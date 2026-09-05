## Building the site

Run the static-page builder after editing `posts.json` or any post:

```sh
python3 scripts/build-site.py
```

This regenerates the crawlable pages in `blog/`, keeps metadata-preserving redirects in `share/`, seeds the homepage with static article links, and updates `sitemap.xml` and `robots.txt`. Existing `/share/` and `?p=` links remain supported as legacy routes.

The older command `node scripts/build-share-pages.mjs` delegates to the same builder when Node is available.

## Announcement likes

Each verified announcement is stored in `posts.json` as `x_post` with its numeric
`id` (a string), `likes`, and `checked_at` date. Only use the article's announcement
post; replies and earlier experiments are not equivalent.

Run `python3 scripts/refresh-x-likes.py` to refresh saved counts and rebuild the
site, or add `--check` to preview without writing. Missing announcement mappings
are listed. Failed requests retain the previous count and checked date.

Counts are snapshots, not live totals. The script uses X's public embed endpoint,
which may be cached, rate-limited, or unavailable; it requires no API key and does
not fetch X data in visitors' browsers.

The `Refresh X likes` GitHub Actions workflow runs daily at 06:23 UTC and can also
be run manually from the Actions tab. Once published to `main`, it refreshes all
mapped announcements, commits updated snapshots, and explicitly requests a Pages
rebuild using GitHub's built-in token. No additional secret is needed. It keeps
the existing Pages source (`main`, repository root).

The scheduled run uses `--allow-partial`: successful requests are published while
failed requests keep their previous counts and checked dates. If every request
fails, the run fails without committing or publishing. GitHub may delay scheduled
runs and disables scheduled workflows in public repositories after 60 days of
inactivity; re-enable the workflow in Actions if that happens.
