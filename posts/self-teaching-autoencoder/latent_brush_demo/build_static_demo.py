import argparse
import base64
import json
import random
import sys
import urllib.request
from pathlib import Path

import numpy as np
import torch
from datasets import load_dataset
from PIL import Image
from torchvision import transforms

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from leae.autoencoder import Autoencoder


DEMO_ROOT = Path(__file__).resolve().parent
ASSETS_DIR = DEMO_ROOT / "assets"
VENDOR_DIR = DEMO_ROOT / "vendor"


RUNTIME_FILES = {
    "ort.min.js": "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.min.js",
    "ort-wasm-simd.wasm": "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort-wasm-simd.wasm",
    "ort-wasm.wasm": "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort-wasm.wasm",
}


def make_model() -> Autoencoder:
    return Autoencoder(in_channels=3, hidden_dim=128, latent_channels=32, output_size=128)


def extract_feature_map(model: Autoencoder, images: torch.Tensor, layer: str) -> torch.Tensor:
    if layer == "latent":
        return model.encode(images)
    stem = model.stem(images)
    if layer == "stem":
        return stem
    x = stem
    for idx, block in enumerate(model.encoder_features):
        x = block(x)
        if layer == f"block{idx + 1}":
            return x
    raise ValueError(f"unknown layer: {layer}")


class DecoderWrapper(torch.nn.Module):
    def __init__(self, model: Autoencoder) -> None:
        super().__init__()
        self.model = model

    def forward(self, latent: torch.Tensor) -> torch.Tensor:
        return self.model.decode(latent)


class Block1ToImageWrapper(torch.nn.Module):
    def __init__(self, model: Autoencoder) -> None:
        super().__init__()
        self.model = model

    def forward(self, block1: torch.Tensor) -> torch.Tensor:
        z = self.model.encoder_features[1](block1)
        batch_size, channels, height, width = z.shape
        z = z.view(batch_size, channels, -1)
        z = self.model.latent_norm(z)
        z = z.view(batch_size, channels, height, width)
        return self.model.decode(z)


def encode_array(values: np.ndarray) -> dict:
    values = np.asarray(values, dtype=np.float32)
    return {
        "shape": list(values.shape),
        "dtype": "float32",
        "data_b64": base64.b64encode(values.astype("<f4", copy=False).tobytes()).decode("ascii"),
    }


def save_image(image: torch.Tensor, path: Path) -> None:
    array = image.detach().cpu().clamp(0.0, 1.0).mul(255).round().to(torch.uint8).permute(1, 2, 0).numpy()
    Image.fromarray(array).save(path)


def tensor_to_numpy(tensor: torch.Tensor) -> np.ndarray:
    return tensor.detach().cpu().numpy().astype(np.float32, copy=False)


def project_feature_map(
    feature_map: torch.Tensor,
    mean: torch.Tensor,
    components: torch.Tensor,
    lo: torch.Tensor,
    hi: torch.Tensor,
) -> torch.Tensor:
    batch, channels, height, width = feature_map.shape
    features = feature_map.permute(0, 2, 3, 1).reshape(-1, channels)
    projected = (features - mean) @ components
    rgb = (projected - lo) / (hi - lo).clamp_min(1e-6)
    rgb = rgb.clamp(0.0, 1.0)
    return rgb.view(batch, height, width, 3).permute(0, 3, 1, 2)


def project_feature_map_per_image(feature_map: torch.Tensor) -> torch.Tensor:
    projections = []
    for sample in feature_map:
        channels, height, width = sample.shape
        features = sample.permute(1, 2, 0).reshape(-1, channels)
        mean = features.mean(dim=0, keepdim=True)
        centered = features - mean
        _, _, v = torch.pca_lowrank(centered, q=3, center=False)
        projected = centered @ v[:, :3]
        lo = torch.quantile(projected, 0.01, dim=0)
        hi = torch.quantile(projected, 0.99, dim=0)
        rgb = (projected - lo) / (hi - lo).clamp_min(1e-6)
        rgb = rgb.clamp(0.0, 1.0)
        projections.append(rgb.view(height, width, 3).permute(2, 0, 1))
    return torch.stack(projections, dim=0)


