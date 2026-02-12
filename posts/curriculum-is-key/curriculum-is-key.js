// Post-specific scripts for Curriculum Is Key
// Tiny in-browser experiment: train on 1..5 multiplication, hold out 9 (OOD).

(function () {
  function initAggregateFlockLab() {
    const root = document.getElementById('aggregate-flock-lab');
    if (!root) return;
    if (root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    const canvas = root.querySelector('#aggregate-flock-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const N = 84;
    const agents = Array.from({ length: N }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() * 2 - 1) * 0.55,
      vy: (Math.random() * 2 - 1) * 0.55,
      hue: 188 + Math.random() * 56,
      phase: Math.random() * Math.PI * 2
    }));

    let running = true;
    let rafId = null;
    let lastTs = 0;
    let weavePhase = 0;

    function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
    function dist2(ax, ay, bx, by) {
      const dx = bx - ax;
      const dy = by - ay;
      return dx * dx + dy * dy;
    }

    function step(dt) {
      const sepR2 = 20 * 20;
      const aliR2 = 58 * 58;
      const cohR2 = 72 * 72;
      const centerPull = 0.012;
      const weave = 0.34 + 0.66 * (0.5 + 0.5 * Math.sin(weavePhase));

      for (let i = 0; i < N; i++) {
        const a = agents[i];
        let sepX = 0, sepY = 0, aliX = 0, aliY = 0, cohX = 0, cohY = 0;
        let cAli = 0, cCoh = 0;

        for (let j = 0; j < N; j++) {
          if (i === j) continue;
          const b = agents[j];
          const d2 = dist2(a.x, a.y, b.x, b.y);
          if (d2 < sepR2) {
            const inv = 1 / Math.max(1, d2);
            sepX += (a.x - b.x) * inv;
            sepY += (a.y - b.y) * inv;
          }
          if (d2 < aliR2) {
            aliX += b.vx;
            aliY += b.vy;
            cAli++;
          }
          if (d2 < cohR2) {
            cohX += b.x;
            cohY += b.y;
            cCoh++;
          }
        }

        if (cAli > 0) {
          aliX = aliX / cAli - a.vx;
          aliY = aliY / cAli - a.vy;
        }
        if (cCoh > 0) {
          cohX = cohX / cCoh - a.x;
          cohY = cohY / cCoh - a.y;
        }

        const swirl = Math.sin(a.phase + weavePhase * 1.8);
        a.vx += (sepX * 1.05 + aliX * 0.052 + cohX * 0.0017) * dt * 60;
        a.vy += (sepY * 1.05 + aliY * 0.052 + cohY * 0.0017) * dt * 60;

        // Light weaving field nudges flock into temporary bands/threads.
        a.vx += Math.cos((a.y / H) * Math.PI * 4 + weavePhase + a.phase) * 0.008 * weave;
        a.vy += Math.sin((a.x / W) * Math.PI * 3 - weavePhase + a.phase) * 0.008 * weave;
        a.vx += swirl * 0.004;
        a.vy += -swirl * 0.004;

        a.vx += ((W * 0.5 - a.x) * centerPull) * dt;
        a.vy += ((H * 0.5 - a.y) * centerPull) * dt;

        const sp = Math.hypot(a.vx, a.vy);
        const maxSp = 1.55;
        if (sp > maxSp) {
          a.vx = (a.vx / sp) * maxSp;
          a.vy = (a.vy / sp) * maxSp;
        }

        a.x += a.vx * dt * 60;
        a.y += a.vy * dt * 60;

        if (a.x < -8) a.x = W + 8;
        else if (a.x > W + 8) a.x = -8;
        if (a.y < -8) a.y = H + 8;
        else if (a.y > H + 8) a.y = -8;
      }

      weavePhase += dt * 0.7;
    }

    function draw() {
      ctx.fillStyle = 'hsla(40 24% 97% / 0.11)';
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < N; i++) {
        const a = agents[i];
        for (let j = i + 1; j < N; j++) {
          const b = agents[j];
          const d2 = dist2(a.x, a.y, b.x, b.y);
          if (d2 > 62 * 62) continue;
          const d = Math.sqrt(d2);
          const alpha = clamp((62 - d) / 62, 0, 1) * 0.12;
          ctx.strokeStyle = `hsla(${((a.hue + b.hue) * 0.5).toFixed(1)} 48% 42% / ${alpha.toFixed(3)})`;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      for (let i = 0; i < N; i++) {
        const a = agents[i];
        ctx.fillStyle = `hsla(${a.hue.toFixed(1)} 62% 46% / 0.78)`;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function tick(ts) {
      if (!running) return;
      if (!lastTs) lastTs = ts;
      const dt = clamp((ts - lastTs) / 1000, 1 / 120, 1 / 24);
      lastTs = ts;
      step(dt);
      draw();
      rafId = window.requestAnimationFrame(tick);
    }

    function setRunning(on) {
      running = on;
      if (running) {
        lastTs = 0;
        rafId = window.requestAnimationFrame(tick);
      } else if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    ctx.fillStyle = 'hsl(40 24% 97%)';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 36; i++) {
      step(1 / 60);
      draw();
    }
    canvas.addEventListener('click', () => setRunning(!running));
    setRunning(true);
  }

  function initCreativityTilesLab() {
    const root = document.getElementById('creativity-tiles-lab');
    if (!root) return;
    if (root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    const canvas = root.querySelector('#creativity-tiles-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cx = W * 0.5;
    const cy = H * 0.5;
    const N = 140;
    let running = true;
    let rafId = null;
    let lastTs = 0;
    let hueDrift = 0;

    function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
    function rand(a, b) { return a + Math.random() * (b - a); }

    const tiles = Array.from({ length: N }, () => ({}));

    function respawn(t, near = false) {
      t.x = rand(-1, 1);
      t.y = rand(-0.72, 0.72);
      t.z = near ? rand(0.18, 0.6) : rand(0.75, 2.2);
      t.vz = rand(0.14, 0.42);
      t.size = rand(8, 26);
      t.rot = rand(-Math.PI, Math.PI);
      t.vr = rand(-0.35, 0.35);
      t.h = rand(175, 245);
      t.s = rand(46, 78);
      t.l = rand(42, 68);
      t.a = rand(0.10, 0.34);
    }

    for (let i = 0; i < tiles.length; i++) respawn(tiles[i], i < 20);

    function drawTile(t, dt) {
      t.z -= t.vz * dt;
      t.rot += t.vr * dt;
      if (t.z <= 0.14) {
        respawn(t, false);
        return;
      }

      const p = 1 / t.z;
      const sx = cx + t.x * W * 0.36 * p;
      const sy = cy + t.y * H * 0.42 * p;
      const size = t.size * p;
      if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60 || size > 180) {
        respawn(t, false);
        return;
      }

      const hue = (t.h + hueDrift) % 360;
      const alpha = clamp(t.a * (1.2 - t.z), 0.05, 0.38);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(t.rot);
      ctx.fillStyle = `hsla(${hue.toFixed(1)} ${t.s.toFixed(1)}% ${t.l.toFixed(1)}% / ${alpha.toFixed(3)})`;
      ctx.fillRect(-size * 0.5, -size * 0.5, size, size);
      ctx.strokeStyle = `hsla(${(hue + 30).toFixed(1)} 42% 20% / ${Math.min(0.18, alpha * 0.8).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.6, size * 0.03);
      ctx.strokeRect(-size * 0.5, -size * 0.5, size, size);
      ctx.restore();
    }

    function renderFrame(dt) {
      ctx.fillStyle = 'hsla(38 28% 97% / 0.11)';
      ctx.fillRect(0, 0, W, H);
      hueDrift += dt * 8.5;
      for (let i = 0; i < tiles.length; i++) drawTile(tiles[i], dt);
    }

    function tick(ts) {
      if (!running) return;
      if (!lastTs) lastTs = ts;
      const dt = clamp((ts - lastTs) / 1000, 1 / 120, 1 / 24);
      lastTs = ts;
      renderFrame(dt);
      rafId = window.requestAnimationFrame(tick);
    }

    function setRunning(on) {
      running = on;
      if (running) {
        lastTs = 0;
        rafId = window.requestAnimationFrame(tick);
      } else if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function resetBackground() {
      ctx.fillStyle = 'hsl(38 28% 97%)';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) renderFrame(1 / 60);
    }

    canvas.addEventListener('click', () => setRunning(!running));
    resetBackground();
    setRunning(true);
  }

  function initMulLab() {
    const root = document.getElementById('mul-ood-lab');
    if (!root) return;
    if (root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    const trainBtn = root.querySelector('#mul-train-btn');
    const resetBtn = root.querySelector('#mul-reset-btn');
    const trainMinEl = root.querySelector('#mul-train-min');
    const trainMaxEl = root.querySelector('#mul-train-max');
    const holdoutEl = root.querySelector('#mul-holdout');
    const epochsEl = root.querySelector('#mul-epochs');
    const epochsOut = root.querySelector('#mul-epochs-out');
    const trainMseEl = root.querySelector('#mul-train-mse');
    const oodMseEl = root.querySelector('#mul-ood-mse');
    const oodLabelEl = root.querySelector('#mul-ood-label');
    const canvas = root.querySelector('#mul-scatter');
    const queryA = root.querySelector('#mul-a');
    const queryB = root.querySelector('#mul-b');
    const queryBtn = root.querySelector('#mul-predict-btn');
    const queryOut = root.querySelector('#mul-query-out');

    let trainPairs = [];
    let oodPairs = [];
    let currentHoldout = 9;

    function intInRange(v, lo, hi, fallback) {
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(hi, Math.max(lo, Math.round(n)));
    }

    function rebuildDatasets() {
      const a = intInRange(trainMinEl.value, 1, 20, 1);
      const b = intInRange(trainMaxEl.value, 1, 20, 5);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      currentHoldout = intInRange(holdoutEl.value, 1, 20, 9);
      trainMinEl.value = String(lo);
      trainMaxEl.value = String(hi);
      holdoutEl.value = String(currentHoldout);

      const trainDigits = [];
      for (let d = lo; d <= hi; d++) trainDigits.push(d);

      trainPairs = [];
      for (const x of trainDigits) {
        for (const y of trainDigits) trainPairs.push({ a: x, b: y, y: x * y });
      }

      oodPairs = [];
      for (const d of trainDigits) oodPairs.push({ a: currentHoldout, b: d, y: currentHoldout * d });
      for (const d of trainDigits) oodPairs.push({ a: d, b: currentHoldout, y: d * currentHoldout });
      oodPairs.push({ a: currentHoldout, b: currentHoldout, y: currentHoldout * currentHoldout });

      oodLabelEl.textContent = `OOD(${currentHoldout})`;
    }

    const H = 56;
    const LR = 2e-3;
    const WD = 1e-4;
    const B1 = 0.9;
    const B2 = 0.999;
    const EPS = 1e-8;

    function randn() {
      let u = 0;
      let v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    function zeros(n) {
      return new Float64Array(n);
    }

    function createModel() {
      const m = {
        t: 0,
        W1: zeros(2 * H),
        b1: zeros(H),
        W2: zeros(H * H),
        b2: zeros(H),
        W3: zeros(H),
        b3: 0,
        gW1: zeros(2 * H),
        gb1: zeros(H),
        gW2: zeros(H * H),
        gb2: zeros(H),
        gW3: zeros(H),
        gb3: 0,
        mW1: zeros(2 * H), vW1: zeros(2 * H),
        mb1: zeros(H), vb1: zeros(H),
        mW2: zeros(H * H), vW2: zeros(H * H),
        mb2: zeros(H), vb2: zeros(H),
        mW3: zeros(H), vW3: zeros(H),
        mb3: 0, vb3: 0,
      };

      for (let i = 0; i < m.W1.length; i++) m.W1[i] = randn() * 0.18;
      for (let i = 0; i < m.W2.length; i++) m.W2[i] = randn() * 0.08;
      for (let i = 0; i < m.W3.length; i++) m.W3[i] = randn() * 0.12;
      return m;
    }

    function zeroGrads(m) {
      m.gW1.fill(0); m.gb1.fill(0);
      m.gW2.fill(0); m.gb2.fill(0);
      m.gW3.fill(0); m.gb3 = 0;
    }

    function tanh(x) {
      return Math.tanh(x);
    }

    function forward(m, a, b) {
      const z1 = zeros(H);
      const a1 = zeros(H);
      const z2 = zeros(H);
      const a2 = zeros(H);

      for (let i = 0; i < H; i++) {
        const v = m.b1[i] + a * m.W1[i] + b * m.W1[H + i];
        z1[i] = v;
        a1[i] = tanh(v);
      }

      for (let i = 0; i < H; i++) {
        let v = m.b2[i];
        for (let j = 0; j < H; j++) v += a1[j] * m.W2[j * H + i];
        z2[i] = v;
        a2[i] = tanh(v);
      }

      let out = m.b3;
      for (let i = 0; i < H; i++) out += a2[i] * m.W3[i];
      return { out, a1, a2 };
    }

    function backwardOne(m, pair) {
      const { a, b, y } = pair;
      const cache = forward(m, a, b);
      const pred = cache.out;
      const dOut = 2 * (pred - y);

      const da2 = zeros(H);
      const da1 = zeros(H);

      for (let i = 0; i < H; i++) {
        m.gW3[i] += cache.a2[i] * dOut;
        da2[i] = m.W3[i] * dOut;
      }
      m.gb3 += dOut;

      for (let i = 0; i < H; i++) {
        const dz2 = da2[i] * (1 - cache.a2[i] * cache.a2[i]);
        m.gb2[i] += dz2;
        for (let j = 0; j < H; j++) {
          const idx = j * H + i;
          m.gW2[idx] += cache.a1[j] * dz2;
          da1[j] += m.W2[idx] * dz2;
        }
      }

      for (let j = 0; j < H; j++) {
        const dz1 = da1[j] * (1 - cache.a1[j] * cache.a1[j]);
        m.gb1[j] += dz1;
        m.gW1[j] += a * dz1;
        m.gW1[H + j] += b * dz1;
      }

      return (pred - y) * (pred - y);
    }

    function adamStepArray(param, grad, m1, v1, t) {
      const b1t = 1 - Math.pow(B1, t);
      const b2t = 1 - Math.pow(B2, t);
      for (let i = 0; i < param.length; i++) {
        const g = grad[i];
        m1[i] = B1 * m1[i] + (1 - B1) * g;
        v1[i] = B2 * v1[i] + (1 - B2) * g * g;
        const mHat = m1[i] / b1t;
        const vHat = v1[i] / b2t;
        param[i] -= LR * (mHat / (Math.sqrt(vHat) + EPS) + WD * param[i]);
      }
    }

    function adamStepScalar(p, g, m1, v1, t) {
      const b1t = 1 - Math.pow(B1, t);
      const b2t = 1 - Math.pow(B2, t);
      const m = B1 * m1 + (1 - B1) * g;
      const v = B2 * v1 + (1 - B2) * g * g;
      const mHat = m / b1t;
      const vHat = v / b2t;
      const np = p - LR * (mHat / (Math.sqrt(vHat) + EPS) + WD * p);
      return { p: np, m, v };
    }

    function trainEpoch(m) {
      zeroGrads(m);
      let loss = 0;
      for (const pair of trainPairs) loss += backwardOne(m, pair);

      const scale = 1 / trainPairs.length;
      for (let i = 0; i < m.gW1.length; i++) m.gW1[i] *= scale;
      for (let i = 0; i < m.gb1.length; i++) m.gb1[i] *= scale;
      for (let i = 0; i < m.gW2.length; i++) m.gW2[i] *= scale;
      for (let i = 0; i < m.gb2.length; i++) m.gb2[i] *= scale;
      for (let i = 0; i < m.gW3.length; i++) m.gW3[i] *= scale;
      m.gb3 *= scale;

      m.t += 1;
      adamStepArray(m.W1, m.gW1, m.mW1, m.vW1, m.t);
      adamStepArray(m.b1, m.gb1, m.mb1, m.vb1, m.t);
      adamStepArray(m.W2, m.gW2, m.mW2, m.vW2, m.t);
      adamStepArray(m.b2, m.gb2, m.mb2, m.vb2, m.t);
      adamStepArray(m.W3, m.gW3, m.mW3, m.vW3, m.t);
      const b3s = adamStepScalar(m.b3, m.gb3, m.mb3, m.vb3, m.t);
      m.b3 = b3s.p;
      m.mb3 = b3s.m;
      m.vb3 = b3s.v;

      return loss * scale;
    }

    function evalPairs(m, pairs) {
      const preds = [];
      let mse = 0;
      for (const pair of pairs) {
        const p = forward(m, pair.a, pair.b).out;
        preds.push(p);
        mse += (p - pair.y) * (p - pair.y);
      }
      return { mse: mse / pairs.length, preds };
    }

    function drawScatter(pairs, preds) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width;
      const Hc = canvas.height;
      const pad = { l: 56, r: 18, t: 20, b: 40 };

      ctx.clearRect(0, 0, W, Hc);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(0, 0, W, Hc);

      // Merge duplicate true values (e.g. (9,2) and (2,9)) so each x appears once.
      const byTrue = new Map();
      for (let i = 0; i < pairs.length; i++) {
        const t = pairs[i].y;
        if (!byTrue.has(t)) byTrue.set(t, []);
        byTrue.get(t).push(preds[i]);
      }
      const ptsData = Array.from(byTrue.entries())
        .map(([trueY, ps]) => ({
          trueY: Number(trueY),
          predY: ps.reduce((a, b) => a + b, 0) / ps.length
        }))
        .sort((a, b) => a.trueY - b.trueY);

      const xs = ptsData.map(p => p.trueY); // true
      const ys = ptsData.map(p => p.predY); // predicted
      const xMin = 0;
      const yMin = 0;
      const maxVal = Math.max(81, ...xs, ...ys.map(v => Math.max(0, v)));
      const xMax = maxVal * 1.05;
      const yMax = maxVal * 1.05;

      const sx = (x) => pad.l + (x - xMin) / (xMax - xMin) * (W - pad.l - pad.r);
      const sy = (y) => Hc - pad.b - (y - yMin) / (yMax - yMin) * (Hc - pad.t - pad.b);

      ctx.strokeStyle = 'rgba(120,120,120,0.28)';
      ctx.lineWidth = 1;
      const yTickVals = Array.from(new Set(ys.map(v => Math.round(v * 10) / 10))).sort((a, b) => a - b);
      const xTickVals = Array.from(new Set(xs)).sort((a, b) => a - b);
      for (const gy of yTickVals) {
        const py = sy(gy);
        ctx.beginPath();
        ctx.moveTo(pad.l, py);
        ctx.lineTo(W - pad.r, py);
        ctx.stroke();
      }
      for (const gx of xTickVals) {
        const px = sx(gx);
        ctx.beginPath();
        ctx.moveTo(px, Hc - pad.b);
        ctx.lineTo(px, pad.t);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(80,80,80,0.7)';
      ctx.beginPath();
      ctx.moveTo(pad.l, Hc - pad.b);
      ctx.lineTo(W - pad.r, Hc - pad.b);
      ctx.moveTo(pad.l, Hc - pad.b);
      ctx.lineTo(pad.l, pad.t);
      ctx.stroke();

      // Ideal diagonal y = x
      ctx.strokeStyle = 'rgba(190,80,80,0.85)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(sx(xMin), sy(xMin));
      ctx.lineTo(sx(Math.min(xMax, yMax)), sy(Math.min(xMax, yMax)));
      ctx.stroke();
      ctx.setLineDash([]);

      const pts = ptsData.map(p => ({ x: sx(p.trueY), y: sy(p.predY) }));

      // Connect points left->right
      ctx.strokeStyle = '#5a86d8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();

      ctx.fillStyle = '#2d4d8c';
      for (const pt of pts) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(50,50,50,0.82)';
      ctx.font = '12px EB Garamond, serif';
      // Axis labels
      ctx.fillText('x: true product (OOD pairs)', W - 170, Hc - 14);
      ctx.fillText('y: predicted product', 12, 16);

      // Numeric ticks
      ctx.font = '11px EB Garamond, serif';
      ctx.fillStyle = 'rgba(70,70,70,0.9)';
      for (const xv of xTickVals) {
        const px = sx(xv);
        ctx.fillText(String(Math.round(xv)), px - 8, Hc - pad.b + 14);
      }
      for (const yv of yTickVals) {
        const py = sy(yv);
        ctx.fillText(String(Math.round(yv)), pad.l - 28, py + 4);
      }
    }

    function updateUI(m, epochText) {
      const tr = evalPairs(m, trainPairs);
      const ood = evalPairs(m, oodPairs);
      trainMseEl.textContent = tr.mse.toFixed(4);
      oodMseEl.textContent = ood.mse.toFixed(4);
      drawScatter(oodPairs, ood.preds);
      if (epochText) queryOut.textContent = epochText;
    }

    function predictOne(m) {
      const a = Number(queryA.value);
      const b = Number(queryB.value);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return;
      const pred = forward(m, a, b).out;
      queryOut.textContent = `pred ${pred.toFixed(2)} (rounded ${Math.round(pred)}), true ${a * b}`;
    }

    function nextTick() {
      return new Promise(resolve => setTimeout(resolve, 0));
    }

    let model = createModel();
    let training = false;

    epochsEl.addEventListener('input', () => {
      epochsOut.textContent = String(epochsEl.value);
    });

    queryBtn.addEventListener('click', () => predictOne(model));

    resetBtn.addEventListener('click', () => {
      if (training) return;
      rebuildDatasets();
      model = createModel();
      queryOut.textContent = '-';
      updateUI(model);
    });

    trainBtn.addEventListener('click', async () => {
      if (training) return;
      training = true;
      trainBtn.disabled = true;
      resetBtn.disabled = true;

      rebuildDatasets();
      model = createModel();
      const totalEpochs = Number(epochsEl.value);
      for (let e = 1; e <= totalEpochs; e++) {
        trainEpoch(model);
        if (e === 1 || e % 60 === 0 || e === totalEpochs) {
          trainBtn.textContent = `Training ${e}/${totalEpochs}`;
          updateUI(model, `epoch ${e}/${totalEpochs}`);
          await nextTick();
        }
      }

      trainBtn.textContent = 'Train Model';
      trainBtn.disabled = false;
      resetBtn.disabled = false;
      training = false;
      predictOne(model);
    });

    [trainMinEl, trainMaxEl, holdoutEl].forEach(el => {
      el.addEventListener('change', () => {
        if (training) return;
        rebuildDatasets();
        model = createModel();
        updateUI(model);
        predictOne(model);
      });
    });

    rebuildDatasets();
    updateUI(model);
    predictOne(model);
  }

  function initQuiltLab() {
    const root = document.getElementById('quilt-lab');
    if (!root) return;
    if (root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    const canvas = root.querySelector('#quilt-canvas');
    const ctx = canvas.getContext('2d');

    const CW = canvas.width;
    const CH = canvas.height;
    const TILE = 14;
    const COLS = Math.floor(CW / TILE);
    const ROWS = Math.floor(CH / TILE);
    const N = COLS * ROWS;
    const DIR8 = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }
    ];

    const grid = Array.from({ length: N }, () => randomStyle());
    const next = Array.from({ length: N }, () => randomStyle());
    let running = true;
    let rafId = null;
    let lastTs = 0;
    let carryMs = 0;
    const TEMPO = 38;

    function ixy(x, y) { return y * COLS + x; }
    function inBounds(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }
    function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
    function hueWrap(h) {
      let n = h % 360;
      if (n < 0) n += 360;
      return n;
    }

    function randomStyle() {
      return {
        h: Math.random() * 360,
        s: 58 + Math.random() * 30,
        l: 36 + Math.random() * 28,
        p: Math.floor(Math.random() * 5)
      };
    }

    function drawTile(x, y, st) {
      const px = x * TILE;
      const py = y * TILE;
      ctx.fillStyle = `hsl(${st.h.toFixed(1)} ${st.s.toFixed(1)}% ${st.l.toFixed(1)}%)`;
      ctx.fillRect(px, py, TILE, TILE);

      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, TILE, TILE);
      ctx.clip();
      ctx.strokeStyle = `hsla(${hueWrap(st.h + 150).toFixed(1)} 38% 18% / 0.35)`;
      ctx.fillStyle = `hsla(${hueWrap(st.h + 150).toFixed(1)} 38% 18% / 0.28)`;
      ctx.lineWidth = 1;

      if (st.p === 0) {
        for (let i = -TILE; i < TILE * 2; i += 4) {
          ctx.beginPath();
          ctx.moveTo(px + i, py);
          ctx.lineTo(px + i + TILE, py + TILE);
          ctx.stroke();
        }
      } else if (st.p === 1) {
        ctx.beginPath();
        ctx.arc(px + TILE * 0.3, py + TILE * 0.3, 2, 0, Math.PI * 2);
        ctx.arc(px + TILE * 0.72, py + TILE * 0.68, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (st.p === 2) {
        ctx.beginPath();
        ctx.moveTo(px + 2, py + TILE * 0.5);
        ctx.lineTo(px + TILE - 2, py + TILE * 0.5);
        ctx.moveTo(px + TILE * 0.5, py + 2);
        ctx.lineTo(px + TILE * 0.5, py + TILE - 2);
        ctx.stroke();
      } else if (st.p === 3) {
        ctx.beginPath();
        ctx.arc(px + TILE * 0.5, py + TILE * 0.5, TILE * 0.34, 0.2, Math.PI + 0.6);
        ctx.stroke();
      } else {
        ctx.fillRect(px + 2, py + 2, 3, 3);
        ctx.fillRect(px + TILE - 5, py + 2, 3, 3);
        ctx.fillRect(px + 2, py + TILE - 5, 3, 3);
        ctx.fillRect(px + TILE - 5, py + TILE - 5, 3, 3);
      }
      ctx.restore();
    }

    function renderAll() {
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          drawTile(x, y, grid[ixy(x, y)]);
        }
      }
    }

    function localUpdate(x, y, kick = 0) {
      const idx = ixy(x, y);
      let hSin = 0;
      let hCos = 0;
      let sAcc = 0;
      let lAcc = 0;
      let pAcc = 0;
      let n = 0;
      for (let i = 0; i < DIR8.length; i++) {
        const nx = x + DIR8[i].x;
        const ny = y + DIR8[i].y;
        if (!inBounds(nx, ny)) continue;
        const st = grid[ixy(nx, ny)];
        const ang = (st.h * Math.PI) / 180;
        hSin += Math.sin(ang);
        hCos += Math.cos(ang);
        sAcc += st.s;
        lAcc += st.l;
        pAcc += st.p;
        n += 1;
      }
      if (!n) return { ...grid[idx] };
      const cur = grid[idx];
      const hMean = hueWrap((Math.atan2(hSin / n, hCos / n) * 180) / Math.PI);
      const sMean = sAcc / n;
      const lMean = lAcc / n;
      const pMean = pAcc / n;
      const newP = (Math.random() < 0.88)
        ? Math.round((cur.p * 3 + pMean) / 4) % 5
        : Math.floor(Math.random() * 5);
      return {
        h: hueWrap(cur.h * 0.56 + hMean * 0.44 + (Math.random() * 11 - 5.5) + kick * (Math.random() * 36 - 18)),
        s: clamp(cur.s * 0.50 + sMean * 0.50 + (Math.random() * 8 - 4) + kick * (Math.random() * 10 - 5), 40, 92),
        l: clamp(cur.l * 0.56 + lMean * 0.44 + (Math.random() * 8 - 4) + kick * (Math.random() * 8 - 4), 24, 82),
        p: newP
      };
    }

    function stepBatch(intensity = 1) {
      const updates = Math.max(8, Math.round(N * 0.10 * intensity));
      for (let i = 0; i < updates; i++) {
        const x = Math.floor(Math.random() * COLS);
        const y = Math.floor(Math.random() * ROWS);
        next[ixy(x, y)] = localUpdate(x, y, 0);
      }
      for (let i = 0; i < updates; i++) {
        const x = Math.floor(Math.random() * COLS);
        const y = Math.floor(Math.random() * ROWS);
        const id = ixy(x, y);
        grid[id] = next[id];
        drawTile(x, y, grid[id]);
      }
    }

    function resetWorld() {
      for (let i = 0; i < N; i++) {
        grid[i] = randomStyle();
        next[i] = { ...grid[i] };
      }
      renderAll();
      for (let i = 0; i < 18; i++) stepBatch(1.6);
    }

    function tick(ts) {
      if (!running) return;
      if (!lastTs) lastTs = ts;
      carryMs += ts - lastTs;
      lastTs = ts;
      const msPerStep = 1000 / Math.max(1, TEMPO * 2.6);
      while (carryMs >= msPerStep) {
        stepBatch(1);
        carryMs -= msPerStep;
      }
      rafId = window.requestAnimationFrame(tick);
    }

    function setRunning(on) {
      running = on;
      if (running) {
        lastTs = 0;
        carryMs = 0;
        rafId = window.requestAnimationFrame(tick);
      } else if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    canvas.addEventListener('click', () => setRunning(!running));

    resetWorld();
    setRunning(true);
  }

  function initPicbreedLab() {
    const root = document.getElementById('picbreed-lab');
    if (!root) return;
    if (root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    const POP = 9;
    const THUMB = 96;

    const gridEl = root.querySelector('#pic-grid');
    const genEl = root.querySelector('#pic-gen');
    const nextBtn = root.querySelector('#pic-next-btn');
    const randomBtn = root.querySelector('#pic-random-btn');
    const mutRateEl = root.querySelector('#pic-mut-rate');
    const mutMagEl = root.querySelector('#pic-mut-mag');
    const topoEl = root.querySelector('#pic-topo-rate');
    const perturbScaleEl = root.querySelector('#pic-perturb-scale');
    const perturbParamBtn = root.querySelector('#pic-perturb-param-btn');
    const perturbParamEl = root.querySelector('#pic-perturb-param');
    const perturbRowEl = root.querySelector('#pic-perturb-row');

    function randf(a, b) { return a + Math.random() * (b - a); }
    function randi(a, b) { return Math.floor(randf(a, b)); }
    function randn() {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function createGenome(hidden = 6) {
      const g = {
        inW: [],
        inMask: [],
        bH: [],
        outW: [],
        skip: [randn() * 0.25, randn() * 0.25, randn() * 0.18],
        bOut: randn() * 0.2
      };
      for (let i = 0; i < hidden; i++) {
        const w = [randn() * 1.0, randn() * 1.0, randn() * 0.8];
        const m = [Math.random() > 0.2, Math.random() > 0.2, Math.random() > 0.25];
        if (!m[0] && !m[1] && !m[2]) m[randi(0, 3)] = true;
        g.inW.push(w);
        g.inMask.push(m);
        g.bH.push(randn() * 0.6);
        g.outW.push(randn() * 0.7);
      }
      return g;
    }

    function blankGenome() {
      return {
        inW: [],
        inMask: [],
        bH: [],
        outW: [],
        skip: [0, 0, 0],
        bOut: 0
      };
    }

    function addNode(g, w0, w1, w2, b, out, m0 = true, m1 = true, m2 = true) {
      g.inW.push([w0, w1, w2]);
      g.inMask.push([m0, m1, m2]);
      g.bH.push(b);
      g.outW.push(out);
    }

    function cloneGenome(g) {
      return {
        inW: g.inW.map(w => w.slice()),
        inMask: g.inMask.map(m => m.slice()),
        bH: g.bH.slice(),
        outW: g.outW.slice(),
        skip: g.skip.slice(),
        bOut: g.bOut
      };
    }

    function makePreset(kind) {
      const g = blankGenome();
      switch (kind) {
        case 'rings':
          addNode(g, 0, 0, 6.5, -2.0, 1.6, false, false, true);
          addNode(g, 0, 0, 11.0, -6.0, -1.3, false, false, true);
          addNode(g, 5.0, 0, 0, 0, 0.4, true, false, false);
          break;
        case 'vertical':
          addNode(g, 8.0, 0, 0, -1.3, 1.3, true, false, false);
          addNode(g, 14.0, 0, 0, -6.0, -1.1, true, false, false);
          addNode(g, 0, 0, 4.5, -1.4, 0.6, false, false, true);
          break;
        case 'horizontal':
          addNode(g, 0, 8.0, 0, -1.1, 1.4, false, true, false);
          addNode(g, 0, 14.0, 0, -6.2, -1.2, false, true, false);
          addNode(g, 0, 0, 4.0, -1.2, 0.5, false, false, true);
          break;
        case 'diagonal':
          addNode(g, 6.5, 6.5, 0, -0.5, 1.2, true, true, false);
          addNode(g, -6.0, 6.0, 0, -0.6, -1.1, true, true, false);
          addNode(g, 0, 0, 5.2, -2.0, 0.9, false, false, true);
          break;
        case 'blob':
          addNode(g, 0, 0, -8.0, 3.0, 2.1, false, false, true);
          addNode(g, 6.0, 0, 0, -1.0, 0.5, true, false, false);
          addNode(g, 0, 6.0, 0, -1.0, 0.5, false, true, false);
          break;
        case 'star':
          addNode(g, 10.0, 0, 0, -3.0, 1.1, true, false, false);
          addNode(g, 0, 10.0, 0, -3.0, 1.1, false, true, false);
          addNode(g, 0, 0, 8.0, -3.5, -1.3, false, false, true);
          addNode(g, -7.0, -7.0, 0, -1.0, 0.8, true, true, false);
          break;
        case 'waves':
          addNode(g, 12.0, 2.0, 0, -2.0, 1.0, true, true, false);
          addNode(g, -12.0, 2.0, 0, -2.0, 1.0, true, true, false);
          addNode(g, 0, 0, 6.0, -2.2, 0.7, false, false, true);
          break;
        case 'corner':
          addNode(g, -7.5, -7.5, 0, -1.8, 1.8, true, true, false);
          addNode(g, 7.5, -7.5, 0, -1.8, -1.2, true, true, false);
          addNode(g, 0, 0, 5.5, -1.9, 0.8, false, false, true);
          break;
        default:
          return createGenome(5 + randi(0, 3));
      }
      g.skip = [randn() * 0.15, randn() * 0.15, randn() * 0.12];
      g.bOut = randn() * 0.18;
      return g;
    }

    function jitterGenome(g, s = 0.06) {
      const c = cloneGenome(g);
      for (let i = 0; i < c.inW.length; i++) {
        for (let k = 0; k < 3; k++) c.inW[i][k] += randn() * s;
        c.bH[i] += randn() * s * 0.5;
        c.outW[i] += randn() * s * 0.7;
      }
      for (let k = 0; k < 3; k++) c.skip[k] += randn() * s * 0.5;
      c.bOut += randn() * s * 0.4;
      return c;
    }

    function seededPopulation(n = POP) {
      const kinds = ['rings', 'vertical', 'horizontal', 'diagonal', 'blob', 'star', 'waves', 'corner'];
      const arr = [];
      for (let i = 0; i < n; i++) {
        const base = makePreset(kinds[i % kinds.length]);
        arr.push(jitterGenome(base, 0.08));
      }
      return arr;
    }

    function evalGenome(g, x, y) {
      const r = Math.sqrt(x * x + y * y);
      const inp = [x, y, r];
      let out = g.bOut + g.skip[0] * inp[0] + g.skip[1] * inp[1] + g.skip[2] * inp[2];
      for (let i = 0; i < g.inW.length; i++) {
        let h = g.bH[i];
        for (let k = 0; k < 3; k++) if (g.inMask[i][k]) h += g.inW[i][k] * inp[k];
        h = Math.tanh(h);
        out += g.outW[i] * h;
      }
      const v = 0.5 + 0.5 * Math.tanh(out);
      return Math.max(0, Math.min(1, v));
    }

    function renderGenome(g, canvas, size = THUMB) {
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(size, size);
      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const x = (px / (size - 1)) * 2 - 1;
          const y = (py / (size - 1)) * 2 - 1;
          const v = evalGenome(g, x, y);
          const c = Math.round(v * 255);
          const i = (py * size + px) * 4;
          img.data[i + 0] = Math.max(0, Math.min(255, c * 0.95 + 14));
          img.data[i + 1] = Math.max(0, Math.min(255, c * 0.85 + 20));
          img.data[i + 2] = Math.max(0, Math.min(255, c * 1.05));
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    function crossover(a, b) {
      const src = Math.random() < 0.5 ? a : b;
      const g = cloneGenome(src);
      const other = src === a ? b : a;
      const n = Math.min(g.inW.length, other.inW.length);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) {
          if (Math.random() < 0.5) g.inW[i][k] = other.inW[i][k];
          if (Math.random() < 0.5) g.inMask[i][k] = other.inMask[i][k];
        }
        if (Math.random() < 0.5) g.bH[i] = other.bH[i];
        if (Math.random() < 0.5) g.outW[i] = other.outW[i];
      }
      for (let k = 0; k < 3; k++) if (Math.random() < 0.5) g.skip[k] = other.skip[k];
      if (Math.random() < 0.5) g.bOut = other.bOut;
      return g;
    }

    function mutate(g, rate, mag, topoRate) {
      const n = g.inW.length;
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) {
          if (Math.random() < rate) g.inW[i][k] += randn() * mag;
          if (Math.random() < topoRate * 0.55) g.inMask[i][k] = !g.inMask[i][k];
        }
        if (!g.inMask[i][0] && !g.inMask[i][1] && !g.inMask[i][2]) g.inMask[i][randi(0, 3)] = true;
        if (Math.random() < rate) g.bH[i] += randn() * mag;
        if (Math.random() < rate) g.outW[i] += randn() * mag;
      }
      for (let k = 0; k < 3; k++) if (Math.random() < rate) g.skip[k] += randn() * mag * 0.5;
      if (Math.random() < rate) g.bOut += randn() * mag * 0.5;

      // NEAT-ish: add/remove node occasionally.
      if (Math.random() < topoRate && g.inW.length < 14) {
        g.inW.push([randn() * 0.8, randn() * 0.8, randn() * 0.6]);
        const m = [Math.random() > 0.2, Math.random() > 0.2, Math.random() > 0.25];
        if (!m[0] && !m[1] && !m[2]) m[randi(0, 3)] = true;
        g.inMask.push(m);
        g.bH.push(randn() * 0.5);
        g.outW.push(randn() * 0.5);
      }
      if (Math.random() < topoRate * 0.35 && g.inW.length > 3) {
        const idx = randi(0, g.inW.length);
        g.inW.splice(idx, 1);
        g.inMask.splice(idx, 1);
        g.bH.splice(idx, 1);
        g.outW.splice(idx, 1);
      }
    }

    function getParamRefs(g) {
      const refs = [];
      for (let i = 0; i < g.inW.length; i++) {
        for (let k = 0; k < 3; k++) {
          refs.push({
            name: `inW[${i}][${k}]`,
            get: (x => () => g.inW[x.i][x.k])({ i, k }),
            set: (x => v => { g.inW[x.i][x.k] = v; })({ i, k })
          });
        }
        refs.push({
          name: `bH[${i}]`,
          get: (x => () => g.bH[x]) (i),
          set: (x => v => { g.bH[x] = v; }) (i)
        });
        refs.push({
          name: `outW[${i}]`,
          get: (x => () => g.outW[x]) (i),
          set: (x => v => { g.outW[x] = v; }) (i)
        });
      }
      for (let k = 0; k < 3; k++) {
        refs.push({
          name: `skip[${k}]`,
          get: (x => () => g.skip[x]) (k),
          set: (x => v => { g.skip[x] = v; }) (k)
        });
      }
      refs.push({
        name: 'bOut',
        get: () => g.bOut,
        set: v => { g.bOut = v; }
      });
      return refs;
    }

    function perturbedSingle(base, delta, paramIdx) {
      const g = cloneGenome(base);
      const refs = getParamRefs(g);
      if (!refs.length) return g;
      const idx = Math.max(0, Math.min(refs.length - 1, paramIdx));
      const p = refs[idx];
      p.set(p.get() + delta);
      return g;
    }

    let generation = 0;
    let population = seededPopulation(POP);
    let selected = new Set();
    let focus = 0;
    let perturbParamIdx = 0;

    function randomisePerturbParam() {
      const base = population[focus] || population[0];
      if (!base) return;
      const refs = getParamRefs(base);
      if (!refs.length) return;
      perturbParamIdx = randi(0, refs.length);
      perturbParamEl.textContent = `param: ${refs[perturbParamIdx].name}`;
    }

    function renderPerturbations() {
      perturbRowEl.innerHTML = '';
      const base = population[focus] || population[0];
      if (!base) return;
      const refs = getParamRefs(base);
      if (!refs.length) return;
      if (perturbParamIdx >= refs.length || perturbParamIdx < 0) perturbParamIdx = 0;
      perturbParamEl.textContent = `param: ${refs[perturbParamIdx].name}`;

      const s = Number(perturbScaleEl.value);
      const scales = [-2, -1, 0, 1, 2];
      for (const k of scales) {
        const box = document.createElement('div');
        box.className = 'pic-perturb-item';
        const c = document.createElement('canvas');
        const g = k === 0 ? base : perturbedSingle(base, s * k, perturbParamIdx);
        renderGenome(g, c, 74);
        const lbl = document.createElement('div');
        lbl.textContent = k === 0 ? 'base' : `${k > 0 ? '+' : ''}${k}`;
        box.appendChild(c);
        box.appendChild(lbl);
        perturbRowEl.appendChild(box);
      }
    }

    function renderPopulation() {
      genEl.textContent = String(generation);
      gridEl.innerHTML = '';
      population.forEach((g, i) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `pic-card${selected.has(i) ? ' selected' : ''}`;
        const c = document.createElement('canvas');
        c.className = 'pic-thumb';
        renderGenome(g, c);
        const meta = document.createElement('div');
        meta.className = 'pic-meta';
        meta.innerHTML = `<span>#${i + 1}</span><span>${selected.has(i) ? 'selected' : ''}</span>`;
        card.appendChild(c);
        card.appendChild(meta);
        card.addEventListener('click', () => {
          if (selected.has(i)) selected.delete(i);
          else selected.add(i);
          focus = i;
          renderPopulation();
        });
        gridEl.appendChild(card);
      });
      nextBtn.disabled = selected.size === 0;
      renderPerturbations();
    }

    function breedNext() {
      const parentIdx = selected.size ? Array.from(selected) : [focus];
      const parents = parentIdx.map(i => population[i]).filter(Boolean);
      if (!parents.length) return;

      const rate = Number(mutRateEl.value);
      const mag = Number(mutMagEl.value);
      const topo = Number(topoEl.value);

      const next = [];
      // Keep one elite exactly.
      next.push(cloneGenome(parents[0]));
      while (next.length < POP) {
        const p1 = parents[randi(0, parents.length)];
        const p2 = parents[randi(0, parents.length)];
        const child = crossover(p1, p2);
        mutate(child, rate, mag, topo);
        next.push(child);
      }

      population = next;
      generation += 1;
      selected = new Set();
      focus = 0;
      randomisePerturbParam();
      renderPopulation();
    }

    nextBtn.addEventListener('click', breedNext);
    randomBtn.addEventListener('click', () => {
      generation = 0;
      population = seededPopulation(POP);
      selected = new Set();
      focus = 0;
      randomisePerturbParam();
      renderPopulation();
    });
    perturbScaleEl.addEventListener('input', renderPerturbations);
    perturbParamBtn.addEventListener('click', () => {
      randomisePerturbParam();
      renderPerturbations();
    });

    randomisePerturbParam();
    renderPopulation();
  }

  function initMazeQDLab() {
    const root = document.getElementById('maze-qd-lab');
    if (!root) return;
    if (root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    const stepBtn = root.querySelector('#maze-step-btn');
    const runBtn = root.querySelector('#maze-run-btn');
    const resetBtn = root.querySelector('#maze-reset-btn');
    const sizeEl = root.querySelector('#maze-size');
    const sizeOutEl = root.querySelector('#maze-size-out');
    const speedEl = root.querySelector('#maze-speed');
    const sigmaEl = root.querySelector('#maze-sigma');
    const coverageEl = root.querySelector('#maze-coverage');
    const mapBestDistEl = root.querySelector('#maze-map-best-dist');
    const mapBestDistStepsEl = root.querySelector('#maze-map-best-dist-steps');
    const mapGoalStepsEl = root.querySelector('#maze-map-goal-steps');
    const mapSolveEvalEl = root.querySelector('#maze-map-solve-eval');
    const directBestDistEl = root.querySelector('#maze-direct-best-dist');
    const directBestDistStepsEl = root.querySelector('#maze-direct-best-dist-steps');
    const directGoalStepsEl = root.querySelector('#maze-direct-goal-steps');
    const directSolveEvalEl = root.querySelector('#maze-direct-solve-eval');
    const evalsEl = root.querySelector('#maze-evals');
    const archiveCanvas = root.querySelector('#maze-archive');
    const directCanvas = root.querySelector('#maze-direct');
    const actx = archiveCanvas.getContext('2d');
    const dctx = directCanvas.getContext('2d');

    let W = 15;
    let H = 15;
    let MAX_STEPS = 68;
    const DIRECT_RANDOM_RESTART_P = 0.01;
    const DIRECT_MUT_SCALE = 0.28;
    const START = { x: 1, y: 1 };
    let GOAL = { x: 11, y: 7 };
    const DIRS = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];

    function normaliseMazeSize(v) {
      let n = Number(v) || 15;
      n = Math.max(15, Math.min(27, n));
      if (n % 2 === 0) n += 1;
      if (n > 27) n = 27;
      return n;
    }

    function makeGrid(fill = 0) {
      return Array.from({ length: H }, () => Array(W).fill(fill));
    }

    function wallRect(g, x0, y0, x1, y1) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = 1;
    }

    function hasPath(g) {
      const seen = makeGrid(0);
      const q = [{ x: START.x, y: START.y }];
      seen[START.y][START.x] = 1;
      for (let qi = 0; qi < q.length; qi++) {
        const cur = q[qi];
        if (cur.x === GOAL.x && cur.y === GOAL.y) return true;
        for (let i = 0; i < DIRS.length; i++) {
          const nx = cur.x + DIRS[i].x;
          const ny = cur.y + DIRS[i].y;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          if (seen[ny][nx] || g[ny][nx] === 1) continue;
          seen[ny][nx] = 1;
          q.push({ x: nx, y: ny });
        }
      }
      return false;
    }

    function seededRandom(seed) {
      let s = seed >>> 0;
      return function rand() {
        s = (1664525 * s + 1013904223) >>> 0;
        return s / 4294967296;
      };
    }

    function carveSegment(g, x0, y0, x1, y1) {
      let x = x0;
      let y = y0;
      g[y][x] = 0;
      while (x !== x1 || y !== y1) {
        if (x !== x1) x += x1 > x ? 1 : -1;
        else if (y !== y1) y += y1 > y ? 1 : -1;
        g[y][x] = 0;
      }
    }

    function buildMaze() {
      const rand = seededRandom(81173);
      const g = makeGrid(1);
      const cellDirs = [
        { x: 2, y: 0 },
        { x: -2, y: 0 },
        { x: 0, y: 2 },
        { x: 0, y: -2 }
      ];

      function inMazeCell(x, y) {
        return x > 0 && x < W - 1 && y > 0 && y < H - 1 && (x % 2 === 1) && (y % 2 === 1);
      }

      // Recursive-backtracker (iterative stack) perfect maze.
      const seen = makeGrid(0);
      const stack = [{ x: START.x, y: START.y }];
      seen[START.y][START.x] = 1;
      g[START.y][START.x] = 0;
      while (stack.length) {
        const cur = stack[stack.length - 1];
        const candidates = [];
        for (let i = 0; i < cellDirs.length; i++) {
          const nx = cur.x + cellDirs[i].x;
          const ny = cur.y + cellDirs[i].y;
          if (!inMazeCell(nx, ny)) continue;
          if (seen[ny][nx]) continue;
          candidates.push(cellDirs[i]);
        }

        if (!candidates.length) {
          stack.pop();
          continue;
        }

        const d = candidates[Math.floor(rand() * candidates.length)];
        const mx = cur.x + d.x / 2;
        const my = cur.y + d.y / 2;
        const nx = cur.x + d.x;
        const ny = cur.y + d.y;
        g[my][mx] = 0;
        g[ny][nx] = 0;
        seen[ny][nx] = 1;
        stack.push({ x: nx, y: ny });
      }

      g[START.y][START.x] = 0;
      g[GOAL.y][GOAL.x] = 0;
      if (!hasPath(g)) {
        // Fallback connector.
        carveSegment(g, START.x, START.y, GOAL.x, START.y);
        carveSegment(g, GOAL.x, START.y, GOAL.x, GOAL.y);
      }
      if (!hasPath(g)) {
        // Last resort deterministic elbow path.
        carveSegment(g, START.x, START.y, 1, START.y);
        carveSegment(g, 1, START.y, 1, GOAL.y);
        carveSegment(g, 1, GOAL.y, GOAL.x, GOAL.y);
      }
      return g;
    }

    let maze = [];

    let archive = [];
    let running = false;
    let evals = 0;
    let mapBestGoalSteps = Infinity;
    let mapBestDist = Infinity;
    let mapBestDistSteps = Infinity;
    let mapSolveEval = null;
    let mapEvals = 0;
    let lastRollout = null;
    let loopTimer = null;
    let directBestGenome = randomGenome();
    let directBestScore = -Infinity;
    let directBestDist = Infinity;
    let directBestDistSteps = Infinity;
    let directBestGoalSteps = Infinity;
    let directSolveEval = null;
    let directEvals = 0;
    let directBestPath = null;
    let directHeat = [];
    let lastDirectRollout = null;

    function randf(a, b) { return a + Math.random() * (b - a); }
    function randn() {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
    function ixy(x, y) { return y * W + x; }
    function free(x, y) { return x >= 0 && x < W && y >= 0 && y < H && maze[y][x] === 0; }

    // Genome = simple local-sensing controller:
    // outputs for 4 actions (NESW) from features [free NESW, visited NESW, bias].
    function randomGenome() {
      return {
        w: Array.from({ length: DIRS.length * 9 }, () => randn() * 0.6),
        b: Array.from({ length: DIRS.length }, () => randn() * 0.25),
        eps: randf(0.02, 0.28)
      };
    }
    function cloneGenome(g) { return { w: g.w.slice(), b: g.b.slice(), eps: g.eps }; }
    function crossoverGenomes(a, b) {
      const child = cloneGenome(a);
      for (let i = 0; i < child.w.length; i++) {
        child.w[i] = Math.random() < 0.5 ? a.w[i] : b.w[i];
      }
      for (let i = 0; i < child.b.length; i++) {
        child.b[i] = Math.random() < 0.5 ? a.b[i] : b.b[i];
      }
      child.eps = clamp((a.eps + b.eps) * 0.5 + randn() * 0.01, 0, 0.45);
      return child;
    }
    function mutateGenome(g, sigma) {
      const c = cloneGenome(g);
      for (let i = 0; i < c.w.length; i++) c.w[i] += randn() * sigma;
      for (let i = 0; i < c.b.length; i++) c.b[i] += randn() * sigma * 0.4;
      c.eps = clamp(c.eps + randn() * sigma * 0.2, 0, 0.45);
      return c;
    }

    function actionScore(g, a, feat) {
      const base = a * 9;
      let s = g.b[a];
      for (let i = 0; i < 9; i++) s += g.w[base + i] * feat[i];
      return s;
    }

    function rollout(g) {
      let x = START.x, y = START.y;
      const path = [{ x, y }];
      let reached = false;
      const visited = Array.from({ length: H }, () => Array(W).fill(0));
      visited[y][x] = 1;

      for (let step = 1; step <= MAX_STEPS; step++) {
        const valid = [];
        const scores = [];
        const nbrs = DIRS.map(d => ({ x: x + d.x, y: y + d.y }));
        const feat = [
          free(nbrs[0].x, nbrs[0].y) ? 1 : 0,
          free(nbrs[1].x, nbrs[1].y) ? 1 : 0,
          free(nbrs[2].x, nbrs[2].y) ? 1 : 0,
          free(nbrs[3].x, nbrs[3].y) ? 1 : 0,
          free(nbrs[0].x, nbrs[0].y) ? visited[nbrs[0].y][nbrs[0].x] : 1,
          free(nbrs[1].x, nbrs[1].y) ? visited[nbrs[1].y][nbrs[1].x] : 1,
          free(nbrs[2].x, nbrs[2].y) ? visited[nbrs[2].y][nbrs[2].x] : 1,
          free(nbrs[3].x, nbrs[3].y) ? visited[nbrs[3].y][nbrs[3].x] : 1,
          1
        ];

        for (let a = 0; a < DIRS.length; a++) {
          const nx = x + DIRS[a].x;
          const ny = y + DIRS[a].y;
          if (free(nx, ny)) {
            valid.push(a);
            scores.push(actionScore(g, a, feat));
          }
        }
        if (!valid.length) break;

        let chosen = valid[0];
        if (Math.random() < g.eps) {
          chosen = valid[Math.floor(Math.random() * valid.length)];
        } else {
          let bi = 0;
          for (let i = 1; i < scores.length; i++) if (scores[i] > scores[bi]) bi = i;
          chosen = valid[bi];
        }

        x += DIRS[chosen].x;
        y += DIRS[chosen].y;
        visited[y][x] = 1;
        path.push({ x, y });
        if (x === GOAL.x && y === GOAL.y) {
          reached = true;
          return { endX: x, endY: y, steps: step, reached, path };
        }
      }
      return { endX: x, endY: y, steps: path.length - 1, reached, path };
    }

    function randomElite() {
      const filled = archive.filter(Boolean);
      if (!filled.length) return null;
      const weights = filled.map(e => {
        const w = 1 + (e.utility || 0) * 0.25;
        return Math.max(0.1, w);
      });
      let total = 0;
      for (let i = 0; i < weights.length; i++) total += weights[i];
      let r = Math.random() * total;
      for (let i = 0; i < filled.length; i++) {
        r -= weights[i];
        if (r <= 0) return filled[i];
      }
      return filled[filled.length - 1];
    }

    function propose(sigma) {
      const parentA = randomElite();
      if (!parentA || Math.random() < 0.22) return { g: randomGenome(), parents: [] };
      let base = parentA.g;
      const parents = [parentA];
      if (Math.random() < 0.34) {
        const parentB = randomElite();
        if (parentB) {
          base = crossoverGenomes(parentA.g, parentB.g);
          parents.push(parentB);
        }
      }
      return { g: mutateGenome(base, sigma), parents };
    }

    function computeGoalForSize(size) {
      const x = size - 4; // odd when size is odd
      let y = Math.max(3, size - 8);
      if (y % 2 === 0) y -= 1;
      return { x, y };
    }

    function configureMazeSize(rawSize) {
      const size = normaliseMazeSize(rawSize);
      W = size;
      H = size;
      GOAL = computeGoalForSize(size);
      MAX_STEPS = Math.max(60, Math.round(size * 4.5));
      maze = buildMaze();
      archive = Array.from({ length: W * H }, () => null);
      directHeat = Array.from({ length: W * H }, () => 0);
      if (sizeEl) sizeEl.value = String(size);
      if (sizeOutEl) sizeOutEl.textContent = String(size);
      resetState();
    }

    function stepOne() {
      const sigma = Number(sigmaEl.value);

      // MAP-Elites update
      const cand = propose(sigma);
      const g = cand.g;
      const r = rollout(g);
      lastRollout = r.path;

      // Local criterion: faster arrival to endpoint cell. Goal gets bonus.
      const fit = (MAX_STEPS - r.steps) / MAX_STEPS + (r.reached ? 1 : 0);
      const idx = ixy(r.endX, r.endY);
      const cur = archive[idx];
      const foundNewArea = !cur;
      for (let i = 0; i < cand.parents.length; i++) {
        cand.parents[i].utility = (cand.parents[i].utility || 0) + (foundNewArea ? 1 : -1);
      }
      if (!cur || fit > cur.fit) {
        archive[idx] = { g, fit, steps: r.steps, reached: r.reached, path: r.path, endX: r.endX, endY: r.endY, utility: 0 };
      }
      mapEvals += 1;
      evals += 1;
      const mapDist = Math.abs(r.endX - GOAL.x) + Math.abs(r.endY - GOAL.y);
      if (mapDist < mapBestDist || (mapDist === mapBestDist && r.steps < mapBestDistSteps)) {
        mapBestDist = mapDist;
        mapBestDistSteps = r.steps;
      }
      if (r.reached) {
        if (mapSolveEval === null) mapSolveEval = mapEvals;
        if (r.steps < mapBestGoalSteps) mapBestGoalSteps = r.steps;
      }

      // Direct objective-only update
      const base = (directBestGenome && Math.random() > DIRECT_RANDOM_RESTART_P) ? directBestGenome : randomGenome();
      const gd = mutateGenome(base, sigma * DIRECT_MUT_SCALE);
      const rd = rollout(gd);
      lastDirectRollout = rd.path;
      directHeat[ixy(rd.endX, rd.endY)] += 1;
      const dist = Math.abs(rd.endX - GOAL.x) + Math.abs(rd.endY - GOAL.y);
      const better = dist < directBestDist;
      if (better) {
        directBestScore = -dist;
        directBestGenome = cloneGenome(gd);
        directBestPath = rd.path.slice();
      }
      if (dist < directBestDist || (dist === directBestDist && rd.steps < directBestDistSteps)) {
        directBestDist = dist;
        directBestDistSteps = rd.steps;
      }
      if (rd.reached) {
        if (directSolveEval === null) directSolveEval = directEvals + 1;
        if (rd.steps < directBestGoalSteps) directBestGoalSteps = rd.steps;
      }
      directEvals += 1;
      evals += 1;

      render();
    }

    function drawMazeBase(ctx, CW, CH, pad) {
      ctx.clearRect(0, 0, CW, CH);
      ctx.fillStyle = 'rgba(255,255,255,0.26)';
      ctx.fillRect(0, 0, CW, CH);
      const cellW = (CW - pad * 2) / W;
      const cellH = (CH - pad * 2) / H;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const px = pad + x * cellW;
          const py = pad + (H - 1 - y) * cellH;
          if (maze[y][x] === 1) {
            ctx.fillStyle = 'rgba(40,40,40,0.75)';
            ctx.fillRect(px, py, cellW, cellH);
          } else {
            ctx.fillStyle = 'rgba(120,120,120,0.08)';
            ctx.fillRect(px, py, cellW, cellH);
          }
        }
      }
      ctx.strokeStyle = 'rgba(80,80,80,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(pad, pad, CW - pad * 2, CH - pad * 2);
      return { cellW, cellH };
    }

    function renderArchive() {
      const CW = archiveCanvas.width;
      const CH = archiveCanvas.height;
      const pad = 28;
      const { cellW, cellH } = drawMazeBase(actx, CW, CH, pad);

      const vals = archive.filter(Boolean).map(e => e.fit);
      const fMin = vals.length ? Math.min(...vals) : 0;
      const fMax = vals.length ? Math.max(...vals) : 1;
      const denom = Math.max(1e-6, fMax - fMin);

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const px = pad + x * cellW;
          const py = pad + (H - 1 - y) * cellH;
          const e = archive[ixy(x, y)];
          if (!e) continue;
          const t = (e.fit - fMin) / denom;
          const lit = 28 + 42 * t;
          actx.fillStyle = `hsl(212 76% ${lit}%)`;
          actx.fillRect(px, py, cellW, cellH);
        }
      }

      // Draw latest rollout path for animation feel.
      if (lastRollout?.length) {
        actx.strokeStyle = 'rgba(255, 184, 60, 0.9)';
        actx.lineWidth = 1.8;
        actx.beginPath();
        lastRollout.forEach((p, i) => {
          const px = pad + (p.x + 0.5) * cellW;
          const py = pad + (H - 1 - p.y + 0.5) * cellH;
          if (i === 0) actx.moveTo(px, py);
          else actx.lineTo(px, py);
        });
        actx.stroke();
      }

      // Start/Goal markers
      const sx = pad + (START.x + 0.5) * cellW;
      const sy = pad + (H - 1 - START.y + 0.5) * cellH;
      const gx = pad + (GOAL.x + 0.5) * cellW;
      const gy = pad + (H - 1 - GOAL.y + 0.5) * cellH;
      actx.fillStyle = 'rgba(20,160,80,0.95)';
      actx.beginPath(); actx.arc(sx, sy, Math.max(2, cellW * 0.32), 0, Math.PI * 2); actx.fill();
      actx.fillStyle = 'rgba(210,60,60,0.95)';
      actx.beginPath(); actx.arc(gx, gy, Math.max(2, cellW * 0.32), 0, Math.PI * 2); actx.fill();

      actx.fillStyle = 'rgba(60,60,60,0.82)';
      actx.font = '12px EB Garamond, serif';
      actx.fillText('endpoint-cell archive (blue = filled niches)', 16, 16);
    }

    function renderDirect() {
      const CW = directCanvas.width;
      const CH = directCanvas.height;
      const pad = 28;
      const { cellW, cellH } = drawMazeBase(dctx, CW, CH, pad);

      const maxHeat = Math.max(1, ...directHeat);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (maze[y][x] === 1) continue;
          const h = directHeat[ixy(x, y)];
          if (!h) continue;
          const t = Math.log1p(h) / Math.log1p(maxHeat);
          const lit = 24 + 38 * t;
          dctx.fillStyle = `hsl(212 72% ${lit}%)`;
          dctx.fillRect(pad + x * cellW, pad + (H - 1 - y) * cellH, cellW, cellH);
        }
      }

      if (directBestPath?.length) {
        dctx.strokeStyle = 'rgba(255, 120, 40, 0.95)';
        dctx.lineWidth = 2;
        dctx.beginPath();
        directBestPath.forEach((p, i) => {
          const px = pad + (p.x + 0.5) * cellW;
          const py = pad + (H - 1 - p.y + 0.5) * cellH;
          if (i === 0) dctx.moveTo(px, py);
          else dctx.lineTo(px, py);
        });
        dctx.stroke();
      }

      if (lastDirectRollout?.length) {
        dctx.strokeStyle = 'rgba(255, 210, 60, 0.9)';
        dctx.lineWidth = 1.6;
        dctx.beginPath();
        lastDirectRollout.forEach((p, i) => {
          const px = pad + (p.x + 0.5) * cellW;
          const py = pad + (H - 1 - p.y + 0.5) * cellH;
          if (i === 0) dctx.moveTo(px, py);
          else dctx.lineTo(px, py);
        });
        dctx.stroke();
      }

      const sx = pad + (START.x + 0.5) * cellW;
      const sy = pad + (H - 1 - START.y + 0.5) * cellH;
      const gx = pad + (GOAL.x + 0.5) * cellW;
      const gy = pad + (H - 1 - GOAL.y + 0.5) * cellH;
      dctx.fillStyle = 'rgba(20,160,80,0.95)';
      dctx.beginPath(); dctx.arc(sx, sy, Math.max(2, cellW * 0.32), 0, Math.PI * 2); dctx.fill();
      dctx.fillStyle = 'rgba(210,60,60,0.95)';
      dctx.beginPath(); dctx.arc(gx, gy, Math.max(2, cellW * 0.32), 0, Math.PI * 2); dctx.fill();

      dctx.fillStyle = 'rgba(60,60,60,0.82)';
      dctx.font = '12px EB Garamond, serif';
      dctx.fillText('direct optimiser heat + best path', 16, 16);
    }

    function renderStats() {
      const freeCells = maze.flat().filter(v => v === 0).length;
      const filled = archive.filter((e, idx) => e && maze[Math.floor(idx / W)][idx % W] === 0).length;
      const cov = (filled / freeCells) * 100;
      coverageEl.textContent = `${cov.toFixed(1)}%`;
      mapBestDistEl.textContent = Number.isFinite(mapBestDist) ? String(mapBestDist) : '-';
      mapBestDistStepsEl.textContent = Number.isFinite(mapBestDistSteps) ? String(mapBestDistSteps) : '-';
      mapGoalStepsEl.textContent = Number.isFinite(mapBestGoalSteps) ? String(mapBestGoalSteps) : '-';
      mapSolveEvalEl.textContent = mapSolveEval === null ? '-' : String(mapSolveEval);
      directBestDistEl.textContent = Number.isFinite(directBestDist) ? String(directBestDist) : '-';
      directBestDistStepsEl.textContent = Number.isFinite(directBestDistSteps) ? String(directBestDistSteps) : '-';
      directGoalStepsEl.textContent = Number.isFinite(directBestGoalSteps) ? String(directBestGoalSteps) : '-';
      directSolveEvalEl.textContent = directSolveEval === null ? '-' : String(directSolveEval);
      evalsEl.textContent = String(evals);
    }

    function render() {
      renderArchive();
      renderDirect();
      renderStats();
    }

    function resetState() {
      for (let i = 0; i < archive.length; i++) archive[i] = null;
      evals = 0;
      mapBestGoalSteps = Infinity;
      mapBestDist = Infinity;
      mapBestDistSteps = Infinity;
      mapSolveEval = null;
      mapEvals = 0;
      lastRollout = null;
      directBestGenome = randomGenome();
      directBestScore = -Infinity;
      directBestDist = Infinity;
      directBestDistSteps = Infinity;
      directBestGoalSteps = Infinity;
      directSolveEval = null;
      directEvals = 0;
      directBestPath = null;
      lastDirectRollout = null;
      directHeat.fill(0);
      running = false;
      runBtn.textContent = 'Run';
      if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    }

    function reset() {
      resetState();
      render();
    }

    function loop() {
      if (!running) return;
      stepOne();
      const speed = Math.max(1, Number(speedEl.value) || 1);
      loopTimer = setTimeout(loop, Math.round(1000 / speed));
    }

    stepBtn.addEventListener('click', () => stepOne());
    runBtn.addEventListener('click', () => {
      running = !running;
      runBtn.textContent = running ? 'Pause' : 'Run';
      if (running) loop();
      else if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    });
    resetBtn.addEventListener('click', reset);
    if (sizeEl) {
      sizeEl.addEventListener('input', () => {
        configureMazeSize(sizeEl.value);
        render();
      });
    }

    configureMazeSize(sizeEl ? sizeEl.value : W);
    render();
  }

  function initAllLabs() {
    initAggregateFlockLab();
    initCreativityTilesLab();
    initMulLab();
    initQuiltLab();
    initPicbreedLab();
    initMazeQDLab();
  }

  document.addEventListener('post:ready', initAllLabs);
  if (document.readyState !== 'loading') initAllLabs();
  else document.addEventListener('DOMContentLoaded', initAllLabs, { once: true });
})();
