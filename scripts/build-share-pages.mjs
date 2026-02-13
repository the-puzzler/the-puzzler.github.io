import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const POSTS_JSON = path.join(ROOT, 'posts.json');
const OUT_DIR = path.join(ROOT, 'share');

const SITE_NAME = 'the-puzzler';
const SITE_URL = 'https://the-puzzler.github.io';
const DEFAULT_DESC = 'Notes on deep learning, physics and biology.';
const DEFAULT_IMAGE = `${SITE_URL}/ghibme.jpg`;

function isExternalPath(p = '') {
  return /^(https?:)?\/\//i.test(p);
}

function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function slugFromPath(postPath = '') {
  const m = postPath.match(/^posts\/([^/]+)\/\1\.html$/);
  if (m) return m[1];
  const trimmed = postPath.replace(/^posts\//, '').replace(/\.html$/i, '');
  if (!trimmed) return '';
  const parts = trimmed.split('/');
  return parts[parts.length - 1] || '';
}

function toAbsImage(src = '') {
  if (!src) return DEFAULT_IMAGE;
  if (/^https?:\/\//i.test(src)) return src;
  const norm = src.startsWith('/') ? src : `/${src}`;
  return `${SITE_URL}${norm}`;
}

function renderShareHtml({ title, description, image, slug }) {
  const pageTitle = `${title} — ${SITE_NAME}`;
  const postUrl = `${SITE_URL}/?p=${encodeURIComponent(slug)}`;
  const shareUrl = `${SITE_URL}/share/${encodeURIComponent(slug)}.html`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">

  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">

  <link rel="canonical" href="${escapeHtml(shareUrl)}">
  <meta http-equiv="refresh" content="0; url=${escapeHtml(postUrl)}">
  <script>location.replace(${JSON.stringify(postUrl)});</script>
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(postUrl)}">${escapeHtml(postUrl)}</a>...</p>
</body>
</html>
`;
}

async function main() {
  const raw = await fs.readFile(POSTS_JSON, 'utf8');
  const posts = JSON.parse(raw);
  await fs.mkdir(OUT_DIR, { recursive: true });

  let count = 0;
  for (const post of posts) {
    if (!post || isExternalPath(post.path || '')) continue;
    const slug = post.slug || slugFromPath(post.path || '');
    if (!slug) continue;

    const html = renderShareHtml({
      title: post.title || slug,
      description: post.description || DEFAULT_DESC,
      image: toAbsImage(post.social_image || ''),
      slug
    });

    await fs.writeFile(path.join(OUT_DIR, `${slug}.html`), html, 'utf8');
    count += 1;
  }

  console.log(`Generated ${count} share page(s) in /share`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
