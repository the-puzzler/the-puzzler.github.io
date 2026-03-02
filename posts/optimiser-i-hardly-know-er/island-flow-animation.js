// Island flow animation module for Optimiser post
function initIslandFlowAnimation() {
  const canvas = document.getElementById('island-flow-canvas');
  if (!canvas || canvas.dataset.bound === 'true') return;
  canvas.dataset.bound = 'true';
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const DPR_CAP = 2;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const w = Math.max(560, Math.floor(canvas.clientWidth * dpr));
    const h = Math.floor((w * 340) / 940);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function ease(t) {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function rr(x, y, w, h, r) {
    const rad = Math.min(r, w * 0.2, h * 0.4);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  function drawNode(x, y, r, label, alpha = 1, fill = 'hsla(0 0% 100% / 0.96)', stroke = 'hsla(210 14% 34% / 0.35)') {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, canvas.height * 0.0046);
    ctx.stroke();
    ctx.fillStyle = 'hsla(210 18% 16% / 0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(8, Math.floor(canvas.height * 0.032))}px "Roboto Mono", monospace`;
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  function drawLine(x1, y1, x2, y2, t = 1, alpha = 1) {
    if (alpha <= 0.01 || t <= 0) return;
    const ex = x1 + (x2 - x1) * t;
    const ey = y1 + (y2 - y1) * t;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'hsla(210 22% 32% / 0.62)';
    ctx.lineWidth = Math.max(1.1, canvas.height * 0.0060);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
  }

  function drawPanelTitle(x, y, txt) {
    ctx.fillStyle = 'hsla(210 14% 20% / 0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(10, Math.floor(canvas.height * 0.050))}px "EB Garamond", serif`;
    ctx.fillText(txt, x, y);
  }

  function drawPanelBox(x, y, w, h, rad) {
    rr(x, y, w, h, rad);
    ctx.fillStyle = 'hsla(0 0% 100% / 0.86)';
    ctx.fill();
    ctx.strokeStyle = 'hsla(210 14% 34% / 0.24)';
    ctx.lineWidth = Math.max(1, h * 0.0045);
    ctx.stroke();
  }

  const start = performance.now();
  const CYCLE_MS = 5200;

  function frame(ts) {
    resize();
    const w = canvas.width;
    const h = canvas.height;
    const elapsed = ts - start;
    const cycleIndex = Math.floor(elapsed / CYCLE_MS);
    const tRaw = (elapsed % CYCLE_MS) / CYCLE_MS;
    const simpleTopIdx = ((cycleIndex * 9301 + 49297) % 233280) % 5;
    const simpleMidIdx = ((cycleIndex * 6173 + 39827) % 233280) % 5;
    const simpleBotIdx = ((cycleIndex * 4721 + 22229) % 233280) % 5;
    const islandDropIdx = ((cycleIndex * 7193 + 19391) % 233280) % 5;

    ctx.clearRect(0, 0, w, h);

    const panelPad = w * 0.04;
    const gap = w * 0.04;
    const panelW = (w - panelPad * 2 - gap) / 2;
    const panelH = h * 0.80;
    const panelY = h * 0.14;
    const leftX = panelPad;
    const rightX = panelPad + panelW + gap;

    drawPanelBox(leftX, panelY, panelW, panelH, Math.max(8, h * 0.03));
    drawPanelBox(rightX, panelY, panelW, panelH, Math.max(8, h * 0.03));

    drawPanelTitle(leftX + panelW * 0.5, panelY + panelH * 0.09, 'SimpleShinka');
    drawPanelTitle(rightX + panelW * 0.5, panelY + panelH * 0.09, 'SimpleIslandShinka');

    const TIMING = {
      draw: 0.16,
      fade: 0.08,
      inStart: 0.00,
      topMidStart: 0.24,
      midBotStart: 0.52,
      outStart: 0.80,
    };

    function drawSimpleShinkaInstance(x, y, pw, ph, phase, selectedTop, selectedMid, selectedBot, radiusScale = 1, alphaScale = 1) {
      const r = Math.max(4, h * 0.026 * radiusScale);
      const cols = Array.from({ length: 5 }, (_, i) => ({
        x: x + pw * (0.18 + i * 0.16),
      }));
      const topNodes = cols.map((c) => ({ x: c.x, y: y + ph * 0.24 }));
      const midNodes = cols.map((c) => ({ x: c.x, y: y + ph * 0.52 }));
      const botNodes = cols.map((c) => ({ x: c.x, y: y + ph * 0.78 }));
      const yIn = y + ph * 0.12;
      const yOut = y + ph * 0.90;

      const pIn = clamp((phase - TIMING.inStart) / TIMING.draw, 0, 1);
      const pExpand = clamp((phase - TIMING.topMidStart) / TIMING.draw, 0, 1);
      const pConverge = clamp((phase - TIMING.midBotStart) / TIMING.draw, 0, 1);
      const pOut = clamp((phase - TIMING.outStart) / TIMING.draw, 0, 1);

      let topAlpha = 1;
      if (phase < TIMING.inStart + TIMING.draw) {
        topAlpha = ease(pIn);
      } else if (phase >= TIMING.topMidStart && phase < TIMING.topMidStart + TIMING.draw + TIMING.fade) {
        topAlpha = 1 - ease(clamp((phase - TIMING.topMidStart) / (TIMING.draw + TIMING.fade), 0, 1));
      } else if (phase >= TIMING.topMidStart + TIMING.draw + TIMING.fade) {
        topAlpha = 0;
      }
      topNodes.forEach((n, i) => {
        const isSelected = i === clamp(selectedTop, 0, topNodes.length - 1);
        drawNode(
          n.x,
          n.y,
          r,
          '',
          topAlpha * alphaScale,
          isSelected ? 'hsla(136 60% 46% / 0.95)' : 'hsla(5 80% 58% / 0.96)',
          isSelected ? 'hsla(136 54% 30% / 0.50)' : 'hsla(5 72% 36% / 0.50)'
        );
      });

      if (phase < TIMING.inStart + TIMING.draw + TIMING.fade) {
        const inT = phase < TIMING.inStart + TIMING.draw ? ease(pIn) : 1;
        const inA = phase < TIMING.inStart + TIMING.draw ? 1 : 1 - ease(clamp((phase - (TIMING.inStart + TIMING.draw)) / TIMING.fade, 0, 1));
        const targetTop = topNodes[clamp(selectedTop, 0, topNodes.length - 1)];
        cols.forEach((c) => drawLine(c.x, yIn, targetTop.x, targetTop.y - r, inT, inA * alphaScale));
      }

      if (phase >= TIMING.topMidStart && phase < TIMING.topMidStart + TIMING.draw + TIMING.fade) {
        const tt = phase < TIMING.topMidStart + TIMING.draw ? ease(pExpand) : 1;
        const topToMidFade = phase < TIMING.topMidStart + TIMING.draw ? 1 : 1 - ease(clamp((phase - (TIMING.topMidStart + TIMING.draw)) / TIMING.fade, 0, 1));
        const seedTop = topNodes[clamp(selectedTop, 0, topNodes.length - 1)];
        midNodes.forEach((m) => drawLine(seedTop.x, seedTop.y + r, m.x, m.y - r, tt, topToMidFade * alphaScale));
      }

      let midAlpha = 0;
      if (phase >= TIMING.topMidStart && phase < TIMING.topMidStart + TIMING.draw) {
        midAlpha = ease(pExpand);
      } else if (phase >= TIMING.topMidStart + TIMING.draw && phase < TIMING.midBotStart) {
        midAlpha = 1;
      } else if (phase >= TIMING.midBotStart && phase < TIMING.midBotStart + TIMING.draw + TIMING.fade) {
        midAlpha = 1 - ease(clamp((phase - TIMING.midBotStart) / (TIMING.draw + TIMING.fade), 0, 1));
      } else if (phase >= TIMING.midBotStart + TIMING.draw + TIMING.fade) {
        midAlpha = 0;
      }
      midNodes.forEach((m, i) => {
        const isSelected = i === clamp(selectedMid, 0, midNodes.length - 1);
        drawNode(
          m.x,
          m.y,
          r * 0.9,
          '',
          midAlpha * alphaScale,
          isSelected ? 'hsla(136 60% 46% / 0.95)' : 'hsla(5 80% 58% / 0.96)',
          isSelected ? 'hsla(136 54% 30% / 0.50)' : 'hsla(5 72% 36% / 0.50)'
        );
      });

      if (phase >= TIMING.midBotStart && phase < TIMING.outStart + TIMING.fade) {
        const tt = ease(pConverge);
        const inToBottomFade = phase < TIMING.outStart ? 1 : 1 - ease(clamp((phase - TIMING.outStart) / TIMING.fade, 0, 1));
        const a = inToBottomFade;
        const seedMid = midNodes[clamp(selectedMid, 0, midNodes.length - 1)];
        botNodes.forEach((b) => drawLine(seedMid.x, seedMid.y + r * 0.9, b.x, b.y - r, tt, a * alphaScale));
      }

      let botAlpha = 0;
      if (phase >= TIMING.midBotStart && phase < TIMING.midBotStart + TIMING.draw) {
        botAlpha = ease(pConverge);
      } else if (phase >= TIMING.midBotStart + TIMING.draw && phase < TIMING.outStart) {
        botAlpha = 1;
      } else if (phase >= TIMING.outStart && phase < TIMING.outStart + TIMING.draw + TIMING.fade) {
        const outFade = clamp((phase - (TIMING.outStart + TIMING.draw)) / TIMING.fade, 0, 1);
        botAlpha = 1 - ease(outFade);
      } else if (phase >= TIMING.outStart + TIMING.draw + TIMING.fade) {
        botAlpha = 0;
      }
      botNodes.forEach((b, i) => {
        const isSelected = i === clamp(selectedBot, 0, botNodes.length - 1);
        drawNode(
          b.x,
          b.y,
          r,
          '',
          botAlpha * alphaScale,
          isSelected ? 'hsla(136 60% 46% / 0.95)' : 'hsla(5 80% 58% / 0.96)',
          isSelected ? 'hsla(136 54% 30% / 0.50)' : 'hsla(5 72% 36% / 0.50)'
        );
      });

      if (phase >= TIMING.outStart && phase < TIMING.outStart + TIMING.draw + TIMING.fade) {
        const outFade = clamp((phase - (TIMING.outStart + TIMING.draw)) / TIMING.fade, 0, 1);
        const outAlpha = (1 - ease(outFade)) * alphaScale;
        const seedBot = botNodes[clamp(selectedBot, 0, botNodes.length - 1)];
        cols.forEach((c) => drawLine(seedBot.x, seedBot.y + r, c.x, yOut, ease(pOut), outAlpha));
      }
    }

    function drawIslandShinkaInstance(x, y, pw, ph, phase, droppedIdx, radiusScale = 1, alphaScale = 1) {
      const rNode = Math.max(4, h * 0.026 * radiusScale);
      const cols = Array.from({ length: 5 }, (_, i) => x + pw * (0.16 + i * 0.17));
      const yTop = y + ph * 0.24;
      const yMid = y + ph * 0.52;
      const yBot = y + ph * 0.78;
      const yIn = y + ph * 0.12;
      const yOut = y + ph * 0.90;

      const rIn = clamp((phase - TIMING.inStart) / TIMING.draw, 0, 1);
      const rDrawTopMid = clamp((phase - TIMING.topMidStart) / TIMING.draw, 0, 1);
      const rFadeTop = clamp((phase - (TIMING.topMidStart + TIMING.draw)) / TIMING.fade, 0, 1);
      const rDrawMidBot = clamp((phase - TIMING.midBotStart) / TIMING.draw, 0, 1);
      const rOut = clamp((phase - TIMING.outStart) / TIMING.draw, 0, 1);

      let topA = 0;
      let midA = 0;
      let botA = 0;
      let inLineA = 0;
      let topMidLineA = 0;
      let midBotLineA = 0;
      let botOutLineA = 0;
      let inLineT = 0;
      let topMidLineT = 0;
      let midBotLineT = 0;
      let botOutLineT = 0;

      if (phase < TIMING.inStart + TIMING.draw) {
        topA = ease(rIn);
      } else if (phase < TIMING.topMidStart + TIMING.draw) {
        topA = 1;
        midA = ease(rDrawTopMid);
        topMidLineA = 0.88;
        topMidLineT = ease(rDrawTopMid);
      } else if (phase < TIMING.topMidStart + TIMING.draw + TIMING.fade) {
        const fadeTop = 1 - ease(rFadeTop);
        topA = 1;
        midA = 1;
        topMidLineA = 0.88 * fadeTop;
        topMidLineT = 1;
      } else if (phase < TIMING.midBotStart) {
        topA = 0;
        midA = 1;
      } else if (phase < TIMING.outStart) {
        const midFade = phase < TIMING.midBotStart + TIMING.draw
          ? 1
          : 1 - ease(clamp((phase - (TIMING.midBotStart + TIMING.draw)) / TIMING.fade, 0, 1));
        topA = 0;
        midA = midFade;
        botA = ease(rDrawMidBot);
        const midToBotFade = phase < TIMING.midBotStart + TIMING.draw ? 1 : 1 - ease(clamp((phase - (TIMING.midBotStart + TIMING.draw)) / TIMING.fade, 0, 1));
        midBotLineA = 0.88 * midToBotFade;
        midBotLineT = ease(rDrawMidBot);
      } else {
        const fade = 1 - ease(clamp((phase - (TIMING.outStart + TIMING.draw)) / TIMING.fade, 0, 1));
        botA = fade;
        botOutLineA = 0.86 * fade;
        botOutLineT = ease(rOut);
        midA = 0;
        midBotLineT = 1;
        midBotLineA = 0;
      }

      if (phase < TIMING.inStart + TIMING.draw) {
        inLineA = 0.86;
        inLineT = ease(rIn);
      } else if (phase < TIMING.inStart + TIMING.draw + TIMING.fade) {
        inLineA = 0.86 * (1 - ease(clamp((phase - (TIMING.inStart + TIMING.draw)) / TIMING.fade, 0, 1)));
        inLineT = 1;
      }

      cols.forEach((cx) => {
        const isDropped = cols.indexOf(cx) === clamp(droppedIdx, 0, cols.length - 1);
        drawLine(cx, yIn, cx, yTop - rNode, inLineT, inLineA * alphaScale);
        drawLine(cx, yTop + rNode, cx, yMid - rNode, topMidLineT, topMidLineA * alphaScale);
        if (!isDropped) {
          drawLine(cx, yMid + rNode, cx, yBot - rNode, midBotLineT, midBotLineA * alphaScale);
        }
        drawLine(cx, yBot + rNode, cx, yOut, botOutLineT, botOutLineA * alphaScale);
        drawNode(cx, yTop, rNode, '', topA * alphaScale);
        const midFill = isDropped && phase >= TIMING.midBotStart && phase < TIMING.outStart
          ? 'hsla(5 80% 58% / 0.96)'
          : 'hsla(0 0% 100% / 0.96)';
        const midStroke = isDropped && phase >= TIMING.midBotStart && phase < TIMING.outStart
          ? 'hsla(5 72% 36% / 0.50)'
          : 'hsla(210 14% 34% / 0.35)';
        drawNode(cx, yMid, rNode, '', midA * alphaScale, midFill, midStroke);

        const botSpawnA = botA * alphaScale;
        const botFill = isDropped ? 'hsla(136 60% 46% / 0.98)' : 'hsla(0 0% 100% / 0.96)';
        const botStroke = isDropped ? 'hsla(136 54% 30% / 0.50)' : 'hsla(210 14% 34% / 0.35)';
        drawNode(cx, yBot, rNode, '', botSpawnA, botFill, botStroke);
      });
    }

    drawSimpleShinkaInstance(leftX, panelY, panelW, panelH, tRaw, simpleTopIdx, simpleMidIdx, simpleBotIdx, 1, 1);
    drawIslandShinkaInstance(rightX, panelY, panelW, panelH, tRaw, islandDropIdx, 1, 1);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
window.initIslandFlowAnimation = initIslandFlowAnimation;
