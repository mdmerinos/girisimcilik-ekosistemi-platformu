from __future__ import annotations

import contextlib
import importlib.util
import io
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

MODULE_PATH = Path(__file__).with_name("nato_diana_worker.py")
SPEC = importlib.util.spec_from_file_location("nato_diana_worker", MODULE_PATH)
assert SPEC and SPEC.loader
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)

NEWS_URL = (
    "https://www.diana.nato.int/connect/"
    "nato-diana-unveils-six-new-challenges-to-tackle-evolving-"
    "defence-and-security-needs.html"
)
NEWS_HTML = """
<html>
  <head>
    <meta name="description"
      content="NATO DIANA unveils six new challenges for the 2027 cohort.">
  </head>
  <body>
    <main>
      <article>
        <h1>NATO DIANA unveils six new challenges to tackle evolving defence and security needs</h1>
        <time>Jun 1, 2026</time>
        <p>The six new challenges will support innovators selected for the 2027 cohort through the accelerator programme.</p>
        <p>Selected companies can receive €100,000 funding and test centre access.</p>
        <p>Applications close on Friday 3 July 2026.</p>
      </article>
    </main>
  </body>
</html>
"""


class NatoDianaWorkerTests(unittest.TestCase):
    def test_supported_date_formats(self) -> None:
        self.assertEqual(worker.parse_date("Jun 1, 2026"), "2026-06-01T00:00:00Z")
        self.assertEqual(
            worker.parse_date("Friday 3 July 2026"),
            "2026-07-03T00:00:00Z",
        )

    def test_fallback_news_produces_real_record(self) -> None:
        item = worker.parse_fallback_page(NEWS_URL, NEWS_HTML)
        self.assertIsNotNone(item)
        assert item
        self.assertEqual(
            item["title"],
            "NATO DIANA unveils six new challenges to tackle evolving defence and security needs",
        )
        self.assertEqual(item["publishedAt"], "2026-06-01T00:00:00Z")
        self.assertEqual(item["deadlineAt"], "2026-07-03T00:00:00Z")
        self.assertEqual(item["sourceUrl"], NEWS_URL)
        for phrase in [
            "six new challenges",
            "2027 cohort",
            "accelerator programme",
            "€100,000 funding",
            "test centre access",
        ]:
            self.assertIn(phrase, item["summary"])

    def test_blocked_connect_uses_fallback_pages(self) -> None:
        def loader(_driver, url: str) -> str:
            if url in worker.PAGE_URLS:
                raise worker.PageBlockedError(url)
            if url == NEWS_URL:
                return NEWS_HTML
            raise worker.PageBlockedError(url)

        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            items = worker.collect_opportunities(object(), loader)

        self.assertEqual(len(items), 1)
        self.assertIn("connect.html blocked, using fallback pages", output.getvalue())
        self.assertEqual(worker.SOURCE_SLUG, "nato-diana")
        self.assertEqual(worker.SOURCE_NAME, "NATO DIANA")

    def test_all_access_blocks_return_zero_records(self) -> None:
        def blocked_loader(_driver, url: str) -> str:
            raise worker.PageBlockedError(url)

        items = worker.collect_opportunities(object(), blocked_loader)
        self.assertEqual(items, [])

    def test_zero_records_with_successful_post_exit_cleanly(self) -> None:
        fake_driver = Mock()
        with (
            patch.object(worker, "build_driver", return_value=fake_driver),
            patch.object(worker, "collect_opportunities", return_value=[]),
            patch.object(worker, "post_items", return_value={"result": {}}),
        ):
            self.assertEqual(worker.main(), 0)
        fake_driver.quit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
