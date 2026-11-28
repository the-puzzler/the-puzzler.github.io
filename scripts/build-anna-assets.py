"""Rebuild the figures for Beautiful on the Inside from the ANNA experiment folder.

uv run --with numpy --with pillow --with matplotlib --with torch scripts/build-anna-assets.py ANNA_FOLDER [--only NAME ...]

ANNA_FOLDER is the experiment export (README.md, result1_three_images/, result2_cat/, result3_grokking/, video/).
Writes into posts/beautiful-on-the-inside/assets/. Parts: opening, thumbnail, montage, images, grokking.
The cluster figures in the Theory section are drawn separately by render-anna-theory-insets.py.
"""

import argparse
import csv
import io
import json
import random
import re
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

ASSETS = Path(__file__).resolve().parents[1] / "posts/beautiful-on-the-inside/assets"
TC, INK, DIM = "#287b78", "#282a28", "#68625c"  # page colours, swapped for CSS variables in the SVGs
plt.rcParams["svg.fonttype"] = "none"  # real <text>, so labels use the page's font

# Opening figure: the showcase cat against the same seed trained without a regulariser.
SHOWCASE = "result2_cat/runs/anna/3_polish/s3/final.pt"
OPENING_SEED = 3846  # chosen by eye for a striking first sample of maps
FACE_UNIT = (10, 1)  # one-based layer and unit drawn in the CPPN figure

# Training montage.
MONTAGE_STEPS = [*range(0, 2001, 100), *range(2400, 10001, 400), *range(12000, 150001, 2000)]
MONTAGE_VERSION = 2  # bump with ?v= in training-panels.html when frames change
# Zero-based (layer, unit), six per quarter of depth: symmetric (mirror correlation >= 0.9), detailed
# and mutually distinct in ANNA's final network. The same units are shown for both networks.
MONTAGE_UNITS = [(0, 2), (0, 10), (2, 22), (3, 10), (3, 15), (3, 18), (5, 18), (6, 12), (6, 20), (7, 5), (7, 12), (7, 20),
                 (8, 3), (8, 6), (8, 7), (10, 10), (10, 12), (11, 6), (12, 2), (12, 12), (12, 13), (12, 15), (14, 3), (14, 6)]


# CPPN --------------------------------------------------------------------------------------------

def hidden(inputs, weights):
    """One CPPN layer: 17 identity, 4 gaussian, 1 sigmoid and 1 sine unit."""
    z = inputs @ weights
    z[..., 17:21] = 2 * np.exp(-np.square(z[..., 17:21])) - 1
    z[..., 21] = np.tanh(z[..., 21] / 2)
    z[..., 22] = np.sin(z[..., 22])
    return z


def colour(hsv):
    h, s, v = np.moveaxis(hsv, -1, 0)
    value = np.clip(np.abs(v), 0, 1)[..., None]
    saturation = np.clip(s, 0, 1)[..., None]
    phase = (6 * h[..., None] + np.array([5, 3, 1], dtype=np.float32)) % 6
    rgb = value * (1 - saturation * np.clip(np.minimum(phase, 4 - phase), 0, 1))
    return np.rint(rgb * 255).astype(np.uint8)


def grid(size):
    axis = np.linspace(-1, 1, size, dtype=np.float32)
    x, y = np.meshgrid(axis, axis)
    return np.stack((x, y, 1.4 * np.hypot(x, y), np.ones_like(x)), axis=-1)


def activations(weights, size):
    a, layers = grid(size), []
    for w in weights[:-1]:
        a = hidden(a, w)
        layers.append(a)
    return layers, colour(a @ weights[-1])


def load_pt(path):
    import torch
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    return [np.asarray(t.detach().float().numpy()).reshape(t.shape[-2:]) for t in checkpoint["theta"]]


def video_weights(folder, network):
    with np.load(folder / f"video/weights_{network}.npz") as data:
        index = {int(step): i for i, step in enumerate(data["steps"])}
        return index, {k: data[k] for k in data.files if k.startswith("W")}


