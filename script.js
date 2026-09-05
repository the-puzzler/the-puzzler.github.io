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

const HOME_FILTER_TAGS = ['LLM', 'RL', 'Robotics', 'Biology', 'World Modelling', 'Generative Modelling', 'Self-Supervision'];
let homePostsCache = [];
const initialHomeParams = new URLSearchParams(location.search);
let activeHomeTags = new Set(initialHomeParams.getAll('topic').filter(tag => HOME_FILTER_TAGS.includes(tag)));
let homeSearchQuery = (initialHomeParams.get('q') || '').trim().toLowerCase();
let homeSort = initialHomeParams.get('sort') === 'likes' ? 'likes' : 'newest';

function syncHomeFilters() {
  const url = new URL(location.href);
  url.searchParams.delete('q');
  url.searchParams.delete('topic');
  url.searchParams.delete('sort');
  if (homeSort === 'likes') url.searchParams.set('sort', 'likes');
  if (homeSearchQuery) url.searchParams.set('q', homeSearchQuery);
  activeHomeTags.forEach(tag => url.searchParams.append('topic', tag));
  history.replaceState(null, '', url);
}

function normalizePostTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map(t => String(t || '').trim()).filter(Boolean);
}

function postMatchesActiveTag(post) {
  if (!activeHomeTags.size) return true;
  const normalized = normalizePostTags(post.tags).map(t => t.toLowerCase());
  for (const selectedTag of activeHomeTags) {
    if (normalized.includes(selectedTag.toLowerCase())) return true;
  }
  return false;
}

function postMatchesSearch(post) {
  if (!homeSearchQuery) return true;
  const haystack = [
    post.title || '',
    post.description || '',
    ...normalizePostTags(post.tags)
  ].join(' ').toLowerCase();
  return haystack.includes(homeSearchQuery);
}

function initHomeSearch() {
  const searchEl = $('#blog-search');
  if (!searchEl || searchEl.dataset.bound === 'true') return;
  searchEl.dataset.bound = 'true';
  searchEl.value = homeSearchQuery;

  const onInput = debounce(() => {
    homeSearchQuery = (searchEl.value || '').trim().toLowerCase();
    renderHomePostList(homePostsCache);
  }, 120);
  searchEl.addEventListener('input', onInput);
}

function renderTagFilters(posts) {
  const filterEl = $('#blog-tag-filters');
  if (!filterEl) return;

  const counts = new Map(HOME_FILTER_TAGS.map(tag => [tag, 0]));
  posts.forEach(post => {
    normalizePostTags(post.tags).forEach(tag => {
      const canonical = HOME_FILTER_TAGS.find(t => t.toLowerCase() === tag.toLowerCase());
      if (canonical) counts.set(canonical, counts.get(canonical) + 1);
    });
  });

  const buttons = [
    { tag: '', label: `All (${posts.length})` },
    ...HOME_FILTER_TAGS.filter(tag => (counts.get(tag) || 0) > 0).map(tag => ({ tag, label: `${tag} (${counts.get(tag)})` }))
  ];

  filterEl.innerHTML = buttons.map(({ tag, label }) => {
    const isActive = tag ? activeHomeTags.has(tag) : activeHomeTags.size === 0;
    return `<button class="tag-chip${isActive ? ' is-active' : ''}" data-tag="${tag}" type="button" aria-pressed="${isActive}">${label}</button>`;
  }).join('');

  $$('.tag-chip', filterEl).forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag || '';
      if (!tag) {
        activeHomeTags.clear();
      } else if (activeHomeTags.has(tag)) {
        activeHomeTags.delete(tag);
      } else {
        activeHomeTags.add(tag);
      }
      renderTagFilters(homePostsCache);
      renderHomePostList(homePostsCache);
      $$('.tag-chip', filterEl).find(button => button.dataset.tag === tag)?.focus();
    });
  });
}

