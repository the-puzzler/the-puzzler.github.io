(function () {
  function initSIGRegDemo() {
    const root = document.getElementById('sigreg-demo');
    if (!root || root.dataset.bound === 'true') return;
    root.dataset.bound = 'true';

    const canvas = root.querySelector('#sigreg-canvas');
    const stepBtn = root.querySelector('#sigreg-step-btn');
    const autoBtn = root.querySelector('#sigreg-auto-btn');
    const resetBtn = root.querySelector('#sigreg-reset-btn');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = 1200;
    let height = 620;
    let points = [];
    let target = [];
    let angle = 0;
    let autoTimer = 0;

    function rand(min, max) {
      return min + Math.random() * (max - min);
    }

    function gaussian() {
      const u = Math.max(1e-6, Math.random());
      const v = Math.max(1e-6, Math.random());
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function reset() {
      const n = 190;
      points = Array.from({ length: n }, () => ({
        x: gaussian() * 0.18 + rand(-0.12, 0.12),
        y: gaussian() * 0.035 + rand(-0.04, 0.04)
      }));
      target = Array.from({ length: n }, () => ({
        x: gaussian() * 0.46,
        y: gaussian() * 0.46
      }));
      angle = rand(0, Math.PI);
      draw();
    }

    function resize() {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const w = Math.max(760, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(430, Math.floor(canvas.clientWidth * 0.52 * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      width = canvas.width;
      height = canvas.height;
    }

    function panelRect(index) {
      const gap = width * 0.035;
      const panelW = (width - gap * 3) / 2;
      const panelH = height - gap * 2;
      return { x: gap + index * (panelW + gap), y: gap, w: panelW, h: panelH };
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawPanel(rect, title, subtitle) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.strokeStyle = 'rgba(70,70,70,0.14)';
      ctx.lineWidth = Math.max(1, height * 0.002);
      roundRect(rect.x, rect.y, rect.w, rect.h, 18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(20,20,20,0.92)';
      ctx.font = `${Math.max(14, Math.floor(height * 0.031))}px "Roboto Mono", monospace`;
      ctx.fillText(title, rect.x + rect.w * 0.06, rect.y + rect.h * 0.10);
      ctx.fillStyle = 'rgba(90,90,90,0.82)';
      ctx.font = `${Math.max(10, Math.floor(height * 0.018))}px "Roboto Mono", monospace`;
      ctx.fillText(subtitle, rect.x + rect.w * 0.06, rect.y + rect.h * 0.15);
      ctx.restore();
    }

    function spaceFor(rect) {
      return {
        cx: rect.x + rect.w * 0.5,
        cy: rect.y + rect.h * 0.57,
        s: Math.min(rect.w, rect.h) * 0.33
      };
    }

    function drawAxes(space) {
      ctx.save();
      ctx.strokeStyle = 'rgba(70,70,70,0.18)';
      ctx.lineWidth = Math.max(1, height * 0.002);
      ctx.beginPath();
      ctx.moveTo(space.cx - space.s * 1.25, space.cy);
      ctx.lineTo(space.cx + space.s * 1.25, space.cy);
      ctx.moveTo(space.cx, space.cy - space.s * 1.25);
      ctx.lineTo(space.cx, space.cy + space.s * 1.25);
      ctx.stroke();
      ctx.restore();
    }

    function drawPoints(space, data, color, alpha) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      for (const p of data) {
        ctx.beginPath();
        ctx.arc(space.cx + p.x * space.s, space.cy - p.y * space.s, Math.max(2.2, height * 0.005), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawProjectionLine(space) {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      ctx.save();
      ctx.strokeStyle = 'rgba(20,20,20,0.58)';
      ctx.lineWidth = Math.max(2, height * 0.004);
      ctx.beginPath();
      ctx.moveTo(space.cx - dx * space.s * 1.35, space.cy + dy * space.s * 1.35);
      ctx.lineTo(space.cx + dx * space.s * 1.35, space.cy - dy * space.s * 1.35);
      ctx.stroke();
      ctx.restore();
    }

    function drawHistogram(rect) {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const bins = 28;
      const min = -1.35;
      const max = 1.35;
      const currentBins = Array(bins).fill(0);
      const gaussianBins = Array(bins).fill(0);

      function fillBins(data, out) {
        for (const p of data) {
          const v = p.x * dx + p.y * dy;
          const idx = Math.max(0, Math.min(bins - 1, Math.floor(((v - min) / (max - min)) * bins)));
          out[idx] += 1;
        }
      }
      fillBins(points, currentBins);
      fillBins(target, gaussianBins);

      const chart = {
        x: rect.x + rect.w * 0.08,
        y: rect.y + rect.h * 0.26,
        w: rect.w * 0.84,
        h: rect.h * 0.56
      };
      const maxBin = Math.max(1, ...currentBins, ...gaussianBins);
      const bw = chart.w / bins;

      ctx.save();
      ctx.strokeStyle = 'rgba(70,70,70,0.20)';
      ctx.beginPath();
      ctx.moveTo(chart.x, chart.y + chart.h);
      ctx.lineTo(chart.x + chart.w, chart.y + chart.h);
      ctx.stroke();

      for (let i = 0; i < bins; i++) {
        const ch = (currentBins[i] / maxBin) * chart.h;
        const gh = (gaussianBins[i] / maxBin) * chart.h;
        ctx.fillStyle = 'rgba(211,93,47,0.48)';
        ctx.fillRect(chart.x + i * bw + bw * 0.08, chart.y + chart.h - ch, bw * 0.42, ch);
        ctx.fillStyle = 'rgba(18,106,90,0.44)';
        ctx.fillRect(chart.x + i * bw + bw * 0.50, chart.y + chart.h - gh, bw * 0.42, gh);
      }
      ctx.restore();
    }

    function step() {
      angle = rand(0, Math.PI);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const targetProj = target.map((p) => p.x * dx + p.y * dy).sort((a, b) => a - b);
      const order = points
        .map((p, i) => ({ i, v: p.x * dx + p.y * dy }))
        .sort((a, b) => a.v - b.v);

      for (let rank = 0; rank < order.length; rank++) {
        const p = points[order[rank].i];
        const targetValue = targetProj[rank];
        const current = p.x * dx + p.y * dy;
        const delta = (targetValue - current) * 0.24;
        p.x += dx * delta + gaussian() * 0.0015;
        p.y += dy * delta + gaussian() * 0.0015;
      }
      draw();
    }

    function draw() {
      resize();
      ctx.clearRect(0, 0, width, height);
      const left = panelRect(0);
      const right = panelRect(1);
      drawPanel(left, 'embedding space', 'a collapsed cloud is reshaped one direction at a time');
      drawPanel(right, 'Gaussian check', 'current and target marginals along the sampled axis');
      const space = spaceFor(left);
      drawAxes(space);
      drawProjectionLine(space);
      drawPoints(space, target, '#126a5a', 0.18);
      drawPoints(space, points, '#d35d2f', 0.72);
      drawHistogram(right);
    }

    function toggleAuto() {
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = 0;
        if (autoBtn) autoBtn.textContent = 'Auto step';
        return;
      }
      autoTimer = window.setInterval(step, 180);
      if (autoBtn) autoBtn.textContent = 'Stop';
    }

    stepBtn?.addEventListener('click', step);
    resetBtn?.addEventListener('click', reset);
    autoBtn?.addEventListener('click', toggleAuto);
    window.addEventListener('resize', draw, { passive: true });
    reset();
  }

  function initSDMatchDemo() {
    const root = document.getElementById('sdmatch-demo');
    if (!root || root.dataset.bound === 'true') return;
    root.dataset.bound = 'true';

    const canvas = root.querySelector('#sdmatch-canvas');
    const stepBtn = root.querySelector('#sdmatch-step-btn');
    const autoBtn = root.querySelector('#sdmatch-auto-btn');
    const resetBtn = root.querySelector('#sdmatch-reset-btn');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = 1200;
    let height = 620;
    let real = [];
    let fake = [];
    let angle = -0.5;
    let autoTimer = 0;

    function rand(min, max) {
      return min + Math.random() * (max - min);
    }

    function gaussian() {
      const u = Math.max(1e-6, Math.random());
      const v = Math.max(1e-6, Math.random());
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function makeRealPoint(i, n) {
      const arm = i % 2 === 0 ? 1 : -1;
      const r = 0.22 + 1.2 * (i / n);
      const th = arm * (1.05 + 4.2 * (i / n)) + gaussian() * 0.05;
      return {
        x: Math.cos(th) * r + gaussian() * 0.045,
        y: Math.sin(th) * r + gaussian() * 0.045
      };
    }

    function reset() {
      const n = 190;
      real = Array.from({ length: n }, (_, i) => makeRealPoint(i, n));
      fake = Array.from({ length: n }, () => ({
        x: rand(-1.25, 1.25),
        y: rand(-1.05, 1.05)
      }));
      angle = rand(0, Math.PI);
      draw();
    }

    function resize() {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const w = Math.max(760, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(430, Math.floor(canvas.clientWidth * 0.52 * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      width = canvas.width;
      height = canvas.height;
    }

    function panelRect(index) {
      const gap = width * 0.035;
      const panelW = (width - gap * 3) / 2;
      const panelH = height - gap * 2;
      return {
        x: gap + index * (panelW + gap),
        y: gap,
        w: panelW,
        h: panelH
      };
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawPanel(rect, title, subtitle) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.strokeStyle = 'rgba(70,70,70,0.14)';
      ctx.lineWidth = Math.max(1, height * 0.002);
      roundRect(rect.x, rect.y, rect.w, rect.h, 18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(20,20,20,0.92)';
      ctx.font = `${Math.max(14, Math.floor(height * 0.031))}px "Roboto Mono", monospace`;
      ctx.fillText(title, rect.x + rect.w * 0.06, rect.y + rect.h * 0.10);
      ctx.fillStyle = 'rgba(90,90,90,0.82)';
      ctx.font = `${Math.max(10, Math.floor(height * 0.018))}px "Roboto Mono", monospace`;
      ctx.fillText(subtitle, rect.x + rect.w * 0.06, rect.y + rect.h * 0.15);
      ctx.restore();
    }

    function spaceFor(rect) {
      return {
        cx: rect.x + rect.w * 0.5,
        cy: rect.y + rect.h * 0.57,
        s: Math.min(rect.w, rect.h) * 0.28
      };
    }

    function drawAxes(space) {
      ctx.save();
      ctx.strokeStyle = 'rgba(70,70,70,0.18)';
      ctx.lineWidth = Math.max(1, height * 0.002);
      ctx.beginPath();
      ctx.moveTo(space.cx - space.s * 1.35, space.cy);
      ctx.lineTo(space.cx + space.s * 1.35, space.cy);
      ctx.moveTo(space.cx, space.cy - space.s * 1.35);
      ctx.lineTo(space.cx, space.cy + space.s * 1.35);
      ctx.stroke();
      ctx.restore();
    }

    function drawPoints(space, points, color, alpha) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(space.cx + p.x * space.s, space.cy - p.y * space.s, Math.max(2.2, height * 0.005), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawProjectionLine(space) {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      ctx.save();
      ctx.strokeStyle = 'rgba(20,20,20,0.58)';
      ctx.lineWidth = Math.max(2, height * 0.004);
      ctx.beginPath();
      ctx.moveTo(space.cx - dx * space.s * 1.55, space.cy + dy * space.s * 1.55);
      ctx.lineTo(space.cx + dx * space.s * 1.55, space.cy - dy * space.s * 1.55);
      ctx.stroke();
      ctx.restore();
    }

    function drawHistogram(rect) {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const bins = 28;
      const min = -1.7;
      const max = 1.7;
      const realBins = Array(bins).fill(0);
      const fakeBins = Array(bins).fill(0);

      function fillBins(points, out) {
        for (const p of points) {
          const v = p.x * dx + p.y * dy;
          const idx = Math.max(0, Math.min(bins - 1, Math.floor(((v - min) / (max - min)) * bins)));
          out[idx] += 1;
        }
      }
      fillBins(real, realBins);
      fillBins(fake, fakeBins);

      const chart = {
        x: rect.x + rect.w * 0.08,
        y: rect.y + rect.h * 0.26,
        w: rect.w * 0.84,
        h: rect.h * 0.56
      };
      const maxBin = Math.max(1, ...realBins, ...fakeBins);
      const bw = chart.w / bins;

      ctx.save();
      ctx.strokeStyle = 'rgba(70,70,70,0.20)';
      ctx.beginPath();
      ctx.moveTo(chart.x, chart.y + chart.h);
      ctx.lineTo(chart.x + chart.w, chart.y + chart.h);
      ctx.stroke();

      for (let i = 0; i < bins; i++) {
        const rh = (realBins[i] / maxBin) * chart.h;
        const fh = (fakeBins[i] / maxBin) * chart.h;
        ctx.fillStyle = 'rgba(18,106,90,0.46)';
        ctx.fillRect(chart.x + i * bw + bw * 0.08, chart.y + chart.h - rh, bw * 0.42, rh);
        ctx.fillStyle = 'rgba(211,93,47,0.46)';
        ctx.fillRect(chart.x + i * bw + bw * 0.50, chart.y + chart.h - fh, bw * 0.42, fh);
      }
      ctx.restore();
    }

    function step() {
      angle = rand(0, Math.PI);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const realProj = real.map((p) => p.x * dx + p.y * dy).sort((a, b) => a - b);
      const order = fake
        .map((p, i) => ({ i, v: p.x * dx + p.y * dy }))
        .sort((a, b) => a.v - b.v);

      for (let rank = 0; rank < order.length; rank++) {
        const p = fake[order[rank].i];
        const target = realProj[rank];
        const current = p.x * dx + p.y * dy;
        const delta = (target - current) * 0.18;
        p.x += dx * delta + gaussian() * 0.0025;
        p.y += dy * delta + gaussian() * 0.0025;
      }
      draw();
    }

    function draw() {
      resize();
      ctx.clearRect(0, 0, width, height);
      const left = panelRect(0);
      const right = panelRect(1);
      drawPanel(left, 'sample space', 'fake points are nudged through one projection');
      drawPanel(right, '1D sketch', 'real and fake histograms along that axis');

      const space = spaceFor(left);
      drawAxes(space);
      drawProjectionLine(space);
      drawPoints(space, real, '#126a5a', 0.50);
      drawPoints(space, fake, '#d35d2f', 0.62);
      drawHistogram(right);
    }

    function toggleAuto() {
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = 0;
        if (autoBtn) autoBtn.textContent = 'Auto step';
        return;
      }
      autoTimer = window.setInterval(step, 180);
      if (autoBtn) autoBtn.textContent = 'Stop';
    }

    stepBtn?.addEventListener('click', step);
    resetBtn?.addEventListener('click', reset);
    autoBtn?.addEventListener('click', toggleAuto);
    window.addEventListener('resize', draw, { passive: true });
    reset();
  }

  function initComments() {
    const host = document.getElementById('post-comments-thread');
    if (!host || host.querySelector('.utterances')) return;
    const s = document.createElement('script');
    s.src = 'https://utteranc.es/client.js';
    s.setAttribute('repo', 'the-puzzler/the-puzzler.github.io');
    s.setAttribute('issue-term', 'pathname');
    s.setAttribute('label', 'comments');
    s.setAttribute('theme', 'github-light');
    s.crossOrigin = 'anonymous';
    s.async = true;
    host.appendChild(s);
  }

  function init() {
    initSIGRegDemo();
    initSDMatchDemo();
    initComments();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('post:ready', init);
})();
