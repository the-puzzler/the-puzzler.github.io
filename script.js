// -----------------------------
// Minimal helpers
// -----------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// -----------------------------
// Posts list
// -----------------------------
// -----------------------------
// Posts list
// -----------------------------
async function loadPosts() {
  const res = await fetch('posts.json'); // use default cache (much faster/robust)
  const posts = await res.json();
  return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return iso;
  }
}

// Treat http(s) and protocol-relative (//) as external
function isExternalPath(path = "") {
  return /^(https?:)?\/\//i.test(path);
}

function makeHref(path = "") {
  return isExternalPath(path)
    ? path
    : `post.html?p=${encodeURIComponent(path)}`;
}

function linkAttrs(path = "") {
  return isExternalPath(path)
    ? 'target="_blank" rel="noopener noreferrer"'
    : '';
}

async function renderList() {
  const listEl = $('#post-list');
  if (!listEl) return;

  const posts = await loadPosts();
  listEl.innerHTML = posts.map(p => {
    const href = makeHref(p.path || "");
    const attrs = linkAttrs(p.path || "");
    return `
      <li class="item">
        <h3><a href="${href}" ${attrs}>${p.title}</a></h3>
        <small>${formatDate(p.date)}</small>
        ${p.description ? `<p>${p.description}</p>` : ``}
      </li>
    `;
  }).join('');
}


// -----------------------------
// MathJax typeset (awaitable)
// -----------------------------
function typesetAfterLoad(root) {
  return new Promise((resolve) => {
    let tries = 0;
    (function tick() {
      const mj = window.MathJax;
      if (mj && typeof mj.typesetPromise === 'function') {
        mj.typesetPromise([root]).then(resolve).catch((err) => { console.error(err); resolve(); });
      } else if (tries++ < 100) {
        setTimeout(tick, 50);
      } else {
        resolve();
      }
    })();
  });
}

// -----------------------------
// Sidecar loader (per-post JS/CSS)
// -----------------------------
function loadSidecarAssets(htmlPath) {
  const base = htmlPath.replace(/\.html?$/i, '');
  addStylesheet(`${base}.css`);
  addModule(`${base}.js`);
}
function addModule(src) {
  const s = document.createElement('script');
  s.type = 'module';
  s.src = src;
  s.async = true;
  s.onerror = () => console.debug('No post script at', src);
  document.body.appendChild(s);
}
function addStylesheet(href) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  l.onerror = () => console.debug('No post stylesheet at', href);
  document.head.appendChild(l);
}

// -----------------------------
// Heading normalization (prevents stalled scramble snapshots)
// -----------------------------
function normalizeHeadings(root) {
  $$('h1, h2, h3, h4, h5, h6', root).forEach(h => {
    const finalText = h.dataset.title || h.textContent.trim();
    // Store once so future reflows know the true title
    if (!h.dataset.title) h.dataset.title = finalText;
    // Ensure DOM has final (clean) text before we measure/flatten
    h.textContent = h.dataset.title;
  });
}

