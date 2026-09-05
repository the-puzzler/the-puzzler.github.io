#!/usr/bin/env python3
"""Refresh verified announcement counts from X's public embed response."""

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent.parent


def fetch_likes(post_id):
    if not re.fullmatch(r"[0-9]+", str(post_id)):
        raise ValueError("Invalid X post ID")
    url = f"https://cdn.syndication.twimg.com/tweet-result?id={post_id}&lang=en&token=1"
    with urlopen(url, timeout=20) as response:
        data = json.load(response)
    if data.get("id_str") != str(post_id):
        raise ValueError("X did not return the requested post")
    if data.get("user", {}).get("screen_name", "").lower() != "mozarellapesto":
        raise ValueError("Post belongs to a different author")
    likes = data.get("favorite_count")
    if type(likes) is not int or likes < 0:
        raise ValueError("X did not return a valid like count")
    return likes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fetch and report without changing files")
    parser.add_argument("--allow-partial", action="store_true", help="Publish successful updates even if some requests fail")
    args = parser.parse_args()
    path = ROOT / "posts.json"
    original = path.read_text()
    posts = json.loads(original)
    failures = 0
    missing = []
    updated = False
    for post in posts:
        announcement = post.get("x_post")
        if not announcement:
            missing.append(post["title"])
            continue
        try:
            likes = fetch_likes(announcement["id"])
        except Exception as error:
            failures += 1
            print(f'{post["title"]}: {error}; retaining saved count and checked date', file=sys.stderr)
            continue
        print(f'{post["title"]}: {likes:,} likes')
        announcement.update(likes=likes, checked_at=datetime.now(timezone.utc).date().isoformat())
        updated = True
    if missing:
        print("Still need verified announcement URLs:")
        for title in missing:
            print(f"  - {title}")
    if updated and not args.check:
        if path.read_text() != original:
            raise RuntimeError("posts.json changed during refresh; refusing to overwrite concurrent edits")
        path.write_text(json.dumps(posts, indent=2, ensure_ascii=False) + "\n")
        subprocess.run([sys.executable, str(ROOT / "scripts/build-site.py")], check=True)
    if failures and args.allow_partial and updated:
        print(f"Warning: {failures} announcement(s) retained their previous counts", file=sys.stderr)
        return 0
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
