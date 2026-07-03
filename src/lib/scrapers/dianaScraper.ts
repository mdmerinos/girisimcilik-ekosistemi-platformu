import * as cheerio from "cheerio";

import { fetchTextWithRetry } from "@/lib/ingestion/fetchWithRetry";
import { EmptySourceError } from "@/lib/ingestion/sourceStatus";
import { extractCleanSummary } from "@/lib/scrapers/cleanOpportunitySummary";
import { createUniqueKey } from "@/lib/utils/createUniqueKey";
import { normalizeText } from "@/lib/utils/normalizeText";
import { parseDate } from "@/lib/utils/parseDate";
import { truncateText } from "@/lib/utils/truncateText";
import type { OpportunityInput } from "@/types/opportunity";

const SOURCE_NAME = "NATO DIANA";
const SOURCE_URL = "https://www.diana.nato.int/connect.html";
const PAGE_URLS = [
  SOURCE_URL,
  "https://www.diana.nato.int/connect/page/2.html",
  "https://www.diana.nato.int/connect/page/3.html",
  "https://www.diana.nato.int/connect/page/4.html",
];
const MAX_ITEMS = 40;
const OPPORTUNITY_PATTERN =
  /\b(challenge|accelerator|programme|program|funding|application|apply|call|startup|demo day)\b/i;
const MONTH_PATTERN =
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?\b/i;

type DianaListingItem = {
  title: string;
  url: string;
  dateText: string | null;
};

export function parseDianaListingPage(
  html: string,
  pageUrl = SOURCE_URL,
): DianaListingItem[] {
  const $ = cheerio.load(html);
  const items = new Map<string, DianaListingItem>();

  $('main a[href], article a[href], a[href^="/connect/"]').each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr("href");
    if (!href) return;

    let url: URL;
    try {
      url = new URL(href, pageUrl);
    } catch {
      return;
    }

    const path = url.pathname.replace(/\/+$/, "");
    if (
      url.hostname !== "www.diana.nato.int" ||
      !/^\/connect\/(?!page\/)[^/]+\.html$/i.test(path)
    ) {
      return;
    }

    const rawText = normalizeText(anchor.text());
    const dateText = rawText.match(MONTH_PATTERN)?.[0] ?? null;
    const title = normalizeText(rawText.replace(MONTH_PATTERN, ""));
    if (title.length < 12) return;

    items.set(url.toString(), { title, url: url.toString(), dateText });
  });

  return [...items.values()];
}

function categoryFor(title: string, summary: string | null) {
  return OPPORTUNITY_PATTERN.test(`${title} ${summary ?? ""}`)
    ? ("Uluslararası Fonlar" as const)
    : ("Haber ve Sosyal Medya Akışı" as const);
}

async function enrichDianaItem(
  item: DianaListingItem,
  fetchedAt: string,
): Promise<OpportunityInput> {
  let summary: string | null = null;
  let publishedAt = parseDate(item.dateText);
  let imageUrl: string | null = null;

  try {
    const html = await fetchTextWithRetry(item.url, {
      timeoutMs: 8_000,
      retries: 1,
    });
    const $ = cheerio.load(html);
    const article = $("main article, main, article").first();
    const dateText =
      article.find("time[datetime]").first().attr("datetime") ||
      article.find("time, .date, .publish-date").first().text() ||
      article.text().match(
        /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s*\d{4}\b/i,
      )?.[0];
    const paragraph = article
      .find("p")
      .toArray()
      .map((element) => normalizeText($(element).text()))
      .find((text) => text.length >= 60);
    const metadataDescription =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="twitter:description"]').attr("content");
    const imageSource =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content");

    summary = extractCleanSummary(metadataDescription || paragraph, item.title);
    publishedAt = parseDate(dateText) ?? publishedAt;
    imageUrl =
      imageSource && URL.canParse(imageSource, item.url)
        ? new URL(imageSource, item.url).toString()
        : null;
  } catch {
    // The listing item remains usable; a failed detail request must not fail the source.
  }

  return {
    unique_key: createUniqueKey(SOURCE_NAME, item.url),
    title: truncateText(item.title, 240),
    summary,
    category: categoryFor(item.title, summary),
    source_name: SOURCE_NAME,
    source_url: item.url,
    application_url: item.url,
    image_url: imageUrl,
    published_at: publishedAt,
    deadline_at: null,
    fetched_at: fetchedAt,
    location: "Global",
    is_featured: false,
  };
}

export async function scrapeDiana(): Promise<OpportunityInput[]> {
  const listings = new Map<string, DianaListingItem>();

  for (const pageUrl of PAGE_URLS) {
    try {
      const html = await fetchTextWithRetry(pageUrl, {
        timeoutMs: 10_000,
        retries: 1,
      });
      const pageItems = parseDianaListingPage(html, pageUrl);
      if (pageItems.length === 0) break;
      for (const item of pageItems) {
        listings.set(item.url, item);
        if (listings.size >= MAX_ITEMS) break;
      }
    } catch (error) {
      if (listings.size === 0) throw error;
      break;
    }
    if (listings.size >= MAX_ITEMS) break;
  }

  if (listings.size === 0) throw new EmptySourceError(SOURCE_URL);

  const fetchedAt = new Date().toISOString();
  const items = [...listings.values()].slice(0, MAX_ITEMS);
  const results: OpportunityInput[] = [];
  const concurrency = 4;

  for (let index = 0; index < items.length; index += concurrency) {
    results.push(
      ...(await Promise.all(
        items
          .slice(index, index + concurrency)
          .map((item) => enrichDianaItem(item, fetchedAt)),
      )),
    );
  }

  return results;
}
