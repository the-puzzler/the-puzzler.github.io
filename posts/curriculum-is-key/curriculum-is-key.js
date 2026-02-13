// Post-specific scripts for Curriculum Is Key
// Tiny in-browser experiment: train on 1..5 multiplication, hold out 9 (OOD).

(function () {
  function initPoetFlowLab() {
    const root = document.getElementById('poet-flow-lab');
    if (!root) return;
    if (root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    const canvas = root.querySelector('#poet-flow-canvas');
    const playBtn = root.querySelector('#poet-play-btn');
    const prevBtn = root.querySelector('#poet-prev-btn');
    const nextBtn = root.querySelector('#poet-next-btn');
    const ctx = canvas.getContext('2d');
    const W = 900;
    const H = 260;
    const TAU = Math.PI * 2;
    const TOTAL_STEPS = 5;
    const STEP_DURATION = [3.0, 4.2, 4.0, 4.0, 4.9];
    const PAIR_A_X = 72;
    const PAIR_A_Y = 84;
    const PAIR_A_DIFF = 0.24;
    const PAIR_A_ALPHA = 1;

    let running = true;
    let rafId = null;
    let lastTs = 0;
    let t = 0;
    let step = 0;
    let stepStartT = 0;
    let scaleX = 1;
    let scaleY = 1;

    function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
    function lerp(a, b, p) { return a + (b - a) * p; }
    function smooth(p) { return p * p * (3 - 2 * p); }

    // Stable jagged reward trajectory (generated once, then revealed over time).
    const rewardPts = [];
    {
      let v = 0.04;
      for (let i = 0; i < 36; i++) {
        const up = 0.012 + Math.random() * 0.042;
        const down = Math.random() < 0.22 ? Math.random() * 0.03 : 0;
        v = clamp(v + up - down, 0, 1);
        rewardPts.push(v);
      }
      rewardPts[rewardPts.length - 1] = Math.max(rewardPts[rewardPts.length - 1], 0.84);
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

    function drawArrow(x0, y0, x1, y1, alpha = 0.28, warm = false, pulse = 0) {
      const hue = warm ? 30 : 206;
      const sat = warm ? 74 : 44;
      const lit = warm ? 42 : 34;
      ctx.strokeStyle = `hsla(${hue} ${sat}% ${lit}% / ${alpha + pulse * 0.4})`;
      ctx.lineWidth = 1.2 + pulse * 1.3;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - Math.cos(a - 0.46) * 8, y1 - Math.sin(a - 0.46) * 8);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - Math.cos(a + 0.46) * 8, y1 - Math.sin(a + 0.46) * 8);
      ctx.stroke();
    }

    function drawEnvGlyph(x, y, w, h, difficulty = 0, alpha = 1) {
      roundedRect(x, y, w, h, 8);
      ctx.fillStyle = `hsla(212 36% 86% / ${0.35 * alpha})`;
      ctx.fill();
      ctx.strokeStyle = `hsla(208 18% 28% / ${0.30 * alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      const by = y + h * 0.68;
      ctx.strokeStyle = `hsla(208 22% 30% / ${0.48 * alpha})`;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      for (let i = 0; i <= 26; i++) {
        const px = x + (i / 26) * w;
        const py = by - Math.sin((i / 26) * Math.PI * (2.1 + difficulty * 2.1)) * (4 + difficulty * 6.5);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    function drawAgent(x, y, alpha = 1, hue = 35) {
      ctx.fillStyle = `hsla(${hue} 76% 44% / ${0.35 + 0.55 * alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, 8.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `hsla(${hue} 70% 30% / ${0.28 + 0.48 * alpha})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    function drawPairCard(x, y, label, difficulty, alpha = 1) {
      // Minimal pair rendering: no card container, just env + agent.
      drawEnvGlyph(x + 14, y + 34, 88, 42, difficulty, alpha);
      drawAgent(x + 116, y + 55, alpha);
      ctx.fillStyle = `hsla(208 18% 24% / ${0.65 + 0.28 * alpha})`;
      ctx.textAlign = 'left';
      ctx.font = '12px EB Garamond, serif';
      ctx.fillText(label, x + 12, y + 20);
    }

    function drawRewardGraph(x, y, w, h, p) {
      roundedRect(x, y, w, h, 8);
      ctx.fillStyle = 'hsla(0 0% 100% / 0.50)';
      ctx.fill();
      ctx.strokeStyle = 'hsla(208 18% 28% / 0.24)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.translate(x + 13, y + h * 0.52);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = 'hsla(208 18% 24% / 0.74)';
      ctx.font = '12px EB Garamond, serif';
      ctx.textAlign = 'center';
      ctx.fillText('Reward', 0, 0);
      ctx.restore();

      const thresholdY = y + h * 0.34;
      ctx.strokeStyle = 'hsla(8 68% 42% / 0.55)';
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x + 8, thresholdY);
      ctx.lineTo(x + w - 8, thresholdY);
      ctx.stroke();
      ctx.setLineDash([]);

      const shown = Math.max(2, Math.floor(lerp(2, rewardPts.length, p)));
      ctx.strokeStyle = 'hsla(208 42% 36% / 0.90)';
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      for (let i = 0; i < shown; i++) {
        const q = i / (rewardPts.length - 1);
        const gx = x + 8 + q * (w - 16);
        const gy = y + h - 10 - rewardPts[i] * (h - 22);
        if (i === 0) ctx.moveTo(gx, gy);
        else ctx.lineTo(gx, gy);
      }
      ctx.stroke();
      return shown >= rewardPts.length - 1;
    }

    function drawGate(x, y, pass, alpha = 1) {
      roundedRect(x - 64, y - 22, 128, 44, 8);
      ctx.fillStyle = `hsla(0 0% 100% / ${0.35 + 0.25 * alpha})`;
      ctx.fill();
      ctx.strokeStyle = `hsla(208 18% 28% / ${0.20 + 0.24 * alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = `hsla(208 18% 24% / ${0.75 + 0.20 * alpha})`;
      ctx.font = '12px EB Garamond, serif';
      ctx.textAlign = 'center';
      ctx.fillText('novel + learnable?', x, y - 2);
      ctx.fillStyle = pass ? `hsla(132 50% 34% / ${0.85 * alpha})` : `hsla(18 62% 38% / ${0.85 * alpha})`;
      ctx.fillText(pass ? 'pass' : 'fail', x, y + 14);
    }

    function drawTick(x, y, alpha = 1) {
      ctx.strokeStyle = `hsla(132 56% 35% / ${0.45 + 0.45 * alpha})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x - 1, y + 7);
      ctx.lineTo(x + 10, y - 8);
      ctx.stroke();
    }

    function drawToken(x0, y0, x1, y1, p) {
      const x = lerp(x0, x1, p);
      const y = lerp(y0, y1, p);
      // Keep transfer line visually stable while token moves once.
      drawArrow(x0, y0, x1, y1, 0.26, true, 0);
      ctx.fillStyle = 'hsla(40 80% 48% / 0.78)';
      ctx.beginPath();
      ctx.arc(x, y, 4.1, 0, TAU);
      ctx.fill();
    }

    function drawCurvedAgentTransfer(x0, y0, cx, cy, x1, y1, p, hue = 35, alpha = 1) {
      const q = 1 - p;
      const x = q * q * x0 + 2 * q * p * cx + p * p * x1;
      const y = q * q * y0 + 2 * q * p * cy + p * p * y1;
      drawAgent(x, y, alpha, hue);
    }

    function drawStage() {
      ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      ctx.fillStyle = 'hsl(39 26% 97%)';
      ctx.fillRect(0, 0, W, H);
      const u = Math.max(0, t - stepStartT);

      if (step === 0) {
        // Start centred; env + agent appear individually with labels, labels fade, then move as a pair left.
        const cx = W * 0.5;
        const cy = H * 0.5;
        const pEnv = clamp(u / 0.7, 0, 1);
        const pAgent = clamp((u - 0.35) / 0.7, 0, 1);
        const pHideLabels = clamp((u - 1.2) / 0.6, 0, 1);
        const pMove = smooth(clamp((u - 1.6) / 1.2, 0, 1));
        // Interpolate to the exact pair-A anchor used in steps 1 and 2.
        const envStartX = cx - 120;
        const envStartY = cy - 24;
        const envEndX = PAIR_A_X + 14;
        const envEndY = PAIR_A_Y + 34;
        const agentStartX = cx + 52;
        const agentStartY = cy - 3;
        const agentEndX = PAIR_A_X + 116;
        const agentEndY = PAIR_A_Y + 55;
        const envX = lerp(envStartX, envEndX, pMove);
        const envY = lerp(envStartY, envEndY, pMove);
        const agentX = lerp(agentStartX, agentEndX, pMove);
        const agentY = lerp(agentStartY, agentEndY, pMove);

        // Use the same env glyph size as steps 1/2 to avoid end-of-step snap.
        drawEnvGlyph(envX, envY, 88, 42, 0.22, pEnv);
        drawAgent(agentX, agentY, pAgent);

        const labelAlpha = 1 - pHideLabels;
        if (labelAlpha > 0.01) {
          ctx.fillStyle = `hsla(208 18% 24% / ${(0.85 * labelAlpha).toFixed(3)})`;
          ctx.font = '12px EB Garamond, serif';
          ctx.textAlign = 'left';
          ctx.fillText('environment', envX, envY - 10);
          ctx.fillText('agent', agentX + 16, agentY + 5);
        }

        // Fade in pair label so step 1 starts visually identical.
        const pairLabelAlpha = clamp((pMove - 0.55) / 0.45, 0, 1);
        if (pairLabelAlpha > 0.01) {
          ctx.fillStyle = `hsla(208 18% 24% / ${(0.72 * pairLabelAlpha).toFixed(3)})`;
          ctx.font = '12px EB Garamond, serif';
          ctx.textAlign = 'left';
          ctx.fillText('pair A', PAIR_A_X + 12, PAIR_A_Y + 20);
        }
      } else if (step === 1) {
        // Pair fixed left, reward graph grows jaggedly, then solved appears.
        drawPairCard(PAIR_A_X, PAIR_A_Y, 'pair A', PAIR_A_DIFF, PAIR_A_ALPHA);
        const pg = clamp((u - 0.25) / 2.4, 0, 1);
        const solved = drawRewardGraph(300, 84, 260, 100, pg);
        if (solved) {
          const pulse = 0.5 + 0.5 * Math.sin((u - 2.7) * 8);
          ctx.fillStyle = `hsla(132 52% 34% / ${(0.55 + 0.35 * pulse).toFixed(3)})`;
          ctx.font = '16px EB Garamond, serif';
          ctx.textAlign = 'left';
          ctx.fillText('solved', 578, 133);
        }
      } else if (step === 2) {
        // Environment search: candidates appear one-by-one; last one passes.
        // Keep pair A anchored exactly where step 1 ends to avoid snap.
        drawPairCard(PAIR_A_X, PAIR_A_Y, 'pair A', PAIR_A_DIFF, PAIR_A_ALPHA);

        // Smooth handoff: briefly fade out prior solved reward graph.
        const fadePrev = clamp(1 - u / 0.8, 0, 1);
        if (fadePrev > 0.01) {
          ctx.save();
          ctx.globalAlpha = fadePrev;
          drawRewardGraph(300, 84, 260, 100, 1);
          ctx.fillStyle = 'hsla(132 52% 34% / 0.9)';
          ctx.font = '16px EB Garamond, serif';
          ctx.textAlign = 'left';
          ctx.fillText('solved', 578, 133);
          ctx.restore();
        }

        const ys = [26, 92, 158];
        for (let i = 0; i < 3; i++) {
          const pa = clamp((u - i * 0.7) / 0.6, 0, 1);
          if (pa <= 0.01) continue;
          drawEnvGlyph(500, ys[i] + 20, 116, 54, 0.35 + i * 0.25, pa);
          ctx.fillStyle = `hsla(208 18% 24% / ${(0.72 * pa).toFixed(3)})`;
          ctx.font = '12px EB Garamond, serif';
          ctx.textAlign = 'left';
          ctx.fillText(`candidate env ${i + 1}`, 500, ys[i] + 14);
          drawArrow(214, 132, 500, ys[i] + 47, 0.10 + pa * 0.08);
          const pass = (i === 2) && u > 2.2;
          drawGate(742, ys[i] + 47, pass, pa);
          if (pass) drawTick(812, ys[i] + 46, 0.9);
        }
      } else if (step === 3) {
        // Branch animation: A -> (B,C), then (B,C) -> (D,E,F).
        const p1 = smooth(clamp(u / 0.9, 0, 1));
        const p2 = smooth(clamp((u - 0.95) / 1.0, 0, 1));
        const p3 = smooth(clamp((u - 2.0) / 1.1, 0, 1));

        drawPairCard(PAIR_A_X, PAIR_A_Y, 'pair A', 0.22, 0.9);
        if (p1 > 0.02) {
          drawPairCard(306, 42, 'pair B', 0.48, p1);
          drawPairCard(306, 140, 'pair C', 0.36, p1);
          drawArrow(224, 116, 306, 90, 0.12 + p1 * 0.12);
          drawArrow(224, 148, 306, 188, 0.12 + p1 * 0.12);
        }
        if (p2 > 0.02) {
          drawPairCard(560, 26, 'pair D', 0.72, p2);
          drawArrow(458, 90, 560, 74, 0.12 + p2 * 0.12);
        }
        if (p3 > 0.02) {
          drawPairCard(560, 92, 'pair E', 0.62, p3);
          drawPairCard(560, 158, 'pair F', 0.82, p3);
          drawArrow(458, 90, 560, 140, 0.12 + p3 * 0.12);
          drawArrow(458, 188, 560, 206, 0.12 + p3 * 0.12);
        }
      } else if (step === 4) {
        // Transfer replacements: C -> E and F -> B, both successful (ticks).
        const fade = smooth(clamp(u / 0.55, 0, 1));
        const nodeAlpha = lerp(1.0, 0.75, fade);
        drawPairCard(PAIR_A_X, PAIR_A_Y, 'pair A', 0.22, nodeAlpha);
        drawPairCard(306, 42, 'pair B', 0.48, nodeAlpha);
        drawPairCard(306, 140, 'pair C', 0.36, nodeAlpha);
        drawPairCard(560, 26, 'pair D', 0.72, nodeAlpha);
        drawPairCard(560, 92, 'pair E', 0.62, nodeAlpha);
        drawPairCard(560, 158, 'pair F', 0.82, nodeAlpha);

        // Fade out branching links from step 3 for continuity.
        const oldA = (1 - fade) * 0.22;
        if (oldA > 0.01) {
          drawArrow(224, 116, 306, 90, oldA);
          drawArrow(224, 148, 306, 188, oldA);
          drawArrow(458, 90, 560, 74, oldA);
          drawArrow(458, 90, 560, 140, oldA);
          drawArrow(458, 188, 560, 206, oldA);
        }

        // Single-pass transfers (no bouncing), edge-to-edge connections.
        const pCE = clamp((u - 0.35) / 1.6, 0, 1);
        const pFB = clamp((u - 1.0) / 1.6, 0, 1);
        const newA = fade * 0.26;
        if (newA > 0.01) {
          drawArrow(458, 188, 560, 140, newA, true, 0);
          drawArrow(560, 206, 458, 90, newA, true, 0);
        }
        // C right-edge centre (458,188) -> E left-edge centre (560,140)
        if (pCE > 0) drawToken(458, 188, 560, 140, pCE);
        // F left-edge centre (560,206) -> B right-edge centre (458,90)
        if (pFB > 0) drawToken(560, 206, 458, 90, pFB);

        // Ticks appear over target environments, then fade.
        // Show each tick only after its transfer token finishes moving.
        const tickCEIn = clamp((u - 2.03) / 0.24, 0, 1);
        const tickCEOut = clamp((u - 2.95) / 0.9, 0, 1);
        const tickCE = tickCEIn * (1 - tickCEOut);
        const tickFBIn = clamp((u - 2.70) / 0.24, 0, 1);
        const tickFBOut = clamp((u - 3.55) / 0.9, 0, 1);
        const tickFB = tickFBIn * (1 - tickFBOut);
        if (tickCE > 0.01) drawTick(618, 147, tickCE);
        if (tickFB > 0.01) drawTick(364, 97, tickFB);

        // After tick confirmation, duplicate invader agents and curve them onto incumbent slots.
        const replCE = smooth(clamp((u - 3.05) / 1.05, 0, 1));
        const replFB = smooth(clamp((u - 3.25) / 0.9, 0, 1));
        if (replCE > 0.01) {
          // Duplicate marker at source (pair C agent) while one copy travels to pair E agent slot.
          drawAgent(422, 195, 0.45 * (1 - replCE), 35);
          drawCurvedAgentTransfer(422, 195, 560, 230, 676, 147, replCE, 35, 0.9);
        }
        if (replFB > 0.01) {
          // Duplicate marker at source (pair F agent) while one copy travels to pair B agent slot.
          drawAgent(676, 213, 0.45 * (1 - replFB), 35);
          drawCurvedAgentTransfer(676, 213, 560, 36, 422, 97, replFB, 35, 0.9);
        }
      }

      ctx.fillStyle = 'hsla(208 18% 24% / 0.78)';
      ctx.textAlign = 'left';
      ctx.font = '12px EB Garamond, serif';
      ctx.fillText(`step ${step + 1}/${TOTAL_STEPS}`, 14, 20);
    }

    function tick(ts) {
      if (!running) return;
      if (!lastTs) lastTs = ts;
      const dt = clamp((ts - lastTs) / 1000, 1 / 120, 1 / 24);
      lastTs = ts;
      t += dt;
      const u = Math.max(0, t - stepStartT);
      if (u > STEP_DURATION[step]) {
        setStep((step + 1) % TOTAL_STEPS);
      }
      drawStage();
      rafId = window.requestAnimationFrame(tick);
    }

    function setRunning(on) {
      running = on;
      if (playBtn) playBtn.textContent = running ? 'Pause' : 'Resume';
      if (running) {
        lastTs = 0;
        rafId = window.requestAnimationFrame(tick);
      } else if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function setStep(n) {
      step = clamp(n, 0, TOTAL_STEPS - 1);
      stepStartT = t;
      drawStage();
    }

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const bw = Math.max(1, Math.round(rect.width * dpr));
      const bh = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      scaleX = bw / W;
      scaleY = bh / H;
    }

    if (playBtn) playBtn.addEventListener('click', () => setRunning(!running));
    if (prevBtn) prevBtn.addEventListener('click', () => setStep(step - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => setStep(step + 1));
    canvas.addEventListener('click', () => setRunning(!running));
    window.addEventListener('resize', () => {
      resizeCanvas();
      drawStage();
    });

    resizeCanvas();
    drawStage();
    setRunning(true);
  }

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

    function buildGridDigits() {
      const lo = intInRange(trainMinEl.value, 1, 20, 1);
      const hi = intInRange(trainMaxEl.value, 1, 20, 5);
      const a = Math.min(lo, hi);
      const b = Math.max(lo, hi);
      const digits = [];
      for (let d = a; d <= b; d++) digits.push(d);
      if (!digits.includes(currentHoldout)) digits.push(currentHoldout);
      digits.sort((x, y) => x - y);
      return digits;
    }

    function drawScatter(digits, pairs, preds) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width;
      const Hc = canvas.height;
      const pad = { l: 48, r: 14, t: 14, b: 30 };

      ctx.clearRect(0, 0, W, Hc);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(0, 0, W, Hc);
      const n = digits.length;
      if (!n || pairs.length !== preds.length) return;

      const gridSize = Math.min(W - pad.l - pad.r, Hc - pad.t - pad.b) * 0.9;
      const gx = pad.l + Math.max(0, ((W - pad.l - pad.r) - gridSize) * 0.5);
      const gy = pad.t + Math.max(0, ((Hc - pad.t - pad.b) - gridSize) * 0.5);
      const cell = gridSize / n;

      let maxErr = 0;
      for (let i = 0; i < pairs.length; i++) {
        const e = Math.abs(preds[i] - pairs[i].y);
        if (e > maxErr) maxErr = e;
      }
      maxErr = Math.max(1e-6, maxErr);

      const holdoutIdx = digits.indexOf(currentHoldout);

      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const idx = r * n + c;
          const p = pairs[idx];
          const pred = preds[idx];
          const err = Math.abs(pred - p.y);
          const t = Math.min(1, err / maxErr);
          const x = gx + c * cell;
          const y = gy + r * cell;

          const light = 88 - t * 38;
          ctx.fillStyle = `hsl(${120 - t * 120} 72% ${light}%)`;
          ctx.fillRect(x, y, cell, cell);
          ctx.strokeStyle = 'rgba(60,60,60,0.18)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cell, cell);

          if (cell >= 20) {
            const rounded = Math.round(pred * 10) / 10;
            const isInt = Math.abs(rounded - Math.round(rounded)) < 1e-6;
            ctx.fillStyle = t > 0.55 ? 'rgba(255,255,255,0.92)' : 'rgba(24,24,24,0.9)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `${Math.max(10, Math.floor(cell * 0.24))}px EB Garamond, serif`;
            ctx.fillText(isInt ? String(Math.round(rounded)) : rounded.toFixed(1), x + cell * 0.5, y + cell * 0.52);
          }
        }
      }

      if (holdoutIdx >= 0) {
        const hy = gy + holdoutIdx * cell;
        const hx = gx + holdoutIdx * cell;
        ctx.strokeStyle = 'rgba(180, 48, 48, 0.95)';
        ctx.lineWidth = Math.max(1.5, cell * 0.06);
        ctx.strokeRect(gx, hy, gridSize, cell);
        ctx.strokeRect(hx, gy, cell, gridSize);
      }

      ctx.fillStyle = 'rgba(44,44,44,0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.max(11, Math.floor(cell * 0.34))}px EB Garamond, serif`;
      for (let i = 0; i < n; i++) {
        const cx = gx + i * cell + cell * 0.5;
        const cy = gy + i * cell + cell * 0.5;
        ctx.fillText(String(digits[i]), cx, gy - Math.max(8, cell * 0.28));
        ctx.fillText(String(digits[i]), gx - Math.max(10, cell * 0.35), cy);
      }

      ctx.fillStyle = 'rgba(55,55,55,0.84)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '12px EB Garamond, serif';
      ctx.fillText('a × b grid: cell text = prediction, colour = |prediction - truth|', 12, 16);
      if (holdoutIdx >= 0) {
        ctx.fillText(`red outlines mark row/column for holdout ${currentHoldout}`, 12, Hc - 10);
      }
    }

    function updateUI(m, epochText) {
      const tr = evalPairs(m, trainPairs);
      const ood = evalPairs(m, oodPairs);
      trainMseEl.textContent = tr.mse.toFixed(4);
      oodMseEl.textContent = ood.mse.toFixed(4);
      const digits = buildGridDigits();
      const gridPairs = [];
      for (const a of digits) {
        for (const b of digits) gridPairs.push({ a, b, y: a * b });
      }
      const gridEval = evalPairs(m, gridPairs);
      drawScatter(digits, gridPairs, gridEval.preds);
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
    let archiveCssW = archiveCanvas.width;
    let archiveCssH = archiveCanvas.height;
    let directCssW = directCanvas.width;
    let directCssH = directCanvas.height;

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
    function fitCanvasForDPR(canvas, ctx) {
      const rect = canvas.getBoundingClientRect();
      const baseW = Number(canvas.getAttribute('width')) || 340;
      const baseH = Number(canvas.getAttribute('height')) || 340;
      const cssW = Math.max(1, Math.round(rect.width));
      const cssH = Math.max(1, Math.round(cssW * (baseH / baseW)));
      canvas.style.height = `${cssH}px`;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const bw = Math.max(1, Math.round(cssW * dpr));
      const bh = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      return { cssW, cssH };
    }

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
      const CW = archiveCssW;
      const CH = archiveCssH;
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
      const CW = directCssW;
      const CH = directCssH;
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
      const aSize = fitCanvasForDPR(archiveCanvas, actx);
      archiveCssW = aSize.cssW;
      archiveCssH = aSize.cssH;
      const dSize = fitCanvasForDPR(directCanvas, dctx);
      directCssW = dSize.cssW;
      directCssH = dSize.cssH;
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
    window.addEventListener('resize', render);

    configureMazeSize(sizeEl ? sizeEl.value : W);
    render();
  }

  function initEpiplexityLab() {
    const root = document.getElementById('epi-order-lab');
    if (!root) return;
    if (root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    const trainBtn = root.querySelector('#epi-train-btn');
    const resetBtn = root.querySelector('#epi-reset-btn');
    const stepsEl = root.querySelector('#epi-steps');
    const stepsOut = root.querySelector('#epi-steps-out');
    const noiseEl = root.querySelector('#epi-noise');
    const noiseOut = root.querySelector('#epi-noise-out');
    const canvas = root.querySelector('#epi-loss-canvas');

    const ehFinalEl = root.querySelector('#epi-eh-final');
    const ehAucEl = root.querySelector('#epi-eh-auc');
    const ehThreshEl = root.querySelector('#epi-eh-thresh');
    const heFinalEl = root.querySelector('#epi-he-final');
    const heAucEl = root.querySelector('#epi-he-auc');
    const heThreshEl = root.querySelector('#epi-he-thresh');

    function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
    function lerp(a, b, p) { return a + (b - a) * p; }

    function makeRng(seed = 1234567) {
      let s = seed >>> 0;
      return function rng() {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return ((s >>> 0) / 4294967296);
      };
    }

    function randn(rng) {
      let u = 0;
      let v = 0;
      while (u <= 1e-9) u = rng();
      while (v <= 1e-9) v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function shuffleInPlace(arr, rng) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    }

    function targetFn(x1, x2) {
      return 0.7 * x1 + 0.25 * x2 + 0.9 * Math.tanh(1.4 * x1 * x2);
    }

    function sampleXY(rng, lo, hi) {
      return lo + (hi - lo) * rng();
    }

    function buildData(noiseLevel) {
      const rng = makeRng(421337);
      const easy = [];
      const hard = [];
      const evalSet = [];
      const nEasy = 240;
      const nHard = 240;
      for (let i = 0; i < nEasy; i++) {
        const x1 = sampleXY(rng, -0.85, 0.85);
        const x2 = sampleXY(rng, -0.85, 0.85);
        const y = targetFn(x1, x2) + randn(rng) * noiseLevel * 0.12;
        easy.push({ x1, x2, y });
      }
      for (let i = 0; i < nHard; i++) {
        const x1 = sampleXY(rng, -2.7, 2.7);
        const x2 = sampleXY(rng, -2.7, 2.7);
        const y = targetFn(x1, x2) + randn(rng) * noiseLevel * 0.55;
        hard.push({ x1, x2, y });
      }

      const evalRng = makeRng(424242);
      for (let i = 0; i < 120; i++) {
        const x1 = sampleXY(evalRng, -0.85, 0.85);
        const x2 = sampleXY(evalRng, -0.85, 0.85);
        evalSet.push({ x1, x2, y: targetFn(x1, x2) });
      }
      for (let i = 0; i < 120; i++) {
        const x1 = sampleXY(evalRng, -2.7, 2.7);
        const x2 = sampleXY(evalRng, -2.7, 2.7);
        evalSet.push({ x1, x2, y: targetFn(x1, x2) });
      }

      shuffleInPlace(easy, rng);
      shuffleInPlace(hard, rng);
      return { easy, hard, evalSet };
    }

    const H = 22;
    function createModel(seed = 99) {
      const rng = makeRng(seed);
      const w1 = new Float64Array(H * 2);
      const b1 = new Float64Array(H);
      const w2 = new Float64Array(H);
      let b2 = 0;
      for (let i = 0; i < w1.length; i++) w1[i] = randn(rng) * 0.28;
      for (let i = 0; i < w2.length; i++) w2[i] = randn(rng) * 0.24;
      for (let i = 0; i < b1.length; i++) b1[i] = randn(rng) * 0.03;
      return { w1, b1, w2, b2 };
    }

    function forward(m, x1, x2) {
      const h = new Float64Array(H);
      for (let i = 0; i < H; i++) {
        const z = m.w1[i * 2] * x1 + m.w1[i * 2 + 1] * x2 + m.b1[i];
        h[i] = Math.tanh(z);
      }
      let out = m.b2;
      for (let i = 0; i < H; i++) out += m.w2[i] * h[i];
      return { out, h };
    }

    function trainOne(m, sample, lr) {
      const f = forward(m, sample.x1, sample.x2);
      const err = f.out - sample.y;
      const dOut = clamp(2 * err, -6, 6);
      for (let i = 0; i < H; i++) {
        const h = f.h[i];
        const dw2 = clamp(dOut * h, -6, 6);
        const dh = dOut * m.w2[i];
        const dz = clamp(dh * (1 - h * h), -6, 6);
        m.w2[i] -= lr * dw2;
        m.w1[i * 2] -= lr * dz * sample.x1;
        m.w1[i * 2 + 1] -= lr * dz * sample.x2;
        m.b1[i] -= lr * dz;
      }
      m.b2 -= lr * dOut;
    }

    function mseOn(m, data) {
      let loss = 0;
      for (let i = 0; i < data.length; i++) {
        const p = forward(m, data[i].x1, data[i].x2).out;
        const e = p - data[i].y;
        loss += e * e;
      }
      return loss / data.length;
    }

    function estimatePlateaus(points, transitionStep) {
      if (!points.length) return { pre: 0, post: 0 };
      const pre = points.filter((p) => p.step <= transitionStep);
      const post = points.filter((p) => p.step > transitionStep);
      function tailMean(arr) {
        if (!arr.length) return points[points.length - 1].loss;
        const n = Math.max(3, Math.ceil(arr.length * 0.22));
        const s = arr.slice(-n);
        let sum = 0;
        for (let i = 0; i < s.length; i++) sum += s[i].loss;
        return sum / s.length;
      }
      return {
        pre: tailMean(pre),
        post: tailMean(post.length ? post : pre)
      };
    }

    function aucTwoPlateau(points, transitionStep) {
      if (!points.length) return 0;
      const p = estimatePlateaus(points, transitionStep);
      let auc = 0;
      for (let i = 1; i < points.length; i++) {
        const x0 = points[i - 1].step;
        const y0 = points[i - 1].loss;
        const x1 = points[i].step;
        const y1 = points[i].loss;

        function areaSeg(ax, ay, bx, by, base) {
          if (bx <= ax) return 0;
          const r0 = Math.max(0, ay - base);
          const r1 = Math.max(0, by - base);
          return (bx - ax) * (r0 + r1) * 0.5;
        }

        if (x0 < transitionStep && x1 > transitionStep) {
          const t = (transitionStep - x0) / Math.max(1e-9, (x1 - x0));
          const yT = lerp(y0, y1, t);
          auc += areaSeg(x0, y0, transitionStep, yT, p.pre);
          auc += areaSeg(transitionStep, yT, x1, y1, p.post);
        } else if (x1 <= transitionStep) {
          auc += areaSeg(x0, y0, x1, y1, p.pre);
        } else {
          auc += areaSeg(x0, y0, x1, y1, p.post);
        }
      }
      return auc;
    }

    function thresholdStep(points) {
      if (!points.length) return null;
      const first = points[0].loss;
      const final = points[points.length - 1].loss;
      const thresh = final + 0.12 * (first - final);
      for (let i = 0; i < points.length; i++) {
        if (points[i].loss <= thresh) return points[i].step;
      }
      return null;
    }

    let previewData = buildData(Number(noiseEl.value));

    function drawPreviewPanel(ctx, W, Hc, data, noiseLevel) {
      const x = 16;
      const y = 16;
      const w = W - 32;
      const h = Hc - 32;
      const leftW = Math.min(360, w * 0.45);

      ctx.fillStyle = 'rgba(255,255,255,0.52)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(120,120,120,0.2)';
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = 'rgba(56,56,56,0.9)';
      ctx.font = '15px EB Garamond, serif';
      ctx.fillText('What this experiment is doing', x + 14, y + 22);
      ctx.font = '12px EB Garamond, serif';
      ctx.fillStyle = 'rgba(70,70,70,0.9)';
      ctx.fillText('1) Target: y = 0.7*x1 + 0.25*x2 + 0.9*tanh(1.4*x1*x2) + noise.', x + 14, y + 44);
      ctx.fillText('2) Same samples + same steps, only curriculum order differs.', x + 14, y + 62);
      ctx.fillText('3) Easy: near origin + low noise. Hard: wider range + higher noise.', x + 14, y + 80);
      ctx.fillText('4) Eval set is balanced: 50% easy samples, 50% hard samples.', x + 14, y + 98);
      ctx.fillText('5) Compare final loss and AUC-above-final (epiplexity proxy).', x + 14, y + 116);
      ctx.fillStyle = 'rgba(90,90,90,0.85)';
      ctx.fillText(`Current noise level: ${noiseLevel.toFixed(2)}`, x + 14, y + 136);

      // Dataset preview (x1/x2 distribution) on the right.
      const px = x + leftW + 18;
      const py = y + 14;
      const pw = w - leftW - 32;
      const ph = h - 28;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = 'rgba(120,120,120,0.25)';
      ctx.strokeRect(px, py, pw, ph);

      const lim = 3.0;
      const sx = (vx) => px + ((vx + lim) / (2 * lim)) * pw;
      const sy = (vy) => py + (1 - ((vy + lim) / (2 * lim))) * ph;

      ctx.strokeStyle = 'rgba(120,120,120,0.28)';
      ctx.beginPath();
      ctx.moveTo(sx(0), py);
      ctx.lineTo(sx(0), py + ph);
      ctx.moveTo(px, sy(0));
      ctx.lineTo(px + pw, sy(0));
      ctx.stroke();

      ctx.fillStyle = 'rgba(76,122,207,0.62)';
      for (let i = 0; i < Math.min(200, data.easy.length); i++) {
        const p = data.easy[i];
        ctx.fillRect(sx(p.x1) - 1, sy(p.x2) - 1, 2, 2);
      }
      ctx.fillStyle = 'rgba(201,125,66,0.6)';
      for (let i = 0; i < Math.min(200, data.hard.length); i++) {
        const p = data.hard[i];
        ctx.fillRect(sx(p.x1) - 1, sy(p.x2) - 1, 2, 2);
      }

      ctx.fillStyle = '#4a77c9';
      ctx.fillRect(px + 10, py + 10, 12, 3);
      ctx.fillStyle = 'rgba(60,60,60,0.88)';
      ctx.fillText('easy samples', px + 28, py + 14);
      ctx.fillStyle = '#c97e42';
      ctx.fillRect(px + 10, py + 28, 12, 3);
      ctx.fillStyle = 'rgba(60,60,60,0.88)';
      ctx.fillText('hard samples', px + 28, py + 32);
      ctx.fillStyle = 'rgba(64,64,64,0.82)';
      ctx.fillText('dataset preview in x1/x2 space', px + 10, py + ph - 8);
    }

    function drawPlot(ehPts, hePts, totalSteps, transitionStep = null) {
      const BASE_W = 860;
      const BASE_H = 320;
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(1, Math.round(rect.width));
      const cssH = Math.max(1, Math.round(cssW * (BASE_H / BASE_W)));
      canvas.style.height = `${cssH}px`;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const bw = Math.max(1, Math.round(cssW * dpr));
      const bh = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      const W = cssW;
      const Hc = cssH;
      const pad = { l: 58, r: 18, t: 18, b: 40 };
      ctx.clearRect(0, 0, W, Hc);
      ctx.fillStyle = 'rgba(255,255,255,0.27)';
      ctx.fillRect(0, 0, W, Hc);

      if (!ehPts.length || !hePts.length) {
        drawPreviewPanel(ctx, W, Hc, previewData, Number(noiseEl.value));
        return;
      }

      const all = ehPts.concat(hePts);
      const xMax = Math.max(1, totalSteps);
      let yMin = Infinity;
      let yMax = -Infinity;
      for (let i = 0; i < all.length; i++) {
        yMin = Math.min(yMin, all[i].loss);
        yMax = Math.max(yMax, all[i].loss);
      }
      const yPad = Math.max(0.02, (yMax - yMin) * 0.14);
      yMin = Math.max(0, yMin - yPad);
      yMax = yMax + yPad;

      const sx = (x) => pad.l + (x / xMax) * (W - pad.l - pad.r);
      const sy = (y) => Hc - pad.b - ((y - yMin) / (yMax - yMin)) * (Hc - pad.t - pad.b);

      ctx.strokeStyle = 'rgba(80,80,80,0.75)';
      ctx.beginPath();
      ctx.moveTo(pad.l, Hc - pad.b);
      ctx.lineTo(W - pad.r, Hc - pad.b);
      ctx.moveTo(pad.l, Hc - pad.b);
      ctx.lineTo(pad.l, pad.t);
      ctx.stroke();

      function shadeAbovePlateaus(points, color, transition) {
        const pl = estimatePlateaus(points, transition);
        ctx.fillStyle = color;
        for (let seg = 0; seg < 2; seg++) {
          const lo = seg === 0 ? -Infinity : transition;
          const hi = seg === 0 ? transition : Infinity;
          const base = seg === 0 ? pl.pre : pl.post;
          const sub = points.filter((p) => p.step >= lo && p.step <= hi);
          if (sub.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(sx(sub[0].step), sy(base));
          for (let i = 0; i < sub.length; i++) ctx.lineTo(sx(sub[i].step), sy(sub[i].loss));
          ctx.lineTo(sx(sub[sub.length - 1].step), sy(base));
          ctx.closePath();
          ctx.fill();
        }
      }

      function line(points, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
          const x = sx(points[i].step);
          const y = sy(points[i].loss);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      if (Number.isFinite(transitionStep)) {
        const tx = sx(transitionStep);
        ctx.save();
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = 'rgba(190, 44, 44, 0.92)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tx, pad.t);
        ctx.lineTo(tx, Hc - pad.b);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(170, 38, 38, 0.96)';
        ctx.font = '12px EB Garamond, serif';
        ctx.textAlign = 'left';
        ctx.fillText('dataset transition', Math.min(tx + 6, W - pad.r - 92), pad.t + 13);
        ctx.restore();
      }

      shadeAbovePlateaus(ehPts, 'rgba(74, 119, 201, 0.17)', transitionStep);
      shadeAbovePlateaus(hePts, 'rgba(201, 126, 66, 0.15)', transitionStep);
      line(ehPts, '#4a77c9');
      line(hePts, '#c97e42');

      const ehPl = estimatePlateaus(ehPts, transitionStep);
      const hePl = estimatePlateaus(hePts, transitionStep);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(74, 119, 201, 0.6)';
      ctx.beginPath();
      ctx.moveTo(pad.l, sy(ehPl.pre));
      ctx.lineTo(sx(transitionStep), sy(ehPl.pre));
      ctx.moveTo(sx(transitionStep), sy(ehPl.post));
      ctx.lineTo(W - pad.r, sy(ehPl.post));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(201, 126, 66, 0.55)';
      ctx.beginPath();
      ctx.moveTo(pad.l, sy(hePl.pre));
      ctx.lineTo(sx(transitionStep), sy(hePl.pre));
      ctx.moveTo(sx(transitionStep), sy(hePl.post));
      ctx.lineTo(W - pad.r, sy(hePl.post));
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#4a77c9';
      ctx.fillRect(W - 220, 16, 13, 2.5);
      ctx.fillStyle = 'rgba(60,60,60,0.88)';
      ctx.font = '12px EB Garamond, serif';
      ctx.fillText('easy -> hard', W - 201, 21);
      ctx.fillStyle = '#c97e42';
      ctx.fillRect(W - 120, 16, 13, 2.5);
      ctx.fillStyle = 'rgba(60,60,60,0.88)';
      ctx.fillText('hard -> easy', W - 101, 21);

      ctx.fillStyle = 'rgba(56,56,56,0.86)';
      ctx.fillText('x: training steps', W - 120, Hc - 12);
      ctx.fillText('y: eval loss', 10, 16);
    }

    function setMetricDefaults() {
      ehFinalEl.textContent = '-';
      ehAucEl.textContent = '-';
      ehThreshEl.textContent = '-';
      heFinalEl.textContent = '-';
      heAucEl.textContent = '-';
      heThreshEl.textContent = '-';
    }

    function nextTick() {
      return new Promise((resolve) => setTimeout(resolve, 0));
    }

    function updateSliderOutputs() {
      stepsOut.textContent = String(stepsEl.value);
      noiseOut.textContent = Number(noiseEl.value).toFixed(2);
    }

    let historyEH = [];
    let historyHE = [];
    let training = false;

    function reset() {
      if (training) return;
      historyEH = [];
      historyHE = [];
      previewData = buildData(Number(noiseEl.value));
      setMetricDefaults();
      drawPlot(historyEH, historyHE, Number(stepsEl.value), Math.floor(Number(stepsEl.value) / 2));
    }

    async function trainBoth() {
      if (training) return;
      training = true;
      trainBtn.disabled = true;
      resetBtn.disabled = true;

      const totalSteps = Number(stepsEl.value);
      const noiseLevel = Number(noiseEl.value);
      const data = buildData(noiseLevel);
      previewData = data;
      const transitionStep = Math.floor(totalSteps / 2);
      const mEH = createModel(777);
      const mHE = createModel(777);
      historyEH = [];
      historyHE = [];
      const ehRng = makeRng(1001);
      const heRng = makeRng(2002);

      for (let step = 1; step <= totalSteps; step++) {
        const p = step / totalSteps;
        const lr = 0.022 * Math.pow(1 - p, 0.7) + 0.0035;
        const ehInEasy = step <= transitionStep;
        const heInHard = step <= transitionStep;
        const ehPool = ehInEasy ? data.easy : data.hard;
        const hePool = heInHard ? data.hard : data.easy;
        const ehSample = ehPool[Math.floor(ehRng() * ehPool.length)];
        const heSample = hePool[Math.floor(heRng() * hePool.length)];
        trainOne(mEH, ehSample, lr);
        trainOne(mHE, heSample, lr);

        if (step === 1 || step % 24 === 0 || step === totalSteps) {
          historyEH.push({ step, loss: mseOn(mEH, data.evalSet) });
          historyHE.push({ step, loss: mseOn(mHE, data.evalSet) });
        }

        if (step % 72 === 0 || step === totalSteps) {
          trainBtn.textContent = `Training ${step}/${totalSteps}`;
          drawPlot(historyEH, historyHE, totalSteps, transitionStep);
          await nextTick();
        }
      }

      const ehFinal = historyEH[historyEH.length - 1].loss;
      const heFinal = historyHE[historyHE.length - 1].loss;
      const ehAuc = aucTwoPlateau(historyEH, transitionStep);
      const heAuc = aucTwoPlateau(historyHE, transitionStep);
      const ehT = thresholdStep(historyEH);
      const heT = thresholdStep(historyHE);

      ehFinalEl.textContent = ehFinal.toFixed(4);
      heFinalEl.textContent = heFinal.toFixed(4);
      ehAucEl.textContent = ehAuc.toFixed(2);
      heAucEl.textContent = heAuc.toFixed(2);
      ehThreshEl.textContent = ehT === null ? '-' : String(ehT);
      heThreshEl.textContent = heT === null ? '-' : String(heT);

      drawPlot(historyEH, historyHE, totalSteps, transitionStep);
      trainBtn.textContent = 'Train Both';
      trainBtn.disabled = false;
      resetBtn.disabled = false;
      training = false;
    }

    stepsEl.addEventListener('input', () => {
      updateSliderOutputs();
      if (!training) drawPlot(historyEH, historyHE, Number(stepsEl.value), Math.floor(Number(stepsEl.value) / 2));
    });
    noiseEl.addEventListener('input', () => {
      updateSliderOutputs();
      if (!training) {
        previewData = buildData(Number(noiseEl.value));
        drawPlot(historyEH, historyHE, Number(stepsEl.value), Math.floor(Number(stepsEl.value) / 2));
      }
    });
    window.addEventListener('resize', () => {
      if (!training) drawPlot(historyEH, historyHE, Number(stepsEl.value), Math.floor(Number(stepsEl.value) / 2));
    });
    trainBtn.addEventListener('click', () => { trainBoth(); });
    resetBtn.addEventListener('click', reset);

    updateSliderOutputs();
    setMetricDefaults();
    drawPlot(historyEH, historyHE, Number(stepsEl.value), Math.floor(Number(stepsEl.value) / 2));
  }

  function initAllLabs() {
    initPoetFlowLab();
    initAggregateFlockLab();
    initCreativityTilesLab();
    initMulLab();
    initQuiltLab();
    initPicbreedLab();
    initMazeQDLab();
    initEpiplexityLab();
  }

  document.addEventListener('post:ready', initAllLabs);
  if (document.readyState !== 'loading') initAllLabs();
  else document.addEventListener('DOMContentLoaded', initAllLabs, { once: true });
})();
