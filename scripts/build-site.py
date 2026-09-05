#!/usr/bin/env python3
"""Build crawlable article pages, the homepage seed list, and SEO discovery files."""

from __future__ import annotations

import html
import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parent.parent
POSTS_JSON = ROOT / "posts.json"
SHARE_DIR = ROOT / "share"
BLOG_DIR = ROOT / "blog"
INDEX_HTML = ROOT / "index.html"
SITE_NAME = "the-puzzler"
SITE_URL = "https://the-puzzler.github.io"
DEFAULT_DESCRIPTION = "Notes on deep learning, physics and biology."
DEFAULT_IMAGE = f"{SITE_URL}/ghibme.jpg"
SCRIPT_VERSION = "20260830seo3"


def is_external(path: str) -> bool:
    return bool(re.match(r"^(?:https?:)?//", path, re.I))


def slug_from_path(path: str) -> str:
    match = re.match(r"^posts/([^/]+)/\1\.html$", path)
    if match:
        return match.group(1)
    trimmed = re.sub(r"^posts/", "", path)
    trimmed = re.sub(r"\.html?$", "", trimmed, flags=re.I)
    return trimmed.rstrip("/").split("/")[-1] if trimmed else ""


def absolute_url(path: str, fallback: str = "") -> str:
    value = path or fallback
    if re.match(r"^https?://", value, re.I):
        return value
    return f"{SITE_URL}/" + value.lstrip("/")


def expand_includes(source: str, source_path: Path) -> str:
    pattern = re.compile(
        r'<div\s+data-include-html=(?P<q>["\'])(?P<src>[^"\']+)(?P=q)\s*>\s*</div>',
        re.I,
    )

    while True:
        match = pattern.search(source)
        if not match:
            return source
        include_path = (source_path.parent / match.group("src")).resolve()
        if not include_path.is_relative_to(ROOT) or not include_path.is_file():
            raise FileNotFoundError(f"Missing or unsafe include: {include_path}")
        replacement = expand_includes(include_path.read_text(encoding="utf-8"), include_path)
        source = source[: match.start()] + replacement + source[match.end() :]


def rewrite_article_links(source: str, slug: str) -> str:
    def rewrite_query(match: re.Match[str]) -> str:
        quote_char, value = match.group(1), match.group(2)
        route = value[3:]
        target, separator, fragment = route.partition("#")
        target_slug = quote(target, safe="")
        suffix = f"#{fragment}" if separator else ""
        return f'href={quote_char}/blog/{target_slug}/{suffix}{quote_char}'

    source = re.sub(r'href=(["\'])(\?p=[^"\']+)\1', rewrite_query, source)

    def rewrite_hash(match: re.Match[str]) -> str:
        quote_char, value = match.group(1), match.group(2)
        return f'href={quote_char}/blog/{quote(slug, safe="")}/{value}{quote_char}'

    return re.sub(r'href=(["\'])(#[^"\']+)\1', rewrite_hash, source)


