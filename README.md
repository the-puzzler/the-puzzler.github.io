## Building the site

Run the static-page builder after editing `posts.json` or any post:

```sh
python3 scripts/build-site.py
```

This regenerates the crawlable pages in `blog/`, keeps metadata-preserving redirects in `share/`, seeds the homepage with static article links, and updates `sitemap.xml` and `robots.txt`. Existing `/share/` and `?p=` links remain supported as legacy routes.

The older command `node scripts/build-share-pages.mjs` delegates to the same builder when Node is available.
