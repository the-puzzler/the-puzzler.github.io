async function initMapSamples(figure, detail, {count, shareSeed = false}) {
  const panels = [...figure.querySelectorAll('[data-map-model]')];
  const folder = new URL('./', panels[0].querySelector('img').src);
  const shuffle = figure.querySelector('.cat-resample');
  let pools;
  try {
    const response = await fetch(new URL('map-units.json', folder));
    if (!response.ok) return;
    pools = await response.json();
    await Promise.all(panels.map(async panel => {
      const image = new Image();
      image.src = new URL(panel.dataset.mapModel + '-units.webp', folder);
      await image.decode();
      panel.style.setProperty('--unit-sheet', `url("${image.src}")`);
    }));
  } catch {
    return; // Keep the illustrated samples if the interactive assets are unavailable.
  }

  function draw(panel, selection) {
    const grid = panel.querySelector('.cat-map-sample');
    const tiles = selection.sort((a, b) => a - b).map(id => {
      const layer = Math.floor(id / 23);
      const unit = id % 23;
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'cat-unit-map';
      tile.dataset.unit = id;
      tile.title = `Layer ${layer + 1} · Unit ${unit + 1}`;
      tile.setAttribute('aria-label', `${panel.querySelector('span').textContent}, ${tile.title}`);
      tile.style.backgroundPosition = `${100 * unit / 22}% ${100 * layer / 15}%`;
      return tile;
    });
    grid.replaceChildren(...tiles);
  }

  function sample(seed) {
    let state = seed;
    return panels.map(panel => {
      const pool = pools[panel.dataset.mapModel];
      // Seed 42 refers to the original order of the shuffled manifest.
      if (seed === 42) return pool.slice(0, count);
      const candidates = pool.slice();
      for (let i = 0; i < count; i++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const j = i + Math.floor((state / 2 ** 32) * (candidates.length - i));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      return candidates.slice(0, count);
    });
  }

  const requested = shareSeed ? new URL(location.href).searchParams.get('seed') : null;
  const initialSeed = requested !== null && /^\d+$/.test(requested) && Number(requested) < 2 ** 32
    ? Number(requested) : pools.openingSeed;
  let selected;
  function show(selection) {
    selected = selection;
    panels.forEach((panel, i) => draw(panel, selected[i]));
  }
  show(sample(initialSeed));
  shuffle.addEventListener('click', () => {
    const previous = selected.map(units => new Set(units));
    let seed, next;
    do {
      seed = Math.floor(Math.random() * 1000000);
      next = sample(seed);
    } while (next.some((units, i) => units.some(id => previous[i].has(id))));
    show(next);
    if (shareSeed) {
      const url = new URL(location.href);
      url.searchParams.set('seed', seed);
      history.replaceState(history.state, '', url);
    }
  });
  figure.addEventListener('click', event => {
    const tile = event.target.closest('button[data-unit]');
    if (!tile) return;
    detail.style.setProperty('--unit-sheet', tile.closest('.cat-comparison-panel').style.getPropertyValue('--unit-sheet'));
    detail.querySelector('strong').textContent = tile.getAttribute('aria-label');
    detail.querySelector('.cat-unit-map').style.backgroundPosition = tile.style.backgroundPosition;
    detail.showModal();
  });
  shuffle.disabled = false;
  shuffle.hidden = false;
}

const opener = document.getElementById('cat-comparison');
if (opener) initMapSamples(opener, opener.querySelector('.cat-unit-detail'), {count: 24, shareSeed: true});

(function initTrainingPanels() {
  const figure = document.getElementById('representations-over-time');
  if (!figure) return;
  const controls = figure.querySelector('.training-controls');
  const slider = controls.querySelector('input');
  const steps = slider.dataset.steps.split(' ').map(Number);
  const button = controls.querySelector('button');
  const output = controls.querySelector('output');
  const error = figure.querySelector('.training-error');
  let frame = figure.querySelector('img');
  const folder = new URL('./', frame.src);
  // The figure opens on the finished cats; Play starts again from step 0.
  let shown = steps.length - 1;
  let playing = false;
  let timer, request, currentBlob, glide;
  const FRAME_MS = 90;
  // Fractional values let the thumb glide between frames during playback.
  slider.step = 'any';
  // Carry the first frame's ?v= tag to every frame, so re-rendered frames bypass old caches.
  const version = new URL(frame.src).search;
  const frameUrl = index => new URL('step' + String(steps[index]).padStart(6, '0') + '.webp' + version, folder);

  function glideTo(from, to, ms) {
    cancelAnimationFrame(glide);
    const start = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - start) / ms);
      slider.value = from + (to - from) * t;
      if (t < 1) glide = requestAnimationFrame(tick);
    };
    glide = requestAnimationFrame(tick);
  }

  function pause() {
    clearTimeout(timer);
    cancelAnimationFrame(glide);
    request?.abort();
    playing = false;
    button.textContent = shown === steps.length - 1 ? 'Replay' : 'Play';
    slider.value = shown;
    slider.setAttribute('aria-valuetext', output.value);
  }

  async function show(index, fromScrub = false) {
    const step = steps[index];
    const label = 'Step ' + step.toLocaleString('en-US');
    const phase = step <= 50000 ? 'Organise' : step <= 100000 ? 'First polish' : 'Second polish';
    const controller = new AbortController();
    request = controller;
    let blob;
    try {
      const response = await fetch(frameUrl(index), {signal: controller.signal});
      if (!response.ok) throw new Error('Frame unavailable');
      blob = URL.createObjectURL(await response.blob());
      const next = new Image(864, 456);
      next.alt = 'Paintings and hidden-unit maps of the ANNA and unregularised cats at ' + label.toLowerCase() + '.';
      next.src = blob;
      await next.decode();
      if (controller.signal.aborted) return;
      frame.replaceWith(next);
      frame = next;
      if (currentBlob) URL.revokeObjectURL(currentBlob);
      currentBlob = blob;
      shown = index;
      if (!fromScrub) slider.value = index;
      output.value = label + ' · ' + phase;
      slider.setAttribute('aria-valuetext', output.value);
      error.textContent = '';
      if (index === steps.length - 1) pause();
      else if (playing) {
        // Warm the cache a few frames ahead so playback is not held up by the network.
        for (let i = index + 1; i <= Math.min(index + 6, steps.length - 1); i++) new Image().src = frameUrl(i);
        glideTo(index, index + 1, FRAME_MS);
        timer = setTimeout(() => show(index + 1), FRAME_MS);
      }
      else button.textContent = 'Play';
    } catch {
      if (!controller.signal.aborted) {
        pause();
        error.textContent = 'This step could not load. Try again.';
      }
    } finally {
      if (blob && blob !== currentBlob) URL.revokeObjectURL(blob);
    }
  }

  button.addEventListener('click', () => {
    if (playing) return pause();
    pause();
    playing = true;
    button.textContent = 'Pause';
    show(shown === steps.length - 1 ? 0 : shown + 1);
  });
  slider.addEventListener('input', () => {
    const index = Math.round(Number(slider.value));
    clearTimeout(timer);
    cancelAnimationFrame(glide);
    request?.abort();
    playing = false;
    button.textContent = 'Play';
    slider.setAttribute('aria-valuetext', 'Step ' + steps[index].toLocaleString('en-US'));
    // Let rapid scrubs settle before requesting a frame.
    timer = setTimeout(() => show(index, true), 80);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  new IntersectionObserver(([entry]) => { if (!entry.isIntersecting && playing) pause(); }).observe(figure);
  slider.value = shown;
  slider.setAttribute('aria-valuetext', output.value);
  controls.hidden = false;
})();


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
  script.setAttribute('issue-term', 'posts/beautiful-on-the-inside/beautiful-on-the-inside.html');
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

