# Latent Brush Demo

This folder now contains a static browser demo:

- `decoder.onnx`: exported decoder from `logs/48/checkpoint_100.pt`
- `palette_bank.json`: precomputed CelebA palette bank and PCA metadata
- `assets/`: palette face images
- `vendor/`: local `onnxruntime-web` runtime files
- `index.html` + `app.js`: the in-browser UI

At runtime, the browser does all inference locally with ONNX Runtime Web. No Python backend is used for picking, painting, or decoding.

## Build assets

```bash
.venv/bin/python latent_brush_demo/build_static_demo.py
```

## Run locally

Open it through the blog site or any static file server so the browser can fetch `decoder.onnx`, `palette_bank.json`, and the wasm runtime.

## Notes

- `New Palette` samples a fresh visible subset from the precomputed palette bank.
- `Paint` stamps the selected latent feature vector into the canvas.
- `Erase` blends back toward the mean latent map from the dataset sample used during preprocessing.
- If you want a larger random bank, rerun `build_static_demo.py` with a bigger `--palette-bank-size`.
