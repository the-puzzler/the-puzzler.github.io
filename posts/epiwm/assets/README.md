# EpiWM figure data

PCA/video source: https://huggingface.co/basilboy/epijepa-lewm/tree/b2bed4a01e3d3e0a3c745cc1e8b8e0688fe43344/analysis

Scores source: https://huggingface.co/basilboy/epiwm/tree/3d5857c68cf163a0abf923fb49daaf8b17253206/analysis/scores

Regenerate with `python3 scripts/prepare-epiwm-data.py`.

The environment JSONs retain all 3,000 sampled frames, their state labels, and PC1/PC2 coordinates for each model. Coordinates are rounded to five decimals. Each model has its own fitted PCA basis. Trajectory row i matches video frame i, at 10 fps. Videos are recorded dataset episodes, not model predictions.

scores.json selects final checkpoints of the stated runs and preserves individual seed scores. all_scores.csv is the unmodified source, including sweeps. probes.json uses one selected EpiWM checkpoint per environment and the released LeWM checkpoint; these are not averages across training seeds.

score-overrides.json records subsequent audited results supplied by the author. The displayed released Cube paper50 result is 72% at CEM-10, selected over 68% at CEM-30. This audit result is applied to scores.json; all_scores.csv retains the original release data.
