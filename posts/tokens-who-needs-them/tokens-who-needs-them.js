function initAttentionLab() {
  const root = document.getElementById('attention-lab');
  if (!root || root.dataset.bound === '1') return;
  root.dataset.bound = '1';

  const canvas = root.querySelector('#attn-canvas');
  const effectiveEl = root.querySelector('#attn-effective');
  const pairsEl = root.querySelector('#attn-pairs');
  const flopsEl = root.querySelector('#attn-flops');
  const ctx = canvas.getContext('2d');
  const N_MIN = 32;
  const N_MAX = 256;
  const N_STEP = 8;
  let currentN = 32;
  let scanN = 32;
  let scanDir = 1;
  let rafId = null;
  let lastTs = 0;

  function fmtInt(v) {
    return new Intl.NumberFormat().format(Math.round(v));
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function triangularPairs(n) {
    return (n * (n + 1)) / 2;
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(640, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(360, Math.floor((w * 2.4) / 5));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h };
  }

  function draw() {
    const nEff = Math.max(1, currentN);
    const nInt = Math.round(nEff);
    const basePairs = triangularPairs(32);
    const pairs = triangularPairs(nEff);
    const relFlops = pairs / Math.max(1, basePairs);

    effectiveEl.textContent = `N=${fmtInt(nInt)}`;
    pairsEl.textContent = fmtInt(pairs);
    flopsEl.textContent = `${relFlops.toFixed(3)}x`;

    const { w, h } = resizeCanvas();
    ctx.clearRect(0, 0, w, h);

    const padL = Math.floor(w * 0.03);
    const padR = Math.floor(w * 0.03);
    const padT = Math.floor(h * 0.08);
    const padB = Math.floor(h * 0.07);
    const gridW = w - padL - padR;
    const gridH = h - padT - padB;

    ctx.fillStyle = 'rgba(0,0,0,0.02)';
    ctx.fillRect(padL, padT, gridW, gridH);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, gridW, gridH);

    // Horizontal guide lines.
    ctx.strokeStyle = 'rgba(0,0,0,0.09)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i += 1) {
      const y = padT + (gridH * i) / 5;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + gridW, y);
      ctx.stroke();
    }

    const yMax = triangularPairs(N_MAX);

    const xOf = (n) => padL + ((n - N_MIN) / (N_MAX - N_MIN)) * gridW;
    const yOf = (pairCount) => padT + (1 - pairCount / yMax) * gridH;

    // Draw curve.
    ctx.strokeStyle = 'rgba(40, 95, 170, 0.9)';
    ctx.lineWidth = Math.max(2, Math.round(h * 0.006));
    ctx.beginPath();
    for (let n = N_MIN; n <= N_MAX; n += 1) {
      const x = xOf(n);
      const y = yOf(triangularPairs(n));
      if (n === N_MIN) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Highlight current selected N.
    const px = xOf(nEff);
    const py = yOf(pairs);
    const pointR = Math.max(5, Math.round(h * 0.014));
    ctx.fillStyle = 'rgba(210, 95, 40, 0.95)';
    ctx.beginPath();
    ctx.arc(px, py, pointR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.font = `${Math.max(11, Math.round(h * 0.03))}px EB Garamond, serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`N=${fmtInt(nInt)}, pairs=${fmtInt(pairs)}`, Math.min(px + 10, padL + gridW - 180), Math.max(py - 8, padT + 14));

    ctx.font = `${Math.max(15, Math.round(h * 0.042))}px EB Garamond, serif`;
    ctx.textAlign = 'left';
    ctx.fillText('Causal attention compute vs sequence length', padL, Math.floor(padT * 0.5));
  }

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    const speed = 70; // N-units per second
    scanN += scanDir * speed * dt;
    if (scanN >= N_MAX) {
      scanN = N_MAX;
      scanDir = -1;
    } else if (scanN <= N_MIN) {
      scanN = N_MIN;
      scanDir = 1;
    }
    currentN = clamp(scanN, N_MIN, N_MAX);

    draw();
    rafId = requestAnimationFrame(tick);
  }

  window.addEventListener('resize', draw, { passive: true });
  draw();
  rafId = requestAnimationFrame(tick);
}

function initUnetFlowLab() {
  const root = document.getElementById('unet-flow-lab');
  if (!root || root.dataset.bound === '1') return;
  root.dataset.bound = '1';

  const canvas = root.querySelector('#unet-flow-canvas');
  const ctx = canvas.getContext('2d');
  const W = 900;
  const H = 250;
  let running = true;
  let rafId = null;
  let t = 0;
  let last = 0;
  let sx = 1;
  let sy = 1;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function ease(p) { const x = clamp(p, 0, 1); return x * x * (3 - 2 * x); }
  function phaseRamp(phase, start, dur) {
    const x = (phase - start) / dur;
    if (x <= 0 || x >= 1) return 0;
    return ease(x);
  }
  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function drawArrow(x0, y0, x1, y1, alpha = 0.3) {
    ctx.strokeStyle = `hsla(208 40% 34% / ${alpha})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0);
    const h = 6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(a - 0.42) * h, y1 - Math.sin(a - 0.42) * h);
    ctx.lineTo(x1 - Math.cos(a + 0.42) * h, y1 - Math.sin(a + 0.42) * h);
    ctx.closePath();
    ctx.fillStyle = `hsla(208 40% 34% / ${alpha})`;
    ctx.fill();
  }
  function shortMidSegment(x0, y0, x1, y1, scale = 0.32, minLen = 30, maxLen = 240) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const mx = (x0 + x1) * 0.5;
    const my = (y0 + y1) * 0.5;
    const seg = clamp(d * scale, minLen, maxLen);
    const hx = ux * seg * 0.5;
    const hy = uy * seg * 0.5;
    return [mx - hx, my - hy, mx + hx, my + hy];
  }
  function drawFlowDot(x0, y0, x1, y1, p, warm = false) {
    const x = lerp(x0, x1, p);
    const y = lerp(y0, y1, p);
    ctx.beginPath();
    ctx.arc(x, y, 3.8, 0, Math.PI * 2);
    ctx.fillStyle = warm ? 'hsla(28 80% 44% / 0.95)' : 'hsla(208 64% 40% / 0.95)';
    ctx.fill();
  }
  function drawStageStack(stage, pulse = 0) {
    const depth = stage.depth;
    const s = stage.size;
    const gap = stage.offset;
    const x0 = stage.x;
    const y0 = stage.y;
    for (let i = 0; i < depth; i += 1) {
      const k = depth - 1 - i;
      const x = x0 + k * gap;
      const y = y0 + k * gap;
      const a = 0.12 + (i / Math.max(1, depth - 1)) * 0.26 + pulse * 0.16;
      roundedRect(x, y, s, s, 5);
      ctx.fillStyle = `hsla(210 38% 80% / ${a})`;
      ctx.fill();
      ctx.strokeStyle = `hsla(208 18% 28% / ${0.24 + pulse * 0.22})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const cx = x0 + (depth - 1) * gap + s * 0.5;
    const cy = y0 + (depth - 1) * gap + s + 16;
    ctx.fillStyle = 'hsla(208 18% 24% / 0.84)';
    ctx.font = '12px EB Garamond, serif';
    ctx.textAlign = 'center';
    ctx.fillText(stage.label, cx, cy);
    ctx.fillStyle = 'hsla(208 16% 28% / 0.72)';
    ctx.fillText(stage.dim, cx, cy + 14);
    return { cx, cy: y0 + (depth - 1) * gap + s * 0.5 };
  }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(620, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(190, Math.floor((w * 1) / 3.6));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    sx = w / W;
    sy = h / H;
  }

  function drawFrame() {
    resize();
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'hsl(39 26% 97%)';
    ctx.fillRect(0, 0, W, H);

    const phase = (t % 7.2) / 7.2;
    const stages = [
      { x: 54, y: 34, size: 66, depth: 3, offset: 7, label: 'Enc L1', dim: '(H, W, C)' },
      { x: 186, y: 64, size: 52, depth: 5, offset: 6, label: 'Enc L2', dim: '(H/2, W/2, 2C)' },
      { x: 302, y: 100, size: 40, depth: 7, offset: 5, label: 'Enc L3', dim: '(H/4, W/4, 4C)' },
      { x: 410, y: 138, size: 30, depth: 9, offset: 4, label: 'Bottleneck', dim: '(H/8, W/8, 8C)' },
      { x: 522, y: 100, size: 40, depth: 7, offset: 5, label: 'Dec L3', dim: '(H/4, W/4, 4C)' },
      { x: 640, y: 64, size: 52, depth: 5, offset: 6, label: 'Dec L2', dim: '(H/2, W/2, 2C)' },
      { x: 772, y: 34, size: 66, depth: 3, offset: 7, label: 'Dec L1', dim: '(H, W, C)' }
    ];

    // Ordered U-Net flow:
    // 1) Down path to bottleneck
    // 2) Each up step, then its matching skip merge
    const p01 = phaseRamp(phase, 0.06, 0.08);
    const p12 = phaseRamp(phase, 0.16, 0.08);
    const p23 = phaseRamp(phase, 0.26, 0.08);

    // Decoder and matching skip tokens are synchronised per level:
    // they leave together and arrive together at the merge stage.
    const p34 = phaseRamp(phase, 0.40, 0.10);
    const psC = p34;
    const p45 = phaseRamp(phase, 0.58, 0.10);
    const psB = p45;
    const p56 = phaseRamp(phase, 0.76, 0.10);
    const psA = p56;

    // Layer highlighting: whenever flow is active between two layers, highlight both.
    const stagePulse = stages.map((_, i) => phaseRamp(phase, 0.04 + i * 0.10, 0.10) * 0.45);
    function bumpPair(a, b, p, gain = 1.0) {
      const v = p * gain;
      stagePulse[a] = Math.max(stagePulse[a], v);
      stagePulse[b] = Math.max(stagePulse[b], v);
    }
    bumpPair(0, 1, p01);
    bumpPair(1, 2, p12);
    bumpPair(2, 3, p23);
    bumpPair(3, 4, p34);
    bumpPair(2, 4, psC, 0.95);
    bumpPair(4, 5, p45);
    bumpPair(1, 5, psB, 0.95);
    bumpPair(5, 6, p56);
    bumpPair(0, 6, psA, 0.95);

    const centers = stages.map((s, i) => drawStageStack(s, stagePulse[i]));

    const links = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]
    ];
    const mainFull = links.map(([a, b]) => [centers[a].cx, centers[a].cy, centers[b].cx, centers[b].cy]);
    const mainSegs = mainFull.map(([x0, y0, x1, y1]) => shortMidSegment(x0, y0, x1, y1, 0.30));
    mainSegs.forEach((seg) => drawArrow(...seg, 0.30));

    // Skip arrows and skip balls are both COM -> COM.
    const skipArrowA = [centers[0].cx, centers[0].cy, centers[6].cx, centers[6].cy];
    const skipArrowB = [centers[1].cx, centers[1].cy, centers[5].cx, centers[5].cy];
    const skipArrowC = [centers[2].cx, centers[2].cy, centers[4].cx, centers[4].cy];
    const skipFullA = [...skipArrowA];
    const skipFullB = [...skipArrowB];
    const skipFullC = [...skipArrowC];

    // Enforce visible ordering: first skip longest, second medium, third shortest (kept near current).
    const skipSegA = shortMidSegment(...skipArrowA, 1.495, 40, 640);
    const skipSegB = shortMidSegment(...skipArrowB, 0.96, 38, 340);
    const skipSegC = shortMidSegment(...skipArrowC, 0.76, 34, 260);
    drawArrow(...skipSegA, 0.22);
    drawArrow(...skipSegB, 0.22);
    drawArrow(...skipSegC, 0.22);
    if (p01 > 0) drawFlowDot(...mainFull[0], p01);
    if (p12 > 0) drawFlowDot(...mainFull[1], p12);
    if (p23 > 0) drawFlowDot(...mainFull[2], p23);
    if (p34 > 0) drawFlowDot(...mainFull[3], p34);
    if (psC > 0) drawFlowDot(...skipFullC, psC, true);
    if (p45 > 0) drawFlowDot(...mainFull[4], p45);
    if (psB > 0) drawFlowDot(...skipFullB, psB, true);
    if (p56 > 0) drawFlowDot(...mainFull[5], p56);
    if (psA > 0) drawFlowDot(...skipFullA, psA, true);

    ctx.fillStyle = 'hsla(208 18% 24% / 0.86)';
    ctx.font = '13px EB Garamond, serif';
    ctx.textAlign = 'left';
    ctx.fillText('Compression: smaller spatial maps, deeper channel stacks', 44, 22);
    ctx.fillText('Expansion: upsample + skip features recover detail', 510, 22);
  }

  function step(ts) {
    if (!running) return;
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    t += dt;
    drawFrame();
    rafId = requestAnimationFrame(step);
  }

  function setRunning(next) {
    running = !!next;
    if (running) {
      last = 0;
      if (!rafId) rafId = requestAnimationFrame(step);
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  canvas.addEventListener('click', () => setRunning(!running));
  window.addEventListener('resize', drawFrame, { passive: true });
  drawFrame();
  setRunning(true);
}

function initCausalityDemo() {
  const root = document.getElementById('causality-demo');
  if (!root || root.dataset.bound === '1') return;
  root.dataset.bound = '1';

  const phraseEl = root.querySelector('#cds-phrase-list');
  const tfEl = root.querySelector('#cds-transformer-cols');
  const unetEl = root.querySelector('#cds-unet-cols');
  const tokens = ['The', 'Cat', 'Sat', 'in', 'the', 'Hat'];

  function pickTokenSubset(all, count) {
    if (count >= all.length) return [...all];
    if (count <= 1) return [all[0]];
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const idx = Math.round((i * (all.length - 1)) / (count - 1));
      out.push(all[idx]);
    }
    return out;
  }

  function renderPhraseColumn() {
    phraseEl.innerHTML = tokens.map(tok => `<div class="cds-token">${tok}</div>`).join('');
  }

  function renderColumns(host, counts, variant) {
    host.innerHTML = counts.map((count, i) => {
      const shown = pickTokenSubset(tokens, count);
      const stack = shown.map(tok => `<div class="cds-token">${tok}</div>`).join('');
      const causalPairs = Math.round((count * (count + 1)) / 2);
      return `
        <div class="cds-col ${variant}">
          <div class="cds-col-label">L${i + 1}</div>
          <div class="cds-stack">${stack}</div>
          <div class="cds-matrix">causal pairs: ${causalPairs}</div>
        </div>
      `;
    }).join('');
  }

  renderPhraseColumn();
  renderColumns(tfEl, [6, 6, 6, 6, 6], 'transformer');
  renderColumns(unetEl, [6, 4, 3, 4, 6], 'unet');
}

function initUpsampleDemo() {
  const root = document.getElementById('upsample-demo');
  if (!root || root.dataset.bound === '1') return;
  root.dataset.bound = '1';

  const canvas = root.querySelector('#upsample-demo-canvas');
  const ctx = canvas.getContext('2d');
  const W = 900;
  const H = 260;
  let sx = 1;
  let sy = 1;
  let running = true;
  let rafId = null;
  let t = 0;
  let last = 0;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function ease(p) { const x = clamp(p, 0, 1); return x * x * (3 - 2 * x); }
  function mix(a, b, p) { return a + (b - a) * p; }
  function windowAlpha(phase, a, b, feather = 0.06) {
    const inA = ease((phase - a) / feather);
    const outA = 1 - ease((phase - (b - feather)) / feather);
    return clamp(Math.min(inA, outA), 0, 1);
  }
  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(620, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(170, Math.floor((w * 1) / 3.46));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    sx = w / W;
    sy = h / H;
  }
  function drawVectorCard(cx, cy, w, h, bars, alpha, title, tint = 208, titleDy = -12) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const x = cx - w * 0.5;
    const y = cy - h * 0.5;
    roundedRect(x, y, w, h, 10);
    ctx.fillStyle = `hsla(${tint} 32% 84% / 0.48)`;
    ctx.fill();
    ctx.strokeStyle = 'hsla(208 18% 28% / 0.40)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const padX = 10;
    const barW = (w - padX * 2 - (bars.length - 1) * 4) / bars.length;
    const baseY = y + h - 12;
    bars.forEach((v, i) => {
      const bh = mix(8, h - 28, v);
      const bx = x + padX + i * (barW + 4);
      const by = baseY - bh;
      ctx.fillStyle = `hsla(${tint} 58% 40% / 0.80)`;
      ctx.fillRect(bx, by, barW, bh);
    });

    if (title) {
      ctx.fillStyle = 'hsla(208 18% 24% / 0.90)';
      ctx.font = '18px EB Garamond, serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, cx, y + titleDy);
    }
    ctx.restore();
  }
  function drawArrow(x0, y0, x1, y1, alpha = 0.5) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'hsla(208 40% 34% / 0.8)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0);
    const h = 7;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(a - 0.44) * h, y1 - Math.sin(a - 0.44) * h);
    ctx.lineTo(x1 - Math.cos(a + 0.44) * h, y1 - Math.sin(a + 0.44) * h);
    ctx.closePath();
    ctx.fillStyle = 'hsla(208 40% 34% / 0.8)';
    ctx.fill();
    ctx.restore();
  }

  function drawFrame() {
    resize();
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'hsl(39 26% 97%)';
    ctx.fillRect(0, 0, W, H);

    const phase = (t % 9.2) / 9.2;
    const a1 = windowAlpha(phase, 0.00, 0.30);
    const a2 = windowAlpha(phase, 0.22, 0.58);
    const a3 = windowAlpha(phase, 0.50, 0.80);
    const a4 = windowAlpha(phase, 0.74, 1.00);

    const cx = W * 0.5;
    const cy = H * 0.5 + 4;
    const vD = [0.42, 0.18, 0.72, 0.56, 0.30, 0.64, 0.48, 0.22];
    const v2D = [...vD, 0.36, 0.74, 0.52, 0.27, 0.61, 0.19, 0.68, 0.40];
    const top = v2D.slice(0, 8);
    const bot = v2D.slice(8, 16);

    // Step 1: single token vector.
    drawVectorCard(cx, cy, 200, 84, vD, a1, 'Token vector (D)');

    // Step 2: linear expansion to 2D.
    if (a2 > 0.001) {
      const lx = cx - 250;
      const rx = cx + 250;
      roundedRect(cx - 38, cy - 19, 76, 38, 8);
      ctx.save();
      ctx.globalAlpha = a2;
      ctx.fillStyle = 'hsla(32 56% 70% / 0.42)';
      ctx.fill();
      ctx.strokeStyle = 'hsla(208 18% 28% / 0.36)';
      ctx.stroke();
      ctx.fillStyle = 'hsla(208 18% 24% / 0.90)';
      ctx.font = '18px EB Garamond, serif';
      ctx.textAlign = 'center';
      ctx.fillText('Linear', cx, cy + 4);
      ctx.restore();

      drawVectorCard(lx, cy, 164, 72, vD, a2 * 0.9, 'Input (D)', 208, -14);
      drawArrow(lx + 92, cy, cx - 44, cy, a2 * 0.75);
      drawArrow(cx + 44, cy, rx - 126, cy, a2 * 0.75);
      drawVectorCard(rx, cy, 236, 72, v2D, a2, 'Expanded (2D)', 26, -14);
    }

    // Step 3: split expanded vector in half.
    if (a3 > 0.001) {
      drawVectorCard(cx, cy, 236, 84, v2D, a3, 'Split 2D -> D + D', 26, -22);
      ctx.save();
      ctx.globalAlpha = a3 * 0.85;
      ctx.strokeStyle = 'hsla(208 18% 28% / 0.72)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 54);
      ctx.lineTo(cx, cy + 54);
      ctx.stroke();
      ctx.restore();
    }

    // Step 4: stack into a 2-token column.
    if (a4 > 0.001) {
      const topY = cy - 28;
      const botY = cy + 38;
      drawVectorCard(cx, topY, 188, 62, top, a4, '', 208);
      drawVectorCard(cx, botY, 188, 62, bot, a4, '', 208);
      ctx.save();
      ctx.globalAlpha = a4;
      ctx.fillStyle = 'hsla(208 18% 24% / 0.90)';
      ctx.font = '18px EB Garamond, serif';
      ctx.textAlign = 'left';
      ctx.fillText('Token A (D)', cx + 112, topY + 5);
      ctx.fillText('Token B (D)', cx + 112, botY + 5);
      ctx.textAlign = 'center';
      ctx.fillText('Stacked output column (2 tokens)', cx, cy + 88);
      ctx.restore();
    }
  }

  function step(ts) {
    if (!running) return;
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    t += dt;
    drawFrame();
    rafId = requestAnimationFrame(step);
  }

  function setRunning(next) {
    running = !!next;
    if (running) {
      last = 0;
      if (!rafId) rafId = requestAnimationFrame(step);
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  canvas.addEventListener('click', () => setRunning(!running));
  window.addEventListener('resize', drawFrame, { passive: true });
  drawFrame();
  setRunning(true);
}

function initBottleneckLab() {
  const root = document.getElementById('bottleneck-lab');
  if (!root || root.dataset.bound === '1') return;
  root.dataset.bound = '1';

  const canvas = root.querySelector('#bottleneck-umap-canvas');
  const mapPanel = root.querySelector('#bottleneck-map-panel');
  const termsPanel = root.querySelector('#bottleneck-terms-panel');
  const titleEl = root.querySelector('#bottleneck-cloud-title');
  const termsEl = root.querySelector('#bottleneck-terms-cloud');
  const emptyEl = root.querySelector('#bottleneck-cloud-empty');
  const previewEl = root.querySelector('#bottleneck-span-preview');
  const ctx = canvas.getContext('2d');
  const csvPath = 'posts/tokens-who-needs-them/assets/umap_points_clusters_spans.csv';
  const tsvPath = 'posts/tokens-who-needs-them/assets/wordcloud_terms.tsv';

  let points = [];
  let centroids = [];
  let activePoint = null;
  let activeCluster = null;
  let clusterTerms = new Map();
  let dpr = 1;
  let view = null;

  function parseCsvRecords(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (ch !== '\r') {
        field += ch;
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function clusterColor(cluster) {
    if (cluster < 0) return 'hsl(0 0% 52%)';
    const hue = ((cluster * 47) % 360 + 360) % 360;
    return `hsl(${hue} 66% 44%)`;
  }

  function normaliseSnippet(text) {
    const compact = (text || '').replace(/\s+/g, ' ').trim();
    if (!compact) return '';
    return compact.slice(0, 50);
  }

  function clusterLabel(cluster) {
    if (cluster === -1) return 'HDBSCAN noise cluster';
    return `Cluster ${cluster}`;
  }

  function parseTermsTsv(text) {
    const out = new Map();
    const lines = text.split(/\r?\n/);
    let currentCluster = null;
    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i];
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('# Cluster ')) {
        const m = line.match(/^#\s*Cluster\s+(-?\d+)\b/);
        currentCluster = m ? Number.parseInt(m[1], 10) : null;
        if (currentCluster != null && !out.has(currentCluster)) out.set(currentCluster, []);
        continue;
      }
      if (line.startsWith('word\t')) continue;
      if (currentCluster == null) continue;

      const parts = raw.split('\t');
      if (parts.length < 2) continue;
      const word = (parts[0] || '').trim();
      const score = Number.parseFloat(parts[1]);
      if (!word || !Number.isFinite(score)) continue;
      out.get(currentCluster).push({ word, score });
    }

    out.forEach((arr, key) => {
      arr.sort((a, b) => b.score - a.score);
      out.set(key, arr);
    });
    return out;
  }

  function renderTerms(cluster) {
    const terms = clusterTerms.get(cluster) || [];
    if (!terms.length) {
      termsEl.innerHTML = '';
      emptyEl.style.display = 'block';
      emptyEl.textContent = `No enriched terms found for ${clusterLabel(cluster)}.`;
      syncPanelHeights();
      return;
    }

    const top = terms.slice(0, 46);
    const minScore = top[top.length - 1].score;
    const maxScore = top[0].score;
    const span = Math.max(1e-9, maxScore - minScore);
    const sparseBoost = 0;
    termsEl.style.justifyContent = 'flex-start';
    termsEl.style.gap = '6px';
    const noiseLabel = cluster === -1 ? '<span class="bottleneck-term" style="font-size:0.78rem;opacity:0.9;font-weight:600;">HDBSCAN noise cluster</span>' : '';
    termsEl.innerHTML = noiseLabel + top.map((t) => {
      const w = (t.score - minScore) / span;
      const size = 0.74 + w * 0.48 + sparseBoost;
      const alpha = 0.66 + w * 0.28;
      return `<span class="bottleneck-term" style="font-size:${size.toFixed(3)}rem;opacity:${alpha.toFixed(3)}" title="score ${t.score.toFixed(4)}">${t.word}</span>`;
    }).join(' ');
    emptyEl.style.display = 'none';
    emptyEl.textContent = '';
    syncPanelHeights();
  }

  function buildData(rows) {
    if (!rows.length) return [];
    const headers = rows[0];
    const iX = headers.indexOf('x');
    const iY = headers.indexOf('y');
    const iCluster = headers.indexOf('cluster');
    const iSpan = headers.indexOf('span_text');
    if (iX < 0 || iY < 0 || iCluster < 0 || iSpan < 0) return [];

    const out = [];
    for (let i = 1; i < rows.length; i += 1) {
      const r = rows[i];
      const x = Number.parseFloat(r[iX]);
      const y = Number.parseFloat(r[iY]);
      const cluster = Number.parseInt(r[iCluster], 10);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(cluster)) continue;
      out.push({ x, y, cluster, span: r[iSpan] || '', px: 0, py: 0 });
    }
    return out;
  }

  function computeCentroids(data) {
    const map = new Map();
    data.forEach((p) => {
      const c = map.get(p.cluster) || { cluster: p.cluster, sx: 0, sy: 0, n: 0 };
      c.sx += p.x;
      c.sy += p.y;
      c.n += 1;
      map.set(p.cluster, c);
    });
    return [...map.values()]
      .map(c => ({ cluster: c.cluster, x: c.sx / c.n, y: c.sy / c.n, n: c.n }))
      .sort((a, b) => a.cluster - b.cluster);
  }

  function applyClusterZeroXShift(data) {
    const cluster0 = data.filter(p => p.cluster === 0);
    const others = data.filter(p => p.cluster !== 0);
    if (!cluster0.length || !others.length) return;

    const c0x = cluster0.reduce((s, p) => s + p.x, 0) / cluster0.length;
    const ox = others.reduce((s, p) => s + p.x, 0) / others.length;
    const shift = (ox - c0x) * 0.42;
    cluster0.forEach((p) => {
      p.x += shift;
    });
  }

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(280, Math.floor(canvas.clientWidth || 700));
    const cssH = Math.round(cssW * 0.86);
    const newW = Math.floor(cssW * dpr);
    const newH = Math.floor(cssH * dpr);
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width = newW;
      canvas.height = newH;
    }
  }

  function syncPanelHeights() {
    if (!mapPanel || !termsPanel) return;
    const h = mapPanel.getBoundingClientRect().height;
    if (Number.isFinite(h) && h > 0) {
      const target = Math.max(120, Math.round(h));
      termsPanel.style.height = `${target}px`;
      termsPanel.style.minHeight = `${target}px`;
      termsPanel.style.maxHeight = `${target}px`;
    }
  }

  function setActive(point) {
    if (!point) {
      activePoint = null;
      activeCluster = null;
      titleEl.textContent = 'Cluster Terms';
      termsEl.innerHTML = '';
      emptyEl.style.display = 'block';
      emptyEl.textContent = 'Click a point to see enriched terms.';
      previewEl.textContent = 'Associated text (first 50 chars):';
      draw();
      return;
    }

    activePoint = point;
    activeCluster = point.cluster;
    titleEl.textContent = 'Cluster Terms';
    previewEl.textContent = `Associated text (first 50 chars): "${normaliseSnippet(point.span)}"`;
    renderTerms(point.cluster);
    draw();
  }

  function draw() {
    if (!points.length) return;
    resizeCanvas();
    const w = canvas.width;
    const h = canvas.height;
    const padL = Math.round(12 * dpr);
    const padR = Math.round(12 * dpr);
    const padT = Math.round(12 * dpr);
    const padB = Math.round(12 * dpr);

    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    points.forEach((p) => {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    });

    const dx = Math.max(1e-6, xMax - xMin);
    const dy = Math.max(1e-6, yMax - yMin);
    const xPad = dx * 0.02;
    const yPad = dy * 0.02;
    xMin -= xPad;
    xMax += xPad;
    yMin -= yPad;
    yMax += yPad;

    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const xToPx = x => padL + ((x - xMin) / (xMax - xMin)) * plotW;
    const yToPx = y => padT + (1 - (y - yMin) / (yMax - yMin)) * plotH;

    view = { xToPx, yToPx };

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'hsl(40 22% 97%)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, plotW, plotH);

    const pointRadius = Math.max(1.6, 1.8 * dpr);
    points.forEach((p) => {
      p.px = xToPx(p.x);
      p.py = yToPx(p.y);
      ctx.fillStyle = clusterColor(p.cluster);
      ctx.globalAlpha = activeCluster == null || p.cluster === activeCluster ? 0.78 : 0.18;
      ctx.beginPath();
      ctx.arc(p.px, p.py, pointRadius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    if (activePoint) {
      ctx.strokeStyle = 'rgba(18, 18, 18, 0.82)';
      ctx.lineWidth = Math.max(1.4, 1.2 * dpr);
      ctx.beginPath();
      ctx.arc(activePoint.px, activePoint.py, 5.3 * dpr, 0, Math.PI * 2);
      ctx.stroke();
    }

    centroids.forEach((c) => {
      const x = xToPx(c.x);
      const y = yToPx(c.y);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      ctx.arc(x, y, 8.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#1a1a1a';
      ctx.font = `${Math.round(9 * dpr)}px Roboto Mono, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(c.cluster), x, y + 0.5 * dpr);
    });

    syncPanelHeights();
  }

  function findNearestPoint(evt) {
    if (!points.length || !view) return;
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left) * (canvas.width / rect.width);
    const y = (evt.clientY - rect.top) * (canvas.height / rect.height);
    const maxR2 = (10 * dpr) ** 2;

    let nearest = null;
    let best = Infinity;
    points.forEach((p) => {
      const dx = p.px - x;
      const dy = p.py - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        nearest = p;
      }
    });

    if (nearest && best <= maxR2) return nearest;
    return null;
  }

  canvas.addEventListener('click', (evt) => {
    const nearest = findNearestPoint(evt);
    if (nearest) setActive(nearest);
  });
  window.addEventListener('resize', () => {
    draw();
    syncPanelHeights();
  }, { passive: true });

  Promise.all([
    fetch(csvPath).then(r => r.text()),
    fetch(tsvPath).then(r => r.text())
  ])
    .then(([csvText, tsvText]) => {
      const rows = parseCsvRecords(csvText);
      points = buildData(rows);
      applyClusterZeroXShift(points);
      centroids = computeCentroids(points);
      clusterTerms = parseTermsTsv(tsvText);
      draw();
      syncPanelHeights();
      const defaultPoint = points.find(p => p.cluster === 25) || points[0] || null;
      if (defaultPoint) setActive(defaultPoint);
    })
    .catch(() => {
      emptyEl.textContent = 'Could not load bottleneck analysis data.';
    });
}