// -----------------------------
// Book mode (soft page breaks, keep-with-next for headings)
// -----------------------------
function enableSoftBookMode(contentEl) {
  const post = contentEl.closest('.post');
  if (!post) return;

  // Save linear HTML once for clean rebuilds
  if (!contentEl._originalHTML) contentEl._originalHTML = contentEl.innerHTML;

  // Make sure headings show their final text before measuring
  normalizeHeadings(contentEl);

  // Split content into sections by <hr>
  const sections = splitIntoSections(contentEl);

  // Measurer with exact width context
  const { sheetForMeasure, cleanup } = makeMeasurer(contentEl);

  // Available page height below header
  const maxH = getPageMaxHeight();
  document.documentElement.style.setProperty('--sheet-h', `${maxH}px`);

  const pages = [];
  let current = [];

  const pushPage = (nodes) => { if (nodes.length) pages.push({ nodes }); };
  const tryPack = (nodes) => {
    const tentative = current.concat(nodes);
    const h = measureNodesHeight(sheetForMeasure, tentative);
    if (h <= maxH) { current = tentative; return true; }
    return false;
  };

  // Build pages
  for (const section of sections) {
    // Split into blocks, then into "units" that keep headings with their next block
    const blocks = splitSectionIntoBlocks(section);
    const units = buildKeepWithNextUnits(blocks);

    // First, try whole section as a single unit (fast path)
    const wholeSection = [...section];
    if (wholeSection.length && tryPack(wholeSection)) continue;

    // Otherwise, pack unit by unit
    // If a unit is too large for an empty page (e.g. huge pre/img), place it alone.
    // This guarantees a heading never sits at the BOTTOM of a page:
    // we never place a heading without its companion block on the same page unless it's impossible.
    pushPage(current); current = [];
    for (const unit of units) {
      if (tryPack(unit)) continue;

      // Unit doesn't fit in current (which is empty here): force it as a separate page
      pushPage(current); current = [];
      if (!tryPack(unit)) {
        // Extremely tall unit: still put as a single page (may exceed slightly)
        pushPage(unit); // no split inside the unit
      }
    }
  }
  pushPage(current); current = [];

  // Build live DOM
  const book = document.createElement('div');
  book.className = 'book';
  for (const p of pages) {
    const sheet = document.createElement('section');
    sheet.className = 'sheet';
    p.nodes.forEach(n => sheet.appendChild(n));
    book.appendChild(sheet);
  }

  contentEl.innerHTML = '';
  contentEl.appendChild(book);
  post.classList.add('book-mode');

  addPageBadge(post, book);
  cleanup();

  // Repack on resize: normalize headings first, then flatten, then pack
  const reflow = debounce(() => {
    document.documentElement.style.setProperty('--sheet-h', `${getPageMaxHeight()}px`);
    // Normalize headings inside sheets so we don't capture a scrambled snapshot
    normalizeHeadings(book);
    const linearHTML = Array.from(book.querySelectorAll('.sheet')).map(s => s.innerHTML).join('');
    contentEl.innerHTML = linearHTML;
    enableSoftBookMode(contentEl);
    document.dispatchEvent(new CustomEvent('post:ready', { detail: { path: getCurrentPostPath() } }));
  }, 200);
  window.addEventListener('resize', reflow);
}

function splitIntoSections(container) {
  const nodes = Array.from(container.childNodes);
  const groups = [[]];
  for (const n of nodes) {
    if (n.nodeType === 1 && n.tagName === 'HR') {
      if (groups[groups.length - 1].length > 0) groups.push([]);
    } else {
      groups[groups.length - 1].push(n);
    }
  }
  if (groups[groups.length - 1].length === 0 && groups.length > 1) groups.pop();
  // Normalize stray text to paragraphs
  return groups.map(g => g.map(node => {
    if (node.nodeType === 3 && node.textContent.trim() !== '') {
      const p = document.createElement('p');
      p.textContent = node.textContent;
      return p;
    }
    return node;
  }));
}

// Split into blocks (indivisible display units)
function splitSectionIntoBlocks(nodes) {
  const blocks = [];
  nodes.forEach(n => {
    if (n.nodeType === 3) {
      const txt = n.textContent.trim();
      if (txt) { const p = document.createElement('p'); p.textContent = txt; blocks.push(p); }
    } else if (n.nodeType === 1) {
      const tag = n.tagName.toLowerCase();
      const isBlock = /^(p|h1|h2|h3|h4|h5|h6|ul|ol|li|pre|blockquote|figure|img|table|hr|div)$/i.test(tag);
      if (isBlock) blocks.push(n);
      else { const p = document.createElement('p'); p.appendChild(n); blocks.push(p); }
    }
  });
  // Remove any hr that slipped in (sections are split by hr already)
  return blocks.filter(el => !(el.tagName && el.tagName.toLowerCase() === 'hr'));
}

// Build units that keep headings with the next block
function buildKeepWithNextUnits(blocks) {
  const units = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const tag = (b.tagName || '').toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const next = blocks[i + 1];
      if (next) {
        units.push([b, next]); // heading + next block stay together
        i++;                   // skip the next (already grouped)
      } else {
        units.push([b]);       // heading at end of section; try to keep it alone at top of a page
      }
    } else {
      units.push([b]);
    }
  }
  return units;
}

