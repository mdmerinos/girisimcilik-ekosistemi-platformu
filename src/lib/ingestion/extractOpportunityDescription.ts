import * as cheerio from "cheerio";

import { fetchTextWithRetry } from "@/lib/ingestion/fetchWithRetry";
import { mapWithConcurrency } from "@/lib/ingestion/mapWithConcurrency";
import { buildSpecificFallbackDescription } from "@/lib/opportunities/specificFallbackDescription";
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
]);
const MAX_DETAIL_REQUESTS_PER_SOURCE = 16;
const DETAIL_CONCURRENCY = 4;
const MAX_DESCRIPTION_LENGTH = 380;

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
  if (!URL.canParse(url)) return null;

  try {
    const html = await fetchTextWithRetry(url, {
      timeoutMs,
      retries: 0,
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    return extractDescriptionFromHtml(html, title);
  } catch {
    return null;
  }
}

export async function enrichOpportunityDescriptions(
  items: OpportunityInput[],
  sourceId: string,
): Promise<OpportunityInput[]> {
  if (!DETAIL_SOURCE_IDS.has(sourceId)) return items;

  const badIndexes = items
    .map((item, index) =>
      isBadDescription(item.summary, item.title) ? index : -1,
    )
    .filter((index) => index >= 0);
  const indexesToFetch = badIndexes.slice(0, MAX_DETAIL_REQUESTS_PER_SOURCE);
  const extractedDescriptions = await mapWithConcurrency(
    indexesToFetch,
    DETAIL_CONCURRENCY,
    async (index) => {
      const item = items[index];
      const url = item.application_url ?? item.source_url;
      return fetchOpportunityDescription(url, item.title);
    },
    async () => null,
  );
  const extractedByIndex = new Map(
    indexesToFetch.map((index, position) => [
      index,
      extractedDescriptions[position],
    ]),
  );

  return items.map((item, index) => {
    if (!badIndexes.includes(index)) return item;
    return {
      ...item,
      summary:
        extractedByIndex.get(index) ??
        buildSpecificFallbackDescription(item),
    };
  });
}

export { buildSpecificFallbackDescription };
