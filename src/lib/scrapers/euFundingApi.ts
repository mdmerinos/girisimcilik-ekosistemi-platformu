import * as cheerio from "cheerio";
import { z } from "zod";

import { fetchWithRetry } from "@/lib/ingestion/fetchWithRetry";
import {
  cleanOpportunitySummary,
  extractCleanSummary,
} from "@/lib/scrapers/cleanOpportunitySummary";
import { createUniqueKey, normalizeOriginalUrl } from "@/lib/utils/createUniqueKey";
import { normalizeText } from "@/lib/utils/normalizeText";
import { parseDate } from "@/lib/utils/parseDate";
import { truncateText } from "@/lib/utils/truncateText";
import type { OpportunityInput } from "@/types/opportunity";

const KEYWORDS = [
  "startup",
  "innovation",
  "SME",
  "entrepreneurship",
  "digital",
  "AI",
  "green",
  "climate",
  "women",
  "education",
] as const;

const euResultSchema = z.object({
  url: z.string(),
  content: z.string().optional(),
  summary: z.string().optional(),
  metadata: z
    .object({
      title: z.array(z.string()).optional(),
      callTitle: z.array(z.string()).optional(),
      callIdentifier: z.array(z.string()).optional(),
      topicIdentifier: z.array(z.string()).optional(),
      programmeTitle: z.array(z.string()).optional(),
      descriptionByte: z.array(z.string()).optional(),
      objective: z.array(z.string()).optional(),
      topicDescription: z.array(z.string()).optional(),
      startDate: z.array(z.string()).optional(),
      publicationDate: z.array(z.string()).optional(),
      openingDate: z.array(z.string()).optional(),
      deadlineDate: z.array(z.string()).optional(),
      status: z.array(z.string()).optional(),
    })
    .passthrough(),
});

const euResponseSchema = z.object({ results: z.array(euResultSchema) });
type EuResult = z.infer<typeof euResultSchema>;

const BASE_ENDPOINT =
  "https://api.tech.ec.europa.eu/search-api/prod/rest/search";

function plainText(value?: string): string {
  return value ? normalizeText(cheerio.load(value).text()) : "";
}

function buildEuSummary(item: EuResult, title: string): string {
  const description = extractCleanSummary(
    item.metadata.descriptionByte?.[0] ??
      item.metadata.objective?.[0] ??
      item.metadata.topicDescription?.[0] ??
      item.summary,
    title,
  );
  const context = [
    item.metadata.topicIdentifier?.[0],
    item.metadata.callIdentifier?.[0],
    item.metadata.programmeTitle?.[0],
    item.metadata.callTitle?.[0],
  ]
    .map((value) => plainText(value))
    .filter(
      (value, index, values) =>
        value &&
        value.toLocaleLowerCase() !== title.toLocaleLowerCase() &&
        values.indexOf(value) === index,
    )
    .slice(0, 2);

  return cleanOpportunitySummary(
    [context.join(" · "), description].filter(Boolean).join(" — "),
    title,
  );
}

async function fetchKeyword(keyword: string): Promise<EuResult[]> {
  const formData = new FormData();
  const query = {
    bool: {
      must: [
        { terms: { type: ["1", "2", "8"] } },
        { terms: { status: ["31094501", "31094502"] } },
      ],
    },
  };

  formData.append(
    "query",
    new Blob([JSON.stringify(query)], { type: "application/json" }),
    "query.json",
  );
  formData.append(
    "languages",
    new Blob([JSON.stringify(["en"])], { type: "application/json" }),
    "languages.json",
  );
  formData.append(
    "sort",
    new Blob([JSON.stringify({ field: "sortStatus", order: "ASC" })], {
      type: "application/json",
    }),
    "sort.json",
  );

  const endpoint = new URL(BASE_ENDPOINT);
  endpoint.searchParams.set("apiKey", "SEDIA");
  endpoint.searchParams.set("text", keyword);
  endpoint.searchParams.set("pageSize", "50");
  endpoint.searchParams.set("pageNumber", "1");

  const response = await fetchWithRetry(endpoint.toString(), {
    method: "POST",
    headers: { accept: "application/json" },
    body: formData,
  });
  return euResponseSchema.parse(await response.json()).results;
}

export async function fetchEuFunding(): Promise<OpportunityInput[]> {
  const responses = await Promise.allSettled(KEYWORDS.map(fetchKeyword));
  const rawResults = responses.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  if (rawResults.length === 0) {
    throw new Error("EU Funding keyword searches returned no usable results.");
  }

  const fetchedAt = new Date().toISOString();
  const uniqueResults = new Map(
    rawResults
      .filter((item) => URL.canParse(item.url))
      .map((item) => [normalizeOriginalUrl(item.url), item]),
  );

  return [...uniqueResults.entries()].flatMap(
    ([originalUrl, item]): OpportunityInput[] => {
      const title = normalizeText(
        plainText(
          item.metadata.title?.[0] ??
            item.metadata.callTitle?.[0] ??
            item.content ??
            item.summary,
        ),
      );
      if (!title) return [];

      return [
        {
          unique_key: createUniqueKey("EU Funding & Tenders", originalUrl),
          title: truncateText(title, 240),
          summary: buildEuSummary(item, title),
          category: "Uluslararası Fonlar",
          source_name: "EU Funding & Tenders",
          source_url: originalUrl,
          application_url: originalUrl,
          published_at: parseDate(
            item.metadata.publicationDate?.[0] ??
              item.metadata.openingDate?.[0] ??
              item.metadata.startDate?.[0],
          ),
          deadline_at: parseDate(item.metadata.deadlineDate?.[0]),
          fetched_at: fetchedAt,
          location: "Avrupa / Global",
          is_featured: false,
        },
      ];
    },
  );
}
