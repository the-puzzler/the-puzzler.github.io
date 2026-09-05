import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("refresh", Path(__file__).with_name("refresh-x-likes.py"))
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


class RefreshTests(unittest.TestCase):
    def run_refresh(self, results, *args):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            posts = [
                {"title": title, "x_post": {"id": str(i), "likes": 10, "checked_at": "2026-01-01"}}
                for i, title in enumerate(("First", "Second"), start=1)
            ]
            path = root / "posts.json"
            path.write_text(json.dumps(posts))
            with patch.object(refresh, "ROOT", root), patch.object(refresh, "fetch_likes", side_effect=results), \
                 patch.object(refresh.subprocess, "run") as build, patch("sys.argv", ["refresh", *args]):
                status = refresh.main()
            return status, json.loads(path.read_text()), build.call_count

    def test_partial_failure_keeps_previous_snapshot(self):
        status, posts, builds = self.run_refresh([25, OSError("Unavailable")], "--allow-partial")
        self.assertEqual(status, 0)
        self.assertEqual(posts[0]["x_post"]["likes"], 25)
        self.assertEqual(posts[1]["x_post"], {"id": "2", "likes": 10, "checked_at": "2026-01-01"})
        self.assertEqual(builds, 1)

    def test_total_failure_does_not_build_or_update(self):
        status, posts, builds = self.run_refresh([OSError("Unavailable")] * 2, "--allow-partial")
        self.assertEqual(status, 1)
        self.assertEqual(builds, 0)
        self.assertTrue(all(p["x_post"]["checked_at"] == "2026-01-01" for p in posts))

    def test_check_never_writes(self):
        status, posts, builds = self.run_refresh([25, 30], "--check")
        self.assertEqual(status, 0)
        self.assertEqual(builds, 0)
        self.assertTrue(all(p["x_post"]["likes"] == 10 for p in posts))


if __name__ == "__main__":
    unittest.main()
