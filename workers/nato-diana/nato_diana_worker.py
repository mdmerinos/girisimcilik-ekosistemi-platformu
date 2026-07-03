"""Collect public NATO DIANA news in an external browser worker."""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

PAGE_URLS = [
    "https://www.diana.nato.int/connect.html",
    "https://www.diana.nato.int/connect/page/2.html",
    "https://www.diana.nato.int/connect/page/3.html",
    "https://www.diana.nato.int/connect/page/4.html",
]
DETAIL_PATH = re.compile(r"^/connect/(?!page/)[^/]+\.html$", re.IGNORECASE)
DATE_PATTERN = re.compile(
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
    r"\s+\d{1,2}(?:,\s*\d{4})?\b",
    re.IGNORECASE,
)
OPPORTUNITY_PATTERN = re.compile(
    r"\b(challenge|accelerator|programme|program|funding|application|"
    r"apply|call|startup|demo day)\b",
    re.IGNORECASE,
)
BLOCKED_PATTERN = re.compile(
    r"captcha|access denied|attention required|just a moment|cloudflare",
    re.IGNORECASE,
)
MAX_ITEMS = 40


def build_driver() -> webdriver.Chrome:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1440,1200")
    options.add_argument("--lang=en-US")
    return webdriver.Chrome(options=options)


def wait_for_public_page(driver: webdriver.Chrome, url: str) -> str:
    driver.get(url)
    WebDriverWait(driver, 20).until(
        lambda current: current.execute_script("return document.readyState")
        == "complete"
    )
    html = driver.page_source
    title = driver.title or ""
    if BLOCKED_PATTERN.search(f"{title} {html[:5000]}"):
        raise RuntimeError(f"Public page access was blocked: {url}")
    return html


def parse_date(value: str | None) -> str | None:
    if not value:
        return None
    for date_format in ("%b %d, %Y", "%B %d, %Y", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(value.strip(), date_format)
            return parsed.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError:
            continue
    return None


def collect_listing_items(driver: webdriver.Chrome) -> list[dict[str, str | None]]:
    items: dict[str, dict[str, str | None]] = {}
    for page_url in PAGE_URLS:
        html = wait_for_public_page(driver, page_url)
        soup = BeautifulSoup(html, "html.parser")
        page_count = 0
        for anchor in soup.select("main a[href], article a[href], a[href^='/connect/']"):
            absolute_url = urljoin(page_url, anchor.get("href", ""))
            parsed_url = urlparse(absolute_url)
            if (
                parsed_url.netloc != "www.diana.nato.int"
                or not DETAIL_PATH.match(parsed_url.path.rstrip("/"))
            ):
                continue

            raw_title = " ".join(anchor.get_text(" ", strip=True).split())
            date_match = DATE_PATTERN.search(raw_title)
            title = DATE_PATTERN.sub("", raw_title).strip(" ,–—-")
            if len(title) < 12:
                continue

            items[absolute_url] = {
                "title": title,
                "url": absolute_url,
                "date_text": date_match.group(0) if date_match else None,
            }
            page_count += 1
            if len(items) >= MAX_ITEMS:
                break

        if page_count == 0 or len(items) >= MAX_ITEMS:
            break
    return list(items.values())


def enrich_item(driver: webdriver.Chrome, item: dict[str, str | None]) -> dict:
    html = wait_for_public_page(driver, str(item["url"]))
    soup = BeautifulSoup(html, "html.parser")
    main = soup.select_one("main article, main, article") or soup
    heading = main.select_one("h1")
    title = " ".join(heading.get_text(" ", strip=True).split()) if heading else item["title"]

    date_value = None
    time_element = main.select_one("time[datetime]")
    if time_element:
        date_value = parse_date(time_element.get("datetime"))
    if not date_value:
        detail_date = DATE_PATTERN.search(main.get_text(" ", strip=True))
        date_value = parse_date(detail_date.group(0) if detail_date else None)

    description_meta = (
        soup.select_one("meta[name='description']")
        or soup.select_one("meta[property='og:description']")
        or soup.select_one("meta[name='twitter:description']")
    )
    summary = description_meta.get("content", "").strip() if description_meta else ""
    if not summary:
        summary = next(
            (
                " ".join(paragraph.get_text(" ", strip=True).split())
                for paragraph in main.select("p")
                if len(paragraph.get_text(" ", strip=True)) >= 60
            ),
            "",
        )

    image_meta = soup.select_one("meta[property='og:image']") or soup.select_one(
        "meta[name='twitter:image']"
    )
    image_url = (
        urljoin(str(item["url"]), image_meta.get("content", ""))
        if image_meta and image_meta.get("content")
        else None
    )
    searchable = f"{title} {summary}"
    category = (
        "Uluslararası Fonlar"
        if OPPORTUNITY_PATTERN.search(searchable)
        else "Haber ve Sosyal Medya Akışı"
    )

    return {
        "title": title,
        "summary": summary or None,
        "category": category,
        "source_name": "NATO DIANA",
        "source_url": item["url"],
        "application_url": item["url"],
        "image_url": image_url,
        "published_at": date_value,
        "deadline_at": None,
        "location": "Global",
        "is_featured": False,
    }


def post_items(items: list[dict]) -> dict:
    endpoint = os.environ.get("WORKER_INGESTION_URL")
    secret = os.environ.get("WORKER_INGESTION_SECRET")
    if not endpoint or not secret:
        raise RuntimeError(
            "WORKER_INGESTION_URL and WORKER_INGESTION_SECRET must be configured."
        )

    response = requests.post(
        endpoint,
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        },
        data=json.dumps({"items": items}, ensure_ascii=False).encode("utf-8"),
        timeout=60,
    )
    response.raise_for_status()
    return response.json()


def main() -> int:
    driver = build_driver()
    try:
        listing_items = collect_listing_items(driver)
        if not listing_items:
            raise RuntimeError("No public NATO DIANA detail links were found.")
        opportunities = [enrich_item(driver, item) for item in listing_items]
        result = post_items(opportunities)
        print(
            json.dumps(
                {
                    "collected": len(opportunities),
                    "endpoint_result": result.get("result", {}),
                },
                ensure_ascii=False,
            )
        )
        return 0
    except (RuntimeError, TimeoutException, WebDriverException, requests.RequestException) as error:
        print(f"NATO DIANA worker failed: {error}", file=sys.stderr)
        return 1
    finally:
        driver.quit()


if __name__ == "__main__":
    raise SystemExit(main())
