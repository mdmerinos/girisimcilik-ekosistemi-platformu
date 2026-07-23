import * as cheerio from "cheerio";

import { fetchTextWithRetry } from "@/lib/ingestion/fetchWithRetry";
import { mapWithConcurrency } from "@/lib/ingestion/mapWithConcurrency";
import { buildSpecificFallbackDescription } from "@/lib/opportunities/specificFallbackDescription";
import { parseDate } from "@/lib/utils/parseDate";
import { normalizeText } from "@/lib/utils/normalizeText";
import type { OpportunityInput } from "@/types/opportunity";

const DETAIL_SOURCE_IDS = new Set([
  "grants-gov",
  "eu-funding",
  "nato-diana",
  "odtu-teknokent",
  "kosgeb-announcements",
  "kosgeb-supports",
  "tubitak",
  "tubitak-bigg",
  "itu-ari-teknokent",
  "analiz-gazetesi",
]);
const MAX_DETAIL_REQUESTS_PER_SOURCE = 16;
const DETAIL_CONCURRENCY = 4;
const MAX_DESCRIPTION_LENGTH = 380;

export type OpportunityDetail = {
  description: string | null;
  publishedAt: string | null;
  canonicalUrl: string | null;
  imageUrl: string | null;
};

export type DescriptionEnrichmentOptions = {
  force?: boolean;
  allowFallback?: boolean;
};

function comparable(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("tr-TR")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function truncateAtBoundary(value: string): string {
  if (value.length <= MAX_DESCRIPTION_LENGTH) return value;

  const candidate = value.slice(0, MAX_DESCRIPTION_LENGTH - 1);
  const sentenceBoundary = Math.max(
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("! "),
    candidate.lastIndexOf("? "),
  );
  const wordBoundary = candidate.lastIndexOf(" ");
  const boundary =
    sentenceBoundary >= 260
      ? sentenceBoundary + 1
      : wordBoundary >= 280
        ? wordBoundary
        : MAX_DESCRIPTION_LENGTH - 1;

  return `${candidate.slice(0, boundary).trim()}…`;
}

export function cleanDescriptionText(
  text: string | null | undefined,
): string {
  if (!text) return "";

  const $ = cheerio.load(`<body>${text}</body>`);
  $("script, style, noscript, nav, footer, aside").remove();
  $("body")
    .find("*")
    .filter((_, element) =>
      /^(?:share|read more|learn more|posted|apply)$/i.test(
        normalizeText($(element).text()),
      ),
    )
    .remove();
  return truncateAtBoundary(
    normalizeText($("body").text().replace(/\u200B|\uFEFF/g, " ")),
  );
}

export function isBadDescription(
  text: string | null | undefined,
  title: string,
): boolean {
  const cleaned = cleanDescriptionText(text);
  if (!cleaned || cleaned.length < 60) return true;

  const normalized = comparable(cleaned);
  const normalizedTitle = comparable(title);
  if (!normalized || normalized === normalizedTitle) return true;

  if (
    /^(?:posted|apply|read more|learn more|details?)$/.test(normalized) ||
    (/\bposted$/.test(normalized) && normalized.split(" ").length <= 14) ||
    /^detayli bilgi icin kaynak sayfasini goruntuleyin/.test(normalized) ||
    /^(?:nato )?diana s (?:mission|vision|purpose) is\b/.test(normalized) ||
    /^the defence innovation accelerator for the north atlantic is\b/.test(
      normalized,
    ) ||
    /^(?:cookie|privacy) (?:policy|notice)/.test(normalized) ||
    /^(?:share|menu|footer|navigation)\b/.test(normalized)
  ) {
    return true;
  }

  const descriptionTokens = new Set(normalized.split(" "));
  const titleTokens = new Set(normalizedTitle.split(" "));
  const overlap = [...descriptionTokens].filter((token) =>
    titleTokens.has(token),
  ).length;
  return (
    titleTokens.size > 0 &&
    overlap / Math.max(descriptionTokens.size, titleTokens.size) >= 0.9
  );
}

export function isMeaningfulDescription(
  text: string | null | undefined,
  title: string,
): boolean {
  return !isBadDescription(text, title);
}

function findJsonLdDescriptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(findJsonLdDescriptions);
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const descriptions =
    typeof record.description === "string" ? [record.description] : [];
  return [
    ...descriptions,
    ...findJsonLdDescriptions(record["@graph"]),
    ...findJsonLdDescriptions(record.mainEntity),
  ];
}

function findJsonLdDates(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(findJsonLdDates);
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const dates = [record.datePublished, record.dateCreated]
    .filter((date): date is string => typeof date === "string");
  return [
    ...dates,
    ...findJsonLdDates(record["@graph"]),
    ...findJsonLdDates(record.mainEntity),
  ];
}

function absoluteHttpUrl(
  value: string | null | undefined,
  pageUrl: string,
): string | null {
  if (!value || !URL.canParse(value, pageUrl)) return null;
  const url = new URL(value, pageUrl);
  return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
}

