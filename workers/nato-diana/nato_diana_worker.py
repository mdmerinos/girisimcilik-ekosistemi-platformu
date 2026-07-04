"""Collect real public NATO DIANA opportunities in an external Chrome worker."""

from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

SOURCE_SLUG = "nato-diana"
SOURCE_NAME = "NATO DIANA"
PAGE_URLS = [
    "https://www.diana.nato.int/connect.html",
    "https://www.diana.nato.int/connect/page/2.html",
    "https://www.diana.nato.int/connect/page/3.html",
    "https://www.diana.nato.int/connect/page/4.html",
]
DETAIL_PATH = re.compile(r"^/connect/(?!page/)[^/]+\.html$", re.IGNORECASE)
RELEVANT_PATTERN = re.compile(
    r"\b(challenge|accelerator|programme|program|funding|grant|application|"
    r"apply|call|startup|innovator|innovation|deep[ -]?tech|cohort|demo day)\b",
    re.IGNORECASE,
)
FUNDING_PATTERN = re.compile(
    r"\b(challenge|fund|funding|grant|call for|competition)\b", re.IGNORECASE
)
PROGRAM_PATTERN = re.compile(
    r"\b(accelerator|programme|program|incubator|cohort|demo day)\b",
    re.IGNORECASE,
)
APPLICATION_PATTERN = re.compile(
    r"\b(apply|application|register|submit|join the challenge)\b", re.IGNORECASE
)
BLOCKED_PATTERN = re.compile(
    r"captcha|access denied|attention required|just a moment|cloudflare",
    re.IGNORECASE,
)
DATE_PATTERN = re.compile(
    r"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|"
    r"Dec(?:ember)?)\s+\d{1,2},\s*\d{4}\b",
    re.IGNORECASE,
)
DEADLINE_PATTERN = re.compile(
    r"(?:deadline|applications? close|apply by)\s*:?\s*"
    r"((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|"
    r"Dec(?:ember)?)\s+\d{1,2},\s*\d{4})",
    re.IGNORECASE,
)
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
MAX_ITEMS = 40


def write_summary(message: str) -> None:
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with Path(summary_path).open("a", encoding="utf-8") as summary:
            summary.write(f"{message}\n")


def build_driver() -> webdriver.Chrome:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1440,1400")
    options.add_argument("--lang=en-US")
    options.add_argument(f"--user-agent={USER_AGENT}")
    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(45)
    return driver


def wait_for_public_page(driver: webdriver.Chrome, url: str) -> str:
    driver.get(url)
    WebDriverWait(driver, 30).until(
        lambda current: current.execute_script("return document.readyState")
        == "complete"
    )
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(1.5)
    html = driver.page_source
    title = driver.title or ""
    if BLOCKED_PATTERN.search(f"{title} {html[:8000]}"):
        raise RuntimeError(f"Public page access was blocked: {url}")
    return html


def parse_date(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(cleaned)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        pass
    for date_format in ("%b %d, %Y", "%B %d, %Y"):
        try:
            parsed = datetime.strptime(cleaned, date_format)
            return parsed.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError:
            continue
    return None


def json_ld_dates(soup: BeautifulSoup) -> tuple[str | None, str | None]:
    for script in soup.select("script[type='application/ld+json']"):
        try:
            payload = json.loads(script.get_text(strip=True))
        except (json.JSONDecodeError, TypeError):
            continue
        records = payload if isinstance(payload, list) else [payload]
        for record in records:
            if not isinstance(record, dict):
                continue
            published = parse_date(record.get("datePublished"))
            deadline = parse_date(
                record.get("applicationDeadline") or record.get("endDate")
            )
            if published or deadline:
                return published, deadline
    return None, None


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
                parsed_url.netloc not in {"diana.nato.int", "www.diana.nato.int"}
                or not DETAIL_PATH.match(parsed_url.path.rstrip("/"))
            ):
                continue

            raw_title = " ".join(anchor.get_text(" ", strip=True).split())
            date_match = DATE_PATTERN.search(raw_title)
            title = DATE_PATTERN.sub("", raw_title).strip(" ,–—-")
            if len(title) < 10:
                continue

            items[absolute_url] = {
                "title": title,
                "url": absolute_url,
                "publishedAt": parse_date(date_match.group(0)) if date_match else None,
            }
            page_count += 1
            if len(items) >= MAX_ITEMS:
                break

        if page_count == 0 or len(items) >= MAX_ITEMS:
            break
    return list(items.values())