function renderHomePostList(posts) {
  const listEl = $('#post-list');
  if (!listEl) return;

  const filtered = posts
    .filter(postMatchesActiveTag)
    .filter(postMatchesSearch)
    .sort((a, b) => {
      if (homeSort === 'likes') {
        const count = post => /^\d+$/.test(post.x_post?.id || '') && Number.isInteger(post.x_post?.likes) && post.x_post.likes >= 0 ? post.x_post.likes : -1;
        const likesDiff = count(b) - count(a);
        if (likesDiff !== 0) return likesDiff;
      }
      return new Date(b.date) - new Date(a.date);
    });
  syncHomeFilters();
  const status = $('#blog-result-count');
  if (status) status.textContent = homeSearchQuery || activeHomeTags.size
    ? `${filtered.length} of ${posts.length} articles`
    : `${posts.length} articles`;
  const clear = $('#blog-clear-filters');
  if (clear) clear.hidden = !homeSearchQuery && !activeHomeTags.size;
  if (!filtered.length) {
    listEl.innerHTML = '<li class="item"><div class="item-main"><p>No posts match the current filters.</p></div></li>';
    return;
  }

  listEl.innerHTML = filtered.map(p => {
    const href = makeHref(p.path || "");
    const attrs = linkAttrs(p.path || "");
    const xPost = p.x_post;
    const likesHtml = xPost && /^\d+$/.test(xPost.id) && Number.isInteger(xPost.likes) && xPost.likes >= 0
      ? `<a class="item-likes" href="https://x.com/MozarellaPesto/status/${xPost.id}" target="_blank" rel="noreferrer" title="Announcement likes · checked ${String(xPost.checked_at || '').replace(/[^0-9-]/g, '')}" aria-label="${xPost.likes} likes on X announcement"><span aria-hidden="true">♡</span> ${xPost.likes.toLocaleString()} on X</a>`
      : '';
    const tags = normalizePostTags(p.tags);
    const tagsHtml = tags.length
      ? `<span class="item-tags">${tags.map(tag => `<span class="item-tag">${tag}</span>`).join('')}</span>`
      : '';
    const thumb = p.social_image
      ? `
        <a class="item-thumb-link" href="${href}" ${attrs} aria-label="${p.title}">
          <img class="item-thumb" src="${p.social_image}" alt="${p.title}" loading="lazy" decoding="async">
        </a>
      `
      : '';
    return `
      <li class="item">
        <div class="item-main">
          <h3><a href="${href}" ${attrs}>${p.title}</a></h3>
          <div class="item-meta">
            <small>${formatDate(p.date)}</small>
            ${tagsHtml}
            ${likesHtml}
          </div>
          ${p.description ? `<p>${p.description}</p>` : ``}
        </div>
        ${thumb}
      </li>
    `;
  }).join('');
}

async function renderList() {
  const listEl = $('#post-list');
  if (!listEl) return;

  homePostsCache = await loadPosts();
  const sortEl = $('#blog-sort');
  if (sortEl) {
    sortEl.value = homeSort;
    sortEl.disabled = false;
    sortEl.onchange = () => {
      homeSort = sortEl.value === 'likes' ? 'likes' : 'newest';
      renderHomePostList(homePostsCache);
    };
  }
  let feedback = $('#blog-results');
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.id = 'blog-results';
    feedback.className = 'blog-results';
    feedback.innerHTML = '<span id="blog-result-count" role="status" aria-live="polite"></span><button id="blog-clear-filters" type="button" aria-label="Clear search and filters" hidden>Clear</button>';
    $('.blog-heading-row').appendChild(feedback);
    $('#blog-clear-filters').onclick = () => {
      homeSearchQuery = '';
      activeHomeTags.clear();
      $('#blog-search').value = '';
      renderTagFilters(homePostsCache);
      renderHomePostList(homePostsCache);
      $('#blog-search').focus();
    };
  }
  initHomeSearch();
  renderTagFilters(homePostsCache);
  renderHomePostList(homePostsCache);
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

