import * as cheerio from "cheerio";

import { fetchTextWithRetry } from "@/lib/ingestion/fetchWithRetry";
import { EmptySourceError } from "@/lib/ingestion/sourceStatus";
import { extractCleanSummary } from "@/lib/scrapers/cleanOpportunitySummary";
import { createUniqueKey } from "@/lib/utils/createUniqueKey";
import { normalizeText } from "@/lib/utils/normalizeText";
import { resolveOpportunityUrl } from "@/lib/utils/opportunityUrl";
import { parseDate } from "@/lib/utils/parseDate";
import { truncateText } from "@/lib/utils/truncateText";
import type { OpportunityCategory, OpportunityInput } from "@/types/opportunity";

const SOURCE_NAME = "ODTÜ Teknokent";
const SOURCE_URL = "https://www.odtuteknokent.com.tr/tr/";
const DATE_PATTERN =
  /\b\d{1,2}(?:[./-]\d{1,2}[./-]\d{4}|\s+(?:ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)\s+\d{4})\b/i;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function categoryFor(title: string, summary: string | null): OpportunityCategory {
  const text = `${title} ${summary ?? ""}`.toLocaleLowerCase("tr-TR");
  if (
    /(yatırım aldı|yatırım turu|satın alındı|birleşme|venture capital|seed|series [a-z])/i.test(
      text,
    )
  ) {
    return "Yatırım ve Sermaye Ağları";
  }
  if (/(hibe|fon|destek çağrısı|bigg|tübitak|kosgeb)/i.test(text)) {
    return "Ulusal Destek ve Fonlar";
  }
  if (
    /(program|programı|başvuru|çağrı|hızlandırma|kuluçka|demo day|etkinlik|eğitim|mentorluk)/i.test(
      text,
    )
  ) {
    return "Etkinlik ve Programlar";
  }
  return "Haber ve Sosyal Medya Akışı";
}

export function extractOdtuPublishedAt(containerHtml: string): string | null {
  const $ = cheerio.load(containerHtml);
  const time = $("time[datetime]").first().attr("datetime");
  if (time) return parseDate(time);

  const explicitDate = $(".haber-tarih, .news-date, .date, time").first().text();
  if (explicitDate) {
    const parsed = parseDate(explicitDate);
    if (parsed) return parsed;
  }

  for (const element of $('script[type="application/ld+json"]').toArray()) {
    try {
      const value = JSON.parse($(element).text()) as
        | { datePublished?: unknown }
        | Array<{ datePublished?: unknown }>;
      const records = Array.isArray(value) ? value : [value];
      const datePublished = records.find(
        (record) => typeof record?.datePublished === "string",
      )?.datePublished;
      if (typeof datePublished === "string") {
        const parsed = parseDate(datePublished);
        if (parsed) return parsed;
      }
    } catch {
      // Invalid third-party JSON-LD must not stop collection.
    }
  }

  const contentText = normalizeText($("body").text());
  const labelledDate = contentText.match(
    new RegExp(
      `(?:Yayın Tarihi|Yayınlanma Tarihi|Haber Tarihi)\\s*:?\\s*(${DATE_PATTERN.source})`,
      "i",
    ),
  )?.[1];
  return parseDate(labelledDate);
}

export function extractOdtuDeadlineAt(containerHtml: string): string | null {
  const $ = cheerio.load(containerHtml);
  const contentText = normalizeText($("body").text());
  const labelledDeadline = contentText.match(
    new RegExp(
      `(?:Son Başvuru Tarihi|Başvuru Son Tarihi|Son Başvuru|Deadline)\\s*:?\\s*(${DATE_PATTERN.source})`,
      "i",
    ),
  )?.[1];
  return parseDate(labelledDeadline);
}

export function parseOdtuListingPage(
  html: string,
  pageUrl = SOURCE_URL,
): OpportunityInput[] {
  const $ = cheerio.load(html);
  const fetchedAt = new Date().toISOString();
  const results = new Map<string, OpportunityInput>();

  $(
    [
      ".news-container-wrapper .news-container",
      ".news-main-container .news-container",
      ".news-item",
      "article:has(.read-more)",
      ".card:has(.read-more)",
    ].join(", "),
  ).each((_, element) => {
    const container = $(element);
    const preferredLink = container.find(".read-more[href]").first();
    const linkElement = preferredLink.length
      ? preferredLink
      : container
          .find(
            'a[href*="/tr/haber/"], a[href*="/tr/duyuru/"], a[href*="basvuru"]',
          )
          .first();
    const url = resolveOpportunityUrl(linkElement.attr("href"), pageUrl);
    if (!url) return;

    const title = normalizeText(
      container.find("h4, h3, h2").first().text() ||
        linkElement.attr("title") ||
        linkElement.text(),
    );
    if (title.length < 3) return;

    const rawSummary = container
      .find(".news-excerpt, .excerpt, p")
      .first()
      .text();
    const summary = extractCleanSummary(rawSummary, title);
    const imageSource = container.find("img[src]").first().attr("src");
    const imageUrl =
      imageSource && URL.canParse(imageSource, pageUrl)
        ? new URL(imageSource, pageUrl).toString()
        : null;
    const publishedAt = extractOdtuPublishedAt($.html(container));
    const deadlineAt = extractOdtuDeadlineAt($.html(container));

    const existing = results.get(url);
    if (existing && existing.title.length >= title.length) return;

    results.set(url, {
      unique_key: createUniqueKey(SOURCE_NAME, url),
      title: truncateText(title, 240),
      summary,
      category: categoryFor(title, summary),
      source_name: SOURCE_NAME,
      source_url: url,
      application_url: url,
      image_url: imageUrl,
      published_at: publishedAt,
      deadline_at: deadlineAt,
      fetched_at: fetchedAt,
      location: "Türkiye",
      is_featured: false,
    });
  });

  return [...results.values()];
}

export async function scrapeOdtuTeknokent(): Promise<OpportunityInput[]> {
  const html = await fetchTextWithRetry(SOURCE_URL, {
    timeoutMs: 12_000,
    retries: 1,
    headers: {
      "user-agent": BROWSER_USER_AGENT,
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
    },
  });
  const items = parseOdtuListingPage(html);
  if (items.length === 0) throw new EmptySourceError(SOURCE_URL);
  return items;
}