export function extractPublishedAtFromHtml(html: string): string | null {
  const $ = cheerio.load(html);
  const candidates: string[] = [];
  const add = (value: string | null | undefined) => {
    if (value) candidates.push(value);
  };

  for (const selector of [
    'meta[property="article:published_time"]',
    'meta[property="og:published_time"]',
    'meta[name="date"]',
    'meta[name="publish-date"]',
    'meta[name="datePublished"]',
    'meta[itemprop="datePublished"]',
  ]) {
    add($(selector).first().attr("content"));
  }
  add($("time[datetime]").first().attr("datetime"));
  add(
    $(
      "time, .date, .tarih, .published, .publish-date, [itemprop='datePublished']",
    )
      .first()
      .text(),
  );

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      for (const date of findJsonLdDates(JSON.parse($(element).text()))) {
        add(date);
      }
    } catch {
      // Invalid third-party JSON-LD must not invalidate the detail page.
    }
  });

  for (const candidate of candidates) {
    const parsed = parseDate(normalizeText(candidate));
    if (parsed) return parsed;
  }
  return null;
}

export function extractDescriptionFromHtml(
  html: string,
  title: string,
): string | null {
  const $ = cheerio.load(html);
  $("script:not([type='application/ld+json']), style, noscript").remove();
  const candidates: string[] = [];
  const add = (value: string | null | undefined) => {
    if (value) candidates.push(value);
  };

  add($('meta[name="description"]').first().attr("content"));
  add($('meta[property="og:description"]').first().attr("content"));

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      for (const description of findJsonLdDescriptions(
        JSON.parse($(element).text()),
      )) {
        add(description);
      }
    } catch {
      // Invalid third-party JSON-LD must not invalidate the page.
    }
  });

  $(
    [
      '[class*="description"]',
      '[id*="description"]',
      '[class*="synopsis"]',
      '[id*="synopsis"]',
      '[class*="objective"]',
      '[id*="objective"]',
      '[class*="scope"]',
      '[id*="scope"]',
      '[class*="summary"]',
      '[id*="summary"]',
      '[class*="abstract"]',
      '[id*="abstract"]',
      '[class*="expected-outcome"]',
      '[id*="expected-outcome"]',
    ].join(","),
  ).each((_, element) => add($(element).text()));

  $("h2, h3, h4, strong").each((_, element) => {
    if (
      /\b(description|synopsis|objective|scope|summary|abstract|expected outcome|opportunity synopsis|funding opportunity description|açıklama|özet)\b/i.test(
        normalizeText($(element).text()),
      )
    ) {
      add($(element).next("p, div, section").first().text());
    }
  });

  $("main article p, article p, main p").each((_, element) =>
    add($(element).text()),
  );

  for (const candidate of candidates) {
    const cleaned = cleanDescriptionText(candidate);
    if (isMeaningfulDescription(cleaned, title)) return cleaned;
  }
  return null;
}

export async function fetchOpportunityDescription(
  url: string,
  title: string,
  timeoutMs = 4_000,
): Promise<string | null> {
  return (await fetchOpportunityDetail(url, title, timeoutMs))?.description ?? null;
}

export async function fetchOpportunityDetail(
  url: string,
  title: string,
  timeoutMs = 4_000,
): Promise<OpportunityDetail | null> {
  if (!URL.canParse(url)) return null;

  try {
    const html = await fetchTextWithRetry(url, {
      timeoutMs,
      retries: 0,
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    const $ = cheerio.load(html);
    return {
      description: extractDescriptionFromHtml(html, title),
      publishedAt: extractPublishedAtFromHtml(html),
      canonicalUrl: absoluteHttpUrl(
        $('link[rel="canonical"]').first().attr("href"),
        url,
      ),
      imageUrl: absoluteHttpUrl(
        $('meta[property="og:image"]').first().attr("content") ??
          $('meta[name="twitter:image"]').first().attr("content"),
        url,
      ),
    };
  } catch {
    return null;
  }
}

export async function enrichOpportunityDescriptions(
  items: OpportunityInput[],
  sourceId: string,
  options: DescriptionEnrichmentOptions = {},
): Promise<OpportunityInput[]> {
  if (!options.force && !DETAIL_SOURCE_IDS.has(sourceId)) return items;

  const incompleteIndexes = items
    .map((item, index) =>
      isBadDescription(item.summary, item.title) || !item.published_at
        ? index
        : -1,
    )
    .filter((index) => index >= 0);
  const indexesToFetch = incompleteIndexes.slice(
    0,
    MAX_DETAIL_REQUESTS_PER_SOURCE,
  );
  const extractedDetails = await mapWithConcurrency(
    indexesToFetch,
    DETAIL_CONCURRENCY,
    async (index) => {
      const item = items[index];
      const url = item.application_url ?? item.source_url;
      return fetchOpportunityDetail(url, item.title);
    },
    async () => null,
  );
  const extractedByIndex = new Map(
    indexesToFetch.map((index, position) => [
      index,
      extractedDetails[position],
    ]),
  );

  return items.map((item, index) => {
    if (!incompleteIndexes.includes(index)) return item;
    const detail = extractedByIndex.get(index);
    const badDescription = isBadDescription(item.summary, item.title);
    return {
      ...item,
      summary: badDescription
        ? detail?.description ??
          (options.allowFallback === true
            ? buildSpecificFallbackDescription(item)
            : item.summary)
        : item.summary,
      published_at: item.published_at ?? detail?.publishedAt ?? null,
      image_url: item.image_url ?? detail?.imageUrl ?? null,
    };
  });
}

export { buildSpecificFallbackDescription };
