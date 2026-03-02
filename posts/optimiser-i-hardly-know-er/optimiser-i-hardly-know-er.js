// Post-specific scripts for "Optimiser? I Hardly Know 'Er."
function ensureTwitterEmbeds() {
  const root = document.getElementById('post-content') || document;
  const hasTweet = root.querySelector('.twitter-tweet');
  if (!hasTweet) return;

  const CROP_PX = 594;

  const cropRenderedTweets = () => {
    const embeds = root.querySelectorAll(
      'iframe.twitter-tweet-rendered, iframe[src*="platform.twitter.com/embed/Tweet.html"]'
    );
    embeds.forEach((iframe) => {
      iframe.style.height = `${CROP_PX}px`;
      iframe.style.maxHeight = `${CROP_PX}px`;
      iframe.style.overflow = 'hidden';
      iframe.style.display = 'block';
    });
  };

  const loadTweets = () => {
    if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
      window.twttr.widgets.load(root);
    }
    setTimeout(cropRenderedTweets, 250);
    setTimeout(cropRenderedTweets, 800);
  };

  const retryLoadTweets = (tries = 12) => {
    loadTweets();
    if ((window.twttr && window.twttr.widgets) || tries <= 0) return;
    setTimeout(() => retryLoadTweets(tries - 1), 250);
  };

  if (window.twttr) {
    retryLoadTweets();
    return;
  }

  const existing = document.querySelector('script[src="https://platform.twitter.com/widgets.js"]');
  if (existing) {
    existing.addEventListener('load', retryLoadTweets, { once: true });
    retryLoadTweets();
    return;
  }

  const s = document.createElement('script');
  s.src = 'https://platform.twitter.com/widgets.js';
  s.async = true;
  s.charset = 'utf-8';
  s.addEventListener('load', retryLoadTweets, { once: true });
  document.body.appendChild(s);

  if (window.MutationObserver) {
    const mo = new MutationObserver(() => cropRenderedTweets());
    mo.observe(root, { childList: true, subtree: true });
  }
}

function ensureCodeEditorHighlight() {
  const root = document.getElementById('post-content') || document;
  const blocks = root.querySelectorAll('pre code.language-python');
  if (!blocks.length) return;

  const highlightNow = () => {
    if (!window.Prism || typeof window.Prism.highlightElement !== 'function') return;
    blocks.forEach((b) => window.Prism.highlightElement(b));
  };

  if (window.Prism) {
    highlightNow();
    return;
  }

  if (!document.getElementById('prism-theme-default')) {
    const l = document.createElement('link');
    l.id = 'prism-theme-default';
    l.rel = 'stylesheet';
    l.href = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css';
    document.head.appendChild(l);
  }

  const loadPythonAndHighlight = () => {
    if (document.querySelector('script[data-prism-python]')) {
      setTimeout(highlightNow, 40);
      return;
    }
    const py = document.createElement('script');
    py.src = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js';
    py.async = true;
    py.dataset.prismPython = 'true';
    py.addEventListener('load', highlightNow, { once: true });
    document.body.appendChild(py);
  };

  const core = document.querySelector('script[data-prism-core]');
  if (core) {
    core.addEventListener('load', loadPythonAndHighlight, { once: true });
    loadPythonAndHighlight();
    return;
  }

  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js';
  s.async = true;
  s.dataset.prismCore = 'true';
  s.addEventListener('load', loadPythonAndHighlight, { once: true });
  document.body.appendChild(s);
}

function ensureGifAutoRestart() {
  const root = document.getElementById('post-content') || document;
  const gifs = root.querySelectorAll('img.restartable-gif');
  gifs.forEach((img) => {
    if (img.dataset.restartBound === 'true') return;
    img.dataset.restartBound = 'true';
    const ms = Number(img.dataset.restartMs || 9000);
    setInterval(() => {
      const base = img.src.split('?')[0];
      img.src = `${base}?_r=${Date.now()}`;
    }, ms);
  });
}

