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
from onnx import TensorProto, helper, numpy_helper
import onnxruntime as ort
import pgx
from flax import serialization


def build_browser_model(variables, output: Path) -> None:
    """Build a small, fixed-shape NCHW graph without converter shape metadata."""
    params = variables["params"]
    stats = variables["batch_stats"]
    nodes, initializers = [], []

    def constant(name, value):
        array = np.asarray(value)
        if not np.issubdtype(array.dtype, np.integer):
            array = array.astype(np.float32)
        initializers.append(numpy_helper.from_array(array, name))
        return name

    def conv(x, index, name):
        layer = params[f"Conv_{index}"]
        # Flax kernels are HWIO; ONNX Conv expects OIHW.
        weight = np.asarray(layer["kernel"]).transpose(3, 2, 0, 1)
        nodes.append(
            helper.make_node(
                "Conv",
                [x, constant(f"{name}.weight", weight),
                 constant(f"{name}.bias", layer["bias"])],
                [name],
                pads=[weight.shape[2] // 2] * 4,
                strides=[1, 1],
            )
        )
        return name

    def norm_relu(x, index, name):
        layer, running = params[f"BatchNorm_{index}"], stats[f"BatchNorm_{index}"]
        scale = np.asarray(layer["scale"]) / np.sqrt(
            np.asarray(running["var"]) + 1e-5
        )
        offset = np.asarray(layer["bias"]) - np.asarray(running["mean"]) * scale
        shape = (1, scale.size, 1, 1)
        scaled = f"{name}.scaled"
        shifted = f"{name}.shifted"
        nodes.append(helper.make_node(
            "Mul", [x, constant(f"{name}.scale", scale.reshape(shape))], [scaled]
        ))
        nodes.append(helper.make_node(
            "Add", [scaled, constant(f"{name}.offset", offset.reshape(shape))],
            [shifted]
        ))
        nodes.append(helper.make_node("Relu", [shifted], [name]))
        return name

    def dense(x, index, name):
        layer = params[f"Dense_{index}"]
        nodes.append(helper.make_node(
            "Gemm",
            [x, constant(f"{name}.weight", layer["kernel"]),
             constant(f"{name}.bias", layer["bias"])],
            [name],
        ))
        return name

    nodes.append(helper.make_node(
        "Transpose", ["observation"], ["input.nchw"], perm=[0, 3, 1, 2]
    ))
    x = conv("input.nchw", 0, "trunk.input")
    for block in range(6):
        residual = x
        x = norm_relu(x, block * 2, f"block{block}.relu0")
        x = conv(x, block * 2 + 1, f"block{block}.conv0")
        x = norm_relu(x, block * 2 + 1, f"block{block}.relu1")
        x = conv(x, block * 2 + 2, f"block{block}.conv1")
        added = f"block{block}.output"
        nodes.append(helper.make_node("Add", [x, residual], [added]))
        x = added
    x = norm_relu(x, 12, "trunk.output")

    policy = conv(x, 13, "policy.conv")
    policy = norm_relu(policy, 13, "policy.relu")
    nodes.append(helper.make_node(
        "Transpose", [policy], ["policy.nhwc"], perm=[0, 2, 3, 1]
    ))
    nodes.append(helper.make_node(
        "Reshape",
        ["policy.nhwc", constant("policy.shape", np.asarray([1, 128], np.int64))],
        ["policy.flat"],
    ))
    dense("policy.flat", 0, "logits")

    value = conv(x, 14, "value.conv")
    value = norm_relu(value, 14, "value.relu")
    nodes.append(helper.make_node(
        "Reshape",
        [value, constant("value.shape", np.asarray([1, 64], np.int64))],
        ["value.flat"],
    ))
    value = dense("value.flat", 1, "value.hidden")
    nodes.append(helper.make_node("Relu", [value], ["value.hidden.relu"]))
    value = dense("value.hidden.relu", 2, "value.dense")
    nodes.append(helper.make_node("Tanh", [value], ["value.tanh"]))
    nodes.append(helper.make_node("Squeeze", ["value.tanh"], ["value"], axes=[1]))

    graph = helper.make_graph(
        nodes,
        "selfplay_othello_aznet_browser",
        [helper.make_tensor_value_info(
            "observation", TensorProto.FLOAT, [1, 8, 8, 2]
        )],
        [
            helper.make_tensor_value_info("logits", TensorProto.FLOAT, [1, 65]),
            helper.make_tensor_value_info("value", TensorProto.FLOAT, [1]),
        ],
        initializers,
    )
    model = helper.make_model(
        graph,
        producer_name="the-puzzler/selfplay",
        opset_imports=[helper.make_opsetid("", 12)],
    )
    model.ir_version = 7
    onnx.checker.check_model(model)
    onnx.save(model, output)


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
    build_browser_model(variables, args.output)
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