function initArchitectureTableToggle() {
  const wrap = document.getElementById('arch-table-wrap');
  const btn = document.getElementById('arch-table-toggle');
  const icon = btn?.querySelector('.arch-toggle-icon');
  if (!wrap || !btn || !icon || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';

  btn.addEventListener('click', () => {
    const expanded = !wrap.classList.contains('is-expanded');
    wrap.classList.toggle('is-expanded', expanded);
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    btn.setAttribute('aria-label', expanded ? 'Collapse architecture table' : 'Expand architecture table');
    icon.textContent = expanded ? '▴' : '▾';
  });
}

function initClickPauseVideos() {
  document.querySelectorAll('.click-pause-video').forEach((video) => {
    if (video.dataset.bound === '1') return;
    video.dataset.bound = '1';
    video.addEventListener('click', () => {
      if (video.paused) video.play();
      else video.pause();
    });
  });
}

function initPostComments() {
  const host = document.getElementById('post-comments-thread');
  if (!host) return;
  if (host.querySelector('.utterances')) return;

  const s = document.createElement('script');
  s.src = 'https://utteranc.es/client.js';
  s.async = true;
  s.setAttribute('repo', 'the-puzzler/the-puzzler.github.io');
  s.setAttribute(
    'issue-term',
    'posts/tokens-who-needs-them/tokens-who-needs-them.html'
  );
  s.setAttribute('label', 'comments');
  s.setAttribute('theme', 'github-light');
  s.setAttribute('crossorigin', 'anonymous');
  host.appendChild(s);
}

document.addEventListener('post:ready', (evt) => {
  const path = evt?.detail?.path || '';
  if (!path.includes('tokens-who-needs-them')) return;
  initAttentionLab();
  initUnetFlowLab();
  initCausalityDemo();
  initUpsampleDemo();
  initBottleneckLab();
  initArchitectureTableToggle();
  initClickPauseVideos();
  initPostComments();
});

// Fallback for async sidecar load ordering: init immediately if lab already exists.
if (document.getElementById('attention-lab')) {
  initAttentionLab();
}
if (document.getElementById('unet-flow-lab')) {
  initUnetFlowLab();
}
if (document.getElementById('causality-demo')) {
  initCausalityDemo();
}
if (document.getElementById('upsample-demo')) {
  initUpsampleDemo();
}
if (document.getElementById('bottleneck-lab')) {
  initBottleneckLab();
}
if (document.getElementById('arch-table-wrap')) {
  initArchitectureTableToggle();
}
if (document.querySelector('.click-pause-video')) {
  initClickPauseVideos();
}
if (document.getElementById('post-comments-thread')) {
  initPostComments();
}
