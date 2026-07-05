import Parser from "rss-parser";

import { fetchTextWithRetry } from "@/lib/ingestion/fetchWithRetry";
import { mapWithConcurrency } from "@/lib/ingestion/mapWithConcurrency";
import {
  cleanOpportunitySummary,
  extractCleanSummary,
} from "@/lib/scrapers/cleanOpportunitySummary";
import { extractPageMetadata } from "@/lib/scrapers/extractPageMetadata";
import { createUniqueKey, normalizeOriginalUrl } from "@/lib/utils/createUniqueKey";
import { normalizeText } from "@/lib/utils/normalizeText";
import { chooseOpportunityUrl } from "@/lib/utils/opportunityUrl";
import { parseDate } from "@/lib/utils/parseDate";
import type { OpportunityCategory, OpportunityInput } from "@/types/opportunity";

export type RssScraperOptions = {
  feedUrl: string;
  sourceName: string;
  category?: OpportunityCategory;
  maxItems?: number;
  location?: string | null;
};

type MediaField =
  | string
  | {
      $?: { url?: string };
      url?: string;
    };

type CustomRssItem = {
  mediaContent?: MediaField;
  mediaThumbnail?: MediaField;
};

const parser = new Parser<Record<string, never>, CustomRssItem>({
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

function mediaFieldUrl(value: MediaField | undefined): string | null {
  if (typeof value === "string") return value;
  return value?.$?.url ?? value?.url ?? null;
}

function absoluteImageUrl(
  value: string | null | undefined,
  baseUrl: string,
): string | null {
  if (!value || !URL.canParse(value, baseUrl)) return null;
  const url = new URL(value, baseUrl);
  return url.protocol === "http:" || url.protocol === "https:"
    ? url.toString()
    : null;
}

function firstHtmlImage(value: string | undefined): string | null {
  if (!value) return null;
  return value.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? null;
}

export async function scrapeRss({
  feedUrl,
  sourceName,
  category = "Haber ve Sosyal Medya Akışı",
  maxItems = 50,
  location = null,
}: RssScraperOptions): Promise<OpportunityInput[]> {
  const xml = await fetchTextWithRetry(feedUrl, {
    headers: { accept: "application/rss+xml,application/xml,text/xml" },
  });
  const feed = await parser.parseString(xml);
  const fetchedAt = new Date().toISOString();

  const items = feed.items
    .slice(0, maxItems)
    .flatMap((item): OpportunityInput[] => {
      const title = item.title ? normalizeText(item.title) : "";
      const originalUrl = chooseOpportunityUrl(
        [item.link, item.guid],
        feedUrl,
      );
      if (!originalUrl || !title) return [];
      const normalizedUrl = normalizeOriginalUrl(originalUrl);
      const summary = extractCleanSummary(
        item.contentSnippet ?? item.content ?? item.summary,
        title,
      );
      const imageUrl = absoluteImageUrl(
        mediaFieldUrl(item.mediaContent) ??
          mediaFieldUrl(item.mediaThumbnail) ??
          item.enclosure?.url ??
          firstHtmlImage(item.content) ??
          firstHtmlImage(item.summary),
        normalizedUrl,
      );

      return [
        {
          unique_key: createUniqueKey(sourceName, normalizedUrl),
          title,
          summary,
          category,
          source_name: sourceName,
          source_url: normalizedUrl,
          application_url: normalizedUrl,
          image_url: imageUrl,
          published_at: parseDate(item.isoDate ?? item.pubDate),
          deadline_at: null,
          fetched_at: fetchedAt,
          location,
          is_featured: false,
        },
      ];
    });

  return mapWithConcurrency(
    items,
    3,
    async (item, index) => {
      if (
        sourceName !== "Hacker News" ||
        item.summary !== null ||
        index >= 10
      ) {
        return {
          ...item,
          summary:
            item.summary ??
            cleanOpportunitySummary(null),
        };
      }

      const metadata = await extractPageMetadata(item.source_url);
      const metadataSummary =
        metadata?.description ??
        metadata?.openGraphDescription ??
        metadata?.twitterDescription ??
        metadata?.jsonLdDescription ??
        metadata?.pageDescription;

      return {
        ...item,
        summary:
          extractCleanSummary(metadataSummary, item.title) ??
          cleanOpportunitySummary(null),
        image_url: item.image_url ?? metadata?.imageUrl ?? null,
      };
    },
    async (item) => ({
      ...item,
      summary:
        item.summary ??
        cleanOpportunitySummary(null),
    }),
  );
}
