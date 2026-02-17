#!/usr/bin/env python3
"""
Temporary local utility to render smooth looping CPPN sweep videos.
Delete after use.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import subprocess
from pathlib import Path

import numpy as np
import torch


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "posts" / "opening-a-portal-to-an-eldritch-dimension" / "assets"

WORLD_IDS = ["blackwhite", "redpurple", "trip"]
MODELS_JSON = ASSETS / "cppn_models.json"

# Base CPPN input dims: x, y, z, latent0..latent4
SWEEP_CANDIDATES = [
    (2, "z"),
    (3, "latent0"),
    (4, "latent1"),
    (5, "latent2"),
    (6, "latent3"),
    (7, "latent4"),
]


class CPPN(torch.nn.Module):
    def __init__(self, sizes: list[int], w0: float = 1.0):
        super().__init__()
        layers = []
        for i in range(len(sizes) - 1):
            layers.append(torch.nn.Linear(sizes[i], sizes[i + 1]))
        self.layers = torch.nn.ModuleList(layers)
        self.w0 = w0

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = x
        for i, layer in enumerate(self.layers):
            h = layer(h)
            if i < len(self.layers) - 1:
                h = torch.sin(self.w0 * h)
        return h


def load_world(world_id: str):
    payload = json.loads(MODELS_JSON.read_text())
    worlds = {w["id"]: w for w in payload.get("worlds", [])}
    if world_id not in worlds:
        raise KeyError(f"world '{world_id}' not found in {MODELS_JSON}")

    raw = worlds[world_id]
    cfg = raw["config"]
    layer_sizes = [raw["layers"][0]["in"]] + [layer["out"] for layer in raw["layers"]]
    model = CPPN(sizes=layer_sizes, w0=float(cfg.get("cppn_sin_w0", 1.0)))

    state = {}
    for li, layer in enumerate(raw["layers"]):
        out_dim = int(layer["out"])
        in_dim = int(layer["in"])
        w = torch.tensor(layer["weight"], dtype=torch.float32).reshape(out_dim, in_dim)
        b = torch.tensor(layer["bias"], dtype=torch.float32)
        state[f"layers.{li}.weight"] = w
        state[f"layers.{li}.bias"] = b

    model.load_state_dict(state)
    model.eval()
    return model, cfg


def build_features(
    x: torch.Tensor,
    y: torch.Tensor,
    z: torch.Tensor,
    lat: torch.Tensor,
    cfg: dict,
) -> torch.Tensor:
    parts = [x, y, z, lat[:, 0], lat[:, 1], lat[:, 2], lat[:, 3], lat[:, 4]]

    if cfg.get("cppn_coord_use_fourier_xy", False):
        for b in cfg.get("cppn_coord_fourier_bands", []):
            bx = b * x
            by = b * y
            parts.extend([torch.sin(bx), torch.cos(bx), torch.sin(by), torch.cos(by)])

    if cfg.get("cppn_coord_use_radial", False):
        r = torch.sqrt(x * x + y * y + z * z)
        for p in cfg.get("cppn_coord_radial_powers", []):
            parts.append(r**p)

    return torch.stack(parts, dim=1)


def logits_to_rgb(logits: torch.Tensor, channels: int) -> np.ndarray:
    with torch.no_grad():
        sig = torch.sigmoid(logits)
        if channels == 1:
            g = sig[:, 0:1]
            rgb = torch.cat([g, g, g], dim=1)
        else:
            rgb = sig[:, :3]
        arr = (rgb.clamp(0, 1) * 255.0).byte().cpu().numpy()
    return arr


def open_ffmpeg_writer(path: Path, width: int, height: int, fps: int):
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{width}x{height}",
        "-r",
        str(fps),
        "-i",
        "-",
        "-an",
        "-vcodec",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "18",
        str(path),
    ]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def render_clip(
    model: CPPN,
    cfg: dict,
    out_path: Path,
    size: int,
    fps: int,
    frames: int,
    sweep_idx: int,
    sweep_name: str,
    base_seed: int,
    xy_range: float = 2.6,
    sweep_amp: float = 1.25,
):
    random.seed(base_seed)
    torch.manual_seed(base_seed)

    xs = torch.linspace(-xy_range, xy_range, size)
    ys = torch.linspace(-xy_range, xy_range, size)
    yy, xx = torch.meshgrid(ys, xs, indexing="ij")
    flat_x = xx.reshape(-1)
    flat_y = yy.reshape(-1)
    n = flat_x.numel()

    base = torch.empty(8).uniform_(-1.0, 1.0)
    base[0] = 0.0
    base[1] = 0.0
    phase = random.uniform(0.0, math.tau)

    writer = open_ffmpeg_writer(out_path, size, size, fps)
    if writer.stdin is None:
        raise RuntimeError("ffmpeg stdin unavailable")

    model.eval()
    channels = int(cfg.get("image_channels", 3))

    for fi in range(frames):
        t = fi / frames
        base[sweep_idx] = sweep_amp * math.sin(math.tau * t + phase)

        z = torch.full((n,), float(base[2]))
        lat = torch.zeros((n, 5))
        lat[:, 0] = float(base[3])
        lat[:, 1] = float(base[4])
        lat[:, 2] = float(base[5])
        lat[:, 3] = float(base[6])
        lat[:, 4] = float(base[7])

        feats = build_features(flat_x, flat_y, z, lat, cfg)
        with torch.no_grad():
            logits = model(feats)
        rgb = logits_to_rgb(logits, channels).reshape(size, size, 3)
        writer.stdin.write(rgb.tobytes())

    writer.stdin.close()
    rc = writer.wait()
    if rc != 0:
        raise RuntimeError(f"ffmpeg failed for {out_path}")

    print(f"wrote {out_path} (sweep={sweep_name}, seed={base_seed})")


def choose_sweep_plan(clips: int, rng: random.Random):
    options = SWEEP_CANDIDATES.copy()
    rng.shuffle(options)
    plan = []
    for i in range(clips):
        plan.append(options[i % len(options)])
    return plan


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--world", choices=["blackwhite", "redpurple", "trip", "all"], default="all")
    ap.add_argument("--clips", type=int, default=7)
    ap.add_argument("--size", type=int, default=256)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--seconds", type=float, default=6.0)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--outdir", type=Path, default=ROOT / "tmp" / "cppn_sweeps")
    ap.add_argument("--make-one", action="store_true", help="Render a single test clip only")
    args = ap.parse_args()

    worlds = list(WORLD_IDS) if args.world == "all" else [args.world]
    outdir = args.outdir
    outdir.mkdir(parents=True, exist_ok=True)

    frames = max(2, int(round(args.seconds * args.fps)))
    rng = random.Random(args.seed)

    for wi, world_id in enumerate(worlds):
        model, cfg = load_world(world_id)
        world_dir = outdir / world_id
        world_dir.mkdir(parents=True, exist_ok=True)
        clip_count = 1 if args.make_one else args.clips
        plan = choose_sweep_plan(clip_count, rng)

        for ci, (sweep_idx, sweep_name) in enumerate(plan, start=1):
            seed = args.seed + wi * 1000 + ci * 37
            out_path = world_dir / f"{world_id}_clip_{ci:02d}_{sweep_name}.mp4"
            render_clip(
                model=model,
                cfg=cfg,
                out_path=out_path,
                size=args.size,
                fps=args.fps,
                frames=frames,
                sweep_idx=sweep_idx,
                sweep_name=sweep_name,
                base_seed=seed,
            )


if __name__ == "__main__":
    main()