def render_article_page(post: dict, article_html: str, sidecar_css: bool, sidecar_js: bool) -> str:
    title = str(post.get("title") or slug_from_path(post["path"]))
    description = str(post.get("description") or DEFAULT_DESCRIPTION)
    slug = str(post.get("slug") or slug_from_path(post["path"]))
    date = str(post.get("date") or "")
    image = absolute_url(str(post.get("social_image") or ""), DEFAULT_IMAGE)
    canonical = f"{SITE_URL}/blog/{quote(slug, safe='')}/"
    path = str(post["path"])
    sidecar_base = re.sub(r"\.html?$", "", path, flags=re.I)
    tags = [str(tag) for tag in post.get("tags", []) if str(tag).strip()]

    structured = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": title,
        "description": description,
        "datePublished": date,
        "dateModified": date,
        "mainEntityOfPage": canonical,
        "url": canonical,
        "image": [image],
        "keywords": tags,
        "author": {"@type": "Person", "name": "Matteo Peluso"},
        "publisher": {"@type": "Organization", "name": SITE_NAME},
    }
    structured_json = json.dumps(structured, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    css_tag = f'  <link rel="stylesheet" href="/{html.escape(sidecar_base)}.css">\n' if sidecar_css else ""
    js_tag = f'  <script type="module" src="/{html.escape(sidecar_base)}.js"></script>\n' if sidecar_js else ""
    article_html = rewrite_article_links(article_html, slug)

    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="/">
  <title>{html.escape(title)} | {SITE_NAME}</title>
  <meta name="description" content="{html.escape(description, quote=True)}">
  <meta name="author" content="Matteo Peluso">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="{html.escape(canonical, quote=True)}">

  <meta property="og:title" content="{html.escape(title, quote=True)}">
  <meta property="og:description" content="{html.escape(description, quote=True)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="{SITE_NAME}">
  <meta property="og:url" content="{html.escape(canonical, quote=True)}">
  <meta property="og:image" content="{html.escape(image, quote=True)}">
  <meta property="article:published_time" content="{html.escape(date, quote=True)}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{html.escape(title, quote=True)}">
  <meta name="twitter:description" content="{html.escape(description, quote=True)}">
  <meta name="twitter:image" content="{html.escape(image, quote=True)}">

  <script type="application/ld+json">{structured_json}</script>
  <link rel="icon" href="data:image/svg+xml,&lt;svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'&gt;&lt;text y='.9em' font-size='90'&gt;M&lt;/text&gt;&lt;/svg&gt;">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="/styles.css?v=20260728a">
{css_tag}  <script defer src="/script.js?v={SCRIPT_VERSION}"></script>
  <script>
    window.MathJax = {{
      tex: {{
        inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
        displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']]
      }}
    }};
  </script>
  <script id="mathjax" src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" async></script>
{js_tag}  <script async src="https://www.googletagmanager.com/gtag/js?id=G-QJZJKLZKHH"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag() {{ dataLayer.push(arguments); }}
    gtag('js', new Date());
    gtag('config', 'G-QJZJKLZKHH');
  </script>
</head>
<body data-static-post-path="{html.escape(path, quote=True)}" data-static-post-slug="{html.escape(slug, quote=True)}">
  <div class="container">
    <header class="header">
      <div class="brand">the-puzzler <span class="badge">Matteo</span></div>
      <nav class="nav" aria-label="Primary navigation">
        <a href="https://x.com/MozarellaPesto" target="_blank" rel="noreferrer">X</a>
        <a href="https://github.com/the-puzzler" target="_blank" rel="noreferrer">GitHub</a>
        <a href="/">Home</a>
      </nav>
    </header>

    <section class="page post" data-post="{html.escape(slug, quote=True)}">
{article_html}
    </section>

    <footer class="footer">
      <span>© <span id="y"></span> the-puzzler</span>
      <script>document.getElementById('y').textContent = new Date().getFullYear()</script>
    </footer>
  </div>
</body>
</html>
'''


def render_legacy_share_page(post: dict) -> str:
    title = str(post.get("title") or slug_from_path(post["path"]))
    description = str(post.get("description") or DEFAULT_DESCRIPTION)
    slug = str(post.get("slug") or slug_from_path(post["path"]))
    image = absolute_url(str(post.get("social_image") or ""), DEFAULT_IMAGE)
    canonical = f"{SITE_URL}/blog/{quote(slug, safe='')}/"
    redirect_target = f"/blog/{quote(slug, safe='')}/"
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)} | {SITE_NAME}</title>
  <meta name="description" content="{html.escape(description, quote=True)}">
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="{html.escape(canonical, quote=True)}">

  <meta property="og:title" content="{html.escape(title, quote=True)}">
  <meta property="og:description" content="{html.escape(description, quote=True)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="{SITE_NAME}">
  <meta property="og:url" content="{html.escape(canonical, quote=True)}">
  <meta property="og:image" content="{html.escape(image, quote=True)}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{html.escape(title, quote=True)}">
  <meta name="twitter:description" content="{html.escape(description, quote=True)}">
  <meta name="twitter:image" content="{html.escape(image, quote=True)}">

  <meta http-equiv="refresh" content="0; url={html.escape(redirect_target, quote=True)}">
  <script>location.replace({json.dumps(redirect_target)});</script>
</head>
<body>
  <p>This article now lives at <a href="{html.escape(redirect_target, quote=True)}">{html.escape(canonical)}</a>.</p>
</body>
</html>
'''


def format_date(value: str) -> str:
    try:
        return datetime.strptime(value, "%Y-%m-%d").strftime("%d %b %Y")
    except ValueError:
        return value


def render_home_item(post: dict) -> str:
    path = str(post.get("path") or "")
    external = is_external(path)
    slug = str(post.get("slug") or slug_from_path(path))
    href = path if external else f"/blog/{quote(slug, safe='')}/"
    extra = ' target="_blank" rel="noreferrer"' if external else ""
    title = html.escape(str(post.get("title") or slug))
    tags = "".join(f'<span class="item-tag">{html.escape(str(tag))}</span>' for tag in post.get("tags", []))
    tags_html = f'<span class="item-tags">{tags}</span>' if tags else ""
    x_post = post.get("x_post") or {}
    likes_html = ""
    if re.fullmatch(r"\d+", str(x_post.get("id", ""))) and type(x_post.get("likes")) is int and x_post["likes"] >= 0:
        likes = x_post["likes"]
        checked = html.escape(str(x_post.get("checked_at", "")), quote=True)
        likes_html = (
            f'<a class="item-likes" href="https://x.com/MozarellaPesto/status/{x_post["id"]}" '
            f'target="_blank" rel="noreferrer" title="Announcement likes · checked {checked}" '
            f'aria-label="{likes} likes on X announcement"><span aria-hidden="true">♡</span> {likes:,} on X</a>'
        )
    image = str(post.get("social_image") or "")
    thumb = ""
    if image:
        thumb = (
            f'<a class="item-thumb-link" href="{html.escape(href, quote=True)}"{extra} aria-label="{title}">'
            f'<img class="item-thumb" src="{html.escape(image, quote=True)}" alt="{title}" loading="lazy" decoding="async">'
            f'</a>'
        )
    description = str(post.get("description") or "")
    description_html = f'<p>{html.escape(description)}</p>' if description else ""
    return f'''        <li class="item">
          <div class="item-main">
            <h3><a href="{html.escape(href, quote=True)}"{extra}>{title}</a></h3>
            <div class="item-meta">
              <small>{html.escape(format_date(str(post.get("date") or "")))}</small>
              {tags_html}{likes_html}
            </div>
            {description_html}
          </div>
          {thumb}
        </li>'''


def seed_homepage(posts: list[dict]) -> None:
    source = INDEX_HTML.read_text(encoding="utf-8")
    items = "\n".join(render_home_item(post) for post in posts)
    replacement = f'''<ul id="post-list" class="list">
        <!-- STATIC_POST_LIST_START -->
{items}
        <!-- STATIC_POST_LIST_END -->
      </ul>'''
    pattern = re.compile(r'<ul id="post-list" class="list">.*?</ul>', re.S)
    matches = list(pattern.finditer(source))
    if not matches:
        raise RuntimeError("Could not find #post-list in index.html")
    match = matches[-1]
    source = source[: match.start()] + replacement + source[match.end() :]
    INDEX_HTML.write_text(source, encoding="utf-8")


def write_sitemap(posts: list[dict]) -> None:
    internal = [post for post in posts if not is_external(str(post.get("path") or ""))]
    latest = max((str(post.get("date") or "") for post in internal), default="")
    entries = [f'''  <url>
    <loc>{SITE_URL}/</loc>
    <lastmod>{html.escape(latest)}</lastmod>
  </url>''']
    for post in internal:
        slug = str(post.get("slug") or slug_from_path(str(post.get("path") or "")))
        entries.append(f'''  <url>
    <loc>{SITE_URL}/blog/{quote(slug, safe='')}/</loc>
    <lastmod>{html.escape(str(post.get("date") or ""))}</lastmod>
  </url>''')
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    sitemap += "\n".join(entries)
    sitemap += "\n</urlset>\n"
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")
    (ROOT / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n",
        encoding="utf-8",
    )


def main() -> None:
    posts = json.loads(POSTS_JSON.read_text(encoding="utf-8"))
    posts.sort(key=lambda post: str(post.get("date") or ""), reverse=True)
    SHARE_DIR.mkdir(parents=True, exist_ok=True)
    BLOG_DIR.mkdir(parents=True, exist_ok=True)

    count = 0
    for post in posts:
        path_value = str(post.get("path") or "")
        if not path_value or is_external(path_value):
            continue
        source_path = ROOT / path_value
        if not source_path.is_file():
            raise FileNotFoundError(source_path)
        slug = str(post.get("slug") or slug_from_path(path_value))
        article_html = expand_includes(source_path.read_text(encoding="utf-8"), source_path)
        sidecar_base = source_path.with_suffix("")
        output = render_article_page(
            post,
            article_html,
            sidecar_base.with_suffix(".css").is_file(),
            sidecar_base.with_suffix(".js").is_file(),
        )
        output = "\n".join(line.rstrip() for line in output.splitlines()) + "\n"
        blog_dir = BLOG_DIR / slug
        blog_dir.mkdir(parents=True, exist_ok=True)
        (blog_dir / "index.html").write_text(output, encoding="utf-8")

        legacy_share = render_legacy_share_page(post)
        legacy_share = "\n".join(line.rstrip() for line in legacy_share.splitlines()) + "\n"
        (SHARE_DIR / f"{slug}.html").write_text(legacy_share, encoding="utf-8")
        count += 1

    seed_homepage(posts)
    write_sitemap(posts)
    print(f"Generated {count} canonical blog pages, legacy share redirects, sitemap.xml, robots.txt, and the homepage seed list.")


if __name__ == "__main__":
    main()