async function resolveHtmlPartials(root, basePath) {
  const includeAttr = 'data-include-html';
  const includeNodes = $$(`[${includeAttr}]`, root);
  if (!includeNodes.length) return;

  const cache = new Map();
  const fetchInclude = async (src) => {
    if (!cache.has(src)) {
      cache.set(src, fetch(src).then((res) => {
        if (!res.ok) throw new Error(`Failed to load include: ${src}`);
        return res.text();
      }));
    }
    return cache.get(src);
  };

  for (const node of includeNodes) {
    const rel = node.getAttribute(includeAttr);
    if (!rel) continue;

    const src = new URL(rel, new URL(basePath, window.location.href)).toString();
    const html = await fetchInclude(src);
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    node.replaceWith(tpl.content);
  }

  if ($$(`[${includeAttr}]`, root).length) {
    await resolveHtmlPartials(root, basePath);
  }
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

let tocTeardown = null;

function ensurePostTOCScaffold(contentEl) {
  let toc = document.getElementById('post-toc');
  let nav = document.getElementById('toc-nav');
  if (toc && nav) return { toc, nav };

  const page = contentEl?.closest('.page');
  if (!page) return { toc: null, nav: null };

  let layout = page.closest('.post-layout');
  if (!layout) {
    layout = document.createElement('main');
    layout.className = 'post-layout';
    page.parentNode.insertBefore(layout, page);
    layout.appendChild(page);
  }

  if (!toc) {
    toc = document.createElement('aside');
    toc.id = 'post-toc';
    toc.className = 'post-toc';
    toc.setAttribute('aria-label', 'Table of contents');
    toc.hidden = true;
    toc.innerHTML = '<div class="toc-card"><h2>Contents</h2><nav id="toc-nav"></nav></div>';
    layout.appendChild(toc);
  }

  nav = toc.querySelector('#toc-nav');
  return { toc, nav };
}

function clearPostTOC() {
  if (typeof tocTeardown === 'function') tocTeardown();
  tocTeardown = null;
  const toc = document.getElementById('post-toc');
  const nav = document.getElementById('toc-nav');
  if (nav) nav.innerHTML = '';
  if (toc) toc.hidden = true;
}

function slugifyHeading(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

function buildPostTOC(contentEl) {
  const { toc, nav } = ensurePostTOCScaffold(contentEl);
  if (!toc || !nav || !contentEl) return;

  clearPostTOC();
  const cardVariant = Boolean(contentEl.querySelector('[data-toc-variant="card"]'));
  toc.classList.toggle('post-toc--card', cardVariant);
  let toggle = toc.querySelector('.toc-toggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toc-toggle';
    toggle.textContent = 'On this page';
    toggle.setAttribute('aria-controls', 'toc-panel');
    toc.prepend(toggle);
  }
  toc.querySelector('.toc-card').id = 'toc-panel';
  toggle.setAttribute('aria-expanded', 'false');
  toc.classList.remove('is-open');
  toggle.onclick = () => {
    const open = toc.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  };

  const headings = $$('h2, h3', contentEl)
    .filter(h => h.textContent.trim().length && !h.hasAttribute('data-toc-skip'));
  if (headings.length < 2) return;

  const usedIds = new Set();
  for (const h of headings) {
    if (!h.id) {
      const base = slugifyHeading(h.textContent);
      let id = base;
      let i = 2;
      while (usedIds.has(id) || document.getElementById(id)) id = `${base}-${i++}`;
      h.id = id;
    }
    usedIds.add(h.id);
  }

  const ul = document.createElement('ul');
  ul.className = 'toc-list';

  for (const h of headings) {
    const li = document.createElement('li');
    li.className = (h.tagName === 'H3' && !h.hasAttribute('data-toc-top')) ? 'toc-h3' : 'toc-h2';
    const a = document.createElement('a');
    const headingUrl = `${location.pathname}${location.search}#${h.id}`;
    a.href = headingUrl;
    a.textContent = h.textContent.trim();
    a.addEventListener('click', (e) => {
      e.preventDefault();
      toc.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      h.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
      history.replaceState(null, '', headingUrl);
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
      // Collapse hover panel after mouse click (avoid sticky focus-within state)
      a.blur();
    });
    li.appendChild(a);
    ul.appendChild(li);
  }

  nav.appendChild(ul);
  toc.hidden = false;
  const tocCard = toc.querySelector('.toc-card');
  const updateCardScrollHint = () => {
    if (!tocCard) return;
    const canScroll = tocCard.scrollHeight - tocCard.clientHeight > 6;
    const atEnd = tocCard.scrollTop + tocCard.clientHeight >= tocCard.scrollHeight - 4;
    tocCard.classList.toggle('is-scrollable', canScroll);
    tocCard.classList.toggle('is-scroll-end', !canScroll || atEnd);
  };
  if (tocCard) tocCard.addEventListener('scroll', updateCardScrollHint, { passive: true });

  let roller = toc.querySelector('.toc-roller');
  if (cardVariant) {
    roller?.remove();
    roller = null;
  } else if (!roller) {
    roller = document.createElement('div');
    roller.className = 'toc-roller';
    roller.innerHTML = `
      <div class="toc-roller-line toc-roller-prev2"></div>
      <div class="toc-roller-line toc-roller-prev"></div>
      <div class="toc-roller-line toc-roller-current"></div>
      <div class="toc-roller-line toc-roller-next"></div>
      <div class="toc-roller-line toc-roller-next2"></div>
    `;
    toc.insertBefore(roller, toc.firstChild);
  }

  const links = $$('a', ul);
  const byId = new Map(links.map(a => [new URL(a.href).hash.slice(1), a]));
  const topOffset = 120;
  // Keep TOC opening position aligned to the current section without
  // continuously re-centering during regular scrolling/clicking.
  const revealActiveOnOpen = () => {
    if (!tocCard) return;
    const activeLink = tocCard.querySelector('.toc-list a.active');
    if (!activeLink) return;
    const top = tocCard.scrollTop;
    const bottom = top + tocCard.clientHeight;
    const linkTop = activeLink.offsetTop - 8;
    const linkBottom = linkTop + activeLink.offsetHeight + 16;
    if (linkTop < top || linkBottom > bottom) {
      tocCard.scrollTop = Math.max(0, activeLink.offsetTop - tocCard.clientHeight * 0.42);
      updateCardScrollHint();
    }
  };

  const updateActive = () => {
    let activeIndex = 0;
    for (let i = 0; i < headings.length; i++) {
      if (headings[i].getBoundingClientRect().top - topOffset <= 0) activeIndex = i;
      else break;
    }
    const active = headings[activeIndex];
    links.forEach(a => { a.classList.remove('active'); a.removeAttribute('aria-current'); });
    const activeLink = byId.get(active.id);
    activeLink?.classList.add('active');
    activeLink?.setAttribute('aria-current', 'location');
    if (roller) {
      roller.querySelector('.toc-roller-prev2').textContent = headings[activeIndex - 2]?.textContent.trim() || '';
      roller.querySelector('.toc-roller-prev').textContent = headings[activeIndex - 1]?.textContent.trim() || '';
      roller.querySelector('.toc-roller-current').textContent = active.textContent.trim() || 'Contents';
      roller.querySelector('.toc-roller-next').textContent = headings[activeIndex + 1]?.textContent.trim() || '';
      roller.querySelector('.toc-roller-next2').textContent = headings[activeIndex + 2]?.textContent.trim() || '';
    }
    updateCardScrollHint();
  };

  window.addEventListener('scroll', updateActive, { passive: true });
  window.addEventListener('resize', updateActive);
  if (tocCard) tocCard.addEventListener('mouseenter', revealActiveOnOpen);
  updateActive();
  requestAnimationFrame(updateCardScrollHint);

  tocTeardown = () => {
    window.removeEventListener('scroll', updateActive);
    window.removeEventListener('resize', updateActive);
    if (tocCard) tocCard.removeEventListener('scroll', updateCardScrollHint);
    if (tocCard) tocCard.removeEventListener('mouseenter', revealActiveOnOpen);
  };
}

function getCurrentPostPath() {
  const params = new URLSearchParams(location.search);
  return params.get('p') || document.body?.dataset.staticPostPath || '';
}

function slugFromPostPath(postPath = '') {
  const clean = String(postPath || '').replace(/^\/+/, '');
  const m = clean.match(/^posts\/([^\/]+)\/\1\.html$/);
  if (m) return m[1];
  const noPrefix = clean.replace(/^posts\//, '').replace(/\.html$/i, '');
  const parts = noPrefix.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function setMetaContent(selector, attributes, content) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

async function applyLegacyPostMetadata(path, fallbackTitle = '') {
  const posts = await loadPosts().catch(() => []);
  const post = posts.find((candidate) => candidate.path === path) || {};
  const slug = post.slug || slugFromPostPath(path);
  if (!slug) return;

  const title = post.title || fallbackTitle || slug;
  const description = post.description || 'Notes on deep learning, physics and biology.';
  const canonicalUrl = `${location.origin}/blog/${encodeURIComponent(slug)}/`;
  const imageUrl = post.social_image
    ? new URL(post.social_image, `${location.origin}/`).toString()
    : `${location.origin}/ghibme.jpg`;

  document.title = `${title} | the-puzzler`;
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;

  setMetaContent('meta[name="description"]', { name: 'description' }, description);
  // This function only serves old query-string routes. Keep those routes out of
  // the index while their links and redirect consolidate on the static page.
  setMetaContent('meta[name="robots"]', { name: 'robots' }, 'noindex, follow');
  setMetaContent('meta[property="og:title"]', { property: 'og:title' }, title);
  setMetaContent('meta[property="og:description"]', { property: 'og:description' }, description);
  setMetaContent('meta[property="og:type"]', { property: 'og:type' }, 'article');
  setMetaContent('meta[property="og:url"]', { property: 'og:url' }, canonicalUrl);
  setMetaContent('meta[property="og:image"]', { property: 'og:image' }, imageUrl);
  setMetaContent('meta[name="twitter:title"]', { name: 'twitter:title' }, title);
  setMetaContent('meta[name="twitter:description"]', { name: 'twitter:description' }, description);
  setMetaContent('meta[name="twitter:image"]', { name: 'twitter:image' }, imageUrl);
}

async function getShareUrlForCurrentPost() {
  const p = getCurrentPostPath();
  if (!p) return location.href;

  // If URL is already a short slug (?p=curriculum-is-key), use it directly.
  if (!p.includes('/') && !p.endsWith('.html')) {
    return `${location.origin}/blog/${encodeURIComponent(p)}/`;
  }

  // For legacy/full paths, resolve through posts.json to find canonical slug.
  try {
    const posts = await loadPosts();
    let found = posts.find(x => x.path === p);
    if (!found) {
      found = posts.find(x => x.path.includes(`/${p}/`) || x.path.endsWith(`/${p}.html`));
    }
    const slug = found ? slugFromPostPath(found.path || '') : slugFromPostPath(p);
    if (slug) return `${location.origin}/blog/${encodeURIComponent(slug)}/`;
  } catch (e) {
    // Fall through to local slug parsing fallback.
  }

  const fallbackSlug = slugFromPostPath(p);
  if (fallbackSlug) return `${location.origin}/blog/${encodeURIComponent(fallbackSlug)}/`;
  return location.href;
}

async function resolvePostPath(p) {
  try {
    const posts = await loadPosts();

    // 1. Exact Match (Legacy links: ?p=posts/foo/bar.html)
    let found = posts.find(x => x.path === p);

    // 2. Slug Match (Clean links: ?p=micro-modelling)
    //    We look for a post whose path *contains* this slug as a folder or filename
    if (!found) {
      found = posts.find(x => x.path.includes(`/${p}/`) || x.path.endsWith(`/${p}.html`));
    }

    if (found) return found.path;
    if (!p.includes('/')) return `posts/${p}/${p}.html`;
    return `posts/${p}.html`;
  } catch (e) {
    return `posts/${p}/${p}.html`;
  }
}

// -----------------------------
// Raw text extraction (copy post for LLMs)
// -----------------------------
function extractPlainText(rootEl) {
  $$('script, style, noscript, svg, canvas, button, [aria-hidden="true"]', rootEl).forEach(n => n.remove());

  // Collapse source-formatting whitespace, except inside <pre>
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  for (const t of textNodes) {
    if (!t.parentElement?.closest('pre')) t.textContent = t.textContent.replace(/\s+/g, ' ');
  }

  // Shield <pre> content from the line-level whitespace cleanup below
  const preTexts = [];
  $$('pre', rootEl).forEach((pre, i) => {
    preTexts.push(pre.textContent.replace(/\s+$/, ''));
    pre.textContent = `\u0000PRE${i}\u0000`;
  });

  $$('h1, h2, h3, h4, h5, h6', rootEl).forEach(h => {
    h.prepend('\n' + '#'.repeat(Number(h.tagName[1])) + ' ');
  });
  $$('li', rootEl).forEach(li => li.prepend('- '));
  $$('hr', rootEl).forEach(el => el.replaceWith('\n---\n'));
  $$('p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, figcaption, tr, figure', rootEl).forEach(el => {
    el.append('\n');
  });

  return rootEl.textContent
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/\u0000PRE(\d+)\u0000/g, (_, i) => preTexts[Number(i)]);
}

async function copyCurrentPostRawText() {
  const p = getCurrentPostPath();
  if (!p) throw new Error('No post loaded');
  const path = await resolvePostPath(p);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  const html = await res.text();

  // Parse the raw source (math is still TeX here, not MathJax output)
  const holder = document.createElement('div');
  holder.innerHTML = html;
  await resolveHtmlPartials(holder, path);

  const text = extractPlainText(holder);
  await navigator.clipboard.writeText(text);
}

// -----------------------------
// Routing / URL Logic
// -----------------------------
function makeHref(path) {
  if (path.startsWith('http')) return path;

  // Canonical static article pages. Legacy ?p= links remain supported by
  // renderPost(), but all new internal links point at indexable HTML.
  const matchSlug = path.match(/^posts\/([^\/]+)\/\1\.html$/);
  if (matchSlug) {
    return `/blog/${encodeURIComponent(matchSlug[1])}/`;
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
  if (!p) {
    if (contentEl) delete contentEl.dataset.post;
    clearPostTOC();
    return;
  }

  // Clear listing if we are showing a post
  const listEl = document.getElementById('post-list');
  if (listEl) {
    listEl.innerHTML = '';
    // also remove "Blogs" header if present, or hide the section
    const h1 = contentEl.querySelector('h1');
    if (h1 && h1.textContent === 'Blogs') h1.style.display = 'none';

  }

  // --- Robust Path Reconstruction ---
  // Instead of guessing, we look it up in the index.
  // This handles ANY folder structure (flat, nested, etc) correctly.
  const path = await resolvePostPath(p);

  try {
    const res = await fetch(path); // Default cache for robustness
    if (!res.ok) throw new Error('Not found');
    const html = await res.text();

    contentEl.innerHTML = html;
    // Mark which post is active so per-post stylesheets (which persist across
    // SPA navigation) can scope rules to their own post.
    const slugMatch = path.match(/^posts\/([^\/]+)\//);
    contentEl.dataset.post = slugMatch ? slugMatch[1] : p;
    await resolveHtmlPartials(contentEl, path);
    // Fade Animation
    contentEl.classList.remove('fade-enter');
    void contentEl.offsetWidth; // force reflow to restart animation
    contentEl.classList.add('fade-enter');

    contentEl.classList.add('post');

    // Stable heading text before any measuring
    normalizeHeadings(contentEl);
    buildPostTOC(contentEl);

    // Typeset article math
    await typesetAfterLoad(contentEl);

    loadSidecarAssets(path);
    document.dispatchEvent(new CustomEvent('post:ready', { detail: { path } }));

    // Update title and point this legacy SPA route at its static canonical page.
    const h1 = contentEl.querySelector('h1');
    await applyLegacyPostMetadata(path, h1?.innerText || '');

  } catch (e) {
    console.error(e);
    clearPostTOC();
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
  applyPreferences();

  const params = new URLSearchParams(window.location.search);
  const isHomePage = !params.get('p') && !document.body?.dataset.staticPostPath;

  // Create Container
  let container = document.querySelector('.theme-controls');
  if (!container) {
    container = document.createElement('div');
    container.className = 'theme-controls';
    document.body.appendChild(container);
  } else {
    container.innerHTML = '';
  }

  // === 1. Controls for HOME PAGE (Theme Only) ===
  if (isHomePage) {
    const themeBtn = document.createElement('button');
    themeBtn.className = 'mode-btn';
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
    const getEffectiveMode = () => {
      const manual = localStorage.getItem('mode');
      if (manual) return manual;
      return sysDark.matches ? 'dark' : 'light';
    };
    const updateThemeUI = () => {
      const current = getEffectiveMode();
      themeBtn.textContent = current === 'dark' ? '☀' : '☾';
      themeBtn.setAttribute('aria-label', current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    };
    themeBtn.onclick = () => {
      const current = getEffectiveMode();
      const target = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem('mode', target);
      applyPreferences();
      updateThemeUI();
    };
    updateThemeUI();
    container.appendChild(themeBtn);

    // Hero images only exist on home page typically, but safe to bind if present
    document.querySelectorAll('.hero-img').forEach(img => {
      img.onclick = themeBtn.onclick;
    });
  }

  // === 2. Controls for POST PAGE (Home, sharing, and copying) ===
  if (!isHomePage) {
    // A. Home Button
    const homeBtn = document.createElement('a');
    homeBtn.className = 'mode-btn';
    homeBtn.innerHTML = '🏠';
    homeBtn.href = 'index.html';
    homeBtn.title = 'Home';
    homeBtn.style.textDecoration = 'none';
    homeBtn.style.lineHeight = '1';
    container.appendChild(homeBtn);

    // B. Share Link Button (copy the canonical blog URL)
    const shareBtn = document.createElement('button');
    shareBtn.className = 'mode-btn';
    shareBtn.type = 'button';
    shareBtn.textContent = '🔗';
    shareBtn.title = 'Copy share link';
    shareBtn.style.lineHeight = '1';
    shareBtn.addEventListener('click', async () => {
      const prev = shareBtn.textContent;
      const prevTitle = shareBtn.title;
      try {
        const shareUrl = await getShareUrlForCurrentPost();
        await navigator.clipboard.writeText(shareUrl);
        shareBtn.textContent = '✓';
        shareBtn.title = 'Copied';
      } catch (err) {
        shareBtn.textContent = '!';
        shareBtn.title = 'Copy failed';
      }
      setTimeout(() => {
        shareBtn.textContent = prev;
        shareBtn.title = prevTitle;
      }, 900);
    });
    container.appendChild(shareBtn);

    // C. Copy Raw Text Button (paste post into LLMs)
    const llmBtn = document.createElement('button');
    llmBtn.className = 'mode-btn';
    llmBtn.type = 'button';
    llmBtn.textContent = '📋 LLM';
    llmBtn.title = 'Copy raw text (for LLMs)';
    llmBtn.style.lineHeight = '1';
    llmBtn.style.whiteSpace = 'nowrap';
    llmBtn.addEventListener('click', async () => {
      const prev = llmBtn.textContent;
      const prevTitle = llmBtn.title;
      try {
        await copyCurrentPostRawText();
        llmBtn.textContent = '✓';
        llmBtn.title = 'Copied';
      } catch (err) {
        console.error(err);
        llmBtn.textContent = '!';
        llmBtn.title = 'Copy failed';
      }
      setTimeout(() => {
        llmBtn.textContent = prev;
        llmBtn.title = prevTitle;
      }, 900);
    });
    container.appendChild(llmBtn);


  }
}

// -----------------------------
// Init
// -----------------------------
async function initStaticPost(path) {
  const contentEl = document.querySelector('.page');
  if (!contentEl) return;

  contentEl.classList.add('post');
  const slugMatch = path.match(/^posts\/([^\/]+)\//);
  if (slugMatch) contentEl.dataset.post = slugMatch[1];
  normalizeHeadings(contentEl);
  buildPostTOC(contentEl);
  await typesetAfterLoad(contentEl);
  document.dispatchEvent(new CustomEvent('post:ready', { detail: { path } }));
}

addEventListener('DOMContentLoaded', () => {
  console.log('[Init] DOMContentLoaded');
  initControls();

  const params = new URLSearchParams(window.location.search);
  const p = params.get('p');
  const staticPostPath = document.body?.dataset.staticPostPath || '';
  console.log('[Init] Params:', p);

  if (staticPostPath) {
    console.log('[Init] Initializing static post');
    initStaticPost(staticPostPath);
  } else if (p) {
    console.log('[Init] Delegating to renderPost');
    renderPost();
  } else {
    console.log('[Init] Delegating to renderList');
    renderList();
  }
});
