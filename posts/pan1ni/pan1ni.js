(function () {
  // Tweet embed: load Twitter's widgets.js once and (re)process embeds whenever
  // the SPA renders this post. Blockquotes get the site's current theme.
  function renderTweets() {
    var embeds = document.querySelectorAll('.pan1ni-tweet .twitter-tweet');
    if (!embeds.length) return;

    var mode = document.documentElement.getAttribute('data-mode');
    var dark = mode === 'dark' ||
      (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    embeds.forEach(function (b) {
      if (!b.getAttribute('data-theme')) b.setAttribute('data-theme', dark ? 'dark' : 'light');
    });

    if (window.twttr && window.twttr.widgets) {
      window.twttr.widgets.load();
      return;
    }
    if (!document.getElementById('twitter-wjs')) {
      var s = document.createElement('script');
      s.id = 'twitter-wjs';
      s.src = 'https://platform.twitter.com/widgets.js';
      s.async = true;
      document.head.appendChild(s);
    }
  }

  // Crop each rendered tweet to its top two-thirds (hides the engagement chrome).
  function cropTweet(widgetEl) {
    var holder = widgetEl && widgetEl.closest && widgetEl.closest('.pan1ni-tweet-clip');
    if (!holder) return;
    var h = widgetEl.offsetHeight;
    if (h > 60) holder.style.maxHeight = Math.max(80, Math.round(h * 2 / 3) - 77) + 'px';
  }

  function bindCrop() {
    if (bindCrop.bound) return;
    if (window.twttr && window.twttr.ready) {
      bindCrop.bound = true;
      window.twttr.ready(function (t) {
        t.events.bind('rendered', function (ev) { cropTweet(ev.target); });
      });
    } else {
      setTimeout(bindCrop, 250);
    }
  }

  // Theme-aware figures: swap light/dark image sources to match the site theme,
  // which can be the OS preference OR the site's manual toggle (data-mode).
  function isDark() {
    var mode = document.documentElement.getAttribute('data-mode');
    return mode === 'dark' ||
      (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function syncThemeImages() {
    var dark = isDark();
    document.querySelectorAll('img.pan1ni-theme-img').forEach(function (img) {
      var want = dark ? img.getAttribute('data-dark') : img.getAttribute('data-light');
      if (want && img.getAttribute('src') !== want) img.setAttribute('src', want);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderTweets);
    document.addEventListener('DOMContentLoaded', syncThemeImages);
  } else {
    renderTweets();
    syncThemeImages();
  }
  document.addEventListener('post:ready', renderTweets);
  document.addEventListener('post:ready', syncThemeImages);

  // React to the site's manual light/dark toggle (flips data-mode on <html>)...
  new MutationObserver(syncThemeImages).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-mode'],
  });
  // ...and to OS theme changes when no manual override is set.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeImages);

  bindCrop();

  // Arcade clip gallery: two stacked <video> elements crossfade so switching
  // clips never flashes. The buffered clip is loaded first, and only once it
  // has a frame do we fade it in over the previous one.
  function initGallery() {
    var root = document.getElementById('pan1ni-gallery');
    if (!root || root.dataset.bound === 'true') return;
    var dataEl = root.querySelector('.pan1ni-gallery-data');
    var videos = Array.prototype.slice.call(root.querySelectorAll('.pan1ni-clip'));
    if (!dataEl || videos.length < 2) return;

    var clips;
    try { clips = JSON.parse(dataEl.textContent); } catch (e) { return; }
    if (!clips || !clips.length) return;
    root.dataset.bound = 'true';

    var noteEl = root.querySelector('.pan1ni-clip-note');
    var statsEl = root.querySelector('.pan1ni-clip-stats');
    var countEl = root.querySelector('.pan1ni-clip-count');
    var idx = 0;
    var active = 0;   // index into videos[] currently shown
    var token = 0;    // guards against rapid clicks racing

    function show(i) {
      idx = (i + clips.length) % clips.length;
      var c = clips[idx];
      if (noteEl) noteEl.textContent = c.note || '';
      if (statsEl) statsEl.textContent =
        'distance to goal: ' + c.dist + '  ·  monsters killed: ' + c.kills;
      if (countEl) countEl.textContent = (idx + 1) + ' / ' + clips.length;

      var cur = videos[active];
      var next = videos[1 - active];
      var my = ++token;

      var swap = function () {
        if (my !== token) return;         // superseded by a newer click
        var p = next.play(); if (p && p.catch) p.catch(function () {});
        next.classList.add('is-active');
        cur.classList.remove('is-active');
        active = 1 - active;
        setTimeout(function () { try { cur.pause(); } catch (e) {} }, 220);
      };

      next.src = c.src;
      next.load();
      next.addEventListener('loadeddata', swap, { once: true });
    }

    root.querySelectorAll('.pan1ni-arcade-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        show(idx + (Number(btn.dataset.dir) || 1));
      });
    });

    show(0);
  }

  // utterances comment thread (matches the other posts on the site)
  function initComments() {
    var host = document.getElementById('post-comments-thread');
    if (!host || host.querySelector('.utterances')) return;
    var s = document.createElement('script');
    s.src = 'https://utteranc.es/client.js';
    s.setAttribute('repo', 'the-puzzler/the-puzzler.github.io');
    s.setAttribute('issue-term', 'pathname');
    s.setAttribute('label', 'comments');
    s.setAttribute('theme', 'github-light');
    s.crossOrigin = 'anonymous';
    s.async = true;
    host.appendChild(s);
  }

  function initPost() {
    initGallery();
    initComments();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPost);
  } else {
    initPost();
  }
  document.addEventListener('post:ready', initPost);
})();
