#!/usr/bin/env python3
"""Prepare EpiWM's browser figures from a pinned public analysis release (stdlib only)."""
import csv
import io
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REVISION = "b2bed4a01e3d3e0a3c745cc1e8b8e0688fe43344"
BASE = f"https://huggingface.co/basilboy/epijepa-lewm/resolve/{REVISION}/analysis/"
SCORES_REVISION = "3d5857c68cf163a0abf923fb49daaf8b17253206"
SCORES_BASE = f"https://huggingface.co/basilboy/epiwm/resolve/{SCORES_REVISION}/analysis/"
OUT = Path(__file__).resolve().parents[1] / "posts/epiwm/assets"
ENVS = {
    "tworoom": ("TwoRoom", 4748, "tw_epi_0.03", 30000, "tw_sigreg_0.09", 30000, 2),
    "pusht": ("PushT", 630, "pusht_epi_0.1_60k", 60000, "pusht_sigreg_0.09_60k", 60000, 2),
    "cube": ("Cube", 348, "cube_epi_0.03", 60000, "cube_sigreg_0.09", 60000, 2),
    "reacher": ("Reacher", 348, "rch_epi_0.3_200k", 200000, "rch_sigreg_0.09_200k", 200000, 2),
}


def fetch(path, base=BASE):
    with urllib.request.urlopen(base + path, timeout=120) as response:
        return response.read()


def write_json(name, value):
    (OUT / name).write_text(json.dumps(value, separators=(",", ":"), allow_nan=False) + "\n")


def rows(data):
    return list(csv.DictReader(io.StringIO(data.decode())))


def apply_score_overrides(report):
    for override in json.loads((OUT / "score-overrides.json").read_text()):
        scores = report["environments"][override["environment"]]["models"][override["model"]]["scores"][override["eval_set"]]
        matches = [score for score in scores if score["run"] == override["run"]]
        assert len(matches) == 1, override
        matches[0].update(value=override["value"], cem_iterations=override["cem_iterations"])


def prepare_env(item):
    env, (name, episode, *_) = item
    frames = rows(fetch(f"embeddings/embeddings_{env}.csv"))
    trajectory = sorted(rows(fetch(f"embeddings/trajectories_{env}.csv")), key=lambda r: int(r["step"]))
    assert all(int(r["step"]) == i and int(r["episode"]) == episode for i, r in enumerate(trajectory))
    labels = [k for k in trajectory[0] if k not in ("episode", "step") and "_pca" not in k]
    values = lambda rs, keys: [[round(float(r[k]), 5) for k in keys] for r in rs]
    data = {"name": name, "episode": episode, "fps": 10, "labels": labels,
            "states": values(frames, labels), "models": {}}
    for model in ("epijepa", "released_lewm"):
        keys = [f"{model}_pca{i}" for i in (1, 2)]
        data["models"][model] = {"points": values(frames, keys), "trajectory": values(trajectory, keys)}
    write_json(f"{env}.json", data)
    (OUT / f"{env}.mp4").write_bytes(fetch(f"embeddings/videos/{env}_ep{episode}.mp4"))
    print(f"Prepared {env}: {len(frames)} points, {len(trajectory)} video frames")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    raw_scores = fetch("scores/all_scores.csv", SCORES_BASE)
    (OUT / "all_scores.csv").write_bytes(raw_scores)
    scores = rows(raw_scores)
    probes = json.loads(fetch("probes/probes.json"))
    write_json("probes.json", probes)
    report = {"revision": REVISION, "scores_revision": SCORES_REVISION, "environments": {}}
    for env, (name, _, epi_run, epi_steps, control_run, control_steps, control_seeds) in ENVS.items():
        configs = {
            "released": ([f"official_{env}"], None),
            "epi": ([epi_run, epi_run + "_seed2", epi_run + "_seed3"], epi_steps),
            "control": ([control_run] + ([control_run + "_seed2"] if control_seeds == 2 else []), control_steps),
        }
        models = {}
        for model, (runs, steps) in configs.items():
            model_scores = {}
            for eval_set in ("paper50", "n200", "n500"):
                matches = [r for r in scores if r["run"] in runs and r["eval_set"] == eval_set
                           and (steps is None or float(r["step"]) == steps)]
                assert len(matches) == len(runs), (env, model, eval_set, matches)
                model_scores[eval_set] = [{"run": r["run"], "value": float(r["success_rate"])} for r in matches]
            models[model] = {"steps": steps, "seeds": len(runs), "scores": model_scores}
        report["environments"][env] = {"name": name, "models": models}
    apply_score_overrides(report)
    write_json("scores.json", report)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(prepare_env, ENVS.items()))
    (OUT / "README.md").write_text(
        f"# EpiWM figure data\n\nPCA/video source: https://huggingface.co/basilboy/epijepa-lewm/tree/{REVISION}/analysis\n\n"
        f"Scores source: https://huggingface.co/basilboy/epiwm/tree/{SCORES_REVISION}/analysis/scores\n\n"
        "Regenerate with `python3 scripts/prepare-epiwm-data.py`.\n\n"
        "The environment JSONs retain all 3,000 sampled frames, their state labels, and PC1/PC2 coordinates "
        "for each model. Coordinates are rounded to five decimals. Each model has its own fitted PCA basis. "
        "Trajectory row i matches video frame i, at 10 fps. Videos are recorded dataset episodes, not model predictions.\n\n"
        "scores.json selects final checkpoints of the stated runs and preserves individual seed scores. "
        "all_scores.csv is the unmodified source, including sweeps. probes.json uses one selected EpiWM checkpoint "
        "per environment and the released LeWM checkpoint; these are not averages across training seeds.\n\n"
        "score-overrides.json records subsequent audited results supplied by the author. The displayed released "
        "Cube paper50 result is 72% at CEM-10, selected over 68% at CEM-30. This audit result is applied to "
        "scores.json; all_scores.csv retains the original release data.\n"
    )


if __name__ == "__main__":
    main()