function makeMeasurer(referenceEl) {
  const width = Math.max(referenceEl.getBoundingClientRect().width, 1);
  const measurer = document.createElement('div');
  measurer.style.cssText = `
    position:absolute; left:-99999px; top:0;
    width:${width}px; visibility:hidden; pointer-events:none;
  `;
  document.body.appendChild(measurer);

  const sheet = document.createElement('section');
  sheet.className = 'sheet';
  measurer.appendChild(sheet);

  function cleanup() { measurer.remove(); }
  return { sheetForMeasure: sheet, cleanup };
}
function measureNodesHeight(sheetEl, nodes) {
  sheetEl.innerHTML = '';
  nodes.forEach(n => sheetEl.appendChild(n.cloneNode(true)));
  const h = sheetEl.scrollHeight;
  sheetEl.innerHTML = '';
  return h;
}
function getPageMaxHeight() {
  const vh = (window.visualViewport?.height || window.innerHeight);
  const header = document.querySelector('.header');
  const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
  const pad = 12; // room for page badge
  return Math.max(120, Math.round(vh - headerBottom - pad));
}
function addPageBadge(postEl, bookEl) {
  console.log('[addPageBadge] Called. Book children:', bookEl.children.length);
  // Remove any old global badges
  const old = document.querySelector('.page-num-global');
  if (old) old.remove();

  const badge = document.createElement('div');
  badge.className = 'page-num page-num-global';
  document.body.appendChild(badge);

  const total = bookEl.children.length;
  function update() {
    const idx = Math.round(bookEl.scrollLeft / Math.max(bookEl.clientWidth, 1));
    const clamped = Math.min(Math.max(idx, 0), total - 1);
    const txt = `${clamped + 1} / ${total}`;
    // console.log('[addPageBadge] Update:', txt);
    badge.textContent = txt;
  }
  bookEl.addEventListener('scroll', debounce(update, 50), { passive: true });
  window.addEventListener('resize', debounce(update, 100));
  update();

  bookEl.addEventListener('click', (e) => {
    const rect = bookEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.2) snapToPage(bookEl, -1);
    else if (x > rect.width * 0.8) snapToPage(bookEl, +1);
  }, { passive: true });
}
function snapToPage(bookEl, delta) {
  const idx = Math.round(bookEl.scrollLeft / Math.max(bookEl.clientWidth, 1)) + delta;
  const target = Math.min(Math.max(idx, 0), bookEl.children.length - 1);
  bookEl.scrollTo({ left: target * bookEl.clientWidth, behavior: 'smooth' });
}
function getCurrentPostPath() {
  const params = new URLSearchParams(location.search);
  return params.get('p') || '';
}

// -----------------------------
// Routing / URL Logic
// -----------------------------
function makeHref(path) {
  if (path.startsWith('http')) return path;

  // Try to create a "Smart Slug" (?p=name)
  // If path is "posts/name/name.html", we shorten to just "name"
  const matchSlug = path.match(/^posts\/([^\/]+)\/\1\.html$/);
  if (matchSlug) {
    return `?p=${matchSlug[1]}`; // clean: ?p=micro-modelling
  }

  // Fallback: Strip "posts/" prefix and ".html" suffix if present
  let short = path;
  if (short.startsWith('posts/')) short = short.slice(6);
  if (short.endsWith('.html')) short = short.slice(0, -5);

  // Encodes as ?p=folder/file (or just folder if logic permits)
  return `?p=${encodeURIComponent(short)}`;
}

function linkAttrs(path) {
  if (path.startsWith('http')) return 'target="_blank" rel="noreferrer"';
  return '';
}

