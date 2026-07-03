import { z } from "zod";

import { fetchWithRetry } from "@/lib/ingestion/fetchWithRetry";
import { createUniqueKey } from "@/lib/utils/createUniqueKey";
import { parseDate } from "@/lib/utils/parseDate";
import type { OpportunityInput } from "@/types/opportunity";

const responseSchema = z.object({
  opportunitiesData: z.array(
    z
      .object({
        noticeId: z.string(),
        title: z.string(),
        postedDate: z.string().optional(),
        responseDeadLine: z.string().optional(),
        fullParentPathName: z.string().optional(),
        uiLink: z.string().optional(),
        type: z.string().optional(),
      })
      .passthrough(),
  ),
});

function mmddyyyy(date: Date): string {
  return [
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    date.getUTCFullYear(),
  ].join("/");
}

export async function fetchSamGov(): Promise<OpportunityInput[]> {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) throw new Error("SAM_GOV_API_KEY is not configured.");

  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 364);
  const endpoint = new URL(
    "https://api.sam.gov/prod/opportunities/v2/search",
  );
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("limit", "100");
  endpoint.searchParams.set("postedFrom", mmddyyyy(from));
  endpoint.searchParams.set("postedTo", mmddyyyy(today));
  endpoint.searchParams.set("ptype", "o");

  const response = await fetchWithRetry(endpoint.toString(), {
    headers: { accept: "application/json" },
  });
  const payload = responseSchema.parse(await response.json());
  const fetchedAt = new Date().toISOString();

  return payload.opportunitiesData.map((item) => {
    const originalUrl =
      item.uiLink ?? `https://sam.gov/opp/${item.noticeId}/view`;
    return {
      unique_key: createUniqueKey("SAM.gov", originalUrl),
      title: item.title,
      summary: [item.fullParentPathName, item.type].filter(Boolean).join(" · "),
      category: "Uluslararası Fonlar",
      source_name: "SAM.gov",
      source_url: originalUrl,
      application_url: originalUrl,
      published_at: parseDate(item.postedDate),
      deadline_at: parseDate(item.responseDeadLine),
      fetched_at: fetchedAt,
      location: "ABD",
      is_featured: false,
    };
  });
}
