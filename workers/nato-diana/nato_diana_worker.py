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
FALLBACK_URLS = [
    "https://www.diana.nato.int/challenges.html",
    "https://www.diana.nato.int/accelerator-programme.html",
    (
        "https://www.diana.nato.int/connect/"
        "nato-diana-unveils-six-new-challenges-to-tackle-evolving-"
        "defence-and-security-needs.html"
    ),
    (
        "https://www.diana.nato.int/challenges/"
        "decision-superiority-for-nato-warfighters.html"
    ),
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
DAY_FIRST_DATE_PATTERN = re.compile(
    r"\b(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?"
    r"\d{1,2}\s+(?:January|February|March|April|May|June|July|August|"
    r"September|October|November|December)\s+\d{4}\b",
    re.IGNORECASE,
)
DEADLINE_PATTERN = re.compile(
    r"(?:deadline|applications? close|apply by|submissions? close|"
    r"closes?(?: on)?|open until|"
    r"applications?[^.\n]{0,180}?(?:until|close on))\s*:?\s*"
    r"((?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?"
    r"\d{1,2}\s+(?:January|February|March|April|May|June|July|August|"
    r"September|October|November|December)\s+\d{4}|"
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|"
    r"Dec(?:ember)?)\s+\d{1,2},\s*\d{4})",
    re.IGNORECASE,
)
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
MAX_ITEMS = 40


class PageBlockedError(RuntimeError):
    """The public source returned an access-block page."""


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
        raise PageBlockedError(f"Public page access was blocked: {url}")
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
    for date_format in (
        "%b %d, %Y",
        "%B %d, %Y",
        "%A %d %B %Y",
        "%d %B %Y",
    ):
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


def collect_listing_items(
    driver: webdriver.Chrome, load_page=wait_for_public_page
) -> list[dict[str, str | None]]:
    items: dict[str, dict[str, str | None]] = {}
    for page_url in PAGE_URLS:
        html = load_page(driver, page_url)
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
    driver: webdriver.Chrome,
    item: dict[str, str | None],
    load_page=wait_for_public_page,
) -> dict | None:
    detail_url = str(item["url"])
    html = load_page(driver, detail_url)
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


def parse_fallback_page(url: str, html: str) -> dict | None:
    """Build one opportunity only from content present on an official page."""
    soup = BeautifulSoup(html, "html.parser")
    main = soup.select_one("main article, main, article") or soup
    heading = main.select_one("h1")
    title = (
        " ".join(heading.get_text(" ", strip=True).split())
        if heading
        else " ".join((soup.title.get_text(" ", strip=True) if soup.title else "").split())
    )

    description_meta = (
        soup.select_one("meta[name='description']")
        or soup.select_one("meta[property='og:description']")
        or soup.select_one("meta[name='twitter:description']")
    )
    summary_parts: list[str] = []
    if description_meta and description_meta.get("content"):
        summary_parts.append(" ".join(description_meta.get("content", "").split()))
    for paragraph in main.select("p"):
        text = " ".join(paragraph.get_text(" ", strip=True).split())
        if len(text) >= 35 and text not in summary_parts:
            summary_parts.append(text)
        if len(" ".join(summary_parts)) >= 3500:
            break
    summary = " ".join(summary_parts).strip()[:4500]
    searchable = f"{title} {summary}"
    if len(title) < 5 or not RELEVANT_PATTERN.search(searchable):
        return None

    json_published, json_deadline = json_ld_dates(soup)
    published_at = json_published
    time_element = main.select_one("time[datetime]")
    if not published_at and time_element:
        published_at = parse_date(time_element.get("datetime"))
    if not published_at:
        published_meta = soup.select_one("meta[property='article:published_time']")
        published_at = (
            parse_date(published_meta.get("content")) if published_meta else None
        )
    # A visible date on a NATO connect news detail is its publication date.
    if not published_at and "/connect/" in url:
        visible_date = DATE_PATTERN.search(main.get_text(" ", strip=True))
        published_at = parse_date(visible_date.group(0)) if visible_date else None

    text = " ".join(main.get_text(" ", strip=True).split())
    deadline_at = json_deadline
    if not deadline_at:
        deadline_match = DEADLINE_PATTERN.search(text)
        deadline_at = parse_date(deadline_match.group(1)) if deadline_match else None

    if FUNDING_PATTERN.search(searchable) or "/challenges" in url:
        category = "Uluslararası Fonlar"
    elif PROGRAM_PATTERN.search(searchable):
        category = "Etkinlik ve Programlar"
    else:
        category = "Haber ve Sosyal Medya Akışı"

    image_meta = soup.select_one("meta[property='og:image']") or soup.select_one(
        "meta[name='twitter:image']"
    )
    image_url = (
        urljoin(url, image_meta.get("content", ""))
        if image_meta and image_meta.get("content")
        else None
    )

    return {
        "title": title,
        "summary": summary or None,
        "category": category,
        "sourceUrl": url,
        "applicationUrl": extract_application_url(main, url),
        "imageUrl": image_url,
        "publishedAt": published_at,
        "deadlineAt": deadline_at,
        "location": "Global",
        "countryGroup": "global",
    }


def collect_fallback_items(
    driver: webdriver.Chrome, load_page=wait_for_public_page
) -> list[dict]:
    results: dict[str, dict] = {}
    for fallback_url in FALLBACK_URLS:
        try:
            html = load_page(driver, fallback_url)
        except PageBlockedError:
            print(f"Fallback page blocked, skipping: {fallback_url}")
            continue
        item = parse_fallback_page(fallback_url, html)
        if item:
            results[fallback_url] = item
    return list(results.values())


def collect_opportunities(
    driver: webdriver.Chrome, load_page=wait_for_public_page
) -> list[dict]:
    try:
        listing_items = collect_listing_items(driver, load_page)
    except PageBlockedError:
        print("connect.html blocked, using fallback pages")
        return collect_fallback_items(driver, load_page)

    opportunities: list[dict] = []
    for item in listing_items:
        try:
            opportunity = enrich_item(driver, item, load_page)
        except PageBlockedError:
            print(f"Detail page blocked, skipping: {item['url']}")
            continue
        if opportunity:
            opportunities.append(opportunity)

    if opportunities:
        return opportunities

    print("connect.html returned no usable records, using fallback pages")
    return collect_fallback_items(driver, load_page)


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
        opportunities = collect_opportunities(driver)
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
