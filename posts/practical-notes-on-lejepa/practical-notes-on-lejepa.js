(function () {
  function initSigregLab() {
    const root = document.getElementById('sigreg-lab');
    if (!root || root.dataset.bound === 'true') return;
    root.dataset.bound = 'true';

    const canvas = root.querySelector('#sigreg-canvas');
    const resetBtn = root.querySelector('#sigreg-reset-btn');
    const stepBtn = root.querySelector('#sigreg-step-btn');
    const autoBtn = root.querySelector('#sigreg-auto-btn');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = 1200;
    let height = 560;
    let autoTimer = 0;

    let initialPoints = [];
    let currentPoints = [];
    let currentDirection = { x: 1, y: 0 };
    let currentAngle = 0;
    let baselineDirection = { x: 1, y: 0 };
    let lastStep = null;
    let stepCount = 0;
    let cloudHistory = [];

    function rand(min, max) {
      return min + Math.random() * (max - min);
    }

    function gaussian() {
      const u = Math.max(1e-6, Math.random());
      const v = Math.max(1e-6, Math.random());
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function gaussianQuantile(p) {
      const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
      const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
      const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
      const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
      const plow = 0.02425;
      const phigh = 1 - plow;
      let q;
      let r;

      if (p < plow) {
        q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
          ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
      }
      if (p > phigh) {
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
          ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
      }

      q = p - 0.5;
      r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }

    function sampleDirection(angle) {
      return { x: Math.cos(angle), y: Math.sin(angle) };
    }

    function clonePoints(points) {
      return points.map((p) => ({ x: p.x, y: p.y }));
    }

    function resize() {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const w = Math.max(760, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(420, Math.floor(canvas.clientWidth * 0.46 * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      width = canvas.width;
      height = canvas.height;
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

    function panelRect(index) {
      const gap = width * 0.04;
      const panelW = (width - gap * 3) / 2;
      const panelH = height - gap * 2;
      return {
        x: gap + index * (panelW + gap),
        y: gap,
        w: panelW,
        h: panelH
      };
    }

    function drawPanelFrame(rect, title, subtitle) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.strokeStyle = 'rgba(70,70,70,0.14)';
      ctx.lineWidth = Math.max(1, height * 0.0022);
      roundRect(rect.x, rect.y, rect.w, rect.h, 18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(20,20,20,0.92)';
      ctx.font = `${Math.max(14, Math.floor(height * 0.032))}px "Roboto Mono", monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(title, rect.x + rect.w * 0.06, rect.y + rect.h * 0.10);

      ctx.fillStyle = 'rgba(90,90,90,0.82)';
      ctx.font = `${Math.max(10, Math.floor(height * 0.019))}px "Roboto Mono", monospace`;
      drawWrappedText(
        subtitle,
        rect.x + rect.w * 0.06,
        rect.y + rect.h * 0.152,
        rect.w * 0.84,
        Math.max(14, Math.floor(height * 0.024)),
        2
      );
      ctx.restore();
    }

    function drawWrappedText(text, x, y, maxWidth, lineHeight, maxLines = 2) {
      const words = String(text).split(/\s+/);
      const lines = [];
      let current = '';

      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width <= maxWidth || !current) {
          current = test;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);

      const clipped = lines.slice(0, maxLines);
      clipped.forEach((line, idx) => {
        ctx.fillText(line, x, y + idx * lineHeight);
      });
    }

    function drawEmbeddingAxes(rect) {
      const cx = rect.x + rect.w * 0.50;
      const cy = rect.y + rect.h * 0.60;
      const sx = rect.w * 0.15;
      const sy = rect.h * 0.21;

      ctx.save();
      ctx.strokeStyle = 'rgba(70,70,70,0.22)';
      ctx.lineWidth = Math.max(1, height * 0.0022);
      ctx.beginPath();
      ctx.moveTo(cx - rect.w * 0.27, cy);
      ctx.lineTo(cx + rect.w * 0.27, cy);
      ctx.moveTo(cx, cy - rect.h * 0.27);
      ctx.lineTo(cx, cy + rect.h * 0.27);
      ctx.stroke();
      ctx.restore();

      return { cx, cy, sx, sy };
    }

    function drawPointCloud(space, data, color, alpha = 1) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      for (const p of data) {
        const x = space.cx + p.x * space.sx;
        const y = space.cy - p.y * space.sy;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2.8, height * 0.006), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawDirection(space, direction, color, strong = true) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = strong ? Math.max(2, height * 0.004) : Math.max(1.2, height * 0.0024);
      ctx.beginPath();
      ctx.moveTo(space.cx - direction.x * space.sx * 1.7, space.cy + direction.y * space.sy * 1.7);
      ctx.lineTo(space.cx + direction.x * space.sx * 1.7, space.cy - direction.y * space.sy * 1.7);
      ctx.stroke();
      ctx.restore();
    }

    function gaussianTarget(x) {
      return Math.exp(-0.5 * x * x);
    }

    function render() {
      resize();
      ctx.clearRect(0, 0, width, height);

      const left = panelRect(0);
      const right = panelRect(1);

      drawPanelFrame(left, 'Latest sampled direction', `step ${stepCount}: cloud after nudging along one random axis`);
      drawPanelFrame(right, 'One 1D marginal before and after', 'blue = initial marginal, gold = current marginal');

      const space = drawEmbeddingAxes(left);

      ctx.save();
      roundRect(left.x + 1, left.y + 1, left.w - 2, left.h - 2, 17);
      ctx.clip();
      const historyToShow = cloudHistory.slice(-4);
      historyToShow.forEach((snapshot, idx) => {
        const alpha = 0.12 + idx * 0.05;
        drawPointCloud(space, snapshot, '#9aa3b6', alpha);
      });
      drawPointCloud(space, currentPoints, '#4c6ef5');
      drawDirection(space, currentDirection, 'rgba(110,110,110,0.96)', true);
      ctx.restore();

      drawProjectionPanel(right);
    }

    function drawProjectionPanel(rect) {
      const leftX = rect.x + rect.w * 0.12;
      const rightX = rect.x + rect.w * 0.88;
      const beforeY = rect.y + rect.h * 0.56;
      const afterY = rect.y + rect.h * 0.80;

      ctx.save();
      ctx.strokeStyle = 'rgba(90,90,90,0.30)';
      ctx.lineWidth = Math.max(1.2, height * 0.0022);
      ctx.beginPath();
      ctx.moveTo(leftX, beforeY);
      ctx.lineTo(rightX, beforeY);
      ctx.moveTo(leftX, afterY);
      ctx.lineTo(rightX, afterY);
      ctx.stroke();

      ctx.fillStyle = 'rgba(90,90,90,0.82)';
      ctx.font = `${Math.max(11, Math.floor(height * 0.022))}px "Roboto Mono", monospace`;
      ctx.fillText('before', leftX, rect.y + rect.h * 0.47);
      ctx.fillText('after', leftX, rect.y + rect.h * 0.72);

      const curveBase = rect.y + rect.h * 0.30;
      ctx.strokeStyle = '#cc8d26';
      ctx.lineWidth = Math.max(1.6, height * 0.0034);
      ctx.beginPath();
      for (let i = 0; i <= 80; i += 1) {
        const t = i / 80;
        const x = leftX + (rightX - leftX) * t;
        const z = -2.6 + 5.2 * t;
        const y = curveBase - gaussianTarget(z) * rect.h * 0.075;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (!lastStep) {
        ctx.fillText('Press Step to sample a direction and update one marginal.', leftX, rect.y + rect.h * 0.60);
        ctx.restore();
        return;
      }

      drawProjectionRow(lastStep.before, beforeY, leftX, rightX, '#4c6ef5');
      drawProjectionRow(lastStep.after, afterY, leftX, rightX, '#cc8d26');
      drawProjectionLinks(lastStep.before, lastStep.after, leftX, rightX, beforeY, afterY);
      ctx.restore();
    }

    function drawProjectionRow(values, lineY, leftX, rightX, color) {
      ctx.save();
      ctx.fillStyle = color;
      values.forEach((entry) => {
        const t = Math.max(0.04, Math.min(0.96, (entry.x + 2.1) / 4.2));
        const x = leftX + (rightX - leftX) * t;
        const y = lineY + (entry.lane - 2) * height * 0.008;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2.8, height * 0.006), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    function drawProjectionLinks(before, after, leftX, rightX, beforeY, afterY) {
      ctx.save();
      ctx.strokeStyle = 'rgba(140,140,140,0.20)';
      ctx.lineWidth = Math.max(1, height * 0.0018);
      before.forEach((src, idx) => {
        const dst = after[idx];
        const tx1 = Math.max(0.04, Math.min(0.96, (src.x + 2.1) / 4.2));
        const tx2 = Math.max(0.04, Math.min(0.96, (dst.x + 2.1) / 4.2));
        const x1 = leftX + (rightX - leftX) * tx1;
        const x2 = leftX + (rightX - leftX) * tx2;
        const y1 = beforeY + (src.lane - 2) * height * 0.008;
        const y2 = afterY + (dst.lane - 2) * height * 0.008;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });
      ctx.restore();
    }

    function reset() {
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = 0;
      }
      initialPoints = Array.from({ length: 56 }, () => {
        const x = gaussian() * 0.26;
        const y = gaussian() * 0.26;
        return { x, y };
      });
      currentPoints = clonePoints(initialPoints);
      currentAngle = rand(0, Math.PI * 2);
      currentDirection = sampleDirection(currentAngle);
      baselineDirection = { ...currentDirection };
      lastStep = null;
      stepCount = 0;
      cloudHistory = [];
      syncBaselinePanel();
      render();
    }

    function step() {
      const beforePoints = clonePoints(currentPoints);
      cloudHistory.push(beforePoints);
      if (cloudHistory.length > 4) cloudHistory = cloudHistory.slice(-4);
      currentAngle = rand(0, Math.PI * 2);
      currentDirection = sampleDirection(currentAngle);

      const beforeProj = currentPoints.map((p, idx) => ({
        idx,
        x: p.x * currentDirection.x + p.y * currentDirection.y,
        lane: idx % 5
      })).sort((a, b) => a.x - b.x);

      const nudged = clonePoints(currentPoints);
      const afterProj = beforeProj.map((entry, rank) => {
        const target = gaussianQuantile((rank + 0.5) / beforeProj.length) * 0.92;
        const delta = (target - entry.x) * 0.18;
        nudged[entry.idx].x += delta * currentDirection.x;
        nudged[entry.idx].y += delta * currentDirection.y;
        return { x: entry.x + delta, lane: entry.lane };
      });

      currentPoints = nudged;
      stepCount += 1;
      lastStep = {
        before: projectRows(initialPoints, baselineDirection),
        after: projectRows(currentPoints, baselineDirection),
        beforePoints
      };
      render();
    }

    function autoStep() {
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = 0;
        return;
      }
      autoTimer = window.setInterval(() => {
        if (stepCount >= 50) {
          clearInterval(autoTimer);
          autoTimer = 0;
          return;
        }
        step();
      }, 35);
    }

    function projectRows(points, direction) {
      return points.map((p, idx) => ({
        x: p.x * direction.x + p.y * direction.y,
        lane: idx % 5
      })).sort((a, b) => a.x - b.x).map((entry) => ({
        x: entry.x,
        lane: entry.lane
      }));
    }

    function syncBaselinePanel() {
      const baseline = projectRows(initialPoints, baselineDirection);
      lastStep = {
        before: baseline,
        after: baseline.map((entry) => ({ ...entry })),
        beforePoints: clonePoints(initialPoints)
      };
    }

    resetBtn?.addEventListener('click', reset);
    stepBtn?.addEventListener('click', step);
    autoBtn?.addEventListener('click', autoStep);
    resize();
    reset();
    window.addEventListener('resize', render, { passive: true });
    window.addEventListener('pagehide', () => {
      if (autoTimer) clearInterval(autoTimer);
    }, { once: true });
  }

  document.addEventListener('post:ready', initSigregLab, { once: true });
  if (document.readyState !== 'loading') setTimeout(initSigregLab, 0);
  else document.addEventListener('DOMContentLoaded', initSigregLab, { once: true });
})();

/* ============================================================
   Normalisation lab
   ============================================================ */
(function () {
  function gaussian() {
    const u = Math.max(1e-6, Math.random());
    const v = Math.max(1e-6, Math.random());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function gaussianQuantile(p) {
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const plow = 0.02425;
    const phigh = 1 - plow;
    let q;
    let r;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > phigh) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function initNormLab() {
    const root = document.getElementById('norm-lab');
    if (!root || root.dataset.bound === 'true') return;
    root.dataset.bound = 'true';

    const canvas = root.querySelector('#norm-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const N = 90;
    const LR = 0.22;

    let mode = 'none';
    let points = [];
    let lastSampledDir = { x: 1, y: 0 };
    let stepCount = 0;
    let autoTimer = 0;
    let width = 1200;
    let height = 560;

    function normalise() {
      if (mode === 'layer') {
        for (const p of points) {
          const r = Math.hypot(p.x, p.y);
          if (r > 1e-6) {
            p.x /= r;
            p.y /= r;
          }
        }
      } else if (mode === 'batch') {
        let mx = 0;
        let my = 0;
        for (const p of points) {
          mx += p.x;
          my += p.y;
        }
        mx /= points.length;
        my /= points.length;
        let vx = 0;
        let vy = 0;
        for (const p of points) {
          vx += (p.x - mx) * (p.x - mx);
          vy += (p.y - my) * (p.y - my);
        }
        vx = Math.sqrt(vx / points.length) || 1;
        vy = Math.sqrt(vy / points.length) || 1;
        for (const p of points) {
          p.x = (p.x - mx) / vx;
          p.y = (p.y - my) / vy;
        }
      }
    }

    function reset() {
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = 0;
      }
      points = [];
      for (let i = 0; i < N; i += 1) {
        const offset = Math.random() < 0.65 ? -0.55 : 0.7;
        const x = gaussian() * 0.32 + offset;
        const y = gaussian() * 0.28 + offset * 0.25;
        points.push({ x, y });
      }
      stepCount = 0;
      lastSampledDir = { x: 1, y: 0 };
      normalise();
      render();
    }

    function step() {
      const angle = Math.random() * Math.PI * 2;
      const dir = { x: Math.cos(angle), y: Math.sin(angle) };
      lastSampledDir = dir;

      const proj = points.map((p, idx) => ({
        idx,
        v: p.x * dir.x + p.y * dir.y
      })).sort((a, b) => a.v - b.v);

      proj.forEach((entry, rank) => {
        const target = gaussianQuantile((rank + 0.5) / proj.length);
        const delta = (target - entry.v) * LR;
        points[entry.idx].x += delta * dir.x;
        points[entry.idx].y += delta * dir.y;
      });

      normalise();
      stepCount += 1;
      render();
    }

    function autoStep() {
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = 0;
        return;
      }
      autoTimer = window.setInterval(() => {
        if (stepCount >= 80) {
          clearInterval(autoTimer);
          autoTimer = 0;
          return;
        }
        step();
      }, 55);
    }

    function setMode(newMode) {
      mode = newMode;
      root.querySelectorAll('[data-mode]').forEach((b) => {
        b.classList.toggle('active', b.dataset.mode === newMode);
      });
      normalise();
      render();
    }

    function resize() {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const w = Math.max(760, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(420, Math.floor(canvas.clientWidth * 0.46 * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      width = canvas.width;
      height = canvas.height;
    }

    function drawPanel(rect, title, subtitle) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.strokeStyle = 'rgba(70,70,70,0.14)';
      ctx.lineWidth = Math.max(1, height * 0.0022);
      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(20,20,20,0.92)';
      ctx.font = `${Math.max(14, Math.floor(height * 0.032))}px "Roboto Mono", monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(title, rect.x + rect.w * 0.06, rect.y + rect.h * 0.10);

      ctx.fillStyle = 'rgba(90,90,90,0.82)';
      ctx.font = `${Math.max(10, Math.floor(height * 0.020))}px "Roboto Mono", monospace`;
      ctx.fillText(subtitle, rect.x + rect.w * 0.06, rect.y + rect.h * 0.152);
      ctx.restore();
    }

    function render() {
      resize();
      ctx.clearRect(0, 0, width, height);

      const gap = width * 0.04;
      const panelW = (width - gap * 3) / 2;
      const panelH = height - gap * 2;
      const left = { x: gap, y: gap, w: panelW, h: panelH };
      const right = { x: gap * 2 + panelW, y: gap, w: panelW, h: panelH };

      const modeLabel = mode === 'none' ? 'no normalisation' : (mode === 'layer' ? 'layernorm (unit circle)' : 'batchnorm (mean 0, std 1)');
      drawPanel(left, '2D embedding cloud', `${modeLabel} · step ${stepCount}`);
      drawPanel(right, '1D marginal vs target Gaussian', 'projected onto the x-axis');

      drawCloud(left);
      drawHistogram(right);
    }

    function drawCloud(rect) {
      const cx = rect.x + rect.w * 0.5;
      const cy = rect.y + rect.h * 0.60;
      const scale = Math.min(rect.w, rect.h) * 0.20;

      ctx.save();
      ctx.strokeStyle = 'rgba(70,70,70,0.22)';
      ctx.lineWidth = Math.max(1, height * 0.0022);
      ctx.beginPath();
      ctx.moveTo(cx - rect.w * 0.30, cy);
      ctx.lineTo(cx + rect.w * 0.30, cy);
      ctx.moveTo(cx, cy - rect.h * 0.30);
      ctx.lineTo(cx, cy + rect.h * 0.30);
      ctx.stroke();
      ctx.restore();

      if (mode === 'layer') {
        ctx.save();
        ctx.strokeStyle = 'rgba(204,141,38,0.55)';
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = Math.max(1.5, height * 0.0028);
        ctx.beginPath();
        ctx.arc(cx, cy, scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.strokeStyle = 'rgba(110,110,110,0.85)';
      ctx.lineWidth = Math.max(1.6, height * 0.003);
      ctx.beginPath();
      ctx.moveTo(cx - lastSampledDir.x * scale * 1.7, cy + lastSampledDir.y * scale * 1.7);
      ctx.lineTo(cx + lastSampledDir.x * scale * 1.7, cy - lastSampledDir.y * scale * 1.7);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      roundRect(ctx, rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2, 17);
      ctx.clip();
      ctx.fillStyle = '#4c6ef5';
      for (const p of points) {
        const x = cx + p.x * scale;
        const y = cy - p.y * scale;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2.6, height * 0.0055), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawHistogram(rect) {
      const histX = rect.x + rect.w * 0.10;
      const histW = rect.w * 0.80;
      const baseY = rect.y + rect.h * 0.86;
      const histH = rect.h * 0.62;
      const minV = -3;
      const maxV = 3;
      const bins = 26;

      const proj = points.map((p) => p.x);
      const counts = new Array(bins).fill(0);
      for (const v of proj) {
        const t = (v - minV) / (maxV - minV);
        if (t >= 0 && t < 1) counts[Math.floor(t * bins)] += 1;
      }
      const binWidth = (maxV - minV) / bins;
      const densityScale = histH * 1.1;

      ctx.save();
      ctx.strokeStyle = 'rgba(90,90,90,0.35)';
      ctx.lineWidth = Math.max(1, height * 0.002);
      ctx.beginPath();
      ctx.moveTo(histX, baseY);
      ctx.lineTo(histX + histW, baseY);
      ctx.stroke();

      const barW = histW / bins;
      ctx.fillStyle = 'rgba(76, 110, 245, 0.65)';
      counts.forEach((c, i) => {
        const density = c / (proj.length * binWidth);
        const h = Math.min(histH, density * densityScale);
        const x = histX + barW * i;
        ctx.fillRect(x + 1, baseY - h, Math.max(1, barW - 2), h);
      });

      ctx.strokeStyle = '#cc8d26';
      ctx.lineWidth = Math.max(1.8, height * 0.0036);
      ctx.beginPath();
      for (let i = 0; i <= 100; i += 1) {
        const t = i / 100;
        const x = histX + histW * t;
        const z = minV + (maxV - minV) * t;
        const density = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
        const y = baseY - density * densityScale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = 'rgba(90,90,90,0.82)';
      ctx.font = `${Math.max(10, Math.floor(height * 0.020))}px "Roboto Mono", monospace`;
      ctx.fillText('−3', histX - 6, baseY + height * 0.028);
      ctx.fillText('0', histX + histW * 0.5 - 4, baseY + height * 0.028);
      ctx.fillText('+3', histX + histW - 12, baseY + height * 0.028);
      ctx.restore();
    }

    root.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
    root.querySelector('#norm-step-btn')?.addEventListener('click', step);
    root.querySelector('#norm-auto-btn')?.addEventListener('click', autoStep);
    root.querySelector('#norm-reset-btn')?.addEventListener('click', reset);

    resize();
    reset();
    window.addEventListener('resize', render, { passive: true });
    window.addEventListener('pagehide', () => {
      if (autoTimer) clearInterval(autoTimer);
    }, { once: true });
  }

  document.addEventListener('post:ready', initNormLab, { once: true });
  if (document.readyState !== 'loading') setTimeout(initNormLab, 0);
  else document.addEventListener('DOMContentLoaded', initNormLab, { once: true });
})();

(function () {
  function initComments() {
    const host = document.getElementById('post-comments-thread');
    if (!host) return;
    if (host.querySelector('.utterances')) return;

    const s = document.createElement('script');
    s.src = 'https://utteranc.es/client.js';
    s.async = true;
    s.setAttribute('repo', 'the-puzzler/the-puzzler.github.io');
    s.setAttribute('issue-term', 'posts/practical-notes-on-lejepa/practical-notes-on-lejepa.html');
    s.setAttribute('label', 'comments');
    s.setAttribute('theme', 'github-light');
    s.setAttribute('crossorigin', 'anonymous');
    host.appendChild(s);
  }

  document.addEventListener('post:ready', initComments, { once: true });
  if (document.readyState !== 'loading') setTimeout(initComments, 0);
  else document.addEventListener('DOMContentLoaded', initComments, { once: true });
})();

