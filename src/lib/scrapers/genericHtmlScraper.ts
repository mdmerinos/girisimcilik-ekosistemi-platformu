import * as cheerio from "cheerio";

import { fetchTextWithRetry } from "@/lib/ingestion/fetchWithRetry";
import { EmptySourceError } from "@/lib/ingestion/sourceStatus";
import { extractCleanSummary } from "@/lib/scrapers/cleanOpportunitySummary";
import { createUniqueKey, normalizeOriginalUrl } from "@/lib/utils/createUniqueKey";
import { normalizeText } from "@/lib/utils/normalizeText";
import {
  chooseOpportunityUrl,
  resolveOpportunityUrl,
} from "@/lib/utils/opportunityUrl";
import { parseDate } from "@/lib/utils/parseDate";
import { truncateText } from "@/lib/utils/truncateText";
import type { OpportunityCategory, OpportunityInput } from "@/types/opportunity";

export type HtmlScraperOptions = {
  url: string;
  sourceName: string;
  category: OpportunityCategory;
  itemSelector: string;
  linkSelector?: string;
  titleSelector?: string;
  summarySelector?: string;
  dateSelector?: string;
  containerSelector?: string;
  linkPattern?: RegExp;
  excludeLinkPattern?: RegExp;
  maxItems?: number;
  location?: string | null;
  requestTimeoutMs?: number;
  requestRetries?: number;
};

const DATE_PATTERN =
  /\b(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{1,2}\s+(?:Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara)[a-zçğıöşü]*\s+\d{4})\b/i;

export async function scrapeGenericHtml({
  url,
  sourceName,
  category,
  itemSelector,
  linkSelector,
  titleSelector,
  summarySelector,
  dateSelector,
  containerSelector,
  linkPattern,
  excludeLinkPattern,
  maxItems = 30,
  location = "Türkiye",
  requestTimeoutMs,
  requestRetries,
}: HtmlScraperOptions): Promise<OpportunityInput[]> {
  const html = await fetchTextWithRetry(url, {
    headers: { "content-type": "text/html; charset=utf-8" },
    timeoutMs: requestTimeoutMs,
    retries: requestRetries,
  });
  const $ = cheerio.load(html);
  const fetchedAt = new Date().toISOString();
  const results = new Map<string, OpportunityInput>();

  $(itemSelector).each((_, element) => {
    if (results.size >= maxItems) return false;

    const item = $(element);
    const links = linkSelector
      ? item.find(linkSelector)
      : item.is("a")
        ? item
        : item.find("a[href]");
    const originalUrlCandidate = chooseOpportunityUrl(
      links
        .toArray()
        .map((linkElement) => $(linkElement).attr("href")),
      url,
    );
    if (!originalUrlCandidate) return;
    const link =
      links
        .toArray()
        .map((linkElement) => $(linkElement))
        .find(
          (linkItem) =>
            resolveOpportunityUrl(linkItem.attr("href"), url) ===
            originalUrlCandidate,
        ) ?? links.first();
    const originalUrl = normalizeOriginalUrl(originalUrlCandidate);
    if (linkPattern && !linkPattern.test(originalUrl)) return;
    if (excludeLinkPattern?.test(originalUrl)) return;

    const container = containerSelector
      ? item.closest(containerSelector).length
        ? item.closest(containerSelector)
        : item
      : item;
    const selectedTitleCandidate = titleSelector
      ? container.find(titleSelector).first().text()
      : "";
    const selectedTitle = /^\s*\{.+\}\s*$/.test(selectedTitleCandidate)
      ? ""
      : selectedTitleCandidate;
    const title = normalizeText(
      selectedTitle || link.attr("title") || link.text(),
    );

    if (title.length < 3) return;

    const summaryText = summarySelector
      ? container.find(summarySelector).first().text()
      : container.find("p").first().text();
    const summary = extractCleanSummary(summaryText, title);
    const imageSource = container.find("img[src]").first().attr("src");
    const imageUrl =
      imageSource && URL.canParse(imageSource, url)
        ? new URL(imageSource, url).toString()
        : null;
    const dateText = dateSelector
      ? container.find(dateSelector).first().text()
      : container.text().match(DATE_PATTERN)?.[1];

    const existing = results.get(originalUrl);
    if (existing && existing.title.length >= title.length) return;

    results.set(originalUrl, {
      unique_key: createUniqueKey(sourceName, originalUrl),
      title: truncateText(title, 240),
      summary,
      category,
      source_name: sourceName,
      source_url: originalUrl,
      application_url: originalUrl,
      image_url: imageUrl,
      published_at: parseDate(dateText),
      deadline_at: null,
      fetched_at: fetchedAt,
      location,
      is_featured: false,
    });
  });

  if (results.size === 0) {
    throw new EmptySourceError(url);
  }

  return [...results.values()];
}