// -----------------------------
// Post Loader
// -----------------------------
async function renderPost() {
  const params = new URLSearchParams(window.location.search);
  let p = params.get('p');
  const contentEl = document.querySelector('.page');

  // If no "p" param, we are on Home (already handled by index.html + renderList)
  if (!p) return;

  // Clear listing if we are showing a post
  const listEl = document.getElementById('post-list');
  if (listEl) {
    listEl.innerHTML = '';
    // also remove "Blogs" header if present, or hide the section
    const h1 = contentEl.querySelector('h1');
    if (h1 && h1.textContent === 'Blogs') h1.style.display = 'none';

    // HIDE mode button on detail view
    const mBtn = document.querySelector('.mode-btn');
    if (mBtn) mBtn.style.display = 'none';
  }

  // --- Robust Path Reconstruction ---
  // Instead of guessing, we look it up in the index.
  // This handles ANY folder structure (flat, nested, etc) correctly.
  let path = null;

  try {
    const posts = await loadPosts();

    // 1. Exact Match (Legacy links: ?p=posts/foo/bar.html)
    let found = posts.find(x => x.path === p);

    // 2. Slug Match (Clean links: ?p=micro-modelling)
    //    We look for a post whose path *contains* this slug as a folder or filename
    if (!found) {
      // Search for "/slug/" or "/slug.html"
      found = posts.find(x => x.path.includes(`/${p}/`) || x.path.endsWith(`/${p}.html`));
    }

    if (found) path = found.path;
    else {
      if (!p.includes('/')) path = `posts/${p}/${p}.html`;
      else path = `posts/${p}.html`;
    }

  } catch (e) {
    path = `posts/${p}/${p}.html`;
  }

  // Fetch Logic
  // ======= Helpers scoped to this function =======
  function ensureInner() {
    // If not in book mode or on desktop, remove global badge
    if (!window.matchMedia('(max-width: 560px)').matches) {
      const g = document.querySelector('.page-num-global');
      if (g) g.remove();
    }
    const post = contentEl.closest('.post.book-mode');
    if (!post) return;
    post.querySelectorAll('.sheet').forEach(sheet => {
      let inner = sheet.querySelector(':scope > .page-inner');
      if (!inner) {
        inner = document.createElement('div');
        inner.className = 'page-inner';
        while (sheet.firstChild) inner.appendChild(sheet.firstChild);
        sheet.appendChild(inner);
      }
      // clear any previous scaling before measuring
      inner.style.transform = 'none';
      inner.style.zoom = '';
    });
  }

  function setViewportVars() {
    const avail = getPageMaxHeight(); // your existing helper (vv.height - header - pad)
    const px = Math.max(0, Math.floor(avail));
    const root = document.documentElement;
    root.style.setProperty('--vp-h', px + 'px');
    root.style.setProperty('--sheet-h', px + 'px');
    return px;
  }

  const supportsZoom = CSS.supports?.('zoom', '1') || /Safari|iPhone|iPad/i.test(navigator.userAgent);

  // Measure the PAINTED height of an inner (taking scale into account)
  function paintedHeight(inner) {
    // getBoundingClientRect reflects both zoom *and* transforms reliably
    return inner.getBoundingClientRect().height || 0;
  }

  // Apply a temporary scale to measure; returns painted height at that scale.
  function measureAtScale(inner, s) {
    // reset
    inner.style.transform = 'none';
    if (supportsZoom) inner.style.zoom = '';
    // set
    if (s < 1) {
      if (supportsZoom) inner.style.zoom = String(s);
      else inner.style.transform = `scale(${s})`;
    }
    // read
    const h = paintedHeight(inner);
    return h;
  }

  // Binary search the LARGEST s in [minS, 1] such that paintedHeight <= avail - marginPx

  // Binary search the MAX scale that fits, with a smaller safety + a final nudge up
  function fitInnerExactly(inner, avail, options) {
    // leaner safety
    const marginPct = options?.marginPct ?? 0.006; // 0.6% (was 1.2%)
    const marginPx = options?.marginPx ?? 0;     // 0 px (was 1px per DPR)
    const lowerCap = options?.minScale ?? 0.75;  // don’t go microscopic
    const supportsZoom = CSS.supports?.('zoom', '1') || /Safari|iPhone|iPad/i.test(navigator.userAgent);

    // measure helper at a given scale
    function measureAtScale(s) {
      // reset
      inner.style.transform = 'none';
      if (supportsZoom) inner.style.zoom = '';
      // set
      if (s < 1) {
        if (supportsZoom) inner.style.zoom = String(s);
        else inner.style.transform = `scale(${s})`;
      }
      // read
      return paintedHeight(inner);
    }

    // quick path: full size already fits
    if (measureAtScale(1) <= (avail - marginPx)) {
      if (supportsZoom) inner.style.zoom = '';
      inner.style.transform = 'none';
      inner.dataset.scale = '1.000';
      return 1;
    }

    // search the largest s ∈ [lowerCap, 1] that fits
    let lo = lowerCap, hi = 1;
    let best = lo;
    for (let i = 0; i < 14; i++) {            // a few extra iters for precision
      const mid = (lo + hi) / 2;
      const h = measureAtScale(mid);
      if (h <= (avail - marginPx)) { best = mid; lo = mid; }
      else { hi = mid; }
    }

    // optimistic nudge up to reclaim a hair of space (counteracts tiny rounding)
    const nudge = 0.004; // 0.4%
    let finalS = Math.min(1, best + nudge);
    // if nudge pushed us over, step back once
    if (measureAtScale(finalS) > (avail - marginPx)) {
      finalS = best;
      measureAtScale(finalS); // apply exactly
    }

    // lock it in (already applied by measureAtScale)
    inner.dataset.scale = finalS.toFixed(3);
    return finalS;
  }

  function fitAllSheets() {
    ensureInner();
    const avail = setViewportVars();

    const inners = Array.from(
      contentEl.closest('.post.book-mode')?.querySelectorAll('.sheet > .page-inner') || []
    );
    if (!inners.length) return;

    // Fit each page independently to “just enough”
    inners.forEach(inner => {
      fitInnerExactly(inner, avail, { marginPct: 0.012, marginPx: undefined, minScale: 0.70 });
    });
  }

  let fitRAF = 0;
  function chaseFit(ms = 900) {
    const t0 = performance.now();
    cancelAnimationFrame(fitRAF);
    const tick = () => {
      fitAllSheets();
      if (performance.now() - t0 < ms) fitRAF = requestAnimationFrame(tick);
    };
    fitRAF = requestAnimationFrame(tick);
  }

  async function startViewportFitterOnce() {
    if (contentEl._fitStarted) return;
    contentEl._fitStarted = true;

    // two paints to let Safari URL bar + line wraps settle
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    chaseFit(900);

    // follow dynamic viewport changes
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', () => chaseFit(900), { passive: true });
      visualViewport.addEventListener('scroll', () => chaseFit(900), { passive: true });
    } else {
      window.addEventListener('resize', () => chaseFit(900), { passive: true });
      window.addEventListener('scroll', () => chaseFit(900), { passive: true });
    }
    window.addEventListener('orientationchange', () => chaseFit(1200), { passive: true });
    window.addEventListener('pageshow', () => chaseFit(900), { passive: true });
    window.addEventListener('load', () => chaseFit(900), { passive: true });

    // refit on content/layout changes
    if (window.MutationObserver) {
      const mo = new MutationObserver(() => chaseFit(900));
      mo.observe(contentEl, { childList: true, subtree: true });
    }
    if (document.fonts?.ready) document.fonts.ready.then(() => chaseFit(600)).catch(() => { });
    contentEl.querySelectorAll('img,video').forEach(el => {
      el.addEventListener('load', () => chaseFit(600), { once: true });
      el.addEventListener('loadedmetadata', () => chaseFit(600), { once: true });
    });
    if (window.MathJax?.startup?.promise) {
      MathJax.startup.promise.then(() => chaseFit(900)).catch(() => { });
    }
    window.addEventListener('post:ready', () => chaseFit(900));
  }
  // ===============================================

  try {
    const res = await fetch(path); // Default cache for robustness
    if (!res.ok) throw new Error('Not found');
    const html = await res.text();

    contentEl.innerHTML = html;
    // Fade Animation
    contentEl.classList.remove('fade-enter');
    void contentEl.offsetWidth; // force reflow to restart animation
    contentEl.classList.add('fade-enter');

    contentEl.classList.add('post');

    // Stable heading text before any measuring
    normalizeHeadings(contentEl);

    // Typeset math first for accurate heights
    await typesetAfterLoad(contentEl);
    const isPhone = window.matchMedia('(max-width: 560px)').matches;
    if (isPhone) {
      enableSoftBookMode(contentEl);

      // Rebuild-once hooks then refit
      const reflowOnce = debounce(async () => {
        document.documentElement.style.setProperty('--sheet-h', `${getPageMaxHeight()}px`);
        const book = contentEl.querySelector('.book');
        if (book) {
          normalizeHeadings(book);
          const linearHTML = Array.from(book.querySelectorAll('.sheet')).map(s => s.innerHTML).join('');
          contentEl.innerHTML = linearHTML;
        } else if (contentEl._originalHTML) {
          contentEl.innerHTML = contentEl._originalHTML;
          normalizeHeadings(contentEl);
          await typesetAfterLoad(contentEl);
        }
        enableSoftBookMode(contentEl);
        document.dispatchEvent(new CustomEvent('post:ready', { detail: { path } }));
        chaseFit(900);
      }, 150);

      window.addEventListener('orientationchange', reflowOnce, { once: true });
      window.addEventListener('load', reflowOnce, { once: true });
      contentEl.querySelectorAll('img').forEach(img => {
        if (!img.complete) img.addEventListener('load', reflowOnce, { once: true });
      });

      // start per-page exact fitter after pages/typeset exist
      await startViewportFitterOnce();
    }

    // Sidecars after packing
    loadSidecarAssets(path);
    document.dispatchEvent(new CustomEvent('post:ready', { detail: { path } }));

    // Update Document Title
    const h1 = contentEl.querySelector('h1');
    if (h1) document.title = h1.innerText + " — " + "the-puzzler";

    // Final follow-up fit
    if (window.matchMedia('(max-width: 560px)').matches) chaseFit(900);

  } catch (e) {
    console.error(e);
    contentEl.innerHTML = `<p>Failed to load post.</p>`;
  }
}




