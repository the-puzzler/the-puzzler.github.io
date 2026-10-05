// All coordinates and results come from the pinned release in assets/README.md.
const root = document.querySelector('.epiwm-post');
const ASSETS = '/posts/epiwm/assets/';
const modelNames = {released: 'Released LeWM', epi: 'EpiWM', control: 'My SIGReg control'};
const cache = new Map();
const videoCache = new Map();
function getVideo(env) {
  // These clips are 10–160 KB. Loading them whole also enables exact seeking
  // on simple preview servers that do not implement HTTP Range requests.
  if (!videoCache.has(env)) videoCache.set(env, fetch(`${ASSETS}${env}.mp4`).then(r => {
    if (!r.ok) throw new Error(`Could not load ${env} video`);
    return r.blob();
  }).then(blob => URL.createObjectURL(blob)).catch(e => { videoCache.delete(env); throw e; }));
  return videoCache.get(env);
}
function getData(file) {
  if (!cache.has(file)) cache.set(file, fetch(ASSETS + file).then(r => {
    if (!r.ok) throw new Error(`Could not load ${file}`);
    return r.json();
  }).catch(e => { cache.delete(file); throw e; }));
  return cache.get(file);
}
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const fmt = value => value.toFixed(1);
const text = (x, y, value, extra = '') => `<text x="${x}" y="${y}" ${extra}>${value}</text>`;
const line = (x1, y1, x2, y2, extra = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${extra}/>`;
const svg = (w, h, title, body, top = 0) => `<svg viewBox="0 ${top} ${w} ${h - top}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>`;

function renderScores(report, set, figure) {
  const headline = figure.dataset.scoreFigure === 'headline';
  const models = headline ? ['released', 'epi'] : ['released', 'epi', 'control'];
  const cards = [];
  for (const [env, data] of Object.entries(report.environments)) {
    let body = '';
    for (const tick of [0, 50, 100]) {
      const y = 176 - tick * 1.4;
      body += line(28, y, 190, y, 'class="epiwm-gridline"');
    }
    const descriptions = [];
    for (const [i, model] of models.entries()) {
      const entry = data.models[model], values = entry.scores[set].map(s => s.value), value = mean(values);
      const x = headline ? 58 + i * 65 : 41 + i * 54, y = 176 - value * 1.4;
      descriptions.push(`${modelNames[model]} ${fmt(value)} percent`);
      body += `<rect class="epiwm-fill-${model}" x="${x}" y="${y}" width="32" height="${value * 1.4}" rx="2"/>`;
      // Horizontal offsets separate seeds even when their scores coincide.
      values.forEach((v, j) => {
        body += `<circle class="epiwm-seed" cx="${x + 16 + (j - (values.length - 1) / 2) * 8}" cy="${176 - v * 1.4}" r="2.8"><title>${entry.scores[set][j].run}: ${v}%</title></circle>`;
      });
      const cemNote = entry.scores[set].some(s => s.cem_iterations === 10);
      const reacherNote = env === 'reacher' && model === 'released';
      const valueLabel = text(x + 16, y - 10, fmt(value) + (cemNote ? '‡' : reacherNote ? '*' : ''), 'text-anchor="middle" class="epiwm-bar-value"');
      body += cemNote ? `<a href="/blog/epiwm/#cube-cem-note" aria-label="Cube CEM setting note">${valueLabel}</a>` : reacherNote ? `<a href="/blog/epiwm/#reacher-note" aria-label="Reacher dataset note">${valueLabel}</a>` : valueLabel;
      if (cemNote) descriptions.push('Released Cube uses 10 CEM iterations, selected because it scored higher than 30');
      body += text(x + 16, 193, ['LeWM', 'EpiWM', 'Control'][i], 'text-anchor="middle" class="epiwm-axis"');
      const budget = entry.steps ? `${entry.steps / 1000}k` : '~200k';
      if (!headline) body += text(x + 16, 210, budget, 'text-anchor="middle" class="epiwm-axis"');
    }
    cards.push(`<div class="epiwm-bar-panel"><strong>${data.name}</strong>${svg(205, headline ? 202 : 218, `${data.name}: ${descriptions.join('; ')}.${headline ? '' : ' Training steps shown below each bar.'}`, body, 14)}</div>`);
  }
  figure.querySelector('[data-score-charts]').innerHTML = cards.join('');
  const cemNote = figure.querySelector('[data-cube-cem-note]');
  if (cemNote) cemNote.hidden = set !== 'paper50';
}

class EpisodeViewer {
  constructor(figure, probes) {
    this.figure = figure;
    this.probes = probes;
    this.video = figure.querySelector('video');
    this.button = figure.querySelector('[data-play]');
    this.scrub = figure.querySelector('[data-scrub]');
    this.status = figure.querySelector('[data-status]');
    this.output = figure.querySelector('[data-frame]');
    this.canvases = [...figure.querySelectorAll('canvas')];
    this.frame = 0;
    this.generation = 0;
    this.visible = false;
    this.wantsPlay = !figure.hasAttribute('data-explorer') && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const toggle = () => {
      if (!this.data) return;
      this.wantsPlay = this.video.paused;
      this.wantsPlay ? this.play() : this.video.pause();
    };
    this.button?.addEventListener('click', toggle);
    if (!this.button) {
      this.video.tabIndex = 0;
      this.video.setAttribute('role', 'button');
      this.video.addEventListener('click', toggle);
      this.video.addEventListener('keydown', e => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
      });
    }
    this.scrub.addEventListener('input', () => {
      this.wantsPlay = false;
      this.video.pause();
      this.video.currentTime = Number(this.scrub.value) / this.data.fps;
      this.draw(Number(this.scrub.value));
    });
    this.video.addEventListener('play', () => { this.updateButton(); this.startFrames(); });
    this.video.addEventListener('pause', () => { this.stopFrames(); this.updateButton(); });
    this.video.addEventListener('seeked', () => this.drawTime(this.video.currentTime));
    this.video.addEventListener('loadedmetadata', () => {
      if (this.data) { if (this.button) this.button.disabled = false; this.scrub.disabled = false; }
    });
    this.video.addEventListener('loadeddata', () => { this.drawTime(this.video.currentTime); if (this.wantsPlay && this.visible) this.play(); });
    this.video.addEventListener('error', () => { this.status.hidden = false; this.status.textContent = 'The episode video could not load. The PCA data are still available.'; });
    this.video.addEventListener('timeupdate', () => { if (!('requestVideoFrameCallback' in this.video)) this.drawTime(this.video.currentTime); });
    figure.querySelector('[data-environment]')?.addEventListener('change', e => this.load(e.target.value));
    figure.querySelector('[data-colour]')?.addEventListener('change', () => this.redraw());
    this.resize = new ResizeObserver(() => this.redraw());
    this.canvases.forEach(c => this.resize.observe(c));
    this.theme = new MutationObserver(() => this.redraw());
    this.theme.observe(document.documentElement, {attributes: true, attributeFilter: ['data-mode']});
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.redraw());
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => { if (e.matches) { this.wantsPlay = false; this.video.pause(); } });
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (!this.visible) this.video.pause();
      else if (this.wantsPlay && this.data && !document.hidden) this.play();
    }, {threshold: 0.15});
    this.observer.observe(figure);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.video.pause();
      else if (this.visible && this.wantsPlay && this.data) this.play();
    });
    this.load(figure.dataset.player);
  }
  play() { if (this.data) this.video.play().catch(() => { this.wantsPlay = false; this.updateButton(); }); }
  updateButton() {
    if (this.button) {
      this.button.textContent = this.video.paused ? 'Play' : 'Pause';
      this.button.setAttribute('aria-label', this.video.paused ? 'Play episode' : 'Pause episode');
    } else {
      this.video.setAttribute('aria-label', `Cube episode: ${this.video.paused ? 'play' : 'pause'}`);
    }
  }
  stopFrames() {
    if (this.callback != null) {
      if ('cancelVideoFrameCallback' in this.video) this.video.cancelVideoFrameCallback(this.callback);
      else cancelAnimationFrame(this.callback);
      this.callback = null;
    }
  }
  startFrames() {
    this.stopFrames();
    const next = (_, metadata) => {
      this.drawTime(metadata ? metadata.mediaTime : this.video.currentTime);
      if (!this.video.paused) this.callback = 'requestVideoFrameCallback' in this.video ? this.video.requestVideoFrameCallback(next) : requestAnimationFrame(next);
    };
    this.callback = 'requestVideoFrameCallback' in this.video ? this.video.requestVideoFrameCallback(next) : requestAnimationFrame(next);
  }
  async load(env) {
    const generation = ++this.generation;
    this.video.pause();
    this.data = null;
    if (this.button) this.button.disabled = true;
    this.scrub.disabled = true;
    this.status.hidden = false;
    this.status.textContent = 'Loading PCA coordinates…';
    try {
      const [data, videoURL] = await Promise.all([getData(`${env}.json`), getVideo(env)]);
      if (generation !== this.generation) return;
      this.data = data;
      this.env = env;
      this.frame = 0;
      this.figure.querySelector('[data-video-title]').textContent = `${data.name} · episode ${data.episode}`;
      this.video.setAttribute('aria-label', `Recorded ${data.name} dataset episode ${data.episode}`);
      this.video.src = videoURL;
      this.video.controls = false;
      this.video.load();
      const colour = this.figure.querySelector('[data-colour]');
      if (colour) {
        colour.replaceChildren(new Option('Episode progress', 'none'), ...data.labels.map((label, i) => new Option(label.replaceAll('_', ' '), String(i))));
        colour.value = 'none';
      }
      for (const model of ['epijepa', 'released_lewm']) this.figure.querySelector(`[data-variance="${model}"]`).textContent = `${Math.round(this.probes[env][model].top2_var * 100)}% variance`;
      this.scrub.max = data.models.epijepa.trajectory.length - 1;
      this.figure.querySelector('.epiwm-playback').hidden = false;
      this.status.hidden = true;
      this.redraw();
    } catch (e) {
      this.status.textContent = 'PCA data could not load. Reload the page to try again.';
      this.video.controls = true;
      console.error(e);
    }
  }
  redraw() {
    if (!this.data) return;
    const style = getComputedStyle(this.figure);
    this.palette = Object.fromEntries(['bg', 'ink', 'ink-dim', 'rule', 'epiwm-epi', 'epiwm-released'].map(k => [k, style.getPropertyValue(`--${k}`).trim()]));
    const colour = this.figure.querySelector('[data-colour]')?.value ?? 'none';
    const values = colour === 'none' ? null : this.data.states.map(s => s[Number(colour)]);
    const min = values ? Math.min(...values) : 0, max = values ? Math.max(...values) : 1;
    const key = this.figure.querySelector('[data-colour-key]');
    if (key) { key.hidden = !values; key.innerHTML = values ? `${min.toFixed(2)} <i></i> ${max.toFixed(2)}` : ''; }
    this.plots = this.canvases.map(canvas => {
      const model = canvas.dataset.model, data = this.data.models[model];
      // Bound backing stores even while the sidecar CSS is still arriving.
      const size = Math.min(800, canvas.parentElement.getBoundingClientRect().width, canvas.getBoundingClientRect().width);
      if (!size) return null;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(size * dpr), h = w;
      canvas.width = w; canvas.height = h;
      const all = [...data.points, ...data.trajectory];
      const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
      const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
      const width = size, pad = {left: 33, right: 10, top: 12, bottom: 29};
      const plotW = width - pad.left - pad.right, plotH = width - pad.top - pad.bottom;
      // Fit each axis independently, matching the release's PCA figures.
      const scaleX = (['cube', 'pusht'].includes(this.env) ? -1 : 1) * plotW / ((xmax - xmin) * 1.12 || 1);
      const scaleY = plotH / ((ymax - ymin) * 1.12 || 1);
      const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
      const project = p => [pad.left + plotW / 2 + (p[0] - cx) * scaleX, pad.top + plotH / 2 - (p[1] - cy) * scaleY];
      const background = document.createElement('canvas'); background.width = w; background.height = h;
      const ctx = background.getContext('2d'); ctx.scale(dpr, dpr);
      ctx.fillStyle = this.palette.bg; ctx.fillRect(0, 0, width, width);
      ctx.strokeStyle = this.palette.rule; ctx.lineWidth = 0.65;
      ctx.beginPath(); ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, width - pad.bottom); ctx.lineTo(width - pad.right, width - pad.bottom); ctx.stroke();
      ctx.font = '10px system-ui'; ctx.fillStyle = this.palette['ink-dim']; ctx.textAlign = 'center';
      for (const tick of [xmin, xmax]) { const [x] = project([tick, 0]); ctx.fillText(tick.toFixed(1), x, width - 16); }
      ctx.fillText('PC1', pad.left + plotW / 2, width - 2);
      ctx.textAlign = 'right';
      for (const tick of [ymin, ymax]) { const [, y] = project([0, tick]); ctx.fillText(tick.toFixed(1), pad.left - 4, y + 3); }
      ctx.save(); ctx.translate(9, pad.top + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('PC2', 0, 0); ctx.restore();
      data.points.forEach((point, i) => {
        const [x, y] = project(point);
        ctx.globalAlpha = values ? 0.65 : 0.2;
        ctx.fillStyle = values ? this.stateColour((values[i] - min) / (max - min || 1)) : this.palette['ink-dim'];
        ctx.beginPath(); ctx.arc(x, y, values ? 1.15 : 1, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 0.18; ctx.strokeStyle = this.palette[model === 'epijepa' ? 'epiwm-epi' : 'epiwm-released']; ctx.lineWidth = 1;
      ctx.beginPath(); data.trajectory.forEach((p, i) => { const [x, y] = project(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      ctx.globalAlpha = 1;
      return {canvas, background, data, project, dpr, model};
    });
    this.draw(this.frame);
  }
  stateColour(t) {
    // A fixed purple–teal–gold scale works on either page background.
    const stops = [[113, 74, 166], [35, 152, 148], [229, 187, 65]];
    const k = t <= 0.5 ? 0 : 1, a = Math.max(0, Math.min(1, t * 2 - k));
    return `rgb(${stops[k].map((c, i) => Math.round(c * (1 - a) + stops[k + 1][i] * a)).join(',')})`;
  }
  drawTime(time) { if (this.data) this.draw(Math.floor(time * this.data.fps + 0.0001)); }
  draw(frame) {
    if (!this.data || !this.plots) return;
    this.frame = Math.max(0, Math.min(this.data.models.epijepa.trajectory.length - 1, frame));
    this.scrub.value = this.frame;
    this.output.value = `${this.frame} / ${this.scrub.max}`;
    this.scrub.setAttribute('aria-valuetext', `Frame ${this.frame} of ${this.scrub.max}`);
    for (const plot of this.plots) {
      if (!plot) continue;
      const {canvas, background, data, project, dpr, model} = plot, ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(background, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = this.palette[model === 'epijepa' ? 'epiwm-epi' : 'epiwm-released']; ctx.lineWidth = 1.7;
      ctx.beginPath();
      data.trajectory.slice(0, this.frame + 1).forEach((p, i) => { const [x, y] = project(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      const [x, y] = project(data.trajectory[this.frame]);
      ctx.fillStyle = ctx.strokeStyle; ctx.strokeStyle = this.palette.bg; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 4.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
}

if (root && !root.dataset.figuresReady) {
  root.dataset.figuresReady = 'true';
  getData('scores.json').then(report => {
    root.querySelectorAll('[data-score-figure]').forEach(figure => {
      const select = figure.querySelector('[data-eval-set]');
      renderScores(report, select?.value ?? 'n500', figure);
      select?.addEventListener('change', () => renderScores(report, select.value, figure));
    });
  }).catch(e => { root.querySelectorAll('[data-score-charts]').forEach(el => { el.textContent = 'Results could not load. The complete scores are linked below.'; }); console.error(e); });
  getData('probes.json').then(probes => {
    root.querySelectorAll('[data-player]').forEach(figure => new EpisodeViewer(figure, probes));
  }).catch(e => { root.querySelectorAll('[data-status]').forEach(s => { s.textContent = 'PCA data could not load. Reload the page to try again.'; }); console.error(e); });
}

(function initPostComments() {
  const host = document.getElementById('post-comments-thread');
  if (!host || host.dataset.ready) return;
  host.dataset.ready = 'true';
  const preferredDark = window.matchMedia('(prefers-color-scheme: dark)');
  const theme = () => {
    const mode = document.documentElement.getAttribute('data-mode');
    return (mode === 'dark' || (mode !== 'light' && preferredDark.matches))
      ? 'github-dark' : 'github-light';
  };
  const syncTheme = () => {
    host.querySelector('iframe')?.contentWindow.postMessage(
      { type: 'set-theme', theme: theme() }, 'https://utteranc.es'
    );
  };
  const script = document.createElement('script');
  script.src = 'https://utteranc.es/client.js';
  script.async = true;
  script.setAttribute('repo', 'the-puzzler/the-puzzler.github.io');
  script.setAttribute('issue-term', 'posts/epiwm/epiwm.html');
  script.setAttribute('label', 'comments');
  script.setAttribute('theme', theme());
  script.setAttribute('crossorigin', 'anonymous');
  host.addEventListener('load', syncTheme, true);
  host.appendChild(script);
  new MutationObserver(syncTheme).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-mode']
  });
  preferredDark.addEventListener('change', syncTheme);
})();
