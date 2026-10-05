# /// script
# dependencies = ["matplotlib"]
# ///
"""Render the homepage/share thumbnail from the article's actual Cube data.

Run: uv run scripts/render-epiwm-thumbnail.py
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ASSETS = Path(__file__).resolve().parents[1] / "posts/epiwm/assets"
FRAME = 100
data = json.loads((ASSETS / "cube.json").read_text())

paper, ink = "#f9f7f1", "#2c2925"
plt.rcParams.update({"font.family": "DejaVu Sans", "text.color": ink,
                     "axes.labelcolor": ink, "xtick.color": "#68625c",
                     "ytick.color": "#68625c", "font.size": 12})
fig, axes = plt.subplots(1, 2, figsize=(12, 8), dpi=100, facecolor=paper)
fig.subplots_adjust(left=.09, right=.91, top=.80, bottom=.18, wspace=.18)
for ax, model, title, colour in zip(axes, ["epijepa", "released_lewm"],
                                  ["EpiWM", "Released LeWM"], ["#168579", "#747fa1"]):
    points = np.array(data["models"][model]["points"])
    trajectory = np.array(data["models"][model]["trajectory"])
    ax.set_facecolor(paper)
    ax.scatter(*points.T, s=9, c="#68625c", alpha=.3, linewidths=0)
    ax.plot(*trajectory.T, color=colour, alpha=.22, linewidth=1)
    ax.plot(*trajectory[:FRAME + 1].T, color=colour, linewidth=3.5)
    ax.scatter(*trajectory[FRAME], s=140, color=colour, edgecolors=paper, linewidths=2, zorder=5)
    ax.invert_xaxis()
    ax.set_title(title, fontsize=27, pad=22)
    ax.set_xlabel("PC1", fontsize=14)
    ax.set_ylabel("PC2", fontsize=14)
    ax.set_xticks([])
    ax.set_yticks([])
    for side in ["top", "right"]:
        ax.spines[side].set_visible(False)
    for side in ["bottom", "left"]:
        ax.spines[side].set_color("#a8a39d")
        ax.spines[side].set_linewidth(.6)
    ax.margins(.06)
fig.savefig(ASSETS / "thumbnail.png", dpi=100, facecolor=paper)
plt.close(fig)
print("Rendered posts/epiwm/assets/thumbnail.png (1200 × 800)")
