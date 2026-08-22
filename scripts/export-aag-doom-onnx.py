#!/usr/bin/env python3
"""Export the released AAG Doom world model as one browser-ready ONNX file."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
import torch.nn as nn


class DoomBrowserModel(nn.Module):
    """Encode three context frames and predict the next frame for one action."""

    def __init__(self, encoder: nn.Module, generator: nn.Module):
        super().__init__()
        self.encoder = encoder
        self.generator = generator

    def forward(
        self,
        frames: torch.Tensor,
        noise: torch.Tensor,
        action: torch.Tensor,
    ) -> torch.Tensor:
        context = self.encoder(frames.reshape(3, 3, 64, 64)).reshape(1, 192)
        return self.generator(torch.cat((noise, context, action), dim=1))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--aag-repo", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    repo = args.aag_repo.resolve()
    sys.path.insert(0, str(repo))
    from aag.ae import AutoEncoder, ResidualDecoder

    weights = repo / "weights" / "doom"
    ae_checkpoint = torch.load(
        weights / "frame_ae.pt", map_location="cpu", weights_only=False
    )
    generator_checkpoint = torch.load(
        weights / "worldmodel_generator.pt", map_location="cpu", weights_only=False
    )

    autoencoder = AutoEncoder(
        latent_dim=ae_checkpoint["latent_dim"],
        ch=ae_checkpoint["channels"],
        architecture=ae_checkpoint["architecture"],
        image_size=ae_checkpoint["image_size"],
    )
    autoencoder.load_state_dict(ae_checkpoint["model_state_dict"])

    generator = ResidualDecoder(
        generator_checkpoint["input_dim"], ch=64, image_size=64
    )
    generator.load_state_dict(generator_checkpoint["model_state_dict"])

    model = DoomBrowserModel(autoencoder.enc, generator).eval()
    frames = torch.zeros(1, 3, 3, 64, 64)
    noise = torch.zeros(1, generator_checkpoint["dim_z"])
    action = torch.zeros(1, 18)
    action[0, 8] = 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with torch.no_grad():
        expected = model(frames, noise, action).numpy()
        torch.onnx.export(
            model,
            (frames, noise, action),
            args.output,
            input_names=["frames", "noise", "action"],
            output_names=["next_frame"],
            opset_version=17,
            do_constant_folding=True,
            dynamo=False,
        )

    session = ort.InferenceSession(
        str(args.output), providers=["CPUExecutionProvider"]
    )
    actual = session.run(
        ["next_frame"],
        {
            "frames": frames.numpy(),
            "noise": noise.numpy(),
            "action": action.numpy(),
        },
    )[0]
    max_error = float(np.max(np.abs(expected - actual)))
    if not np.isfinite(max_error) or max_error > 1e-4:
        raise RuntimeError(f"ONNX parity check failed: max error {max_error:.6g}")

    size_mb = args.output.stat().st_size / 1_000_000
    print(f"Exported {args.output} ({size_mb:.1f} MB, max error {max_error:.3g})")


if __name__ == "__main__":
    main()