function initProgramLoopAnimation() {
  const canvas = document.getElementById('program-loop-canvas');
  if (!canvas || canvas.dataset.bound === 'true') return;
  canvas.dataset.bound = 'true';
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const DPR_CAP = 2;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const w = Math.max(560, Math.floor(canvas.clientWidth * dpr));
    const h = Math.floor((w * 300) / 940);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w * 0.25, h * 0.45);
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

  function measureNode(lines) {
    const fontPx = Math.max(11, Math.floor(canvas.height * 0.073));
    ctx.font = `${fontPx}px "EB Garamond", serif`;
    let maxW = 0;
    lines.forEach((line) => {
      maxW = Math.max(maxW, ctx.measureText(line).width);
    });
    const padX = Math.max(10, canvas.height * 0.040);
    const lineGap = Math.max(11, fontPx * 1.05);
    const padY = Math.max(8, canvas.height * 0.030);
    const width = maxW + padX * 2;
    const height = lineGap * lines.length + padY * 2;
    return { width, height, fontPx, lineGap };
  }

  function drawNode(x, y, w, h, lines, metrics) {
    roundRect(x, y, w, h, Math.max(7, h * 0.14));
    ctx.fillStyle = 'hsla(0 0% 100% / 0.95)';
    ctx.fill();
    ctx.strokeStyle = 'hsla(210 14% 34% / 0.36)';
    ctx.lineWidth = Math.max(1, canvas.height * 0.0055);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'hsla(210 18% 16% / 0.96)';
    ctx.font = `${metrics.fontPx}px "EB Garamond", serif`;
    const gap = metrics.lineGap;
    const y0 = y + h * 0.5 - (gap * (lines.length - 1)) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, x + w * 0.5, y0 + i * gap);
    });
  }

  function edgePoint(fromX, fromY, toX, toY, halfW, halfH) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const denom = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH, 1e-6);
    return {
      x: fromX + dx / denom,
      y: fromY + dy / denom,
    };
  }

  function drawConnector(from, to, centerX, centerY) {
    const midX = (from.x + to.x) * 0.5;
    const midY = (from.y + to.y) * 0.5;
    const outX = midX - centerX;
    const outY = midY - centerY;
    const outLen = Math.hypot(outX, outY) || 1;
    const bow = Math.min(canvas.width, canvas.height) * 0.06;
    const cx = midX + (outX / outLen) * bow;
    const cy = midY + (outY / outLen) * bow;

    ctx.strokeStyle = 'hsla(210 22% 32% / 0.58)';
    ctx.lineWidth = Math.max(1.1, canvas.height * 0.0063);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(cx, cy, to.x, to.y);
    ctx.stroke();

    const t = 0.94;
    const omt = 1 - t;
    const px = omt * omt * from.x + 2 * omt * t * cx + t * t * to.x;
    const py = omt * omt * from.y + 2 * omt * t * cy + t * t * to.y;
    const tx = 2 * omt * (cx - from.x) + 2 * t * (to.x - cx);
    const ty = 2 * omt * (cy - from.y) + 2 * t * (to.y - cy);
    const ang = Math.atan2(ty, tx);
    const head = Math.max(6, canvas.height * 0.031);

    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - Math.cos(ang - 0.48) * head, py - Math.sin(ang - 0.48) * head);
    ctx.lineTo(px - Math.cos(ang + 0.48) * head, py - Math.sin(ang + 0.48) * head);
    ctx.closePath();
    ctx.fillStyle = 'hsla(210 22% 32% / 0.58)';
    ctx.fill();
  }

  function drawStraightConnector(from, to) {
    ctx.strokeStyle = 'hsla(210 22% 32% / 0.58)';
    ctx.lineWidth = Math.max(1.1, canvas.height * 0.0063);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const head = Math.max(6, canvas.height * 0.031);
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - Math.cos(ang - 0.48) * head, to.y - Math.sin(ang - 0.48) * head);
    ctx.lineTo(to.x - Math.cos(ang + 0.48) * head, to.y - Math.sin(ang + 0.48) * head);
    ctx.closePath();
    ctx.fillStyle = 'hsla(210 22% 32% / 0.58)';
    ctx.fill();
  }

  const labels = [
    ['LLM Proposes', 'Change to Program'],
    ['Experiment', 'with Program'],
    ['LLM Evaluates', 'Result'],
  ];

  const start = performance.now();

  function frame(ts) {
    resize();
    const w = canvas.width;
    const h = canvas.height;
    const sec = (ts - start) / 1000;

    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.47;
    const topDx = Math.min(w, h) * 0.45;
    const topY = cy - Math.min(w, h) * 0.20;
    const bottomY = cy + Math.min(w, h) * 0.30;
    const nodeSizes = labels.map((l) => measureNode(l));
    const unifiedW = Math.max(...nodeSizes.map((m) => m.width));
    const unifiedH = Math.max(...nodeSizes.map((m) => m.height));
    nodeSizes.forEach((m) => {
      m.width = unifiedW;
      m.height = unifiedH;
    });

    const nodes = [
      { lines: labels[0], m: nodeSizes[0], cx: cx - topDx, cy: topY },
      { lines: labels[1], m: nodeSizes[1], cx: cx + topDx, cy: topY },
      { lines: labels[2], m: nodeSizes[2], cx, cy: bottomY },
    ];

    nodes.forEach((n) => {
      const nx = n.cx - n.m.width * 0.5;
      const ny = n.cy - n.m.height * 0.5;
      drawNode(nx, ny, n.m.width, n.m.height, n.lines, n.m);
    });

    for (let i = 0; i < 3; i += 1) {
      const a = nodes[i];
      const b = nodes[(i + 1) % 3];
      const p1 = edgePoint(a.cx, a.cy, b.cx, b.cy, a.m.width * 0.5, a.m.height * 0.5);
      const p2 = edgePoint(b.cx, b.cy, a.cx, a.cy, b.m.width * 0.5, b.m.height * 0.5);
      if (i === 0) drawStraightConnector(p1, p2);
      else drawConnector(p1, p2, cx, cy);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function initLuckyGuessBoard() {
  const canvas1 = document.getElementById('lucky-board-canvas-1');
  const canvas15 = document.getElementById('lucky-board-canvas-15');
  if (!canvas1 || !canvas15) return;
  if (canvas1.dataset.bound === 'true' && canvas15.dataset.bound === 'true') return;
  canvas1.dataset.bound = 'true';
  canvas15.dataset.bound = 'true';

  const ctx1 = canvas1.getContext('2d');
  const ctx15 = canvas15.getContext('2d');
  if (!ctx1 || !ctx15) return;

  const green1 = document.getElementById('lucky-board-green-1');
  const green15 = document.getElementById('lucky-board-green-15');
  if (!green1 || !green15) return;

  const DPR_CAP = 2;
  const ROWS = 9;
  const TOP_PINS = 2;
  const BINS = ROWS + TOP_PINS;
  const GREEN_BINS = new Set([1, BINS - 2]);
  const PIN_R = 4.2;
  const BALL_R = 4.6;
  const G = 680;
  const BATCH_GAP_MS = 2100;
  const STAGGER_MS = 95;
  const RESTITUTION = 0.42;
  const FRICTION = 0.985;

  function mkBoard(canvas, ctx, breadth, els) {
    return {
      canvas,
      ctx,
      breadth,
      els,
      active: [],
      pins: [],
      stats: { green: 0 },
      batchId: 0,
      batchState: new Map(),
      nextBatchAt: performance.now() + 500 + (breadth > 1 ? 250 : 0),
      waitingForNextBatch: false,
    };
  }

  const boardA = mkBoard(canvas1, ctx1, 1, { green: green1 });
  const boardB = mkBoard(canvas15, ctx15, 15, { green: green15 });
  const boards = [boardA, boardB];
  let roundInProgress = false;
  let nextRoundAt = performance.now() + 500;

  function resizeBoard(b) {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const w = Math.max(380, Math.floor(b.canvas.clientWidth * dpr));
    const h = Math.max(240, Math.floor((w * 320) / 440));
    if (b.canvas.width !== w || b.canvas.height !== h) {
      b.canvas.width = w;
      b.canvas.height = h;
      buildPins(b);
    }
  }

  function boardGeom(b) {
    const w = b.canvas.width;
    const h = b.canvas.height;
    const topY = h * 0.11;
    const pinBandH = h * 0.58;
    const rowStepY = pinBandH / ROWS;
    const stepX = w * 0.064;
    const cx = w * 0.5;
    const binsTop = topY + pinBandH + h * 0.04;
    return { w, h, topY, pinBandH, rowStepY, stepX, cx, binsTop, left: w * 0.10, right: w * 0.90 };
  }

  function buildPins(b) {
    const g = boardGeom(b);
    b.pins = [];
    for (let r = 0; r < ROWS; r += 1) {
      const y = g.topY + r * g.rowStepY;
      const count = r + TOP_PINS;
      const x0 = g.cx - ((count - 1) * g.stepX) / 2;
      for (let i = 0; i < count; i += 1) {
        b.pins.push({ x: x0 + i * g.stepX, y });
      }
    }
  }

  function spawnBall(b, now, id) {
    const g = boardGeom(b);
    return {
      id,
      t0: now,
      x: g.cx + (Math.random() - 0.5) * g.stepX * 0.15,
      y: g.topY - g.rowStepY * 0.85,
      vx: (Math.random() - 0.5) * 18,
      vy: 0,
      alive: true,
    };
  }

  function startBatch(b, now) {
    const id = ++b.batchId;
    b.stats.green = 0;
    b.batchState.set(id, { remaining: b.breadth, hitGreen: false });
    for (let i = 0; i < b.breadth; i += 1) {
      const ball = spawnBall(b, now + i * STAGGER_MS, id);
      b.active.push(ball);
    }
    b.nextBatchAt = now + BATCH_GAP_MS + b.breadth * STAGGER_MS;
  }

  function startRound(now) {
    for (const b of boards) startBatch(b, now);
    roundInProgress = true;
  }

  function finishBall(b, ball, bin) {
    const isGreen = GREEN_BINS.has(bin);
    if (isGreen) b.stats.green += 1;
    const batch = b.batchState.get(ball.id);
    if (!batch) return;
    if (isGreen) batch.hitGreen = true;
    batch.remaining -= 1;
    if (batch.remaining <= 0) {
      b.batchState.delete(ball.id);
      b.waitingForNextBatch = true;
    }
    ball.alive = false;
    ball.bin = bin;
  }

  function drawPins(b, g) {
    b.ctx.fillStyle = 'hsla(210 16% 34% / 0.42)';
    for (const p of b.pins) {
      b.ctx.beginPath();
      b.ctx.arc(p.x, p.y, Math.max(2.1, g.h * 0.0072), 0, Math.PI * 2);
      b.ctx.fill();
    }
  }

  function drawBins(b, g) {
    const ctx = b.ctx;
    const laneW = (g.stepX * ROWS) / BINS + 2;
    const tile = Math.min(laneW - 3, g.h * 0.070);
    const totalW = BINS * laneW;
    const xStart = g.cx - totalW / 2;
    const y = g.binsTop + g.h * 0.035;
    for (let i = 0; i < BINS; i += 1) {
      const laneX = xStart + i * laneW;
      const x = laneX + (laneW - tile) * 0.5;
      const isGreen = GREEN_BINS.has(i);
      ctx.fillStyle = isGreen ? 'hsla(142 58% 42% / 0.90)' : 'hsla(2 74% 49% / 0.78)';
      ctx.fillRect(x, y, tile, tile);
      ctx.strokeStyle = 'hsla(210 14% 28% / 0.22)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, tile, tile);
    }
  }

  function resolvePinCollision(ball, pin) {
    const dx = ball.x - pin.x;
    const dy = ball.y - pin.y;
    const minD = BALL_R + PIN_R;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minD * minD) return;
    const d = Math.sqrt(d2) || 0.001;
    const nx = dx / d;
    const ny = dy / d;
    const overlap = minD - d;
    ball.x += nx * overlap;
    ball.y += ny * overlap;

    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= (1 + RESTITUTION) * vn * nx;
      ball.vy -= (1 + RESTITUTION) * vn * ny;
    }
    ball.vx *= FRICTION;
  }

  function stepBalls(b, dt, now, g) {
    const survivors = [];
    const laneW = (g.stepX * ROWS) / BINS + 2;
    const xStart = g.cx - (laneW * BINS) / 2;
    for (const ball of b.active) {
      if (now < ball.t0) {
        survivors.push(ball);
        continue;
      }
      ball.vy += G * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      if (ball.x < g.left + BALL_R) {
        ball.x = g.left + BALL_R;
        ball.vx = Math.abs(ball.vx) * 0.55;
      } else if (ball.x > g.right - BALL_R) {
        ball.x = g.right - BALL_R;
        ball.vx = -Math.abs(ball.vx) * 0.55;
      }

      for (const pin of b.pins) resolvePinCollision(ball, pin);

      if (ball.y >= g.binsTop + g.h * 0.02) {
        const bin = Math.max(0, Math.min(BINS - 1, Math.floor((ball.x - xStart) / laneW)));
        finishBall(b, ball, bin);
        continue;
      }
      survivors.push(ball);
    }
    b.active = survivors;
  }

  function drawBalls(b, g, now) {
    const ctx = b.ctx;
    for (const ball of b.active) {
      if (now < ball.t0) continue;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, Math.max(3.0, g.h * 0.0105), 0, Math.PI * 2);
      ctx.fillStyle = 'hsla(34 86% 52% / 0.94)';
      ctx.fill();
      ctx.strokeStyle = 'hsla(18 46% 25% / 0.42)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function updateStats(b) {
    b.els.green.textContent = String(b.stats.green);
  }

  function resetAll() {
    const now = performance.now();
    for (const b of boards) {
      b.active = [];
      b.stats.green = 0;
      b.batchState.clear();
      b.nextBatchAt = now + 350 + (b.breadth > 1 ? 250 : 0);
      b.waitingForNextBatch = false;
      updateStats(b);
    }
    roundInProgress = false;
    nextRoundAt = now + 500;
  }

  resetAll();

  let lastTs = performance.now();

  function frame(ts) {
    const now = ts || performance.now();
    const dt = Math.min(0.032, Math.max(0.001, (now - lastTs) / 1000));

    for (const b of boards) {
      resizeBoard(b);
      const g = boardGeom(b);
      b.ctx.clearRect(0, 0, g.w, g.h);
      stepBalls(b, dt, now, g);
      drawPins(b, g);
      drawBins(b, g);
      drawBalls(b, g, now);
      updateStats(b);
    }

    const boardsFullyIdle = boards.every(
      (b) => b.active.length === 0 && b.batchState.size === 0 && !b.waitingForNextBatch
    );

    if (!roundInProgress && boardsFullyIdle && now >= nextRoundAt) {
      startRound(now);
    }

    if (roundInProgress) {
      const allDone = boards.every((b) => b.waitingForNextBatch && b.active.length === 0);
      if (allDone) {
        roundInProgress = false;
        for (const b of boards) {
          b.active = [];
          b.batchState.clear();
          b.stats.green = 0;
          b.waitingForNextBatch = false;
          updateStats(b);
        }
        nextRoundAt = now + 500;
      }
    }

    lastTs = now;
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function ensureIslandFlowScript() {
  const init = window.initIslandFlowAnimation;
  if (typeof init === "function") {
    init();
    return;
  }

  const src = "posts/optimiser-i-hardly-know-er/island-flow-animation.js";
  const existing = document.querySelector(`script[src=""]`);
  if (existing) {
    existing.addEventListener("load", () => {
      if (typeof window.initIslandFlowAnimation === "function") window.initIslandFlowAnimation();
    }, { once: true });
    return;
  }

  const s = document.createElement("script");
  s.src = src;
  s.async = true;
  s.addEventListener("load", () => {
    if (typeof window.initIslandFlowAnimation === "function") window.initIslandFlowAnimation();
  }, { once: true });
  document.body.appendChild(s);
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
    'posts/optimiser-i-hardly-know-er/optimiser-i-hardly-know-er.html'
  );
  s.setAttribute('label', 'comments');
  s.setAttribute('theme', 'github-light');
  s.setAttribute('crossorigin', 'anonymous');
  host.appendChild(s);
}

ensureTwitterEmbeds();
ensureCodeEditorHighlight();
ensureGifAutoRestart();
initProgramLoopAnimation();
initLuckyGuessBoard();
ensureIslandFlowScript();
initPostComments();
document.addEventListener('post:ready', ensureTwitterEmbeds);
document.addEventListener('post:ready', ensureCodeEditorHighlight);
document.addEventListener('post:ready', ensureGifAutoRestart);
document.addEventListener('post:ready', initProgramLoopAnimation);
document.addEventListener('post:ready', initLuckyGuessBoard);
document.addEventListener('post:ready', ensureIslandFlowScript);
document.addEventListener('post:ready', initPostComments);