def build_palette_bank(
    checkpoint_path: Path,
    split: str,
    palette_bank_size: int,
    pca_image_count: int,
    seed: int,
    display_layer: str,
) -> dict:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = make_model().to(device)
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=True)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    transform = transforms.Compose(
        [
            transforms.CenterCrop(128),
            transforms.ToTensor(),
        ]
    )
    dataset = load_dataset("flwrlabs/celeba", split=split, cache_dir=ROOT / "data" / "hf")
    rng = random.Random(seed)

    def dataset_image(index: int) -> torch.Tensor:
        return transform(dataset[index]["image"])

    def encode_batch(images: torch.Tensor) -> torch.Tensor:
        with torch.no_grad():
            return model.encode(images.to(device)).cpu()

    def display_features_batch(images: torch.Tensor) -> torch.Tensor:
        with torch.no_grad():
            return extract_feature_map(model, images.to(device), display_layer).cpu()

    total = len(dataset)
    shuffled = list(range(total))
    rng.shuffle(shuffled)

    pca_indices = shuffled[: min(pca_image_count, total)]
    feature_chunks = []
    display_feature_chunks = []
    batch_size = 16
    for offset in range(0, len(pca_indices), batch_size):
        batch_indices = pca_indices[offset : offset + batch_size]
        images = torch.stack([dataset_image(idx) for idx in batch_indices], dim=0)
        display_features = display_features_batch(images)
        display_feature_chunks.append(display_features)
        features = display_features.permute(0, 2, 3, 1).reshape(-1, display_features.size(1))
        feature_chunks.append(features)

    features = torch.cat(feature_chunks, dim=0)
    display_feature_stack = torch.cat(display_feature_chunks, dim=0)
    mean = features.mean(dim=0, keepdim=True)
    centered = features - mean
    _, _, v = torch.pca_lowrank(centered, q=3, center=False)
    components = v[:, :3]
    projected = centered @ components
    lo = torch.quantile(projected, 0.01, dim=0)
    hi = torch.quantile(projected, 0.99, dim=0)
    base_feature_map = display_feature_stack.mean(dim=0)

    palette_indices = shuffled[pca_image_count : pca_image_count + min(palette_bank_size, total - pca_image_count)]
    if len(palette_indices) < palette_bank_size:
        palette_indices.extend(shuffled[: palette_bank_size - len(palette_indices)])

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    palette_items = []
    for item_idx, dataset_idx in enumerate(palette_indices):
        image = dataset_image(dataset_idx)
        display_feature_map = display_features_batch(image.unsqueeze(0))
        display_rgb = project_feature_map_per_image(display_feature_map)[0]
        image_name = f"palette_{item_idx:03d}.png"
        feature_name = f"palette_feature_{item_idx:03d}.png"
        save_image(image, ASSETS_DIR / image_name)
        save_image(display_rgb, ASSETS_DIR / feature_name)
        palette_items.append(
            {
                "dataset_index": int(dataset_idx),
                "image_path": f"assets/{image_name}",
                "feature_map_path": f"assets/{feature_name}",
                "feature_map": encode_array(tensor_to_numpy(display_feature_map[0])),
            }
        )

    return {
        "checkpoint": str(checkpoint_path),
        "palette_bank_size": len(palette_items),
        "editable_feature_shape": list(display_feature_stack.shape[1:]),
        "display_layer": display_layer,
        "palette_projection": "within_image_pca",
        "base_feature_map": encode_array(tensor_to_numpy(base_feature_map)),
        "pca_mean": encode_array(tensor_to_numpy(mean.squeeze(0))),
        "pca_components": encode_array(tensor_to_numpy(components)),
        "pca_lo": encode_array(tensor_to_numpy(lo)),
        "pca_hi": encode_array(tensor_to_numpy(hi)),
        "items": palette_items,
    }


def export_decoder_onnx(checkpoint_path: Path, out_path: Path) -> None:
    device = torch.device("cpu")
    model = make_model().to(device)
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=True)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    wrapper = Block1ToImageWrapper(model).to(device)
    sample = torch.randn(1, 256, 32, 32, device=device)
    torch.onnx.export(
        wrapper,
        sample,
        out_path,
        input_names=["feature_map"],
        output_names=["image"],
        opset_version=17,
        do_constant_folding=True,
    )


def download_runtime_files() -> None:
    VENDOR_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in RUNTIME_FILES.items():
        target = VENDOR_DIR / name
        if target.exists():
            continue
        print(f"downloading {name}")
        urllib.request.urlretrieve(url, target)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=ROOT / "logs" / "48" / "checkpoint_100.pt",
    )
    parser.add_argument("--split", type=str, default="test")
    parser.add_argument("--palette-bank-size", type=int, default=32)
    parser.add_argument("--palette-visible-count", type=int, default=4)
    parser.add_argument("--pca-image-count", type=int, default=128)
    parser.add_argument("--display-layer", type=str, default="block1")
    parser.add_argument("--seed", type=int, default=0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    demo_manifest = build_palette_bank(
        checkpoint_path=args.checkpoint,
        split=args.split,
        palette_bank_size=args.palette_bank_size,
        pca_image_count=args.pca_image_count,
        seed=args.seed,
        display_layer=args.display_layer,
    )
    demo_manifest["palette_visible_count"] = args.palette_visible_count
    demo_manifest["seed"] = args.seed

    export_decoder_onnx(args.checkpoint, DEMO_ROOT / "decoder.onnx")
    download_runtime_files()

    with (DEMO_ROOT / "palette_bank.json").open("w", encoding="utf-8") as handle:
        json.dump(demo_manifest, handle)

    print(f"wrote {DEMO_ROOT / 'decoder.onnx'}")
    print(f"wrote {DEMO_ROOT / 'palette_bank.json'}")
    print(f"wrote {len(demo_manifest['items'])} palette images to {ASSETS_DIR}")


if __name__ == "__main__":
    main()
