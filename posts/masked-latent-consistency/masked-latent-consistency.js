(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const C = {
    gold: '#e8b84a',
    blue: '#4a8fff',
    green: '#38d68a',
    red: '#ff5060',
    purple: '#9b6dff',
    orange: '#ff8c3a',
    teal: '#36d6cc',
    muted: '#7d7a86',
    border: '#c9c3bb',
    bg: '#f4f1ea',
  };

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function $$(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    if (parent) parent.appendChild(node);
    return node;
  }

  function txt(str, x, y, attrs, parent) {
    const node = el('text', { x, y, ...attrs }, parent);
    node.textContent = str;
    return node;
  }

  function mk(defs, id, col) {
    const marker = el('marker', { id, markerWidth: 8, markerHeight: 6, refX: 7, refY: 3, orient: 'auto' }, defs);
    el('polygon', { points: '0 0,8 3,0 6', fill: col }, marker);
  }

  function arr(svg, x1, y1, x2, y2, col, markerId) {
    el('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': 1.6, 'marker-end': `url(#${markerId})` }, svg);
  }

  function parr(svg, d, col, markerId) {
    el('path', { d, stroke: col, 'stroke-width': 1.6, fill: 'none', 'marker-end': `url(#${markerId})` }, svg);
  }

  function box(svg, cx, cy, w, h, label, col, fs) {
    el('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 6, fill: col, 'fill-opacity': 0.1, stroke: col, 'stroke-width': 1.5 }, svg);
    txt(label, cx, cy + 5, { 'text-anchor': 'middle', fill: col, 'font-size': fs || 13, 'font-weight': '500' }, svg);
  }

  function circ(svg, cx, cy, r, label, col, fs) {
    el('circle', { cx, cy, r, fill: col, 'fill-opacity': 0.1, stroke: col, 'stroke-width': 1.5 }, svg);
    txt(label, cx, cy + 5, { 'text-anchor': 'middle', fill: col, 'font-size': fs || 12, 'font-family': 'IBM Plex Mono, monospace' }, svg);
  }

  function drawArch() {
    const s = $('#arch-svg');
    if (!s || s.dataset.bound === 'true') return;
    s.dataset.bound = 'true';
    const d = el('defs', {}, s);
    ['gold', 'blue', 'purple', 'orange', 'red'].forEach((k) => mk(d, `a${k}`, C[k]));
    mk(d, 'amut', '#383870');
    const r1 = 90;
    const r2 = 230;
    const p = { x: 65, e1: 155, z: 245, d2: 335, xh: 425 };
    circ(s, p.x, r1, 22, 'x', C.gold);
    box(s, p.e1, r1, 58, 32, 'E', C.blue);
    circ(s, p.z, r1, 22, 'z', C.blue);
    box(s, p.d2, r1, 58, 32, 'D', C.purple);
    circ(s, p.xh, r1, 22, 'x̂', C.purple);
    arr(s, p.x + 22, r1, p.e1 - 29, r1, C.gold, 'agold');
    arr(s, p.e1 + 29, r1, p.z - 22, r1, C.blue, 'ablue');
    arr(s, p.z + 22, r1, p.d2 - 29, r1, C.blue, 'ablue');
    arr(s, p.d2 + 29, r1, p.xh - 22, r1, C.purple, 'amut');
    el('line', { x1: p.z, y1: r1 - 22, x2: p.z, y2: 42, stroke: C.gold, 'stroke-width': 1, 'stroke-dasharray': '3,3', 'stroke-opacity': 0.7 }, s);
    el('rect', { x: p.z - 34, y: 12, width: 68, height: 26, rx: 5, fill: 'none', stroke: C.gold, 'stroke-width': 1, 'stroke-dasharray': '3,3', 'stroke-opacity': 0.7 }, s);
    txt('SigReg', p.z, 30, { 'text-anchor': 'middle', fill: C.gold, 'font-size': 9.5, 'fill-opacity': 0.85, 'letter-spacing': 1 }, s);
    const xr = 585;
    el('line', { x1: p.x, y1: r1 + 22, x2: p.x, y2: r2 - 22, stroke: '#383870', 'stroke-width': 1.5, 'stroke-dasharray': '4,3' }, s);
    txt('M', p.x - 16, 162, { fill: C.orange, 'font-size': 14, 'font-weight': '500' }, s);
    parr(s, `M ${p.xh + 22} ${r1} L ${xr} ${r1} L ${xr} ${r2 - 22}`, '#383870', 'amut');
    txt('M', xr + 16, 162, { fill: C.orange, 'font-size': 14, 'font-weight': '500' }, s);
    const mx = (p.x + xr) / 2;
    el('line', { x1: p.x + 8, y1: 160, x2: mx - 44, y2: 160, stroke: C.orange, 'stroke-width': 0.8, 'stroke-dasharray': '2,3', 'stroke-opacity': 0.4 }, s);
    el('line', { x1: mx + 44, y1: 160, x2: xr - 8, y2: 160, stroke: C.orange, 'stroke-width': 0.8, 'stroke-dasharray': '2,3', 'stroke-opacity': 0.4 }, s);
    txt('same mask M', mx, 157, { 'text-anchor': 'middle', fill: C.orange, 'font-size': 9, 'fill-opacity': 0.6, 'letter-spacing': 1.5 }, s);
    circ(s, p.x, r2, 22, 'M⊙x', C.orange, 10);
    box(s, p.e1, r2, 58, 32, 'E', C.blue);
    circ(s, p.z, r2, 22, 'z₁', C.blue);
    arr(s, p.x + 22, r2, p.e1 - 29, r2, C.orange, 'aorange');
    arr(s, p.e1 + 29, r2, p.z - 22, r2, C.blue, 'ablue');
    const xe3 = 495;
    const xz2 = 405;
    circ(s, xr, r2, 22, 'M⊙x̂', C.orange, 10);
    box(s, xe3, r2, 58, 32, 'E', C.blue);
    circ(s, xz2, r2, 22, 'z₂', C.blue);
    arr(s, xr - 22, r2, xe3 + 29, r2, C.orange, 'aorange');
    arr(s, xe3 - 29, r2, xz2 + 22, r2, C.blue, 'ablue');
    const lx = 325;
    const ly = 294;
    el('rect', { x: lx - 32, y: ly - 18, width: 64, height: 36, rx: 7, fill: C.red, 'fill-opacity': 0.12, stroke: C.red, 'stroke-width': 1.5 }, s);
    txt('ℒ', lx, ly + 6, { 'text-anchor': 'middle', fill: C.red, 'font-size': 16 }, s);
    mk(d, 'ared', C.red);
    parr(s, `M ${p.z + 14} ${r2 + 16} L ${lx - 26} ${ly - 10}`, C.red, 'ared');
    parr(s, `M ${xz2 - 14} ${r2 + 16} L ${lx + 26} ${ly - 10}`, C.red, 'ared');
    const lb = (t, x, y) => txt(t, x, y, { 'text-anchor': 'middle', fill: C.muted, 'font-size': 8.5 }, s);
    lb('Encode', p.e1, r1 + 32);
    lb('Decode', p.d2, r1 + 32);
    lb('Re-encode', p.e1, r2 + 32);
    lb('Re-encode', xe3, r2 + 32);
    lb('Latent Loss', lx, ly + 30);
  }

  function drawCollapse() {
    const s = $('#collapse-svg');
    if (!s || s.dataset.bound === 'true') return;
    s.dataset.bound = 'true';
    const d = el('defs', {}, s);
    ['red', 'blue', 'green', 'gold'].forEach((k) => mk(d, `c${k}`, C[k]));
    mk(d, 'cmut', '#383870');
    el('line', { x1: 360, y1: 18, x2: 360, y2: 232, stroke: C.border, 'stroke-width': 1 }, s);
    txt('WITHOUT MASKING', 180, 16, { 'text-anchor': 'middle', fill: C.muted, 'font-size': 9, 'letter-spacing': 2 }, s);
    txt('WITH MASKING', 540, 16, { 'text-anchor': 'middle', fill: C.green, 'font-size': 9, 'letter-spacing': 2 }, s);
    const l = { x0: 18, x1: 84, x2: 150, x3: 226, x4: 308, y: 92 };
    el('ellipse', { cx: l.x0, cy: l.y, rx: 26, ry: 36, fill: C.blue, 'fill-opacity': 0.05, stroke: C.blue, 'stroke-width': 1.1 }, s);
    txt('real', l.x0, l.y - 4, { 'text-anchor': 'middle', fill: C.blue, 'font-size': 9.2 }, s);
    txt('image', l.x0, l.y + 10, { 'text-anchor': 'middle', fill: C.blue, 'font-size': 9.2 }, s);
    box(s, l.x1, l.y, 48, 28, 'E', C.blue);
    circ(s, l.x2, l.y, 14, 'z', C.blue, 10);
    box(s, l.x3, l.y, 48, 28, 'D', C.red);
    el('ellipse', { cx: l.x4, cy: l.y, rx: 30, ry: 40, fill: C.red, 'fill-opacity': 0.06, stroke: C.red, 'stroke-width': 1.1, 'stroke-dasharray': '3,2' }, s);
    txt('secret', l.x4, l.y - 4, { 'text-anchor': 'middle', fill: C.red, 'font-size': 9.2 }, s);
    txt('code image', l.x4, l.y + 10, { 'text-anchor': 'middle', fill: C.red, 'font-size': 9.2 }, s);
    arr(s, l.x0 + 24, l.y, l.x1 - 24, l.y, C.blue, 'cblue');
    arr(s, l.x1 + 24, l.y, l.x2 - 14, l.y, C.blue, 'cblue');
    arr(s, l.x2 + 14, l.y, l.x3 - 24, l.y, C.red, 'cred');
    arr(s, l.x3 + 24, l.y, l.x4 - 28, l.y, C.red, 'cred');
    box(s, 260, 144, 44, 24, 'E', C.blue, 10);
    circ(s, 308, 144, 14, 'z', C.blue, 10);
    arr(s, l.x4, l.y + 40, 260, 132, C.red, 'cred');
    arr(s, 282, 144, 294, 144, C.blue, 'cblue');
    txt('re-encodes to the same latent', 236, 178, { 'text-anchor': 'middle', fill: C.blue, 'font-size': 8.8 }, s);
    txt('decoder can hide in a private code space', 180, 196, { 'text-anchor': 'middle', fill: C.muted, 'font-size': 8.8 }, s);

    const r = { x0: 392, x1: 458, x2: 524, x3: 600, x4: 682, y: 78 };
    // Good path
    el('ellipse', { cx: r.x0, cy: r.y, rx: 26, ry: 36, fill: C.blue, 'fill-opacity': 0.05, stroke: C.blue, 'stroke-width': 1.1 }, s);
    txt('real', r.x0, r.y - 4, { 'text-anchor': 'middle', fill: C.blue, 'font-size': 9.2 }, s);
    txt('image', r.x0, r.y + 10, { 'text-anchor': 'middle', fill: C.blue, 'font-size': 9.2 }, s);
    box(s, r.x1, r.y, 48, 28, 'E', C.blue);
    circ(s, r.x2, r.y, 14, 'z', C.blue, 10);
    box(s, r.x3, r.y, 48, 28, 'D', C.green);
    el('ellipse', { cx: r.x4, cy: r.y, rx: 26, ry: 36, fill: C.green, 'fill-opacity': 0.05, stroke: C.green, 'stroke-width': 1.1 }, s);
    txt('real', r.x4, r.y - 4, { 'text-anchor': 'middle', fill: C.green, 'font-size': 9.2 }, s);
    txt('image', r.x4, r.y + 10, { 'text-anchor': 'middle', fill: C.green, 'font-size': 9.2 }, s);
    arr(s, r.x0 + 24, r.y, r.x1 - 24, r.y, C.blue, 'cblue');
    arr(s, r.x1 + 24, r.y, r.x2 - 14, r.y, C.blue, 'cblue');
    arr(s, r.x2 + 14, r.y, r.x3 - 24, r.y, C.green, 'cgreen');
    arr(s, r.x3 + 24, r.y, r.x4 - 24, r.y, C.green, 'cgreen');
    el('rect', { x: r.x0 - 18, y: r.y + 40, width: 44, height: 22, rx: 4, fill: C.orange, 'fill-opacity': 0.1, stroke: C.orange, 'stroke-width': 1.1 }, s);
    el('rect', { x: r.x4 - 18, y: r.y + 40, width: 44, height: 22, rx: 4, fill: C.orange, 'fill-opacity': 0.1, stroke: C.orange, 'stroke-width': 1.1 }, s);
    txt('mask', r.x0 + 4, r.y + 55, { 'text-anchor': 'middle', fill: C.orange, 'font-size': 9 }, s);
    txt('mask', r.x4 + 4, r.y + 55, { 'text-anchor': 'middle', fill: C.orange, 'font-size': 9 }, s);
    box(s, 612, 142, 44, 24, 'E', C.blue, 10);
    circ(s, 660, 142, 14, 'z', C.blue, 10);
    arr(s, r.x4, r.y + 36, 612, 130, C.green, 'cgreen');
    arr(s, 634, 142, 646, 142, C.blue, 'cblue');
    txt('masked real output maps back to the same latent', 544, 176, { 'text-anchor': 'middle', fill: C.green, 'font-size': 8.8 }, s);

    // Bad fake-code path under masking
    el('ellipse', { cx: 636, cy: 204, rx: 30, ry: 20, fill: C.red, 'fill-opacity': 0.06, stroke: C.red, 'stroke-width': 1.1, 'stroke-dasharray': '3,2' }, s);
    txt('fake code', 636, 201, { 'text-anchor': 'middle', fill: C.red, 'font-size': 9.2 }, s);
    txt('image', 636, 214, { 'text-anchor': 'middle', fill: C.red, 'font-size': 9.2 }, s);
    el('rect', { x: 614, y: 226, width: 44, height: 22, rx: 4, fill: C.orange, 'fill-opacity': 0.1, stroke: C.orange, 'stroke-width': 1.1 }, s);
    txt('mask', 636, 241, { 'text-anchor': 'middle', fill: C.orange, 'font-size': 9 }, s);
    box(s, 574, 204, 44, 24, 'E', C.blue, 10);
    circ(s, 520, 204, 14, 'z′', C.red, 10);
    arr(s, 606, 204, 596, 204, C.red, 'cred');
    arr(s, 552, 204, 534, 204, C.red, 'cred');
    txt('masked fake code no longer lands on z', 582, 258, { 'text-anchor': 'middle', fill: C.red, 'font-size': 8.8 }, s);
    txt('masking forces decoder outputs to align with real image space', 540, 274, { 'text-anchor': 'middle', fill: C.muted, 'font-size': 8.8 }, s);
  }

  let eqStepState = 0;
  const eqStates = [
    { rx: 155, ry: 88, cx: 320, cy: 150, col: C.red, lbl: '[x]_E — Large equivalence class. Decoder can hide anywhere here.' },
    { rx: 100, ry: 74, cx: 305, cy: 148, col: C.orange, lbl: 'After mask M₁ — class cut along one dimension.' },
    { rx: 65, ry: 50, cx: 298, cy: 145, col: C.gold, lbl: 'After M₁, M₂ — intersection is tighter.' },
    { rx: 36, ry: 28, cx: 294, cy: 148, col: C.purple, lbl: 'After M₁, M₂, M₃ — concentrated region.' },
    { rx: 9, ry: 7, cx: 293, cy: 149, col: C.green, lbl: '∩ₘ [x]_{E,M} → {x}   Only solution: x̂ ≈ x' },
  ];
  const eqLines = [
    { x1: 354, y1: 38, x2: 408, y2: 262, col: C.blue },
    { x1: 158, y1: 78, x2: 348, y2: 228, col: C.orange },
    { x1: 198, y1: 212, x2: 398, y2: 186, col: C.purple },
    { x1: 208, y1: 93, x2: 328, y2: 183, col: C.teal },
  ];

  function renderEquiv() {
    const cv = $('#equiv-canvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.font = '10px IBM Plex Mono, monospace';
    ctx.fillStyle = '#484870';
    ctx.fillText('Image space dimension 1 →', 60, H - 8);
    ctx.save();
    ctx.translate(14, H - 28);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Image space dimension 2 →', 0, 0);
    ctx.restore();
    ctx.fillStyle = '#d8d2c8';
    for (let x = 50; x < W - 80; x += 28) {
      for (let y = 18; y < H - 18; y += 28) {
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 0; i < eqStepState && i < eqLines.length; i += 1) {
      const m = eqLines[i];
      ctx.beginPath();
      ctx.moveTo(m.x1, m.y1);
      ctx.lineTo(m.x2, m.y2);
      ctx.strokeStyle = m.col;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.font = '9px IBM Plex Mono, monospace';
      ctx.fillStyle = m.col;
      ctx.globalAlpha = 0.7;
      ctx.fillText(`M${i + 1}`, (m.x1 + m.x2) / 2 + 10, (m.y1 + m.y2) / 2 - 8);
      ctx.globalAlpha = 1;
    }
    const state = eqStates[eqStepState];
    const ix = 293;
    const iy = 150;
    if (eqStepState < 4) {
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.07) {
        const j = 1 + 0.1 * Math.sin(a * 4.1) + 0.07 * Math.cos(a * 7.3);
        ctx.lineTo(state.cx + state.rx * j * Math.cos(a), state.cy + state.ry * j * Math.sin(a));
      }
      ctx.closePath();
      ctx.fillStyle = state.col;
      ctx.globalAlpha = 0.11;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = state.col;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(ix, iy, eqStepState === 4 ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = eqStepState === 4 ? C.green : '#fff';
    ctx.globalAlpha = eqStepState === 4 ? 1 : 0.7;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = 'bold 12px IBM Plex Mono, monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText('x', ix + 8, iy + 4);
    if (eqStepState === 4) {
      ctx.beginPath();
      ctx.arc(ix, iy, 16, 0, Math.PI * 2);
      ctx.strokeStyle = C.green;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const px2 = 552;
    const py2 = 44;
    const pw = 232;
    const ph = 194;
    ctx.fillStyle = '#ece7de';
    ctx.beginPath();
    ctx.roundRect(px2, py2, pw, ph, 8);
    ctx.fill();
    ctx.strokeStyle = '#c9c3bb';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = '9px IBM Plex Mono, monospace';
    ctx.fillStyle = '#484870';
    ctx.fillText(`STEP ${eqStepState} OF 4`, px2 + 14, py2 + 22);
    ctx.font = '10.5px IBM Plex Mono, monospace';
    ctx.fillStyle = state.col;
    let line = '';
    let ly = py2 + 46;
    state.lbl.split(' ').forEach((word) => {
      const test = `${line}${word} `;
      if (ctx.measureText(test).width > pw - 24 && line) {
        ctx.fillText(line, px2 + 14, ly);
        line = `${word} `;
        ly += 17;
      } else {
        line = test;
      }
    });
    ctx.fillText(line, px2 + 14, ly);
    if (eqStepState < 4) {
      const bw = 192 * (1 - eqStepState * 0.22);
      ctx.font = '9px IBM Plex Mono, monospace';
      ctx.fillStyle = '#484870';
      ctx.fillText(`Class size: ${['very large', 'large', 'medium', 'small'][eqStepState]}`, px2 + 14, py2 + 138);
      ctx.fillStyle = state.col;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(px2 + 14, py2 + 148, bw, 7);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = state.col;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(px2 + 14, py2 + 148, 192, 7);
    } else {
      ctx.font = 'bold 10px IBM Plex Mono, monospace';
      ctx.fillStyle = C.green;
      ctx.fillText('∩ = {x}  ✓', px2 + 14, py2 + 155);
    }
  }

  function equivStep(n) {
    eqStepState = n;
    $$('#equiv .mlc-ctrl-btn').forEach((b, i) => b.classList.toggle('active', i === n));
    renderEquiv();
  }

  function drawSynth(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#dbe7f7');
    g.addColorStop(1, '#eef2f7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8c040';
    ctx.fillRect(W * 0.08, H * 0.08, W * 0.36, H * 0.28);
    ctx.fillStyle = '#ff5060';
    ctx.beginPath();
    ctx.arc(W * 0.72, H * 0.30, W * 0.19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#38d68a';
    ctx.beginPath();
    ctx.moveTo(W * 0.18, H * 0.92);
    ctx.lineTo(W * 0.44, H * 0.56);
    ctx.lineTo(W * 0.70, H * 0.92);
    ctx.fill();
    ctx.fillStyle = '#9b6dff';
    ctx.beginPath();
    ctx.arc(W * 0.82, H * 0.76, W * 0.10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,140,58,.55)';
    ctx.fillRect(0, H * 0.48, W, H * 0.06);
  }

  function pixMask(d, r) {
    const o = new Uint8ClampedArray(d.data);
    for (let i = 0; i < o.length; i += 4) {
      if (Math.random() < r) {
        o[i] = 0;
        o[i + 1] = 0;
        o[i + 2] = 0;
      }
    }
    return new ImageData(o, d.width, d.height);
  }

  function chanMask(d, r) {
    const o = new Uint8ClampedArray(d.data);
    for (let i = 0; i < o.length; i += 4) {
      if (Math.random() < r) o[i] = 0;
      if (Math.random() < r) o[i + 1] = 0;
      if (Math.random() < r) o[i + 2] = 0;
    }
    return new ImageData(o, d.width, d.height);
  }

  function patchMask(d, ps, r) {
    const W = d.width;
    const H = d.height;
    const o = new Uint8ClampedArray(d.data);
    for (let py = 0; py < H; py += ps) {
      for (let px = 0; px < W; px += ps) {
        if (Math.random() < r) {
          for (let dy = 0; dy < ps && py + dy < H; dy += 1) {
            for (let dx = 0; dx < ps && px + dx < W; dx += 1) {
              const i = ((py + dy) * W + (px + dx)) * 4;
              o[i] = 0;
              o[i + 1] = 0;
              o[i + 2] = 0;
            }
          }
        }
      }
    }
    return new ImageData(o, W, H);
  }

  function cropResize(src, r) {
    const W = src.width;
    const H = src.height;
    const cw = Math.max(2, Math.floor(W * r));
    const ch = Math.max(2, Math.floor(H * r));
    const cx = Math.floor((W - cw) / 2);
    const cy = Math.floor((H - ch) / 2);
    const t = document.createElement('canvas');
    t.width = W;
    t.height = H;
    const tc = t.getContext('2d');
    tc.imageSmoothingEnabled = false;
    tc.drawImage(src, cx, cy, cw, ch, 0, 0, W, H);
    return tc.getImageData(0, 0, W, H);
  }

  function drawMasks() {
    const g = $('#mask-grid');
    if (!g || g.dataset.bound === 'true') return;
    g.dataset.bound = 'true';
    const sz = 128;
    const src = document.createElement('canvas');
    src.width = sz;
    src.height = sz;
    drawSynth(src.getContext('2d'), sz, sz);
    const sd = src.getContext('2d').getImageData(0, 0, sz, sz);
    const items = [
      { lbl: 'Original', cls: 'mlc-mask-label-neutral', fn: null },
      { lbl: 'Pixel mask', cls: 'mlc-mask-label-warn', fn: (d) => pixMask(d, 0.7) },
      { lbl: 'Channel mask', cls: 'mlc-mask-label-bad', fn: (d) => chanMask(d, 0.7) },
      { lbl: 'Patch mask', cls: 'mlc-mask-label-bad', fn: (d) => patchMask(d, 10, 0.7) },
      { lbl: 'Crop (10%)', cls: 'mlc-mask-label-good', fn: () => cropResize(src, 0.10) },
    ];
    items.forEach(({ lbl, cls, fn }) => {
      const div = document.createElement('div');
      div.className = 'mlc-mask-item';
      const c = document.createElement('canvas');
      c.width = sz;
      c.height = sz;
      c.style.cssText = 'border-radius:4px;border:1px solid #1c1c36;display:block';
      const ctx = c.getContext('2d');
      if (fn) {
        ctx.putImageData(fn(new ImageData(new Uint8ClampedArray(sd.data), sz, sz)), 0, 0);
      } else {
        ctx.drawImage(src, 0, 0);
      }
      const l = document.createElement('div');
      l.className = `mlc-mask-label ${cls}`;
      l.textContent = lbl;
      div.appendChild(c);
      div.appendChild(l);
      g.appendChild(div);
    });
  }

  const methods = [
    { n: 'Pixel Masking', col: C.blue, s: [0.80, 0.70, 0.35], note: 'misses colour' },
    { n: 'Channel Masking', col: C.red, s: [0.75, 0.10, 0.72], note: 'out-of-distribution' },
    { n: 'Patch Masking', col: C.purple, s: [0.38, 0.65, 0.44], note: 'too coarse' },
    { n: 'Combined', col: C.orange, s: [0.80, 0.32, 0.56], note: 'sparse coverage' },
    { n: 'Random Crops', col: C.green, s: [0.92, 0.98, 0.96], note: '✓ all three' },
  ];
  let activeMethod = 4;

  function tp(cx, cy, R, ax, v) {
    const a = [Math.PI * 1.5, Math.PI * 1.5 + Math.PI * (2 / 3), Math.PI * 1.5 + Math.PI * (4 / 3)][ax];
    return [cx + v * R * Math.cos(a), cy + v * R * Math.sin(a)];
  }

  function drawTriangle() {
    const s = $('#triangle-svg');
    if (!s || s.dataset.bound === 'true') return;
    s.dataset.bound = 'true';
    const cx = 360;
    const cy = 170;
    const R = 130;
    [0.25, 0.5, 0.75, 1].forEach((v) => {
      const ps = [0, 1, 2].map((a) => tp(cx, cy, R, a, v));
      el('path', { d: ps.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ') + 'Z', fill: 'none', stroke: v === 1 ? '#b0aba3' : '#d7d1c7', 'stroke-width': v === 1 ? 1.2 : 0.7 }, s);
    });
    [0, 1, 2].forEach((a) => {
      const [x1, y1] = tp(cx, cy, R, a, 0);
      const [x2, y2] = tp(cx, cy, R, a, 1);
      el('line', { x1, y1, x2, y2, stroke: '#b0aba3', 'stroke-width': 1 }, s);
    });
    [
      ['Constraint Tightness', { x: 0, y: -22 }],
      ['Distribution Fidelity', { x: -90, y: 20 }],
      ['Information Coverage', { x: 90, y: 20 }],
    ].forEach(([label, o], i) => {
      const [bx, by] = tp(cx, cy, R, i, 1);
      txt(label, bx + o.x, by + o.y, { 'text-anchor': 'middle', fill: '#8a847e', 'font-size': 10.5, 'letter-spacing': 0.5 }, s);
    });
    [0.25, 0.5, 0.75].forEach((v) => {
      const [bx, by] = tp(cx, cy, R, 0, v);
      txt(v.toFixed(2), bx + 8, by, { fill: '#aaa39b', 'font-size': 8.5 }, s);
    });
    methods.forEach((m, mi) => {
      const ps = m.s.map((v, ai) => tp(cx, cy, R, ai, v));
      el('path', {
        d: ps.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ') + 'Z',
        fill: m.col,
        'fill-opacity': mi === activeMethod ? 0.18 : 0.05,
        stroke: m.col,
        'stroke-width': mi === activeMethod ? 1.8 : 0.8,
        'stroke-opacity': mi === activeMethod ? 0.9 : 0.25,
        id: `tp${mi}`,
      }, s);
    });
    methods[activeMethod].s.forEach((v, ai) => {
      const [px, py] = tp(cx, cy, R, ai, v);
      el('circle', { cx: px, cy: py, r: 4, fill: methods[activeMethod].col, class: 'vd' }, s);
    });
    const leg = $('#tri-legend');
    leg.innerHTML = '';
    methods.forEach((m, mi) => {
      const item = document.createElement('div');
      item.className = `mlc-leg-item${mi === activeMethod ? ' active' : ''}`;
      item.style.color = m.col;
      item.innerHTML = `<div class="mlc-leg-dot" style="background:${m.col}"></div>${m.n}<span style="color:#6c6c96;margin-left:5px">${m.note}</span>`;
      item.addEventListener('click', () => {
        activeMethod = mi;
        refreshTri();
      });
      leg.appendChild(item);
    });
  }

  function refreshTri() {
    methods.forEach((m, mi) => {
      const p = document.getElementById(`tp${mi}`);
      if (p) {
        p.setAttribute('fill-opacity', mi === activeMethod ? 0.18 : 0.05);
        p.setAttribute('stroke-width', mi === activeMethod ? 1.8 : 0.8);
        p.setAttribute('stroke-opacity', mi === activeMethod ? 0.9 : 0.25);
      }
    });
    $$('.mlc-leg-item').forEach((it, mi) => it.classList.toggle('active', mi === activeMethod));
    const s = $('#triangle-svg');
    s.querySelectorAll('.vd').forEach((d) => d.remove());
    const cx = 360;
    const cy = 170;
    const R = 130;
    methods[activeMethod].s.forEach((v, ai) => {
      const [px, py] = tp(cx, cy, R, ai, v);
      el('circle', { cx: px, cy: py, r: 4, fill: methods[activeMethod].col, class: 'vd' }, s);
    });
  }

  function drawCrop() {
    const cv = $('#crop-canvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    const sz = 96;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    const src = document.createElement('canvas');
    src.width = sz;
    src.height = sz;
    drawSynth(src.getContext('2d'), sz, sz);
    const sy = (H - sz) / 2 - 8;
    ctx.font = '9px IBM Plex Mono, monospace';
    ctx.fillStyle = '#484870';
    ctx.textAlign = 'center';
    ctx.fillText('SOURCE IMAGE', 10 + sz / 2, sy - 10);
    ctx.drawImage(src, 10, sy);
    ctx.strokeStyle = '#b8b1a7';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, sy, sz, sz);
    [
      { r: 0.10, lbl: '10% CROP', col: C.gold, desc: 'Colour + local texture' },
      { r: 0.30, lbl: '30% CROP', col: C.blue, desc: 'Regional structure' },
      { r: 0.70, lbl: '70% CROP', col: C.teal, desc: 'Global composition' },
    ].forEach((cr, ci) => {
      const gx = 10 + sz + 20 + ci * ((W - 10 - sz - 20) / 3);
      const cw = Math.max(2, Math.floor(sz * cr.r));
      const ch = Math.max(2, Math.floor(sz * cr.r));
      const cxs = Math.floor((sz - cw) / 2);
      const cys = Math.floor((sz - ch) / 2);
      const ox = gx + 6;
      ctx.drawImage(src, ox, sy);
      ctx.strokeStyle = '#b8b1a7';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox, sy, sz, sz);
      ctx.strokeStyle = cr.col;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(ox + cxs, sy + cys, cw, ch);
      ctx.setLineDash([]);
      ctx.fillStyle = cr.col;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(ox + cxs, sy + cys, cw, ch);
      ctx.globalAlpha = 1;
      ctx.fillStyle = cr.col;
      ctx.globalAlpha = 0.75;
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('→', gx + sz + 14, sy + sz / 2 + 5);
      ctx.globalAlpha = 1;
      const rx = gx + sz + 28;
      const tmp = document.createElement('canvas');
      tmp.width = sz;
      tmp.height = sz;
      const tc = tmp.getContext('2d');
      tc.imageSmoothingEnabled = false;
      tc.drawImage(src, cxs, cys, cw, ch, 0, 0, sz, sz);
      ctx.drawImage(tmp, rx, sy);
      ctx.strokeStyle = cr.col;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx, sy, sz, sz);
      ctx.textAlign = 'center';
      ctx.font = 'bold 8.5px IBM Plex Mono, monospace';
      ctx.fillStyle = cr.col;
      ctx.fillText(cr.lbl, gx + (W - 10 - sz - 20) / 6, sy - 10);
      ctx.font = '8px IBM Plex Mono, monospace';
      ctx.fillStyle = '#8a847e';
      ctx.fillText(cr.desc, gx + (W - 10 - sz - 20) / 6, sy + sz + 17);
      ctx.fillStyle = '#aaa39b';
      ctx.fillText('→ upsampled to full res', gx + (W - 10 - sz - 20) / 6, sy + sz + 30);
    });
    ctx.textAlign = 'center';
    ctx.font = '8.5px IBM Plex Mono, monospace';
    ctx.fillStyle = '#aaa39b';
    ctx.fillText('Small crops  →  colour + fine detail  ·  Large crops  →  global structure', W / 2, H - 7);
  }

  function drawTraining() {
    const s = $('#training-svg');
    if (!s || s.dataset.bound === 'true') return;
    s.dataset.bound = 'true';
    const d = el('defs', {}, s);
    const L = { l: 72, r: 682, t: 40, b: 268 };
    const pW = L.r - L.l;
    const pH = L.b - L.t;
    const sx = (t) => L.l + t * pW;
    const sy = (v) => L.b - v * pH;
    el('rect', { x: 0, y: 0, width: 720, height: 310, fill: C.bg }, s);
    el('line', { x1: L.l, y1: L.t, x2: L.l, y2: L.b, stroke: '#b0aba3', 'stroke-width': 1 }, s);
    el('line', { x1: L.l, y1: L.b, x2: L.r, y2: L.b, stroke: '#b0aba3', 'stroke-width': 1 }, s);
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      const y = sy(v);
      el('line', { x1: L.l - 4, y1: y, x2: L.r, y2: y, stroke: '#d7d1c7', 'stroke-width': 0.8 }, s);
      txt(v.toFixed(2), L.l - 10, y + 4, { 'text-anchor': 'end', fill: '#aaa39b', 'font-size': 9 }, s);
    });
    txt('Latent Loss', 16, (L.t + L.b) / 2, { 'text-anchor': 'middle', fill: '#8a847e', 'font-size': 9.5, transform: `rotate(-90,16,${(L.t + L.b) / 2})`, 'letter-spacing': 1 }, s);
    txt('Training steps →', (L.l + L.r) / 2, L.b + 20, { 'text-anchor': 'middle', fill: '#8a847e', 'font-size': 9.5, 'letter-spacing': 1 }, s);
    const p1 = [[0, 1], [0.05, 0.82], [0.12, 0.60], [0.18, 0.42], [0.23, 0.30], [0.28, 0.23], [0.36, 0.19], [0.44, 0.175], [0.54, 0.168], [0.64, 0.162], [0.74, 0.155], [0.87, 0.142], [1, 0.128]];
    let d1 = `M ${sx(p1[0][0])} ${sy(p1[0][1])}`;
    for (let i = 1; i < p1.length; i += 1) {
      const a = p1[i - 1];
      const b = p1[i];
      const mx = sx(a[0] + (b[0] - a[0]) * 0.5);
      d1 += ` C ${mx},${sy(a[1])} ${mx},${sy(b[1])} ${sx(b[0])},${sy(b[1])}`;
    }
    el('path', { d: d1, stroke: C.blue, 'stroke-width': 1.8, fill: 'none', 'stroke-dasharray': '6,4', 'stroke-opacity': 0.5 }, s);
    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0xffffffff;
    };
    let d2 = '';
    const npts = [];
    for (let i = 0; i <= 50; i += 1) {
      const t = i / 50;
      const v = 0.9 * Math.exp(-3.5 * t) + 0.09 * Math.exp(-0.4 * t) + 0.10 + (rng() - 0.5) * 0.03;
      npts.push([t, Math.max(0.08, Math.min(0.98, v))]);
    }
    d2 = `M ${sx(npts[0][0])} ${sy(npts[0][1])}`;
    npts.slice(1).forEach((p) => { d2 += ` L ${sx(p[0])} ${sy(p[1])}`; });
    const gid = 'cg';
    const gg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, d);
    el('stop', { offset: '0%', 'stop-color': C.green, 'stop-opacity': 0.15 }, gg);
    el('stop', { offset: '100%', 'stop-color': C.green, 'stop-opacity': 0 }, gg);
    el('path', { d: `${d2} L ${sx(1)} ${L.b} L ${L.l} ${L.b} Z`, fill: `url(#${gid})` }, s);
    el('path', { d: d2, stroke: C.green, 'stroke-width': 1.8, fill: 'none', 'stroke-opacity': 0.8 }, s);
    txt('pixel masking', sx(0.76), sy(0.135) - 14, { fill: C.blue, 'fill-opacity': 0.5, 'font-size': 9 }, s);
    txt('spatial first → colour plateau', sx(0.76), sy(0.135), { fill: '#6d73a8', 'font-size': 8.5 }, s);
    txt('random crops', sx(0.42), sy(0.3) + 2, { fill: C.green, 'fill-opacity': 0.8, 'font-size': 9 }, s);
    txt('noisier · colour + structure together', sx(0.42), sy(0.3) + 15, { fill: '#5e8c71', 'font-size': 8.5 }, s);
    const plY = sy(0.165);
    el('line', { x1: sx(0.30), y1: plY, x2: sx(0.66), y2: plY, stroke: '#aaa39b', 'stroke-width': 0.8, 'stroke-dasharray': '3,3' }, s);
    txt('apparent plateau', sx(0.48), plY - 7, { 'text-anchor': 'middle', fill: '#aaa39b', 'font-size': 8.5 }, s);
    const lx = L.l + 12;
    const lb = L.t + 16;
    el('line', { x1: lx, y1: lb, x2: lx + 28, y2: lb, stroke: C.blue, 'stroke-width': 1.8, 'stroke-dasharray': '6,4', 'stroke-opacity': 0.5 }, s);
    txt('Pixel masking', lx + 36, lb + 4, { fill: '#6d73a8', 'font-size': 9 }, s);
    el('line', { x1: lx, y1: lb + 18, x2: lx + 28, y2: lb + 18, stroke: C.green, 'stroke-width': 1.8, 'stroke-opacity': 0.8 }, s);
    txt('Random crops', lx + 36, lb + 22, { fill: C.green, 'font-size': 9, 'fill-opacity': 0.8 }, s);
  }

  const demo = { type: 'pixel', param: 0.70, src: null };
  const demoCols = { pixel: C.blue, channel: C.red, patch: C.purple, crop: C.green };
  const demoActiveCls = { pixel: 'mlc-ap', channel: 'mlc-ac', patch: 'mlc-apa', crop: 'mlc-acr' };

  function liveScores(type, p) {
    const clamp = (v) => Math.max(0.03, Math.min(0.97, v));
    if (type === 'pixel') return [clamp(0.08 + 0.87 * p), clamp(0.78 - 0.12 * p), clamp(0.30 - 0.10 * p)];
    if (type === 'channel') return [clamp(0.08 + 0.75 * p), clamp(0.88 - 0.82 * p), clamp(0.28 + 0.50 * p)];
    if (type === 'patch') return [clamp(0.08 + 0.42 * p), clamp(0.70 - 0.22 * p), clamp(0.32 + 0.16 * p)];
    if (type === 'crop') return [clamp(0.95 - 0.65 * p), 0.98, clamp(0.94 - 0.22 * p)];
    return [0.5, 0.5, 0.5];
  }

  function renderDemoScores(scores, type) {
    const col = demoCols[type];
    const names = ['Constraint Tightness', 'Distribution Fidelity', 'Info Coverage'];
    $('#demo-scores').innerHTML = names.map((n, i) => {
      const pct = Math.round(scores[i] * 100);
      return `<div class="mlc-demo-score-item"><div class="mlc-demo-score-hdr"><span class="mlc-demo-score-name">${n}</span><span class="mlc-demo-score-val" style="color:${col}">${pct}%</span></div><div class="mlc-demo-bar-bg"><div class="mlc-demo-bar" style="width:${pct}%;background:${col}"></div></div></div>`;
    }).join('');
  }

  function renderDemoTri(scores, type) {
    const cv = $('#demo-tri');
    const ctx = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H / 2 - 14;
    const R = 106;
    const tp2 = (ax, v) => {
      const a = [Math.PI * 1.5, Math.PI * 1.5 + Math.PI * (2 / 3), Math.PI * 1.5 + Math.PI * (4 / 3)][ax];
      return [cx + v * R * Math.cos(a), cy + v * R * Math.sin(a)];
    };
    ctx.lineWidth = 0.7;
    [0.25, 0.5, 0.75, 1].forEach((v) => {
      const pts = [0, 1, 2].map((a) => tp2(a, v));
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.strokeStyle = v === 1 ? '#b0aba3' : '#d7d1c7';
      ctx.stroke();
    });
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#b0aba3';
    [0, 1, 2].forEach((a) => {
      const [x1, y1] = tp2(a, 0);
      const [x2, y2] = tp2(a, 1);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
    methods.forEach((m) => {
      const pts = m.s.map((v, ai) => tp2(ai, v));
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.strokeStyle = m.col;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    const lc = demoCols[type];
    const pts = scores.map((v, ai) => tp2(ai, v));
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fillStyle = lc;
    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = lc;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    pts.forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = lc;
      ctx.fill();
    });
    const axNames = [['Constraint', 'Tightness'], ['Distribution', 'Fidelity'], ['Information', 'Coverage']];
    const axOff = [{ x: 0, y: -20 }, { x: -18, y: 24 }, { x: 18, y: 24 }];
    const axAlign = ['center', 'right', 'left'];
    ctx.fillStyle = '#8a847e';
    axNames.forEach((lines, i) => {
      const [vx, vy] = tp2(i, 1);
      ctx.textAlign = axAlign[i];
      lines.forEach((ln, li) => {
        ctx.font = li === 0 ? 'bold 8.5px IBM Plex Mono, monospace' : '8px IBM Plex Mono, monospace';
        ctx.fillText(ln, vx + axOff[i].x, vy + axOff[i].y + li * 11);
      });
    });
    ctx.font = 'bold 10px IBM Plex Mono, monospace';
    ctx.fillStyle = lc;
    const sOff = [{ x: 18, y: 0 }, { x: -12, y: 14 }, { x: 12, y: 14 }];
    scores.forEach((v, i) => {
      const [px, py] = tp2(i, v);
      ctx.fillText(`${Math.round(v * 100)}%`, px + sOff[i].x, py + sOff[i].y + 4);
    });
    ctx.textAlign = 'center';
    ctx.font = '9px IBM Plex Mono, monospace';
    ctx.fillStyle = lc;
    ctx.globalAlpha = 0.65;
    ctx.fillText(`${type.toUpperCase()} MASKING`, cx, H - 12);
    ctx.globalAlpha = 1;
  }

  function updateDemo() {
    const { type, param, src } = demo;
    $('#demo-src').getContext('2d').drawImage(src, 0, 0);
    const sd = src.getContext('2d').getImageData(0, 0, 180, 180);
    let m;
    if (type === 'pixel') m = pixMask(sd, param);
    else if (type === 'channel') m = chanMask(sd, param);
    else if (type === 'patch') m = patchMask(sd, Math.max(4, Math.floor(180 * 0.09)), param);
    else m = cropResize(src, param);
    $('#demo-out').getContext('2d').putImageData(m, 0, 0);
    $('#demo-out-lbl').textContent = `${type} ${type === 'crop' ? 'size' : 'ratio'}: ${Math.round(param * 100)}%`;
    const sc = liveScores(type, param);
    renderDemoScores(sc, type);
    renderDemoTri(sc, type);
  }

  function demoType(type, btn) {
    demo.type = type;
    $$('#type-btns .mlc-ctrl-btn').forEach((b) => { b.className = 'mlc-ctrl-btn'; });
    btn.classList.add(demoActiveCls[type]);
    const sl = $('#demo-sl');
    if (type === 'crop') {
      $('#slider-lbl').textContent = 'Crop size:';
      sl.min = 5;
      sl.max = 85;
      sl.value = 15;
      demo.param = 0.15;
    } else {
      $('#slider-lbl').textContent = 'Mask ratio:';
      sl.min = 5;
      sl.max = 95;
      sl.value = 70;
      demo.param = 0.70;
    }
    $('#sl-val').textContent = `${sl.value}%`;
    updateDemo();
  }

  function demoSlide(sl) {
    demo.param = parseInt(sl.value, 10) / 100;
    $('#sl-val').textContent = `${sl.value}%`;
    updateDemo();
  }

  function setActiveToggle(btn) {
    const row = btn?.closest('.mlc-toggle-row');
    if (!row) return;
    row.querySelectorAll('.mlc-small-toggle').forEach((el) => el.classList.toggle('is-active', el === btn));
  }

  function showCifarSolution(mode, btn) {
    const img = $('#cifar-solution-image');
    if (!img || !btn) return;
    if (mode === 'baseline') {
      img.src = 'posts/masked-latent-consistency/assets/cifar_baseline.png';
      img.alt = 'CIFAR-10 reconstructions under MSE baseline';
    } else {
      img.src = 'posts/masked-latent-consistency/assets/cifar_crop.png';
      img.alt = 'CIFAR-10 reconstructions under crop-and-resize showing improved colour and structure';
    }
    setActiveToggle(btn);
  }

  function showCelebASolution(mode, btn) {
    const img = $('#celeba-solution-image');
    if (!img || !btn) return;
    if (mode === 'baseline') {
      img.src = 'posts/masked-latent-consistency/assets/celeba_baseline_6x.png';
      img.alt = 'CelebA 6x compression MSE baseline';
    } else if (mode === 'algo2_crop') {
      img.src = 'posts/masked-latent-consistency/assets/celeba_stepfrozen_crop.png';
      img.alt = 'CelebA step-frozen crop-resize result';
    } else if (mode === 'detail_transforms') {
      img.src = 'posts/masked-latent-consistency/assets/celeba_stepfrozen_5stack.png';
      img.alt = 'CelebA detail-transform result';
    } else {
      img.src = 'posts/masked-latent-consistency/assets/celeba_algo1_crop.png';
      img.alt = 'CelebA crop-resize result';
    }
    setActiveToggle(btn);
  }

  function showCifarEmaSolution(mode, btn) {
    const img = $('#cifar-ema-image');
    if (!img || !btn) return;
    if (mode === 'baseline') {
      img.src = 'posts/masked-latent-consistency/assets/cifar_baseline.png';
      img.alt = 'CIFAR-10 MSE baseline';
    } else if (mode === 'crop_resize') {
      img.src = 'posts/masked-latent-consistency/assets/cifar_stepfrozen_crop.png';
      img.alt = 'CIFAR-10 crop-resize result under the step-frozen formulation';
    } else if (mode === 'gaussian') {
      img.src = 'posts/masked-latent-consistency/assets/cifar_stepfrozen_gaussian.png';
      img.alt = 'CIFAR-10 gaussian result under the step-frozen formulation';
    } else if (mode === 'no_corruption') {
      img.src = 'posts/masked-latent-consistency/assets/ema_private_code.png';
      img.alt = 'CIFAR-10 private-code failure with no corruption';
    } else {
      img.src = 'posts/masked-latent-consistency/assets/cifar_emaenc.png';
      img.alt = 'CIFAR-10 reconstructions under the step-frozen detail-bundle formulation';
    }
    setActiveToggle(btn);
  }

  function showHardChallengeSolution(mode, btn) {
    const img = $('#hard-challenge-image');
    if (!img || !btn) return;
    if (mode === 'latent512') {
      img.src = 'posts/masked-latent-consistency/assets/our_method_vs_baseline_latent512_checkpoint100.png';
      img.alt = 'CelebA masked autoencoding comparison at latent 512, showing original images, masked inputs, our method masked and clean reconstructions, and baseline masked and clean reconstructions';
    } else {
      img.src = 'posts/masked-latent-consistency/assets/our_method_vs_baseline_latent128_checkpoint100.png';
      img.alt = 'CelebA masked autoencoding comparison at latent 128, showing original images, masked inputs, our method masked and clean reconstructions, and baseline masked and clean reconstructions';
    }
    setActiveToggle(btn);
  }

  function initDemo() {
    const demoRoot = $('#demo-src')?.closest('.mlc-figure');
    if (!demoRoot) return;
    if (demoRoot.dataset.bound === 'true') return;
    demoRoot.dataset.bound = 'true';
    demo.src = document.createElement('canvas');
    demo.src.width = 180;
    demo.src.height = 180;
    const img = new Image();
    img.onload = () => {
      const c = demo.src.getContext('2d');
      c.clearRect(0, 0, 180, 180);
      c.drawImage(img, 0, 0, 180, 180);
      updateDemo();
    };
    img.onerror = () => {
      drawSynth(demo.src.getContext('2d'), 180, 180);
      updateDemo();
    };
    img.src = 'posts/masked-latent-consistency/assets/example.png';
  }

  function initComments() {
    const host = $('#post-comments-thread');
    if (!host || host.querySelector('.utterances')) return;
    const s = document.createElement('script');
    s.src = 'https://utteranc.es/client.js';
    s.async = true;
    s.setAttribute('repo', 'the-puzzler/the-puzzler.github.io');
    s.setAttribute('issue-term', 'posts/masked-latent-consistency/masked-latent-consistency.html');
    s.setAttribute('label', 'comments');
    s.setAttribute('theme', 'github-light');
    s.setAttribute('crossorigin', 'anonymous');
    host.appendChild(s);
  }

  function retitleToc() {
    const toc = document.getElementById('post-toc');
    if (!toc) return;
    const h2s = Array.from(document.querySelectorAll('.mlc-section > h2'));
    h2s.forEach((heading) => {
      const id = heading.id;
      if (!id) return;
      const link = toc.querySelector(`a[href="#${CSS.escape(id)}"]`);
      const raw = heading.parentElement?.querySelector('.mlc-section-num')?.textContent?.trim();
      const label = raw ? raw.replace(/^\d+\s+[—-]\s+/, '') : '';
      if (link && label) link.textContent = label;
    });
  }

  function init() {
    const page = document.querySelector('.page.post');
    if (!page) return;
    page.classList.add('mlc-post');
    page.closest('.post-layout')?.classList.add('mlc-layout');
    window.equivStep = equivStep;
    window.demoType = demoType;
    window.demoSlide = demoSlide;
    window.showCifarSolution = showCifarSolution;
    window.showCelebASolution = showCelebASolution;
    window.showCifarEmaSolution = showCifarEmaSolution;
    window.showHardChallengeSolution = showHardChallengeSolution;
    drawArch();
    drawCollapse();
    renderEquiv();
    drawMasks();
    drawTriangle();
    drawCrop();
    drawTraining();
    initDemo();
    initComments();
    retitleToc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
