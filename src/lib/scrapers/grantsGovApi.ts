import { z } from "zod";

import { fetchWithRetry } from "@/lib/ingestion/fetchWithRetry";
import {
  resolveNasaSbirDeadlineAt,
  resolveNasaSbirPublishedAt,
} from "@/lib/opportunities/nasaSbirDates";
import { createUniqueKey } from "@/lib/utils/createUniqueKey";
import type { OpportunityInput } from "@/types/opportunity";

const KEYWORDS = [
  "startup",
  "entrepreneurship",
  "innovation",
  "small business",
  "technology",
  "research",
  "artificial intelligence",
  "climate",
  "women entrepreneurs",
  "education technology",
] as const;

const grantsResponseSchema = z.object({
  errorcode: z.number(),
  msg: z.string(),
  data: z.object({
    oppHits: z.array(
      z.object({
        id: z.string(),
        number: z.string().optional(),
        title: z.string(),
        agencyCode: z.string().optional(),
        agency: z.string().optional(),
        agencyName: z.string().optional(),
        openDate: z.string().optional(),
        closeDate: z.string().optional(),
        oppStatus: z.string().optional(),
      }),
    ),
  }),
});

const ENDPOINT = "https://api.grants.gov/v1/api/search2";
export function resolveGrantsGovDeadline(
  title: string,
  agency: string | undefined,
  closeDate: string | undefined,
): string | null {
  return resolveNasaSbirDeadlineAt(title, agency, closeDate);
}

async function fetchKeyword(keyword: string) {
  const response = await fetchWithRetry(ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      rows: 50,
      keyword,
      oppStatuses: "forecasted|posted",
      sortBy: "openDate|desc",
    }),
  });
  const payload = grantsResponseSchema.parse(await response.json());
  if (payload.errorcode !== 0) {
    throw new Error(`Grants.gov API error for "${keyword}": ${payload.msg}`);
  }
  return payload.data.oppHits;
}

export async function fetchGrantsGov(): Promise<OpportunityInput[]> {
  const responses = await Promise.allSettled(KEYWORDS.map(fetchKeyword));
  const hits = responses.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  if (hits.length === 0) {
    throw new Error("Grants.gov keyword searches returned no usable results.");
  }

  const fetchedAt = new Date().toISOString();
  const uniqueHits = new Map(hits.map((item) => [item.id, item]));

  return [...uniqueHits.values()].map((item) => {
    const originalUrl = `https://www.grants.gov/search-results-detail/${item.id}`;
    const agency = item.agency ?? item.agencyName ?? item.agencyCode;

    return {
      unique_key: createUniqueKey("Grants.gov", originalUrl),
      title: item.title,
      summary: [item.number, agency, item.oppStatus].filter(Boolean).join(" · "),
      category: "Uluslararası Fonlar",
      source_name: "Grants.gov",
      source_url: originalUrl,
      application_url: originalUrl,
      published_at: resolveNasaSbirPublishedAt(
        item.title,
        agency,
        item.openDate,
      ),
      deadline_at: resolveGrantsGovDeadline(
        item.title,
        agency,
        item.closeDate,
      ),
      fetched_at: fetchedAt,
      location: "ABD / Global",
      is_featured: false,
    };
  });
}
