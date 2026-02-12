// Post-specific scripts for Curriculum Is Key
// Tiny in-browser experiment: train on 1..5 multiplication, hold out 9 (OOD).

(function () {
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

  document.addEventListener('post:ready', initMulLab);
  if (document.readyState !== 'loading') initMulLab();
  else document.addEventListener('DOMContentLoaded', initMulLab, { once: true });
})();
