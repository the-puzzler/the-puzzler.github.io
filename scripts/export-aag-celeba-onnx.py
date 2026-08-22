#!/usr/bin/env python3
"""Export the released conditional CelebA generator for browser inference."""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image
import torch
import torch.nn as nn


DEFAULT_FACE_SEEDS = [
    1975887587, 2380606041, 3745204751, 2129590463, 1367594244, 448088262,
    1929526248, 3874245998, 2126376399, 1258965489, 3703626157, 2603089353,
    2207234326, 2680225980, 3092199768, 2071319590, 4130305047, 3833760874,
]


def seeded_gaussian_noise(seeds: list[int], width: int) -> torch.Tensor:
    rows = []
    for seed in seeds:
        state = seed & 0xFFFFFFFF

        def random() -> float:
            nonlocal state
            state = (state + 0x6D2B79F5) & 0xFFFFFFFF
            value = state
            value = ((value ^ (value >> 15)) * (value | 1)) & 0xFFFFFFFF
            value ^= (
                value
                + ((value ^ (value >> 7)) * (value | 61) & 0xFFFFFFFF)
            ) & 0xFFFFFFFF
            value &= 0xFFFFFFFF
            return ((value ^ (value >> 14)) & 0xFFFFFFFF) / 4294967296

        row = []
        for _ in range(0, width, 2):
            u = max(sys.float_info.epsilon, random())
            v = random()
            radius = math.sqrt(-2 * math.log(u))
            row.extend([
                radius * math.cos(2 * math.pi * v),
                radius * math.sin(2 * math.pi * v),
            ])
        rows.append(row)
    return torch.tensor(rows, dtype=torch.float32)


class CelebaBrowserModel(nn.Module):
    def __init__(self, generator: nn.Module):
        super().__init__()
        self.generator = generator

    def forward(
        self, noise: torch.Tensor, attributes: torch.Tensor
    ) -> torch.Tensor:
        return self.generator(torch.cat((noise, attributes), dim=1))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--aag-repo", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    repo = args.aag_repo.resolve()
    sys.path.insert(0, str(repo))
    from aag.ae import ResidualDecoder

    checkpoint = torch.load(
        repo / "weights" / "celeba" / "generator_cond.pt",
        map_location="cpu",
        weights_only=False,
    )
    generator = ResidualDecoder(
        checkpoint["dim_z"] + checkpoint["n_attrs"],
        ch=checkpoint["ch"],
        image_size=checkpoint["image_size"],
    )
    generator.load_state_dict(checkpoint["model_state_dict"])
    model = CelebaBrowserModel(generator).eval()

    noise = torch.zeros(1, checkpoint["dim_z"])
    attributes = torch.zeros(1, checkpoint["n_attrs"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with torch.no_grad():
        expected = model(noise, attributes).numpy()
        torch.onnx.export(
            model,
            (noise, attributes),
            args.output,
            input_names=["noise", "attributes"],
            output_names=["face"],
            opset_version=17,
            do_constant_folding=True,
            dynamo=False,
            dynamic_axes={
                "noise": {0: "batch"},
                "attributes": {0: "batch"},
                "face": {0: "batch"},
            },
        )

    session = ort.InferenceSession(
        str(args.output), providers=["CPUExecutionProvider"]
    )
    actual = session.run(
        ["face"],
        {"noise": noise.numpy(), "attributes": attributes.numpy()},
    )[0]
    max_error = float(np.max(np.abs(expected - actual)))
    if not np.isfinite(max_error) or max_error > 1e-4:
        raise RuntimeError(f"ONNX parity check failed: max error {max_error:.6g}")

    size_mb = args.output.stat().st_size / 1_000_000
    print(f"Exported {args.output} ({size_mb:.1f} MB, max error {max_error:.3g})")
    print("Attributes:", ", ".join(checkpoint["attr_names"]))

    default_names = {"Male", "Receding_Hairline"}
    default_attributes = torch.tensor(
        [[float(name in default_names) for name in checkpoint["attr_names"]]]
    )
    placeholder_noise = seeded_gaussian_noise(
        DEFAULT_FACE_SEEDS, checkpoint["dim_z"]
    )
    placeholder_attributes = default_attributes.repeat(18, 1)
    with torch.no_grad():
        placeholder = model(placeholder_noise, placeholder_attributes)
    pixels = (
        placeholder.permute(0, 2, 3, 1).add(1).mul(127.5).clamp(0, 255)
        .to(torch.uint8).numpy()
    )
    grid = np.zeros((64 * 3, 64 * 6, 3), dtype=np.uint8)
    for index, face in enumerate(pixels):
        row, column = divmod(index, 6)
        grid[row * 64:(row + 1) * 64, column * 64:(column + 1) * 64] = face
    placeholder_path = args.output.with_name("placeholder.png")
    Image.fromarray(grid).save(placeholder_path)
    print(f"Saved {placeholder_path} using the default condition vector")


if __name__ == "__main__":
    main()