def red_blue(activation, size):
    """Red for a unit's lowest activation, blue for its highest, fading to the page at the midpoint."""
    lo, hi = activation.min(), activation.max()
    if hi - lo < 1e-5:
        return None
    relative = 2 * (activation - lo) / (hi - lo) - 1
    pixels = np.empty((size, size, 4), dtype=np.uint8)
    pixels[..., :3] = np.where(relative[..., None] < 0, [212, 68, 66], [68, 111, 205])
    pixels[..., 3] = np.rint(255 * np.abs(relative))
    return Image.fromarray(pixels)


def unit_sheet(weights, dest, name, size=112):
    """Every live unit's map on one sheet, at its layer and unit position, plus a shuffled pool of their ids."""
    layers, _ = activations(weights, size)
    sheet = Image.new("RGBA", (23 * size, len(layers) * size))
    units = []
    for layer, a in enumerate(layers):
        for unit in range(23):
            tile = red_blue(a[..., unit], size)
            if tile is not None:
                sheet.paste(tile, (unit * size, layer * size))
                units.append(layer * 23 + unit)
    sheet.save(dest / f"{name}-units.webp", lossless=True)
    random.Random(42).shuffle(units)
    return units


def map_previews(dest, pools, seed, columns, suffix):
    """Static previews matching the page's sampler, which continues one random sequence across both panels."""
    state, count = seed, columns * 4
    for name, pool in pools.items():
        units = pool.copy()
        for i in range(count):
            state = (1664525 * state + 1013904223) % 2**32
            j = i + (state * (len(units) - i)) // 2**32
            units[i], units[j] = units[j], units[i]
        with Image.open(dest / f"{name}-units.webp") as sheet:
            size, gap = sheet.width // 23, 5
            preview = Image.new("RGBA", (columns * size + (columns - 1) * gap, 4 * size + 3 * gap))
            for i, index in enumerate(sorted(units[:count])):
                layer, unit = divmod(index, 23)
                tile = sheet.crop((unit * size, layer * size, (unit + 1) * size, (layer + 1) * size))
                preview.paste(tile, ((i % columns) * (size + gap), (i // columns) * (size + gap)))
            preview.save(dest / f"{name}-{suffix}.webp", lossless=True)


def build_opening(folder):
    dest = ASSETS / "anna-cat"
    dest.mkdir(parents=True, exist_ok=True)
    anna = load_pt(folder / SHOWCASE)
    index, weights = video_weights(folder, "no_regulariser")
    baseline = [weights[f"W{i}"][index[150000]] for i in range(17)]

    layers, painting = activations(anna, 512)
    Image.fromarray(painting).save(dest / "output.webp", lossless=True)
    face = layers[FACE_UNIT[0] - 1][..., FACE_UNIT[1] - 1]
    grey = np.rint(255 * (face - face.min()) / (face.max() - face.min())).astype(np.uint8)
    Image.fromarray(grey).save(dest / "face-unit.webp", lossless=True)
    Image.fromarray(activations(baseline, 512)[1]).save(dest / "unregularised-output.webp", lossless=True)

    pools = {"unregularised": unit_sheet(baseline, dest, "unregularised"), "anna": unit_sheet(anna, dest, "anna")}
    map_previews(dest, pools, OPENING_SEED, 6, "sample")
    (dest / "map-units.json").write_text(json.dumps({**pools, "openingSeed": OPENING_SEED}, separators=(",", ":")) + "\n")
    return {"anna-cat/": [SHOWCASE, "video/weights_no_regulariser.npz (step 150,000)"]}


def build_montage(folder):
    dest = ASSETS / "anna-montage"
    dest.mkdir(parents=True, exist_ok=True)
    for old in dest.glob("step*.webp"):
        old.unlink()
    nets = [video_weights(folder, n) for n in ("anna", "no_regulariser")]
    column, paint, tile, gap = 432, 176, 64, 4
    maps_w, maps_h = 6 * tile + 5 * gap, 4 * tile + 3 * gap
    for step in MONTAGE_STEPS:
        frame = Image.new("RGBA", (2 * column, paint + 12 + maps_h))
        for c, (index, weights) in enumerate(nets):
            w = [weights[f"W{i}"][index[step]] for i in range(17)]
            layers, _ = activations(w, tile)
            _, painting = activations(w, paint)
            frame.paste(Image.fromarray(painting), (c * column + (column - paint) // 2, 0))
            maps = Image.new("RGBA", (maps_w, maps_h))
            for i, (layer, unit) in enumerate(MONTAGE_UNITS):
                t = red_blue(layers[layer][..., unit], tile)
                if t is not None:
                    maps.paste(t, ((i % 6) * (tile + gap), (i // 6) * (tile + gap)))
            frame.paste(maps, (c * column + (column - maps_w) // 2, paint + 12), maps)
        frame.save(dest / f"step{step:06d}.webp", quality=72, alpha_quality=50, method=6)
    (dest / "slider.html").write_text(
        f'<input type="range" aria-label="Training step" aria-valuetext="Step 0" min="0" '
        f'max="{len(MONTAGE_STEPS) - 1}" value="0" data-steps="{" ".join(map(str, MONTAGE_STEPS))}">\n')
    return {"anna-montage/": ["video/weights_anna.npz", "video/weights_no_regulariser.npz"]}


def build_thumbnail(folder):
    """Social card: the showcase cat beside twelve symmetric, distinct hidden-unit maps, ordered by depth."""
    weights = load_pt(folder / SHOWCASE)
    background = (248, 247, 242)
    layers, _ = activations(weights, 96)
    candidates = []
    for layer, a in enumerate(layers):
        for unit in range(23):
            v = a[..., unit]
            if v.max() - v.min() < 1e-5:
                continue
            z = (v - v.mean()) / v.std()
            symmetry = (z * z[:, ::-1]).mean()
            gy, gx = np.gradient(z)
            if symmetry >= .85:
                candidates.append((np.hypot(gx, gy).mean() * symmetry, layer, unit, z))
    candidates.sort(key=lambda c: -c[0])
    chosen = []
    for c in candidates:
        if all(abs((c[3] * d[3]).mean()) < .85 for d in chosen):
            chosen.append(c)
        if len(chosen) == 12:
            break
    picks = [(layer, unit) for _, layer, unit, _ in sorted(chosen, key=lambda c: (c[1], c[2]))]

    canvas = Image.new("RGB", (1200, 800), background)
    canvas.paste(Image.fromarray(activations(weights, 600)[1]), (70, 100))
    tile, gap = 136, 16
    layers, _ = activations(weights, tile)
    x0, y0 = 1200 - 70 - (3 * tile + 2 * gap), 100 + (600 - (4 * tile + 3 * gap)) // 2
    for i, (layer, unit) in enumerate(picks):
        cell = Image.new("RGBA", (tile, tile), background + (255,))
        cell.alpha_composite(red_blue(layers[layer][..., unit], tile))
        canvas.paste(cell.convert("RGB"), (x0 + (i % 3) * (tile + gap), y0 + (i // 3) * (tile + gap)))
    canvas.save(ASSETS / "thumbnail.png", optimize=True)
    return {"thumbnail.png": [SHOWCASE]}


# Charts -----------------------------------------------------------------------------------------

def save_svg(fig, dest, title, description):
    """Save a figure as a self-contained inline SVG: themed colours, unique ids, plain paths, real text."""
    buffer = io.StringIO()
    fig.savefig(buffer, format="svg", transparent=True, metadata={"Date": None})
    plt.close(fig)
    svg = buffer.getvalue()
    svg = svg[svg.index("<svg"):]
    svg = svg.replace('version="1.1">', f'version="1.1" role="img" aria-labelledby="{dest.stem}-title {dest.stem}-desc">\n'
                      f'<title id="{dest.stem}-title">{title}</title><desc id="{dest.stem}-desc">{description}</desc>', 1)
    for value, variable in [(TC, "--tc-accent"), (INK, "--ink"), (DIM, "--ink-dim")]:
        svg = svg.replace(value, f"var({variable}, {value})")
    # Several charts share one page, so prefix every id with the chart's name.
    p = dest.stem + "-"
    svg = re.sub(r'\bid="(?!' + re.escape(dest.stem) + r'-(title|desc)")([^"]+)"', lambda m: f'id="{p}{m.group(2)}"', svg)
    svg = re.sub(r'(xlink:href|href)="#([^"]+)"', lambda m: f'{m.group(1)}="#{p}{m.group(2)}"', svg)
    # Draw every marker as its own path: no <use> references or clip paths left to resolve.
    defs = dict(re.findall(r'<path id="([^"]+)" d="([^"]+)"', svg, flags=re.S))
    svg = re.sub(r'<use xlink:href="#([^"]+)" x="([^"]+)" y="([^"]+)"( style="[^"]*")?\s*/>',
                 lambda m: f'<path d="{defs[m.group(1)]}" transform="translate({m.group(2)} {m.group(3)})"{m.group(4) or ""}/>', svg)
    svg = re.sub(r'\s*clip-path="url\(#[^)]+\)"', '', svg)
    svg = svg.replace("'DejaVu Sans'", "'EB Garamond', Garamond, serif").replace("DejaVu Sans", "'EB Garamond', Garamond, serif")
    dest.write_text(svg)
    return svg


def build_images(folder):
    source = "result1_three_images/images_per_seed.tsv"
    rows = list(csv.DictReader(open(folder / source), delimiter="\t"))
    images = ["cat", "butterfly", "skull"]
    methods = [("anna", "ANNA"), ("ufo", "UFO"), ("none", "unregularised")]

    def chart(metric, dest, title, log):
        rng = np.random.default_rng(0)
        with plt.rc_context({"svg.hashsalt": dest.stem}):
            fig, ax = plt.subplots(figsize=(4.9, 3.6), layout="constrained")
            ticks, labels, desc = [], [], []
            for g, image in enumerate(images):
                parts = []
                for m, (key, name) in enumerate(methods):
                    y = g * 4 + m
                    v = np.array([float(r[metric]) for r in rows if r["image"] == image and r["method"] == key])
                    median = float(np.median(v))
                    face = TC if key == "anna" else (DIM if key == "ufo" else "none")
                    ax.scatter(v, y + rng.uniform(-.17, .17, len(v)), s=11, facecolor=face, edgecolor=TC if key == "anna" else DIM,
                               linewidth=.7, alpha=.75, zorder=2)
                    ax.plot([median, median], [y - .34, y + .34], color=INK, linewidth=1.8, zorder=3, solid_capstyle="butt")
                    parts.append(f"{name} {median:.{4 if log else 2}f}")
                ticks.append(g * 4 + 1)
                labels.append(image.capitalize())
                desc.append(f"{image.capitalize()}: median " + ", ".join(parts) + ".")
            ax.set_yticks(ticks, labels)
            ax.set_ylim(len(images) * 4 - 1.3, -.7)
            if log:
                ax.set_xscale("log")
                xt = [3e-4, 1e-3, 3e-3, 1e-2, 3e-2, 1e-1, 3e-1]
                ax.set_xticks(xt, [f"{t:g}" for t in xt])
                ax.minorticks_off()
                ax.set_xlim(2.5e-4, .45)
            else:
                ax.set_xticks(np.linspace(0, 1, 5), ["0", "0.25", "0.5", "0.75", "1"])
                ax.set_xlim(0, 1.02)
            ax.tick_params(length=0, pad=5, colors=INK, labelsize=11)
            ax.tick_params(axis="y", labelsize=12.5)
            for g in range(1, len(images)):
                ax.axhline(g * 4 - 1, color=DIM, linewidth=.5, alpha=.35)
            ax.spines[:].set_visible(False)
            save_svg(fig, dest, title, "Each row is one method, in the order ANNA, UFO, unregularised. "
                     "Dots are individual seeds and the dark tick is the median. " + " ".join(desc))

    chart("symmetry", ASSETS / "map-symmetry.svg", "Map symmetry by image and method", False)
    chart("image_mse", ASSETS / "pixel-mse.svg", "Pixel MSE by image and method, on a log scale", True)
    return {"map-symmetry.svg": [source], "pixel-mse.svg": [source]}


def build_grokking(folder):
    curves = folder / "result3_grokking/curves"
    dest = ASSETS / "grokking-accuracy.svg"
    arms = {
        "Attention": ["anna-attention-wd0.03-*.csv", "intercomponent-attention-*wd0p03-*.csv", "plain-wd0p03.csv"],
        "MLP": ["anna-mlp-wd0.03-*.csv", "intercomponent-mlp-*wd0p03-*.csv", "plain-wd0p03.csv"],
    }
    styles = [("anna", TC, "-"), ("ufo", DIM, "--"), ("wd", DIM, ":")]
    xmax = 130
    steps = np.arange(1000, xmax * 1000 + 1, 1000)
    hover = []
    with plt.rc_context({"svg.hashsalt": dest.stem}):
        fig, axes = plt.subplots(1, 2, figsize=(7.2, 3.0), sharey=True, layout="constrained")
        for ax, (title, patterns) in zip(axes, arms.items()):
            series = {}
            for pattern, (key, colour_, style) in zip(patterns, styles):
                runs = [{int(r["step"]): float(r["validation_accuracy"]) for r in csv.DictReader(open(f))}
                        for f in sorted(curves.glob("seed0*-" + pattern))]
                assert len(runs) == 8, pattern
                # A run stops once it groks and keeps its final score afterwards.
                acc = np.array([[run.get(s, run[max(run)] if s > max(run) else np.nan) for s in steps] for run in runs])
                avg, sd = np.nanmean(acc, 0), np.nanstd(acc, 0, ddof=1)
                t = steps / 1000
                ax.fill_between(t, (avg - sd).clip(0, 100), (avg + sd).clip(0, 100), color=colour_, alpha=.14, linewidth=0)
                ax.plot(t, avg, color=colour_, linestyle=style, linewidth=1.8)
                series[key] = [round(float(v), 1) for v in avg]
            ax.set_title(title, fontsize=13, color=INK)
            ax.set(xlim=(0, xmax), ylim=(-2, 103), xticks=[0, 40, 80, 120], yticks=[0, 50, 100])
            ax.set_xticklabels(["0", "40k", "80k", "120k"])
            ax.grid(axis="y", color=DIM, alpha=.25)
            ax.tick_params(length=0, labelsize=11, colors=INK)
            ax.spines[:].set_visible(False)
            hover.append({"title": title, "steps": [int(s) for s in steps // 1000], **series})
        axes[0].set_ylabel("Held-out accuracy (%)", fontsize=12, color=INK)
        fig.supxlabel("Training step", fontsize=12, color=INK)
        # Panel geometry in SVG units (points, y down), so the page can map the pointer to a step.
        fig.canvas.draw()
        k, height = 72 / fig.dpi, fig.get_figheight() * 72
        for ax, h in zip(axes, hover):
            (x0, y0), (x1, y1) = ax.transData.transform([(0, 0), (xmax, 100)]) * k
            h.update(x0=round(x0, 2), x1=round(x1, 2), y0=round(height - y0, 2), y100=round(height - y1, 2), xmax=xmax)
        svg = save_svg(fig, dest, "Held-out accuracy during training on modular division",
                       "Two panels, regularising either the attention or the MLP at the equals token. Each line averages eight seeds, "
                       "with a shaded band of one standard deviation: ANNA solid, the UFO dashed, weight decay alone dotted. "
                       "Median steps to grok: attention, ANNA 16,000 and UFO 15,500; MLP, ANNA 37,500 and UFO 30,000; "
                       "weight decay alone 104,500.")
    dest.write_text(svg.replace("<svg ", "<svg data-hover='" + json.dumps(hover, separators=(",", ":")) + "' ", 1))
    return {"grokking-accuracy.svg": ["result3_grokking/curves/"]}


PARTS = {"opening": build_opening, "thumbnail": build_thumbnail, "montage": build_montage, "images": build_images, "grokking": build_grokking}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", type=Path, help="the ANNA experiment export")
    parser.add_argument("--only", nargs="+", choices=PARTS, default=list(PARTS))
    args = parser.parse_args()
    manifest_path = ASSETS / "figure-sources.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    if "export" not in manifest:
        manifest = {"export": "ANNA blog assets (see its README.md)", "sources": {}}
    for name in args.only:
        manifest["sources"].update(PARTS[name](args.folder))
        print("built", name)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