// -----------------------------
// Font & Mode Controls
// -----------------------------
// -----------------------------
// Mode Logic (Persistent & UI)
// -----------------------------
function applyPreferences() {
  const modeVal = localStorage.getItem('mode');
  // If no manual override, let CSS (prefers-color-scheme) handle it naturally.
  // If manual override exists (light/dark), apply it.
  if (modeVal === 'dark') document.documentElement.setAttribute('data-mode', 'dark');
  else if (modeVal === 'light') document.documentElement.setAttribute('data-mode', 'light');
  else document.documentElement.removeAttribute('data-mode');
}

function initControls() {
  // 1. Always apply saved preference
  applyPreferences();

  // 2. Only render button on Home Page (which has #post-list)
  const isHomePage = !!document.getElementById('post-list');
  if (!isHomePage) return;

  // --- UI Setup ---
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)');

  // Helper: determine effective current mode (manual > system)
  const getEffectiveMode = () => {
    const manual = localStorage.getItem('mode');
    if (manual) return manual;
    return sysDark.matches ? 'dark' : 'light';
  };

  const updateUI = () => {
    // Current state
    const current = getEffectiveMode();

    // Button shows the TARGET icon (Sun if Dark, Moon if Light)
    // ☀ (Sun) / ☾ (Moon)
    const icon = current === 'dark' ? '☀' : '☾';

    const mBtn = document.querySelector('.mode-btn');
    if (mBtn) {
      mBtn.textContent = icon;
      // onclick is static now
    }
  };

  // Create Container
  const container = document.createElement('div');
  container.className = 'theme-controls';

  // Mode Button
  const mBtn = document.createElement('button');
  mBtn.className = 'mode-btn';
  mBtn.style.fontSize = '1.2rem'; // slightly larger icon
  mBtn.style.padding = '4px 8px';

  const toggleAction = () => {
    // Current state
    const current = getEffectiveMode();
    // Target state (what clicking will do)
    const target = current === 'dark' ? 'light' : 'dark';

    localStorage.setItem('mode', target);
    applyPreferences();
    updateUI(); // refresh icon
  };

  mBtn.onclick = toggleAction;
  container.appendChild(mBtn);
  document.body.appendChild(container);

  // Bind Hero Images
  document.querySelectorAll('.hero-img').forEach(img => {
    img.onclick = toggleAction;
  });

  // Initial render
  updateUI();
}

// -----------------------------
// Init
// -----------------------------
addEventListener('DOMContentLoaded', () => {
  console.log('[Init] DOMContentLoaded');
  initControls();

  const params = new URLSearchParams(window.location.search);
  const p = params.get('p');
  console.log('[Init] Params:', p);

  if (p) {
    console.log('[Init] Delegating to renderPost');
    renderPost();
  } else {
    console.log('[Init] Delegating to renderList');
    renderList();
  }
});
