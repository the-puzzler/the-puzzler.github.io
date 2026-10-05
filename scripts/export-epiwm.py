#!/usr/bin/env python3
"""Export the built EpiWM article as one offline HTML file for review."""
import base64
import json
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'posts/epiwm/assets'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / 'Downloads/EpiWM-review.html'


def data_url(data, mime):
    return f'data:{mime};base64,' + base64.b64encode(data).decode()


def script_json(value):
    return json.dumps(value, separators=(',', ':')).replace('<', '\\u003c')


page = (ROOT / 'blog/epiwm/index.html').read_text()
page = re.sub(r'<script\b[^>]*>.*?</script>', '', page, flags=re.S)
page = re.sub(r'\s*<base\b[^>]*>', '', page)
page = re.sub(r'\s*<link\b[^>]*>', '', page)
page = page.replace('index, follow, max-image-preview:large', 'noindex, nofollow')
page = re.sub(r'\s*<h2 data-toc-skip id="comments">Comments</h2>\s*<div id="post-comments-thread"></div>', '', page)
page = page.replace('<span id="y"></span>', '<span>2026</span>')
page = page.replace('href="/blog/epiwm/#', 'href="#')
page = re.sub(r'href="(/[^"#]*)"', lambda m: 'href="https://the-puzzler.github.io' + m[1] + '"', page)

# Native MathML keeps the handful of inline equations available offline.
zn = '<msub><mi>z</mi><mi>n</mi></msub>'
maths = {
    'x_n': '<msub><mi>x</mi><mi>n</mi></msub>',
    'z_n': zn,
    r'\hat z_n': '<msub><mover><mi>z</mi><mo>^</mo></mover><mi>n</mi></msub>',
    'z_n = C': zn + '<mo>=</mo><mi>C</mi>',
    'n': '<mi>n</mi>',
    r'\mathcal{N}(0,I)': '<mi mathvariant="script">N</mi><mo>(</mo><mn>0</mn><mo>,</mo><mi>I</mi><mo>)</mo>',
}
page = re.sub(r'\\\((.*?)\\\)', lambda m: '<math xmlns="http://www.w3.org/1998/Math/MathML">' + maths[m[1]] + '</math>', page)

css = (ROOT / 'styles.css').read_text()
font_url = re.search(r"@import url\('([^']+)'\);", css)[1]
font_cache = Path(tempfile.gettempdir()) / 'epiwm-export-fonts.css'
if font_cache.exists():
    font_css = font_cache.read_text()
else:
    font_css = urllib.request.urlopen(font_url, timeout=30).read().decode()
    for url in set(re.findall(r'url\((https://[^)]+)\)', font_css)):
        font_css = font_css.replace(url, data_url(urllib.request.urlopen(url, timeout=30).read(), 'font/ttf'))
    font_cache.write_text(font_css)
css = re.sub(r"@import url\('[^']+'\);", lambda _: font_css, css)
css += '\n' + (ROOT / 'posts/epiwm/epiwm.css').read_text()
page = page.replace('</head>', '<style>' + css + '</style>\n</head>')

embedded_data = {name: json.loads((ASSETS / name).read_text()) for name in ['scores.json', 'probes.json', 'cube.json', 'tworoom.json', 'pusht.json', 'reacher.json']}
embedded_videos = {env: data_url((ASSETS / f'{env}.mp4').read_bytes(), 'video/mp4') for env in ['cube', 'tworoom', 'pusht', 'reacher']}
# The player sets the embedded video source once initialised.
page = re.sub(r' src="/posts/epiwm/assets/[^\"]+\.mp4"', '', page)
post_js = (ROOT / 'posts/epiwm/epiwm.js').read_text()
start, end = post_js.index('const ASSETS ='), post_js.index('const mean =')
post_js = post_js[:start] + (
    'const modelNames = {released: "Released LeWM", epi: "EpiWM", control: "My SIGReg control"};\n'
    + 'const embeddedData = ' + script_json(embedded_data) + ';\n'
    + 'const embeddedVideos = ' + script_json(embedded_videos) + ';\n'
    + 'function getData(file) { return Promise.resolve(embeddedData[file]); }\n'
    + 'function getVideo(env) { return Promise.resolve(embeddedVideos[env]); }\n'
) + post_js[end:]
post_js = post_js[:post_js.index('(function initPostComments()')]
post_js = post_js.replace('/blog/epiwm/#', '#')

site_js = (ROOT / 'script.js').read_text()
toc_js = site_js[site_js.index('function normalizeHeadings('):site_js.index('function getCurrentPostPath(')]
toc_js = toc_js.replace('`${location.pathname}${location.search}#${h.id}`', '`#${h.id}`')
ui_js = '''
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
'''+toc_js+'''
normalizeHeadings(document.querySelector('.page'));
buildPostTOC(document.querySelector('.page'));
const controls = document.createElement('div');
controls.className = 'theme-controls';
const button = document.createElement('button');
button.className = 'mode-btn';
button.type = 'button';
const dark = () => document.documentElement.dataset.mode ? document.documentElement.dataset.mode === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
function updateThemeButton() {
  button.textContent = dark() ? '☀' : '☾';
  button.setAttribute('aria-label', dark() ? 'Switch to light theme' : 'Switch to dark theme');
}
button.onclick = () => { document.documentElement.dataset.mode = dark() ? 'light' : 'dark'; updateThemeButton(); };
updateThemeButton();
controls.appendChild(button);
document.body.appendChild(controls);
'''
page = page.replace('</body>', '<script>\n(() => {\n' + ui_js + '\n})();\n</script>\n<script>\n(() => {\n' + post_js + '\n})();\n</script>\n</body>')
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(page)
print(f'{OUT} ({OUT.stat().st_size / 1_000_000:.1f} MB)')