def extract_application_url(main: BeautifulSoup, detail_url: str) -> str:
    for anchor in main.select("a[href]"):
        text = " ".join(anchor.get_text(" ", strip=True).split())
        if APPLICATION_PATTERN.search(text):
            candidate = urljoin(detail_url, anchor.get("href", ""))
            if urlparse(candidate).scheme in {"http", "https"}:
                return candidate
    return detail_url


def enrich_item(
    driver: webdriver.Chrome, item: dict[str, str | None]
) -> dict | None:
    detail_url = str(item["url"])
    html = wait_for_public_page(driver, detail_url)
    soup = BeautifulSoup(html, "html.parser")
    main = soup.select_one("main article, main, article") or soup
    heading = main.select_one("h1")
    title = (
        " ".join(heading.get_text(" ", strip=True).split())
        if heading
        else str(item["title"])
    )

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

    searchable = f"{title} {summary}"
    if not RELEVANT_PATTERN.search(searchable):
        return None

    json_published, json_deadline = json_ld_dates(soup)
    published_at = item.get("publishedAt") or json_published
    if not published_at:
        time_element = main.select_one("time[datetime]")
        published_at = parse_date(time_element.get("datetime")) if time_element else None
    if not published_at:
        published_meta = soup.select_one("meta[property='article:published_time']")
        published_at = (
            parse_date(published_meta.get("content")) if published_meta else None
        )

    deadline_at = json_deadline
    if not deadline_at:
        deadline_match = DEADLINE_PATTERN.search(main.get_text(" ", strip=True))
        deadline_at = parse_date(deadline_match.group(1)) if deadline_match else None

    if FUNDING_PATTERN.search(searchable):
        category = "Uluslararası Fonlar"
    elif PROGRAM_PATTERN.search(searchable):
        category = "Etkinlik ve Programlar"
    else:
        category = "Haber ve Sosyal Medya Akışı"

    image_meta = soup.select_one("meta[property='og:image']") or soup.select_one(
        "meta[name='twitter:image']"
    )
    image_url = (
        urljoin(detail_url, image_meta.get("content", ""))
        if image_meta and image_meta.get("content")
        else None
    )

    return {
        "title": title,
        "summary": summary or None,
        "category": category,
        "sourceUrl": detail_url,
        "applicationUrl": extract_application_url(main, detail_url),
        "imageUrl": image_url,
        "publishedAt": published_at,
        "deadlineAt": deadline_at,
        "location": "Global",
        "countryGroup": "global",
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
        data=json.dumps(
            {
                "sourceSlug": SOURCE_SLUG,
                "sourceName": SOURCE_NAME,
                "items": items,
            },
            ensure_ascii=False,
        ).encode("utf-8"),
        timeout=90,
    )
    response.raise_for_status()
    return response.json()


def main() -> int:
    driver: webdriver.Chrome | None = None
    try:
        driver = build_driver()
        listing_items = collect_listing_items(driver)
        opportunities = [
            opportunity
            for item in listing_items
            if (opportunity := enrich_item(driver, item)) is not None
        ]
        result = post_items(opportunities)
        endpoint_result = result.get("result", {})
        message = (
            f"### NATO DIANA Worker\n\n"
            f"- Collected: {len(opportunities)}\n"
            f"- Inserted: {endpoint_result.get('inserted', 0)}\n"
            f"- Updated: {endpoint_result.get('updated', 0)}\n"
            f"- Rejected: {endpoint_result.get('rejected', 0)}\n"
        )
        write_summary(message)
        print(
            json.dumps(
                {
                    "sourceSlug": SOURCE_SLUG,
                    "collected": len(opportunities),
                    "endpointResult": endpoint_result,
                },
                ensure_ascii=False,
            )
        )
        if not opportunities:
            print("NATO DIANA worker completed: 0 matching records found.")
        return 0
    except (
        RuntimeError,
        TimeoutException,
        WebDriverException,
        requests.RequestException,
    ) as error:
        message = f"NATO DIANA worker failed: {error}"
        write_summary(f"### NATO DIANA Worker\n\n- Status: failed\n- Error: {error}\n")
        print(message, file=sys.stderr)
        return 1
    finally:
        if driver is not None:
            driver.quit()


if __name__ == "__main__":
    raise SystemExit(main())
