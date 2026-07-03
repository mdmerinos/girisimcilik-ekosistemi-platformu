import * as cheerio from "cheerio";

import { fetchTextWithRetry } from "@/lib/ingestion/fetchWithRetry";
import { normalizeText } from "@/lib/utils/normalizeText";

export type PageMetadata = {
  title: string | null;
  description: string | null;
  openGraphTitle: string | null;
  openGraphDescription: string | null;
  twitterDescription: string | null;
  imageUrl: string | null;
  canonicalUrl: string | null;
  jsonLdDescription: string | null;
  pageDescription: string | null;
};

function absoluteHttpUrl(
  value: string | null | undefined,
  pageUrl: string,
): string | null {
  if (!value || !URL.canParse(value, pageUrl)) return null;
  const url = new URL(value, pageUrl);
  return url.protocol === "http:" || url.protocol === "https:"
    ? url.toString()
    : null;
}

function findJsonLdDescription(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const description = findJsonLdDescription(item);
      if (description) return description;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.description === "string") {
    return normalizeText(record.description) || null;
  }

  return findJsonLdDescription(record["@graph"]);
}

export async function extractPageMetadata(
  pageUrl: string,
  timeoutMs = 8_000,
): Promise<PageMetadata | null> {
  if (!URL.canParse(pageUrl)) return null;

  try {
    const html = await fetchTextWithRetry(pageUrl, {
      timeoutMs,
      retries: 1,
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    const $ = cheerio.load(html);
    const meta = (selector: string) =>
      normalizeText($(selector).first().attr("content") ?? "") || null;
    let jsonLdDescription: string | null = null;

    $('script[type="application/ld+json"]').each((_, element) => {
      if (jsonLdDescription) return false;
      try {
        jsonLdDescription = findJsonLdDescription(
          JSON.parse($(element).text()),
        );
      } catch {
        // Invalid JSON-LD should not invalidate otherwise useful page metadata.
      }
    });

    const openGraphImage = meta('meta[property="og:image"]');
    const twitterImage =
      meta('meta[name="twitter:image"]') ??
      meta('meta[property="twitter:image"]');
    const pageDescription =
      $("main article p, article p, main p")
        .toArray()
        .map((element) => normalizeText($(element).text()))
        .find((value) => value.length >= 30) ?? null;

    return {
      title: normalizeText($("title").first().text()) || null,
      description: meta('meta[name="description"]'),
      openGraphTitle: meta('meta[property="og:title"]'),
      openGraphDescription: meta('meta[property="og:description"]'),
      twitterDescription:
        meta('meta[name="twitter:description"]') ??
        meta('meta[property="twitter:description"]'),
      imageUrl: absoluteHttpUrl(openGraphImage ?? twitterImage, pageUrl),
      canonicalUrl: absoluteHttpUrl(
        $('link[rel="canonical"]').first().attr("href"),
        pageUrl,
      ),
      jsonLdDescription,
      pageDescription,
    };
  } catch {
    return null;
  }
}
