#!/usr/bin/env python3
import json
from pathlib import Path

import torch


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "posts" / "opening-a-portal-to-an-eldritch-dimension" / "assets"
OUT = ASSETS / "cppn_models.json"

WORLD_SPECS = [
    {
        "id": "blackwhite",
        "label": "Black and White",
        "checkpoint": "cppn_latest_blackwhite.pt",
        "config": "config_blackwhite.json",
    },
    {
        "id": "redpurple",
        "label": "Red and Purple",
        "checkpoint": "cppn_latest_redpurple.pt",
        "config": "config_redpurple.json",
    },
    {
        "id": "trip",
        "label": "Trip",
        "checkpoint": "cppn_latest_trip.pt",
        "config": "config_trip.json",
    },
]


def load_layers(checkpoint_path: Path):
    state = torch.load(checkpoint_path, map_location="cpu")
    layers = []
    idx = 0
    while True:
        w_key = f"MLP.{idx}.weight"
        b_key = f"MLP.{idx}.bias"
        if w_key not in state:
            break
        weight = state[w_key].detach().cpu().float()
        bias = state[b_key].detach().cpu().float()
        layers.append(
            {
                "in": int(weight.shape[1]),
                "out": int(weight.shape[0]),
                "weight": weight.reshape(-1).tolist(),
                "bias": bias.tolist(),
            }
        )
        idx += 2
    return layers


def main():
    worlds = []
    for spec in WORLD_SPECS:
        config_path = ASSETS / spec["config"]
        checkpoint_path = ASSETS / spec["checkpoint"]
        cfg = json.loads(config_path.read_text())
        layers = load_layers(checkpoint_path)
        worlds.append(
            {
                "id": spec["id"],
                "label": spec["label"],
                "config": {
                    "cppn_activation": cfg.get("cppn_activation", "sin"),
                    "cppn_sin_w0": float(cfg.get("cppn_sin_w0", 1.0)),
                    "cppn_coord_use_fourier_xy": bool(cfg.get("cppn_coord_use_fourier_xy", False)),
                    "cppn_coord_use_radial": bool(cfg.get("cppn_coord_use_radial", False)),
                    "cppn_coord_fourier_bands": cfg.get("cppn_coord_fourier_bands", [1, 2]),
                    "cppn_coord_radial_powers": cfg.get("cppn_coord_radial_powers", [1, 2]),
                    "image_channels": int(cfg.get("image_channels", 3)),
                    "param_seed_dim": int(cfg.get("param_seed_dim", 16)),
                },
                "layers": layers,
            }
        )
    payload = {"version": 1, "worlds": worlds}
    OUT.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