(() => {
  document.querySelectorAll('.info-note').forEach(note => {
    const info = note.querySelector('button');
    const tooltip = note.querySelector('[role="tooltip"]');
    const show = () => { tooltip.hidden = false; };
    const hide = () => { tooltip.hidden = true; };
    note.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') show();
    });
    note.addEventListener('pointerleave', event => {
      if (event.pointerType !== 'touch' && document.activeElement !== info) hide();
    });
    info.addEventListener('focus', show);
    info.addEventListener('blur', hide);
    info.addEventListener('click', show);
    document.addEventListener('pointerdown', event => {
      if (!tooltip.hidden && !note.contains(event.target)) hide();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') hide();
    });
  });
})();

// Hover readout for charts that embed their plotted series (see grok_chart in the build script).
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const names = {anna: 'ANNA', ufo: 'UFO', wd: 'Weight decay alone'};
  document.querySelectorAll('svg[data-hover]').forEach(svg => {
    const panels = JSON.parse(svg.dataset.hover);
    const host = svg.parentElement;
    host.classList.add('hover-host');
    const guide = document.createElementNS(NS, 'g');
    guide.setAttribute('class', 'hover-guide');
    guide.style.display = 'none';
    const line = document.createElementNS(NS, 'line');
    guide.append(line);
    const dots = Object.fromEntries(Object.keys(names).map(key => {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', 3.2);
      dot.dataset.method = key;
      guide.append(dot);
      return [key, dot];
    }));
    svg.append(guide);
    const readout = document.createElement('div');
    readout.className = 'hover-readout';
    readout.hidden = true;
    host.append(readout);

    function hide() { guide.style.display = 'none'; readout.hidden = true; }
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('pointermove', event => {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
      const panel = panels.find(p => point.x >= p.x0 && point.x <= p.x1);
      if (!panel) return hide();
      const steps = panel.steps;
      const at = (point.x - panel.x0) / (panel.x1 - panel.x0) * panel.xmax;
      const i = Math.min(steps.length - 1, Math.max(0, Math.round(at) - steps[0]));
      const x = panel.x0 + steps[i] / panel.xmax * (panel.x1 - panel.x0);
      const y = value => panel.y0 + value / 100 * (panel.y100 - panel.y0);
      line.setAttribute('x1', x); line.setAttribute('x2', x);
      line.setAttribute('y1', panel.y100); line.setAttribute('y2', panel.y0);
      for (const [key, dot] of Object.entries(dots)) {
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y(panel[key][i]));
      }
      guide.style.display = '';
      readout.replaceChildren(
        Object.assign(document.createElement('strong'), {textContent: `${panel.title} · step ${steps[i]}k`}),
        ...Object.keys(names).map(key => Object.assign(document.createElement('span'),
          {textContent: `${names[key]} ${Math.round(panel[key][i])}%`, className: 'hover-' + key})));
      readout.hidden = false;
      const box = host.getBoundingClientRect();
      const left = event.clientX - box.left;
      readout.style.top = (event.clientY - box.top + 14) + 'px';
      readout.style.left = (left > box.width - 190 ? left - readout.offsetWidth - 14 : left + 14) + 'px';
    });
  });
})();
