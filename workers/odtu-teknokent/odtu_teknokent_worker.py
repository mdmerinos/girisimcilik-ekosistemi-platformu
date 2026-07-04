"""Collect real ODTÜ Teknokent ecosystem records in an external Chrome worker."""

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
from bs4 import BeautifulSoup, Tag
from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

SOURCE_SLUG = "odtu-teknokent"
SOURCE_NAME = "ODTÜ Teknokent"
LISTING_URL = "https://www.odtuteknokent.com.tr/tr/"
ODTU_HOSTS = {"odtuteknokent.com.tr", "www.odtuteknokent.com.tr"}
ALLOWED_SOURCE_HOSTS = ODTU_HOSTS | {
    "portal.odtuteknokent.com.tr",
    "yfyi.odtuteknokent.com.tr",
    "yfyi.com",
    "www.yfyi.com",
    "atom.org.tr",
    "www.atom.org.tr",
    "etkim.gov.tr",
    "www.etkim.gov.tr",
    "metustars.com",
    "www.metustars.com",
}
RELEVANT_PATTERN = re.compile(
    r"\b(girişim|girişimci|startup|teknoloji|inovasyon|yatırım|program|"
    r"başvuru|çağrı|kuluçka|hızlandırma|hibe|fon|destek|ticarileş|"
    r"ar-?ge|demo günü|demo day|mentorluk|ekosistem)\b",
    re.IGNORECASE,
)
APPLICATION_PATTERN = re.compile(
    r"\b(başvuru|başvur|kayıt|katıl|detay|siteye git)\b", re.IGNORECASE
)
BLOCKED_PATTERN = re.compile(
    r"captcha|access denied|attention required|just a moment|cloudflare|"
    r"bir dakika lütfen",
    re.IGNORECASE,
)
DATE_PATTERN = re.compile(
    r"\b(\d{1,2})\s+"
    r"(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|"
    r"ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)"
    r"\s+(\d{4})\b",
    re.IGNORECASE,
)
NUMERIC_DATE_PATTERN = re.compile(r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b")
DEADLINE_PATTERN = re.compile(
    r"(?:son başvuru tarihi|başvuru son tarihi|son başvuru|deadline)\s*:?\s*"
    r"((?:\d{1,2}\s+(?:ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|"
    r"temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)"
    r"\s+\d{4})|(?:\d{1,2}[./-]\d{1,2}[./-]\d{4}))",
    re.IGNORECASE,
)
MONTHS = {
    "ocak": 1,
    "şubat": 2,
    "subat": 2,
    "mart": 3,
    "nisan": 4,
    "mayıs": 5,
    "mayis": 5,
    "haziran": 6,
    "temmuz": 7,
    "ağustos": 8,
    "agustos": 8,
    "eylül": 9,
    "eylul": 9,
    "ekim": 10,
    "kasım": 11,
    "kasim": 11,
    "aralık": 12,
    "aralik": 12,
}
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
MAX_ITEMS = 50


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
    options.add_argument("--window-size=1440,1800")
    options.add_argument("--lang=tr-TR")
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
    time.sleep(2)
    html = driver.page_source
    if BLOCKED_PATTERN.search(f"{driver.title} {html[:8000]}"):
        raise RuntimeError(f"Public page access was blocked: {url}")
    return html


def iso_date(day: int, month: int, year: int) -> str | None:
    try:
        parsed = datetime(year, month, day, tzinfo=timezone.utc)
        return parsed.isoformat().replace("+00:00", "Z")
    except ValueError:
        return None


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
    turkish = DATE_PATTERN.search(cleaned)
    if turkish:
        return iso_date(
            int(turkish.group(1)),
            MONTHS[turkish.group(2).lower()],
            int(turkish.group(3)),
        )
    numeric = NUMERIC_DATE_PATTERN.search(cleaned)
    if numeric:
        return iso_date(
            int(numeric.group(1)), int(numeric.group(2)), int(numeric.group(3))
        )
    return None


def category_for(text: str) -> str:
    if re.search(
        r"\b(yatırım aldı|yatırım turu|venture capital|melek yatırım|"
        r"satın alındı|seed|series [a-z])\b",
        text,
        re.IGNORECASE,
    ):
        return "Yatırım ve Sermaye Ağları"
    if re.search(r"\b(hibe|fon|destek çağrısı|bigg|tübitak|kosgeb)\b", text, re.I):
        return "Ulusal Destek ve Fonlar"
    if re.search(
        r"\b(program|başvuru|çağrı|hızlandırma|kuluçka|demo day|"
        r"etkinlik|eğitim|mentorluk)\b",
        text,
        re.IGNORECASE,
    ):
        return "Etkinlik ve Programlar"
    return "Haber ve Sosyal Medya Akışı"


def first_text(container: Tag, selectors: list[str]) -> str:
    for selector in selectors:
        element = container.select_one(selector)
        if element:
            value = " ".join(element.get_text(" ", strip=True).split())
            if value:
                return value
    return ""


def allowed_source_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and parsed.hostname in ALLOWED_SOURCE_HOSTS


def application_url(container: Tag, base_url: str) -> str | None:
    for anchor in container.select("a[href]"):
        label = " ".join(anchor.get_text(" ", strip=True).split())
        if APPLICATION_PATTERN.search(label):
            value = urljoin(base_url, anchor.get("href", ""))
            if urlparse(value).scheme in {"http", "https"}:
                return value
    return None


def source_url(container: Tag, base_url: str) -> str | None:
    selectors = [
        "a.read-more[href]",
        "a[href*='/tr/haber/']",
        "a[href*='/tr/duyuru/']",
        "a[href*='basvuru']",
    ]
    for selector in selectors:
        for anchor in container.select(selector):
            value = urljoin(base_url, anchor.get("href", ""))
            if allowed_source_url(value):
                return value
    candidate = application_url(container, base_url)
    return candidate if candidate and allowed_source_url(candidate) else None


def detail_fields(
    driver: webdriver.Chrome, url: str, fallback_summary: str
) -> tuple[str, str | None, str | None, str | None]:
    if urlparse(url).hostname not in ODTU_HOSTS:
        return fallback_summary, None, None, None
    html = wait_for_public_page(driver, url)
    soup = BeautifulSoup(html, "html.parser")
    main = soup.select_one("main article, main, article") or soup
    summary = fallback_summary or first_text(
        main, ["meta[name='description']", ".news-detail p", "p"]
    )
    text = " ".join(main.get_text(" ", strip=True).split())
    time_element = main.select_one("time[datetime]")
    published_at = parse_date(time_element.get("datetime")) if time_element else None
    if not published_at:
        published_meta = soup.select_one("meta[property='article:published_time']")
        published_at = (
            parse_date(published_meta.get("content")) if published_meta else None
        )
    deadline_match = DEADLINE_PATTERN.search(text)
    deadline_at = parse_date(deadline_match.group(1)) if deadline_match else None
    return summary, published_at, deadline_at, application_url(main, url)


def collect_items(driver: webdriver.Chrome) -> list[dict]:
    html = wait_for_public_page(driver, LISTING_URL)
    soup = BeautifulSoup(html, "html.parser")
    containers = soup.select(
        ".news-container-wrapper .news-container, "
        ".news-main-container .news-container, .news-item, "
        "article:has(.read-more), .card:has(.read-more)"
    )
    results: dict[str, dict] = {}

    for container in containers:
        title = first_text(container, ["h4", "h3", "h2"])
        summary = first_text(container, [".news-excerpt", ".excerpt", "p"])
        searchable = f"{title} {summary}"
        if len(title) < 3 or not RELEVANT_PATTERN.search(searchable):
            continue

        detail_url = source_url(container, LISTING_URL)
        if not detail_url:
            continue
        card_application = application_url(container, LISTING_URL)
        detail_summary, published_at, deadline_at, detail_application = detail_fields(
            driver, detail_url, summary
        )
        if not deadline_at:
            deadline_match = DEADLINE_PATTERN.search(searchable)
            deadline_at = parse_date(deadline_match.group(1)) if deadline_match else None
        if not published_at:
            time_element = container.select_one("time[datetime]")
            published_at = (
                parse_date(time_element.get("datetime")) if time_element else None
            )

        image = container.select_one("img[src]")
        image_url = (
            urljoin(LISTING_URL, image.get("src", ""))
            if image and image.get("src")
            else None
        )
        results[detail_url] = {
            "title": title,
            "summary": detail_summary or None,
            "category": category_for(f"{title} {detail_summary}"),
            "sourceUrl": detail_url,
            "applicationUrl": detail_application or card_application or detail_url,
            "imageUrl": image_url,
            "publishedAt": published_at,
            "deadlineAt": deadline_at,
            "location": "Türkiye",
            "countryGroup": "turkiye",
        }
        if len(results) >= MAX_ITEMS:
            break

    return list(results.values())


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
        opportunities = collect_items(driver)
        result = post_items(opportunities)
        endpoint_result = result.get("result", {})
        write_summary(
            "### ODTÜ Teknokent Worker\n\n"
            f"- Collected: {len(opportunities)}\n"
            f"- Inserted: {endpoint_result.get('inserted', 0)}\n"
            f"- Updated: {endpoint_result.get('updated', 0)}\n"
            f"- Rejected: {endpoint_result.get('rejected', 0)}\n"
        )
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
            print("ODTÜ Teknokent worker completed: 0 matching records found.")
        return 0
    except (
        RuntimeError,
        TimeoutException,
        WebDriverException,
        requests.RequestException,
    ) as error:
        write_summary(
            f"### ODTÜ Teknokent Worker\n\n- Status: failed\n- Error: {error}\n"
        )
        print(f"ODTÜ Teknokent worker failed: {error}", file=sys.stderr)
        return 1
    finally:
        if driver is not None:
            driver.quit()


if __name__ == "__main__":
    raise SystemExit(main())
