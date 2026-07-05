import * as cheerio from "cheerio";

import { fetchTextWithRetry } from "@/lib/ingestion/fetchWithRetry";
import { extractCleanSummary } from "@/lib/scrapers/cleanOpportunitySummary";
import { createUniqueKey, normalizeOriginalUrl } from "@/lib/utils/createUniqueKey";
import { normalizeText } from "@/lib/utils/normalizeText";
import { parseDate } from "@/lib/utils/parseDate";
import type { OpportunityCategory, OpportunityInput } from "@/types/opportunity";

export type PublicNewsListingOptions = {
  url: string;
  sourceName: string;
  category: OpportunityCategory;
  location: string;
  itemSelector: string;
  linkPattern: RegExp;
  excludeLinkPattern?: RegExp;
  containerSelector: string;
  summarySelector?: string;
  dateSelector?: string;
  maxItems?: number;
};

function publishedAtFromUrl(url: string): string | null {
  const match = url.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})\//);
  return match ? parseDate(`${match[1]}-${match[2]}-${match[3]}`) : null;
}

export async function scrapePublicNewsListing({
  url,
  sourceName,
  category,
  location,
  itemSelector,
  linkPattern,
  excludeLinkPattern,
  containerSelector,
  summarySelector = "p",
  dateSelector = "time, .date, .entry-date, .td-post-date",
  maxItems = 50,
}: PublicNewsListingOptions): Promise<OpportunityInput[]> {
  const html = await fetchTextWithRetry(url, {
    headers: { accept: "text/html,application/xhtml+xml" },
  });
  const $ = cheerio.load(html);
  const fetchedAt = new Date().toISOString();
  const results = new Map<string, OpportunityInput>();

  $(itemSelector).each((_, element) => {
    if (results.size >= maxItems) return false;

    const anchor = $(element).is("a")
      ? $(element)
      : $(element).find("a[href]").first();
    const href = anchor.attr("href");
    if (!href || !URL.canParse(href, url)) return;

    const originalUrl = normalizeOriginalUrl(new URL(href, url).toString());
    if (!linkPattern.test(originalUrl) || excludeLinkPattern?.test(originalUrl)) {
      return;
    }

    const container = anchor.closest(containerSelector);
    const title = normalizeText(
      anchor.attr("title") ||
        anchor.find("h1, h2, h3, h4").first().text() ||
        anchor.text(),
    );
    if (title.length < 12 || /^\s*@media\b/i.test(title)) return;

    const summary = extractCleanSummary(
      container.find(summarySelector).first().text(),
      title,
    );
    const dateText =
      container.find(dateSelector).first().attr("datetime") ??
      container.find(dateSelector).first().text();
    const imageSource =
      container.find("img[src]").first().attr("src") ??
      container.find("img[data-src]").first().attr("data-src");
    const imageUrl =
      imageSource && URL.canParse(imageSource, url)
        ? new URL(imageSource, url).toString()
        : null;

    results.set(originalUrl, {
      unique_key: createUniqueKey(sourceName, originalUrl),
      title,
      summary,
      category,
      source_name: sourceName,
      source_url: originalUrl,
      application_url: originalUrl,
      image_url: imageUrl,
      published_at: parseDate(dateText) ?? publishedAtFromUrl(originalUrl),
      deadline_at: null,
      fetched_at: fetchedAt,
      location,
      is_featured: false,
    });
  });

  return [...results.values()];
}

function newestPublication(items: OpportunityInput[]): number | null {
  const dates = items
    .map((item) => item.published_at && new Date(item.published_at).getTime())
    .filter((value): value is number => value !== null && Number.isFinite(value));
  return dates.length > 0 ? Math.max(...dates) : null;
}

export async function collectRssWithPublicFallbackDetailed(options: {
  collectRss: () => Promise<OpportunityInput[]>;
  collectPublic: () => Promise<OpportunityInput[]>;
  rssUrl: string;
  publicUrl: string;
  now?: Date;
  staleAfterHours?: number;
}): Promise<{
  items: OpportunityInput[];
  attemptedUrls: string[];
  fallbackStatus: "not_needed" | "success" | "failed";
}> {
  const rssItems = await options.collectRss();
  const newest = newestPublication(rssItems);
  const staleBoundary =
    (options.now ?? new Date()).getTime() -
    (options.staleAfterHours ?? 36) * 60 * 60 * 1000;

  if (newest !== null && newest >= staleBoundary) {
    return {
      items: rssItems,
      attemptedUrls: [options.rssUrl],
      fallbackStatus: "not_needed",
    };
  }

  try {
    const publicItems = await options.collectPublic();
    return {
      items: [
        ...new Map(
          [...rssItems, ...publicItems].map((item) => [
            normalizeOriginalUrl(item.source_url),
            item,
          ]),
        ).values(),
      ],
      attemptedUrls: [options.rssUrl, options.publicUrl],
      fallbackStatus: "success",
    };
  } catch {
    return {
      items: rssItems,
      attemptedUrls: [options.rssUrl, options.publicUrl],
      fallbackStatus: "failed",
    };
  }
}

export async function collectRssWithPublicFallback(
  options: Parameters<typeof collectRssWithPublicFallbackDetailed>[0],
): Promise<OpportunityInput[]> {
  return (await collectRssWithPublicFallbackDetailed(options)).items;
}
