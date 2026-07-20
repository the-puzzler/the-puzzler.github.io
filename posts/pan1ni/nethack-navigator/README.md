# NetHack Navigator

An interactive, **fully in-browser** demo of a goal-conditioned world model that was
pretrained **only on recordings of humans playing NetHack** — never on actions,
rewards, or a navigation objective. A small frozen inverse-dynamics head reads its
latents and picks moves. Choose a goal on a dungeon level and watch the model walk
there, using nothing but a 9×9 player-centred tile view and a picture of the goal.

## Run it

ONNX Runtime Web needs cross-origin isolation and correct MIME types, which the
stock `python -m http.server` does **not** provide. Use the bundled server:

```bash
cd nethack-navigator
python3 serve.py          # then open http://localhost:8000
```

- Best experience in a **WebGPU** browser (recent Chrome/Edge, or Safari 18+). It
  falls back to WebAssembly automatically (slower, but works).
- First load fetches the model once (~48 MB) and caches it.

## Using it

- **Dungeon** — switch between four real NetHack levels (depths 2–5).
- **Goal** — pick one of four goal frames, at increasing distance (the `d…` label is
  the goal's Chebyshev distance in tiles).
- **Run / Step / Reset** and a **speed** slider.
- Left = *what the model sees* (its live 9×9 crop). Right = *the goal frame*. Below =
  a schematic map with the agent (green), goal (gold), start (blue), and its trail.

Selection is a genuine test: the exact same frozen model handles every level and
goal with no per-level tuning.

## What's in here

```
index.html   app.js   serve.py        the demo + local server
model/policy.onnx                      the exported model (world model + IDM head, ~12M params)
ort/                                   ONNX Runtime Web (WebGPU build + wasm)
assets/atlas.png, atlas.json           the 16×16 tile atlas used to draw crops
levels/level*.json                     each level: start, goals, and the tile grid per cell
goals/                                 goal-frame thumbnails (PNG)
```

## How it stays faithful to the trained model

The model consumes the identical tile representation it was trained on: a 9×9
player-centred crop rendered to 144×144 RGB, fed as 8 frames of history plus one
goal frame. Rather than re-deriving that rendering in JavaScript (which we verified
drifts just enough to hurt navigation), each level ships the **real NetHack crop for
every reachable cell**, decomposed into a 9×9 grid of atlas-tile indices. The browser
simply blits those tiles, so every frame the model sees is **byte-identical** to what
it saw during evaluation. Movement is a plain grid step; illegal directions (into
walls / off the known map) are masked, exactly as in the offline evaluation.

Each level here was checked offline with the same sampled policy the browser runs —
the per-goal solve rate is shown in `levels/level*.json`.

## The result this demonstrates

Across a multi-level offline evaluation, this policy reaches goals **64–80% of the
time from 3 to 30 tiles away**, essentially flat with distance, while a
masked random walk on identical setups collapses to **0% beyond ~10 tiles**. Flat
success vs. distance is the signature of goal-*following* rather than search — from a
model that only ever watched humans play.

## Notes & caveats

- **In-distribution domain, unseen instances + unseen task.** The tiles are the same
  domain the model was pretrained on, but these exact levels/goals are novel, and the
  model was never trained to act — control is emergent/zero-shot.
- The policy is movement-only (8 compass directions); it has no notion of doors,
  items, or combat strategy.
- Short goals occasionally fail where long ones succeed — sampling is stochastic;
  press Run again for a different rollout.
