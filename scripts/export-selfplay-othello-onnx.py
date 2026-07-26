#!/usr/bin/env python3
"""Export the selfplay Othello AZNet checkpoint to one browser-ready ONNX file."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import jax
import jax.numpy as jnp
import numpy as np
import onnx
import onnxruntime as ort
import pgx
from flax import serialization
from jax2onnx import to_onnx


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--selfplay-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    root = args.selfplay_root.resolve()
    sys.path.insert(0, str(root))
    from pgx4.train import ActorCritic

    config_path = root / "results/checkpoints/oth-aznet-s0-config.json"
    checkpoint_path = root / "results/checkpoints/oth-aznet-s0-final.msgpack"
    config = json.loads(config_path.read_text())

    env = pgx.make("othello")
    network = ActorCritic(
        n_actions=env.num_actions,
        width=config["width"],
        depth=config["depth"],
        arch=config["arch"],
    )
    example = jnp.zeros((1,) + env.observation_shape, dtype=jnp.float32)
    template = network.init(jax.random.PRNGKey(0), example)
    variables = serialization.from_bytes(template, checkpoint_path.read_bytes())

    def inference(observation):
        return network.apply(variables, observation, train=False)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    to_onnx(
        inference,
        inputs=[jax.ShapeDtypeStruct(example.shape, jnp.float32)],
        model_name="selfplay_othello_aznet",
        opset=18,
        return_mode="file",
        output_path=args.output,
        input_names=["observation"],
        output_names=["logits", "value"],
        export_mode="web",
    )
    onnx.checker.check_model(onnx.load(args.output))

    session = ort.InferenceSession(
        str(args.output), providers=["CPUExecutionProvider"]
    )
    state = env.init(jax.random.PRNGKey(7))
    max_logits_error = 0.0
    max_value_error = 0.0
    checked = 0

    for step in range(32):
        observation = np.asarray(state.observation, dtype=np.float32)[None]
        jax_logits, jax_value = inference(jnp.asarray(observation))
        ort_logits, ort_value = session.run(None, {"observation": observation})
        max_logits_error = max(
            max_logits_error,
            float(np.max(np.abs(np.asarray(jax_logits) - ort_logits))),
        )
        max_value_error = max(
            max_value_error,
            float(np.max(np.abs(np.asarray(jax_value) - ort_value))),
        )
        checked += 1
        legal = np.flatnonzero(np.asarray(state.legal_action_mask))
        state = env.step(state, int(legal[step % len(legal)]))
        if bool(state.terminated) or bool(state.truncated):
            break

    tolerance = 2e-4
    if max_logits_error > tolerance or max_value_error > tolerance:
        raise RuntimeError(
            f"ONNX verification failed: logits={max_logits_error:.3g}, "
            f"value={max_value_error:.3g}"
        )

    size_mb = args.output.stat().st_size / 1024 / 1024
    print(
        f"Exported {args.output} ({size_mb:.2f} MiB); verified {checked} positions; "
        f"max |logit diff|={max_logits_error:.3g}, "
        f"max |value diff|={max_value_error:.3g}"
    )


if __name__ == "__main__":
    main()
