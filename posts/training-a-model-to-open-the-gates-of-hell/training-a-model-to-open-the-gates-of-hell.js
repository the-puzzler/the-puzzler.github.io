const twoModelsCanvas = document.getElementById("two-models-canvas");

if (twoModelsCanvas) {
  const ctx = twoModelsCanvas.getContext("2d");
  const prevBtn = document.getElementById("two-models-prev");
  const nextBtn = document.getElementById("two-models-next");

  const PHASES = [
    "Image Generator CPPN",
    "It maps x, y, z to RGB",
    "",
    "Represenation Model",
    "",
    "",
  ];

  const PHASE_DUR_MS = [1300, 1500, 1400, 1400, 1300, 999999];

  const state = {
    phase: 0,
    phaseT: 0,
    loopIntro: 0,
    loopHold: 0,
    cycle: 0,
    auto: true,
    lastTs: performance.now(),
  };
  const RESTART_HOLD_S = 1.0;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOut(t) {
    const x = clamp(t, 0, 1);
    return 1 - (1 - x) ** 3;
  }

  function easeInOut(t) {
    const x = clamp(t, 0, 1);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(460, Math.floor(twoModelsCanvas.clientWidth * dpr));
    const h = Math.max(160, Math.floor((w * 8) / 23));
    if (twoModelsCanvas.width !== w || twoModelsCanvas.height !== h) {
      twoModelsCanvas.width = w;
      twoModelsCanvas.height = h;
    }
  }

  function roundedRectPath(x, y, w, h, r) {
    const rr = Math.min(r, w * 0.25, h * 0.35);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function drawNodeBox(x, y, w, h, labelA, labelB, alpha, layers = [3, 5, 4, 3]) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    const px = x + w * 0.08;
    const py = y + h * 0.14;
    const pw = w * 0.84;
    const ph = h * 0.68;
    const lxStep = layers.length > 1 ? pw / (layers.length - 1) : 0;

    const nodes = [];
    const maxCount = Math.max(...layers);
    for (let li = 0; li < layers.length; li += 1) {
      const count = layers[li];
      const col = [];
      const colX = px + li * lxStep;
      const spanRatio = count / maxCount;
      const layerSpan = ph * (0.26 + spanRatio * 0.74);
      const layerTop = py + (ph - layerSpan) * 0.5;
      for (let ni = 0; ni < count; ni += 1) {
        const yT = count === 1 ? 0.5 : ni / (count - 1);
        const colY = layerTop + yT * layerSpan;
        col.push({ x: colX, y: colY });
      }
      nodes.push(col);
    }

    ctx.lineWidth = Math.max(0.8, twoModelsCanvas.height * 0.0038);
    ctx.strokeStyle = "hsla(206 34% 38% / 0.34)";
    for (let li = 0; li < nodes.length - 1; li += 1) {
      for (const a of nodes[li]) {
        for (const b of nodes[li + 1]) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    const r = Math.max(4.2, Math.min(w, h) * 0.048);
    for (let li = 0; li < nodes.length; li += 1) {
      for (const n of nodes[li]) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = li === 0
          ? "hsla(210 40% 72% / 0.55)"
          : li === nodes.length - 1
            ? "hsla(28 76% 62% / 0.55)"
            : "hsla(208 20% 78% / 0.5)";
        ctx.fill();
        ctx.strokeStyle = "hsla(208 18% 28% / 0.42)";
        ctx.lineWidth = Math.max(0.9, twoModelsCanvas.height * 0.0038);
        ctx.stroke();
      }
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "hsla(208 18% 22% / 0.9)";
    ctx.font = `${Math.max(11, Math.floor(twoModelsCanvas.height * 0.07))}px EB Garamond, serif`;
    ctx.fillText(labelA, x + w * 0.5, y + h * 0.92);
    if (labelB) {
      ctx.font = `${Math.max(9, Math.floor(twoModelsCanvas.height * 0.055))}px EB Garamond, serif`;
      ctx.fillStyle = "hsla(208 14% 26% / 0.72)";
      ctx.fillText(labelB, x + w * 0.5, y + h * 1.08);
    }
    ctx.restore();
  }

  function drawArrowLine(x1, y1, x2, y2, alpha, progress) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "hsla(206 44% 34% / 0.75)";
    ctx.lineWidth = Math.max(1.5, twoModelsCanvas.height * 0.008);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const a = Math.atan2(y2 - y1, x2 - x1);
    const head = Math.max(7, twoModelsCanvas.height * 0.04);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(a - 0.46) * head, y2 - Math.sin(a - 0.46) * head);
    ctx.lineTo(x2 - Math.cos(a + 0.46) * head, y2 - Math.sin(a + 0.46) * head);
    ctx.closePath();
    ctx.fillStyle = "hsla(206 44% 34% / 0.75)";
    ctx.fill();

    const px = lerp(x1, x2, progress);
    const py = lerp(y1, y2, progress);
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2, twoModelsCanvas.height * 0.012), 0, Math.PI * 2);
    ctx.fillStyle = "hsla(30 74% 42% / 0.85)";
    ctx.fill();
    ctx.restore();
  }

  function drawArrowCurve(x1, y1, cx, cy, x2, y2, alpha, progress) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "hsla(206 44% 34% / 0.72)";
    ctx.lineWidth = Math.max(1.4, twoModelsCanvas.height * 0.007);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();

    const t = clamp(progress, 0, 1);
    const omt = 1 - t;
    const px = omt * omt * x1 + 2 * omt * t * cx + t * t * x2;
    const py = omt * omt * y1 + 2 * omt * t * cy + t * t * y2;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2, twoModelsCanvas.height * 0.011), 0, Math.PI * 2);
    ctx.fillStyle = "hsla(30 74% 42% / 0.82)";
    ctx.fill();

    const ta = 0.92;
    const omta = 1 - ta;
    const hx = omta * omta * x1 + 2 * omta * ta * cx + ta * ta * x2;
    const hy = omta * omta * y1 + 2 * omta * ta * cy + ta * ta * y2;
    const tx = 2 * omta * (cx - x1) + 2 * ta * (x2 - cx);
    const ty = 2 * omta * (cy - y1) + 2 * ta * (y2 - cy);
    const ang = Math.atan2(ty, tx);
    const head = Math.max(6, twoModelsCanvas.height * 0.035);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - Math.cos(ang - 0.5) * head, hy - Math.sin(ang - 0.5) * head);
    ctx.lineTo(hx - Math.cos(ang + 0.5) * head, hy - Math.sin(ang + 0.5) * head);
    ctx.closePath();
    ctx.fillStyle = "hsla(206 44% 34% / 0.72)";
    ctx.fill();
    ctx.restore();
  }

  function drawArcArrow(cx, cy, r, a0, a1, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "hsla(206 44% 34% / 0.72)";
    ctx.lineWidth = Math.max(1.4, twoModelsCanvas.height * 0.007);
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1, false);
    ctx.stroke();

    const ah = a1;
    const hx = cx + Math.cos(ah) * r;
    const hy = cy + Math.sin(ah) * r;
    const tx = -Math.sin(ah);
    const ty = Math.cos(ah);
    const tangentSign = a1 > a0 ? 1 : -1;
    const vx = tx * tangentSign;
    const vy = ty * tangentSign;
    const vang = Math.atan2(vy, vx);
    const head = Math.max(6, twoModelsCanvas.height * 0.035);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - Math.cos(vang - 0.5) * head, hy - Math.sin(vang - 0.5) * head);
    ctx.lineTo(hx - Math.cos(vang + 0.5) * head, hy - Math.sin(vang + 0.5) * head);
    ctx.closePath();
    ctx.fillStyle = "hsla(206 44% 34% / 0.72)";
    ctx.fill();
    ctx.restore();
  }

  function drawGeneratorIO(x, y, w, h, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const lx = x - w * 0.21;
    const rx = x + w + w * 0.21;
    const ys = [y + h * 0.28, y + h * 0.5, y + h * 0.72];
    const ins = ["x", "y", "z"];
    const outs = ["r", "g", "b"];

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.max(10, Math.floor(twoModelsCanvas.height * 0.055))}px EB Garamond, serif`;

    function drawArrowHead(x0, y0, x1, y1, size) {
      const a = Math.atan2(y1 - y0, x1 - x0);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - Math.cos(a - 0.52) * size, y1 - Math.sin(a - 0.52) * size);
      ctx.lineTo(x1 - Math.cos(a + 0.52) * size, y1 - Math.sin(a + 0.52) * size);
      ctx.closePath();
      ctx.fill();
    }

    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(lx, ys[i], Math.max(5, h * 0.07), 0, Math.PI * 2);
      ctx.fillStyle = "hsla(210 40% 72% / 0.45)";
      ctx.fill();
      ctx.strokeStyle = "hsla(208 20% 34% / 0.36)";
      ctx.stroke();
      ctx.fillStyle = "hsla(208 18% 22% / 0.86)";
      ctx.fillText(ins[i], lx, ys[i] + 0.5);

      const x0 = lx + h * 0.08;
      const x1 = x - h * 0.03;
      ctx.beginPath();
      ctx.moveTo(x0, ys[i]);
      ctx.lineTo(x1, ys[i]);
      ctx.strokeStyle = "hsla(206 44% 34% / 0.6)";
      ctx.stroke();
      ctx.fillStyle = "hsla(206 44% 34% / 0.6)";
      drawArrowHead(x0, ys[i], x1, ys[i], Math.max(4.2, h * 0.055));
    }

    for (let i = 0; i < 3; i += 1) {
      const x0 = x + w + h * 0.03;
      const x1 = rx - h * 0.08;
      ctx.beginPath();
      ctx.moveTo(x0, ys[i]);
      ctx.lineTo(x1, ys[i]);
      ctx.strokeStyle = "hsla(206 44% 34% / 0.6)";
      ctx.stroke();
      ctx.fillStyle = "hsla(206 44% 34% / 0.6)";
      drawArrowHead(x0, ys[i], x1, ys[i], Math.max(4.2, h * 0.055));

      ctx.beginPath();
      ctx.arc(rx, ys[i], Math.max(5, h * 0.07), 0, Math.PI * 2);
      ctx.fillStyle = "hsla(28 76% 62% / 0.45)";
      ctx.fill();
      ctx.strokeStyle = "hsla(26 56% 34% / 0.35)";
      ctx.stroke();
      ctx.fillStyle = "hsla(208 18% 22% / 0.86)";
      ctx.fillText(outs[i], rx, ys[i] + 0.5);
    }
    ctx.restore();
  }

  function drawAutoencoderInputImage(x, y, w, h, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    const tile = Math.min(w, h) * 0.22;
    const tx = x - tile * 1.7;
    const ty = y + h * 0.5 - tile * 0.5;
    roundedRectPath(tx, ty, tile, tile, tile * 0.16);
    ctx.fillStyle = "hsla(210 24% 82% / 0.5)";
    ctx.fill();
    ctx.strokeStyle = "hsla(208 16% 30% / 0.34)";
    ctx.stroke();

    const inner = tile * 0.78;
    const ix = tx + (tile - inner) * 0.5;
    const iy = ty + (tile - inner) * 0.5;
    const cell = Math.max(1.8, inner / 11);
    for (let gy = 0; gy < 11; gy += 1) {
      for (let gx = 0; gx < 11; gx += 1) {
        const n = Math.sin((gx + 1) * 12.9898 + (gy + 1) * 78.233) * 43758.5453;
        const frac = n - Math.floor(n);
        const shade = Math.floor(70 + frac * 150);
        ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.72)`;
        ctx.fillRect(ix + gx * cell, iy + gy * cell, cell * 0.92, cell * 0.92);
      }
    }

    const x0 = tx + tile + tile * 0.07;
    const y0 = ty + tile * 0.5;
    const x1 = x - w * 0.02;
    const y1 = y0;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = "hsla(206 44% 34% / 0.62)";
    ctx.lineWidth = Math.max(1.3, twoModelsCanvas.height * 0.0055);
    ctx.stroke();

    const a = Math.atan2(y1 - y0, x1 - x0);
    const hs = Math.max(5, h * 0.07);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(a - 0.52) * hs, y1 - Math.sin(a - 0.52) * hs);
    ctx.lineTo(x1 - Math.cos(a + 0.52) * hs, y1 - Math.sin(a + 0.52) * hs);
    ctx.closePath();
    ctx.fillStyle = "hsla(206 44% 34% / 0.62)";
    ctx.fill();
    ctx.restore();
  }

  function drawDataStack(x, y, size, alpha, denoiseProgress = 0) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const n = 4;
    for (let i = 0; i < n; i += 1) {
      const ox = i * size * 0.16;
      const oy = -i * size * 0.12;
      roundedRectPath(x + ox, y + oy, size, size, size * 0.12);
      ctx.fillStyle = `hsla(210 24% ${78 - i * 4}% / ${0.26 + i * 0.1})`;
      ctx.fill();
      ctx.strokeStyle = "hsla(208 16% 30% / 0.28)";
      ctx.stroke();

      const inner = size * 0.78;
      const ix = x + ox + (size - inner) * 0.5;
      const iy = y + oy + (size - inner) * 0.5;
      const reveal = clamp(denoiseProgress, 0, 1);
      const square = inner * 0.42;
      const sx = ix + (inner - square) * 0.5;
      const sy = iy + (inner - square) * 0.5;
      const redA = 0.08 + reveal * 0.62;
      roundedRectPath(sx, sy, square, square, square * 0.16);
      ctx.fillStyle = `hsla(2 74% 48% / ${redA})`;
      ctx.fill();
      const grid = 9;
      const cell = inner / grid;
      for (let gy = 0; gy < grid; gy += 1) {
        for (let gx = 0; gx < grid; gx += 1) {
          const n0 = Math.sin((gx + 1 + i * 2) * 12.9898 + (gy + 1 + i * 3) * 78.233) * 43758.5453;
          const frac = n0 - Math.floor(n0);
          const shade = Math.floor(64 + frac * 150);
          const noiseA = Math.max(0, 0.66 - reveal * 0.66);
          ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${noiseA})`;
          ctx.fillRect(ix + gx * cell, iy + gy * cell, cell * 0.9, cell * 0.9);
        }
      }
    }
    ctx.restore();
  }

  function drawLoopParticle(cx, cy, r, progress, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const t = ((progress % 1) + 1) % 1;
    const ang = -Math.PI * 0.5 + t * Math.PI * 2;
    const px = cx + Math.cos(ang) * r;
    const py = cy + Math.sin(ang) * r;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2.6, twoModelsCanvas.height * 0.013), 0, Math.PI * 2);
    ctx.fillStyle = "hsla(30 74% 42% / 0.9)";
    ctx.fill();
    ctx.restore();
  }

  function phaseWindow(t, a, b) {
    return easeInOut(clamp((t - a) / (b - a), 0, 1));
  }

  function drawLoopLabel(text, x, y, alpha) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.max(10, Math.floor(twoModelsCanvas.height * 0.06))}px EB Garamond, serif`;
    ctx.fillStyle = "hsla(208 18% 24% / 0.88)";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function render() {
    const w = twoModelsCanvas.width;
    const h = twoModelsCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const nodeW = w * 0.24;
    const nodeH = h * 0.28;

    const genStartX = w * 0.5 - nodeW * 0.5;
    const genStartY = h * 0.37;
    const genLeftX = w * 0.08;
    const genTopY = h * 0.16;

    const repCenterX = w * 0.53 - nodeW * 0.5;
    const repCenterY = h * 0.38;
    const repLeftX = genLeftX;
    const repBottomY = h * 0.58;

    let genFade = 0;
    let genDetail = 0;
    let genMove = 0;
    let repFade = 0;
    let repMove = 0;
    let loopOn = 0;

    if (state.phase === 0) genFade = easeOut(state.phaseT);
    if (state.phase >= 1) genFade = 1;

    if (state.phase === 1) genDetail = easeInOut(state.phaseT);
    if (state.phase >= 2) genDetail = 1;

    if (state.phase === 2) genMove = easeInOut(state.phaseT);
    if (state.phase >= 3) genMove = 1;

    if (state.phase === 3) repFade = easeOut(state.phaseT);
    if (state.phase >= 4) repFade = 1;

    if (state.phase === 4) repMove = easeInOut(state.phaseT);
    if (state.phase >= 5) repMove = 1;

    if (state.phase === 5) loopOn = 1;

    const genX = lerp(genStartX, genLeftX, genMove);
    const genY = lerp(genStartY, genTopY, genMove);
    const repX = lerp(repCenterX, repLeftX, repMove);
    const repY = lerp(repCenterY, repBottomY, repMove);

    drawNodeBox(genX, genY, nodeW, nodeH, "Generator", "CPPN", genFade, [3, 5, 3]);
    drawGeneratorIO(genX, genY, nodeW, nodeH, genFade * genDetail);

    drawNodeBox(repX, repY, nodeW, nodeH, "Representation", "Autoencoder / Lejepa", repFade, [3, 5, 3]);
    drawAutoencoderInputImage(repX, repY, nodeW, nodeH, repFade);

    let loopPhaseText = "";
    if (loopOn > 0) {
      const t = state.cycle >= 3 ? 0.999 : (state.cycle % 1);
      const intro = state.loopIntro;
      const aGen = phaseWindow(intro, 0.0, 0.12);
      const aImg = phaseWindow(intro, 0.14, 0.34);
      const aRep = phaseWindow(intro, 0.34, 0.56);
      const aFb = phaseWindow(intro, 0.56, 0.76);
      const aClose = phaseWindow(intro, 0.76, 0.98);

      const cx = w * 0.67;
      const cy = h * 0.49;
      const r = Math.min(w, h) * 0.255;

      const pGen = { x: cx, y: cy - r * 0.98 };
      const pImg = { x: cx + r * 0.98, y: cy };
      const pRep = { x: cx, y: cy + r * 0.98 };
      const pFb = { x: cx - r * 0.98, y: cy };

      drawLoopLabel("Generator", pGen.x, pGen.y - h * 0.03, aGen);
      drawDataStack(pImg.x - h * 0.01, pImg.y - h * 0.05, h * 0.1, aImg, clamp(state.cycle / 3, 0, 1));
      drawLoopLabel("Representation model", pRep.x, pRep.y + h * 0.03, aRep);
      drawLoopLabel("Feedback", pFb.x - h * 0.15, pFb.y, aFb);

      drawArcArrow(cx, cy, r, -Math.PI * 0.5, 0, aImg);
      drawArcArrow(cx, cy, r, 0, Math.PI * 0.5, aRep);
      drawArcArrow(cx, cy, r, Math.PI * 0.5, Math.PI, aFb);
      drawArcArrow(cx, cy, r, Math.PI, Math.PI * 1.5, aClose);
      drawLoopParticle(cx, cy, r, t, aClose);

      if (t < 0.25) loopPhaseText = "Generator creates images";
      else if (t < 0.5) loopPhaseText = "Representaton model trains";
      else if (t < 0.75) loopPhaseText = "Creates Feedback";
      else loopPhaseText = "Feedback updates generator";
    }

    const heading = state.phase === PHASES.length - 1 ? loopPhaseText : (PHASES[state.phase] || "");
    if (heading) {
      ctx.fillStyle = "hsla(208 18% 24% / 0.86)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.max(11, Math.floor(h * 0.08))}px EB Garamond, serif`;
      ctx.fillText(heading, w * 0.52, h * 0.11);
    }
  }

  function setPhase(next) {
    state.phase = clamp(next, 0, PHASES.length - 1);
    state.phaseT = 0;
    if (state.phase === PHASES.length - 1) {
      state.loopIntro = 0;
      state.cycle = 0;
    }
    state.auto = true;
  }

  prevBtn?.addEventListener("click", () => {
    setPhase(state.phase - 1);
  });

  nextBtn?.addEventListener("click", () => {
    setPhase(state.phase + 1);
  });

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  function tick(ts) {
    const dt = Math.min((ts - state.lastTs) * 0.001, 0.05);
    state.lastTs = ts;

    if (state.phase < PHASES.length - 1) {
      const dur = PHASE_DUR_MS[state.phase] * 0.001;
      state.phaseT = clamp(state.phaseT + dt / dur, 0, 1);
      state.loopIntro = 0;
      state.loopHold = 0;
      if (state.phaseT >= 1 && state.auto) {
        state.phase += 1;
        state.phaseT = 0;
      }
    } else {
      state.phaseT = 1;
      state.loopIntro = clamp(state.loopIntro + dt * 0.35, 0, 1);
      if (state.auto && state.cycle >= 3) {
        state.loopHold += dt;
        if (state.loopHold >= RESTART_HOLD_S) {
          state.phase = 0;
          state.phaseT = 0;
          state.loopIntro = 0;
          state.loopHold = 0;
          state.cycle = 0;
        }
      }
    }

    if (state.phase === PHASES.length - 1) {
      state.cycle = Math.min(3, state.cycle + dt * 0.2);
    }
    render();
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

(function initDeltaCollapseLab() {
  const root = document.getElementById("delta-collapse-lab");
  if (!root) return;

  const canvas = root.querySelector("#delta-collapse-canvas");
  const ctx = canvas.getContext("2d");
  const startBtn = root.querySelector("#delta-collapse-start");
  const restartBtn = root.querySelector("#delta-collapse-restart");
  const adaptEl = root.querySelector("#delta-collapse-adapt");
  const driftEl = root.querySelector("#delta-collapse-drift");
  const deltaEl = root.querySelector("#delta-collapse-value");
  const preEl = root.querySelector("#delta-collapse-pre");
  const postEl = root.querySelector("#delta-collapse-post");

  let running = false;
  let lastTs = performance.now();
  let simAccum = 0;
  const SIM_STEP_INTERVAL_S = 0.35;
  const H = 6;
  const BATCH_N = 48;
  const REP_LR = 0.05;
  const HISTORY = 220;

  const xBatch = new Float32Array(BATCH_N);
  for (let i = 0; i < BATCH_N; i += 1) xBatch[i] = -1 + (2 * i) / (BATCH_N - 1);

  function makeModel(scale = 0.55) {
    const w1 = new Float32Array(H);
    const b1 = new Float32Array(H);
    const w2 = new Float32Array(H);
    for (let i = 0; i < H; i += 1) {
      w1[i] = (Math.random() * 2 - 1) * scale;
      b1[i] = (Math.random() * 2 - 1) * scale * 0.6;
      w2[i] = (Math.random() * 2 - 1) * scale;
    }
    return { w1, b1, w2, b2: (Math.random() * 2 - 1) * scale * 0.6 };
  }

  function copyModel(src) {
    return {
      w1: new Float32Array(src.w1),
      b1: new Float32Array(src.b1),
      w2: new Float32Array(src.w2),
      b2: src.b2,
    };
  }

  let gen = makeModel(0.8);
  let rep = makeModel(0.45);

  const histPre = [];
  const histPost = [];
  const histDelta = [];

  function resetSim() {
    gen = makeModel(0.8);
    rep = makeModel(0.45);
    histPre.length = 0;
    histPost.length = 0;
    histDelta.length = 0;
    simAccum = 0;
    deltaEl.textContent = "0.000";
    preEl.textContent = "0.000";
    postEl.textContent = "0.000";
    running = false;
    startBtn.textContent = "Start";
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function tanh(x) {
    return Math.tanh(x);
  }

  function forward(model, x) {
    const h = new Float32Array(H);
    for (let i = 0; i < H; i += 1) h[i] = tanh(model.w1[i] * x + model.b1[i]);
    let y = model.b2;
    for (let i = 0; i < H; i += 1) y += model.w2[i] * h[i];
    return { h, y };
  }

  function evalBatch(model, xs) {
    const ys = new Float32Array(xs.length);
    for (let i = 0; i < xs.length; i += 1) ys[i] = forward(model, xs[i]).y;
    return ys;
  }

  function trainRepOneEpoch(repModel, xs, targets, lr) {
    const gw1 = new Float32Array(H);
    const gb1 = new Float32Array(H);
    const gw2 = new Float32Array(H);
    let gb2 = 0;
    let mse = 0;

    const n = xs.length;
    for (let s = 0; s < n; s += 1) {
      const x = xs[s];
      const t = targets[s];
      const cache = forward(repModel, x);
      const err = cache.y - t;
      mse += err * err;
      const dy = (2 * err) / n;
      gb2 += dy;
      for (let i = 0; i < H; i += 1) {
        gw2[i] += cache.h[i] * dy;
        const dh = repModel.w2[i] * dy;
        const dz = dh * (1 - cache.h[i] * cache.h[i]);
        gw1[i] += x * dz;
        gb1[i] += dz;
      }
    }

    for (let i = 0; i < H; i += 1) {
      repModel.w1[i] -= lr * gw1[i];
      repModel.b1[i] -= lr * gb1[i];
      repModel.w2[i] -= lr * gw2[i];
    }
    repModel.b2 -= lr * gb2;
    return mse / n;
  }

  function ascendGeneratorPreLoss(genModel, repModel, xs, lr) {
    const gw1 = new Float32Array(H);
    const gb1 = new Float32Array(H);
    const gw2 = new Float32Array(H);
    let gb2 = 0;
    const n = xs.length;

    for (let s = 0; s < n; s += 1) {
      const x = xs[s];
      const gCache = forward(genModel, x);
      const rY = forward(repModel, x).y;
      const err = rY - gCache.y;
      const dLg_dGy = (-2 * err) / n;

      gb2 += dLg_dGy;
      for (let i = 0; i < H; i += 1) {
        gw2[i] += gCache.h[i] * dLg_dGy;
        const dh = genModel.w2[i] * dLg_dGy;
        const dz = dh * (1 - gCache.h[i] * gCache.h[i]);
        gw1[i] += x * dz;
        gb1[i] += dz;
      }
    }

    for (let i = 0; i < H; i += 1) {
      genModel.w1[i] += lr * gw1[i];
      genModel.b1[i] += lr * gb1[i];
      genModel.w2[i] += lr * gw2[i];
      genModel.w1[i] = clamp(genModel.w1[i], -3, 3);
      genModel.b1[i] = clamp(genModel.b1[i], -3, 3);
      genModel.w2[i] = clamp(genModel.w2[i], -3, 3);
    }
    genModel.b2 = clamp(genModel.b2 + lr * gb2, -3, 3);
  }

  function mse(pred, target) {
    let acc = 0;
    for (let i = 0; i < pred.length; i += 1) {
      const e = pred[i] - target[i];
      acc += e * e;
    }
    return acc / pred.length;
  }

  function pushHist(arr, v) {
    arr.push(v);
    if (arr.length > HISTORY) arr.shift();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(460, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(150, Math.floor((w * 29) / 100));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function drawAxes(x, y, w, h) {
    ctx.strokeStyle = "hsla(208 16% 36% / 0.36)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h);
    ctx.stroke();
  }

  function drawCurve(samples, x, y, w, h, color, alpha) {
    if (!samples.length) return;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(1.3, canvas.height * 0.006);
    ctx.beginPath();
    for (let i = 0; i < samples.length; i += 1) {
      const px = x + (i / (samples.length - 1)) * w;
      const py = y + (1 - samples[i]) * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function stepSimOnce() {
    const repSteps = parseInt(adaptEl.value, 10);
    const genLr = parseFloat(driftEl.value);
    const yGen = evalBatch(gen, xBatch);
    const yRepPre = evalBatch(rep, xBatch);
    const pre = mse(yRepPre, yGen);

    const repTmp = copyModel(rep);
    for (let rs = 0; rs < repSteps; rs += 1) {
      trainRepOneEpoch(repTmp, xBatch, yGen, REP_LR);
    }
    const yRepPost = evalBatch(repTmp, xBatch);
    const post = mse(yRepPost, yGen);
    const delta = pre - post;

    rep.w1.set(repTmp.w1);
    rep.b1.set(repTmp.b1);
    rep.w2.set(repTmp.w2);
    rep.b2 = repTmp.b2;

    ascendGeneratorPreLoss(gen, rep, xBatch, genLr);

    pushHist(histPre, clamp(pre, 0, 1));
    pushHist(histPost, clamp(post, 0, 1));
    pushHist(histDelta, clamp(delta, 0, 1));
  }

  function tick(ts) {
    const dt = Math.min((ts - lastTs) * 0.001, 0.05);
    lastTs = ts;
    if (running) {
      simAccum += dt;
      while (simAccum >= SIM_STEP_INTERVAL_S) {
        stepSimOnce();
        simAccum -= SIM_STEP_INTERVAL_S;
      }
    }

    resize();
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const pad = { l: W * 0.08, r: W * 0.05, t: H * 0.16, b: H * 0.16 };
    const gw = W - pad.l - pad.r;
    const gh = H - pad.t - pad.b;
    drawAxes(pad.l, pad.t, gw, gh);

    const preSeries = histPre.length ? histPre : [0];
    const postShiftSeries = [];
    for (let i = 0; i < histPost.length; i += 1) {
      if (i === 0) postShiftSeries.push(histPost[0]);
      else postShiftSeries.push(histPost[i - 1]);
    }
    const deltaSeries = histDelta.length ? histDelta : [0];

    drawCurve(preSeries, pad.l, pad.t, gw, gh, "hsla(18 78% 44% / 0.95)", 1);
    drawCurve(postShiftSeries, pad.l, pad.t, gw, gh, "hsla(210 58% 44% / 0.95)", 1);
    drawCurve(deltaSeries, pad.l, pad.t, gw, gh, "hsla(140 54% 34% / 0.9)", 0.9);

    const delta = histDelta.length ? histDelta[histDelta.length - 1] : 0;
    const preVal = histPre.length ? histPre[histPre.length - 1] : 0;
    const postVal = histPost.length ? histPost[histPost.length - 1] : 0;
    deltaEl.textContent = delta.toFixed(3);
    preEl.textContent = preVal.toFixed(3);
    postEl.textContent = postVal.toFixed(3);

    ctx.fillStyle = "hsla(208 18% 24% / 0.82)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.max(11, Math.floor(H * 0.075))}px EB Garamond, serif`;
    ctx.fillText("L_post(t-1)", pad.l + 8, pad.t + 10);
    ctx.fillStyle = "hsla(18 78% 36% / 0.88)";
    ctx.fillText("L_pre(t)", pad.l + 96, pad.t + 10);
    ctx.fillStyle = "hsla(140 54% 28% / 0.9)";
    ctx.fillText("Δ(t)", pad.l + 178, pad.t + 10);

    ctx.fillStyle = "hsla(208 18% 24% / 0.8)";
    ctx.textAlign = "right";
    ctx.fillText("Generator: x -> y_g(x), Representation: x -> y_r(x)", W - pad.r, pad.t + 10);

    requestAnimationFrame(tick);
  }

  startBtn.addEventListener("click", () => {
    running = true;
    startBtn.textContent = "Running";
  });

  restartBtn.addEventListener("click", () => {
    resetSim();
  });

  window.addEventListener("resize", resize);
  resetSim();
  resize();
  requestAnimationFrame(tick);
})();

(function initEvoLoopLab() {
  const root = document.getElementById("evo-loop-lab");
  if (!root) return;
  const canvas = root.querySelector("#evo-loop-canvas");
  const ctx = canvas.getContext("2d");

  let t = 0;
  let lastTs = performance.now();
  const cycleSeconds = 6.2;
  const noveltyFrac = 0.43;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(520, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(160, Math.floor((w * 14) / 46));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function phaseLoss(u) {
    if (u < noveltyFrac) {
      const p = u / noveltyFrac;
      const base = 0.24 + 0.56 * p;
      const jag = 0.04 * Math.sin(23 * p) + 0.02 * Math.sin(71 * p + 0.4);
      return clamp(base + jag, 0.06, 0.96);
    }
    const q = (u - noveltyFrac) / (1 - noveltyFrac);
    const base = 0.14 + 0.72 * Math.exp(-4.6 * q);
    const jag = 0.015 * Math.sin(34 * q + 0.2);
    return clamp(base + jag, 0.06, 0.96);
  }

  function draw() {
    resize();
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const leftW = W * 0.32;
    const gap = W * 0.035;
    const gx = leftW + gap;
    const gy = H * 0.13;
    const gw = W - gx - W * 0.06;
    const gh = H * 0.74;

    const u = (t % cycleSeconds) / cycleSeconds;
    const noveltyOn = u < noveltyFrac;
    const pNovel = noveltyOn ? u / noveltyFrac : 1;
    const pTrain = noveltyOn ? 0 : (u - noveltyFrac) / (1 - noveltyFrac);

    const normalSize = Math.max(11, Math.floor(H * 0.075));
    const activeSize = Math.max(14, Math.floor(H * 0.098));

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    ctx.fillStyle = noveltyOn ? "hsla(208 18% 18% / 0.94)" : "hsla(208 18% 24% / 0.66)";
    ctx.font = `${noveltyOn ? activeSize : normalSize}px EB Garamond, serif`;
    ctx.fillText("Find Local Novelty", W * 0.03, H * 0.39);

    ctx.fillStyle = noveltyOn ? "hsla(208 18% 24% / 0.66)" : "hsla(208 18% 18% / 0.94)";
    ctx.font = `${noveltyOn ? normalSize : activeSize}px EB Garamond, serif`;
    ctx.fillText("Train Representation", W * 0.03, H * 0.60);

    ctx.strokeStyle = "hsla(208 16% 36% / 0.36)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, gy + gh);
    ctx.lineTo(gx + gw, gy + gh);
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx, gy + gh);
    ctx.stroke();

    const peakYv = 0.82;
    const plateauYv = 0.16;
    const yPeak = gy + (1 - peakYv) * gh;
    const yPlateau = gy + (1 - plateauYv) * gh;

    ctx.setLineDash([5, 4]);
    ctx.lineWidth = Math.max(1, H * 0.0045);
    ctx.strokeStyle = "hsla(8 72% 42% / 0.68)";
    ctx.beginPath();
    ctx.moveTo(gx, yPeak);
    ctx.lineTo(gx + gw, yPeak);
    ctx.stroke();

    ctx.strokeStyle = "hsla(210 52% 40% / 0.64)";
    ctx.beginPath();
    ctx.moveTo(gx + gw * 0.62, yPlateau);
    ctx.lineTo(gx + gw, yPlateau);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `${Math.max(9, Math.floor(H * 0.05))}px EB Garamond, serif`;
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "hsla(8 72% 34% / 0.84)";
    ctx.textAlign = "right";
    ctx.fillText("Edge of Reasonable Novelty", gx + gw - 2, yPeak - 3);

    ctx.textBaseline = "top";
    ctx.fillStyle = "hsla(210 46% 34% / 0.82)";
    ctx.fillText("Plateau Reached", gx + gw - 2, yPlateau + 3);

    ctx.save();
    ctx.translate(gx - W * 0.038, gy + gh * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "hsla(208 18% 24% / 0.78)";
    ctx.font = `${Math.max(10, Math.floor(H * 0.056))}px EB Garamond, serif`;
    ctx.fillText("Representation Loss", 0, 0);
    ctx.restore();

    const N = 140;
    ctx.strokeStyle = "hsla(206 44% 34% / 0.88)";
    ctx.lineWidth = Math.max(1.6, H * 0.008);
    ctx.beginPath();
    for (let i = 0; i < N; i += 1) {
      const x = i / (N - 1);
      const yv = phaseLoss(x);
      const px = gx + x * gw;
      const py = gy + (1 - yv) * gh;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    const yNow = phaseLoss(u);
    const xNow = gx + u * gw;
    const pyNow = gy + (1 - yNow) * gh;
    ctx.beginPath();
    ctx.arc(xNow, pyNow, Math.max(2.6, H * 0.014), 0, Math.PI * 2);
    ctx.fillStyle = "hsla(30 74% 42% / 0.92)";
    ctx.fill();

    ctx.fillStyle = "hsla(208 18% 24% / 0.72)";
    ctx.textAlign = "right";
    ctx.font = `${Math.max(10, Math.floor(H * 0.06))}px EB Garamond, serif`;
    if (noveltyOn) {
      ctx.fillText(`Loss rising (novelty search) ${Math.round(pNovel * 100)}%`, gx + gw, gy - H * 0.035);
    } else {
      ctx.fillText(`Loss falling (representation training) ${Math.round(pTrain * 100)}%`, gx + gw, gy - H * 0.035);
    }

    window.__evoLoopSync = { u, noveltyOn, pNovel, pTrain };
  }

  function tick(ts) {
    const dt = Math.min((ts - lastTs) * 0.001, 0.05);
    lastTs = ts;
    t += dt;
    draw();
    requestAnimationFrame(tick);
  }

  window.addEventListener("resize", draw);
  draw();
  requestAnimationFrame(tick);
})();

(function initEvoSearchLab() {
  const root = document.getElementById("evo-search-lab");
  if (!root) return;
  const canvas = root.querySelector("#evo-search-canvas");
  const ctx = canvas.getContext("2d");
  let t = 0;
  let lastTs = performance.now();
  const cycleSeconds = 9.0;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(520, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(170, Math.floor((w * 15) / 46));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function roundedRectPath(x, y, w, h, r) {
    const rr = Math.min(r, w * 0.2, h * 0.2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function drawPattern(x, y, s, noiseMix, phi, radial, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const inner = s * 0.78;
    const ix = x + (s - inner) * 0.5;
    const iy = y + (s - inner) * 0.5;
    roundedRectPath(ix, iy, inner, inner, inner * 0.08);
    ctx.fillStyle = "hsla(0 0% 96% / 0.9)";
    ctx.fill();

    const cX = ix + inner * 0.5;
    const cY = iy + inner * 0.5;
    const a1 = phi;
    const a2 = phi + Math.PI * 0.7;
    const a3 = phi + Math.PI * 1.25;
    const m = 0.18 * radial;

    ctx.fillStyle = `hsla(212 26% 30% / ${0.78 * (1 - noiseMix)})`;
    ctx.beginPath();
    ctx.arc(cX + Math.cos(a1) * inner * (0.22 + m), cY + Math.sin(a1) * inner * 0.2, inner * 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `hsla(7 72% 48% / ${0.62 * (1 - noiseMix)})`;
    ctx.beginPath();
    ctx.moveTo(cX + Math.cos(a2) * inner * (0.34 + m), cY + Math.sin(a2) * inner * 0.34);
    ctx.lineTo(cX + Math.cos(a2 + 1.1) * inner * 0.22, cY + Math.sin(a2 + 1.1) * inner * 0.22);
    ctx.lineTo(cX + Math.cos(a2 + 2.2) * inner * 0.28, cY + Math.sin(a2 + 2.2) * inner * 0.28);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `hsla(142 42% 38% / ${0.58 * (1 - noiseMix)})`;
    ctx.beginPath();
    ctx.rect(
      cX + Math.cos(a3) * inner * (0.16 + m) - inner * 0.09,
      cY + Math.sin(a3) * inner * 0.18 - inner * 0.09,
      inner * 0.18,
      inner * 0.18
    );
    ctx.fill();

    const grid = 13;
    const cell = inner / grid;
    for (let gy = 0; gy < grid; gy += 1) {
      for (let gx = 0; gx < grid; gx += 1) {
        const n0 = Math.sin((gx + 1) * 12.9898 + (gy + 1) * 78.233 + phi * 23.17) * 43758.5453;
        const frac = n0 - Math.floor(n0);
        const shade = Math.floor(26 + frac * 210);
        ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${0.94 * noiseMix})`;
        ctx.fillRect(ix + gx * cell, iy + gy * cell, cell * 0.92, cell * 0.92);
      }
    }
    ctx.restore();
  }

  function drawImageCard(x, y, s, label, noiseMix, phi, radial, active) {
    const a = active ? 1 : 0.72;
    roundedRectPath(x, y, s, s, s * 0.08);
    ctx.fillStyle = `hsla(210 24% 86% / ${0.24 * a})`;
    ctx.fill();
    ctx.strokeStyle = active ? "hsla(30 74% 42% / 0.78)" : "hsla(208 16% 30% / 0.38)";
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();
    drawPattern(x, y, s, noiseMix, phi, radial, 1);

    ctx.fillStyle = "hsla(208 18% 24% / 0.78)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `${Math.max(10, Math.floor(canvas.height * 0.05))}px EB Garamond, serif`;
    ctx.fillText(label, x + s * 0.5, y + s + 5);
  }

  function draw() {
    resize();
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const u = (t % cycleSeconds) / cycleSeconds;
    let cx = W * 0.28;
    const cy = H * 0.53;
    const R = H * 0.31;
    const cutoffR = R * 0.44;
    const ease = (x) => 1 - (1 - x) ** 2;
    const p = u < 0.8 ? u / 0.8 : (u - 0.8) / 0.2;
    let probeR;
    let probeA;
    if (u < 0.8) {
      const radial = ease(p);
      probeR = cutoffR * (0.08 + 0.92 * radial);
      probeA = -Math.PI * 0.5 + p * Math.PI * 2.5;
    } else {
      probeR = cutoffR + (R - cutoffR) * p;
      probeA = -Math.PI * 0.5 + Math.PI * 2.5 + p * Math.PI * 0.35;
    }
    const qx = cx + Math.cos(probeA) * probeR;
    const qy = cy + Math.sin(probeA) * probeR;
    const overshoot = clamp((probeR - cutoffR) / (R - cutoffR), 0, 1);
    const noiseMix = overshoot ** 0.7;
    const radialNorm = clamp(probeR / cutoffR, 0, 1);

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = "hsla(208 16% 36% / 0.34)";
    ctx.lineWidth = Math.max(1.1, H * 0.005);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, cutoffR, 0, Math.PI * 2);
    ctx.fillStyle = "hsla(140 44% 42% / 0.12)";
    ctx.fill();
    ctx.strokeStyle = "hsla(140 44% 32% / 0.48)";
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(4, H * 0.016), 0, Math.PI * 2);
    ctx.fillStyle = "hsla(30 74% 42% / 0.9)";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(qx, qy);
    ctx.strokeStyle = overshoot > 0.02 ? "hsla(8 72% 42% / 0.68)" : "hsla(140 44% 32% / 0.68)";
    ctx.lineWidth = Math.max(1.1, H * 0.005);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(qx, qy, Math.max(3.8, H * 0.016), 0, Math.PI * 2);
    ctx.fillStyle = overshoot > 0.02 ? "hsla(8 72% 42% / 0.95)" : "hsla(30 74% 42% / 0.95)";
    ctx.fill();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "hsla(208 18% 24% / 0.75)";
    ctx.font = `${Math.max(9, Math.floor(H * 0.042))}px EB Garamond, serif`;
    ctx.fillText("Current generation", cx, cy - H * 0.09);
    ctx.fillText("Local novelty cutoff", cx, cy + cutoffR + H * 0.08);
    ctx.fillText("Search space", cx, cy - R - H * 0.07);

    const panelSize = Math.min(W, H) * 0.42;
    let px = W * 0.56;
    const groupMidX = (cx - R + (px + panelSize)) * 0.5;
    const groupShift = W * 0.5 - groupMidX;
    cx += groupShift;
    px += groupShift;
    const py = cy - panelSize * 0.5;
    drawImageCard(px, py, panelSize, "Image at probe position", noiseMix, probeA, radialNorm, true);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.max(13, Math.floor(H * 0.064))}px EB Garamond, serif`;
    if (overshoot > 0.02) {
      ctx.fillStyle = "hsla(8 72% 34% / 0.9)";
      ctx.fillText("Beyond cutoff: collapses to adversarial novelty", W * 0.5, H * 0.95);
    } else {
      ctx.fillStyle = "hsla(140 44% 30% / 0.9)";
      ctx.fillText("Inside cutoff: image morphs but stays coherent", W * 0.5, H * 0.95);
    }
  }

  function tick(ts) {
    const dt = Math.min((ts - lastTs) * 0.001, 0.05);
    lastTs = ts;
    t += dt;
    draw();
    requestAnimationFrame(tick);
  }

  window.addEventListener("resize", draw);
  draw();
  requestAnimationFrame(tick);
})();

(function initPostComments() {
  const host = document.getElementById("post-comments-thread");
  if (!host) return;
  if (host.querySelector(".utterances")) return;

  const s = document.createElement("script");
  s.src = "https://utteranc.es/client.js";
  s.async = true;
  s.setAttribute("repo", "the-puzzler/the-puzzler.github.io");
  // Fixed term guarantees an independent thread for this post.
  s.setAttribute(
    "issue-term",
    "posts/training-a-model-to-open-the-gates-of-hell/training-a-model-to-open-the-gates-of-hell.html"
  );
  s.setAttribute("label", "comments");
  s.setAttribute("theme", "github-light");
  s.setAttribute("crossorigin", "anonymous");
  host.appendChild(s);
})();
