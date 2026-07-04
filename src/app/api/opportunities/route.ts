import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fallbackOpportunities } from "@/data/fallbackOpportunities";
import {
  INVESTMENT_CATEGORY,
  isStrictInvestmentOpportunity,
} from "@/lib/ingestion/investmentClassification";
import {
  COUNTRY_GROUPS,
  matchesCountryGroup,
} from "@/lib/opportunities/countryGroup";
import { sanitizeNasaSbirOpportunityDates } from "@/lib/opportunities/nasaSbirDates";
import {
  TIME_RANGES,
  matchesOpportunitySearch,
  matchesTimeRange,
  sortOpportunities,
} from "@/lib/opportunities/opportunityFilters";
import {
  createAdminSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/admin";
import { OPPORTUNITY_CATEGORIES, type Opportunity } from "@/types/opportunity";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  page: z.coerce.number().int().min(1).default(1),
  category: z.enum(OPPORTUNITY_CATEGORIES).optional(),
  countryGroup: z.enum(COUNTRY_GROUPS).default("all"),
  timeRange: z.enum(TIME_RANGES).default("near"),
  q: z.string().trim().max(100).optional(),
});

async function getAllOpportunityRows(): Promise<Opportunity[]> {
  const supabase = createAdminSupabaseClient();
  const batchSize = 1000;
  const rows: Opportunity[] = [];

  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await supabase
      .from("opportunities")
      .select("*")
      .order("id", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) throw error;
    const batch = (data ?? []) as Opportunity[];
    rows.push(...batch);
    if (batch.length < batchSize) return rows;
  }
}

function isAllowedForCategory(item: Opportunity, category?: string): boolean {
  if (category !== INVESTMENT_CATEGORY) return true;
  return isStrictInvestmentOpportunity({
    title: item.title,
    summary: item.summary,
    sourceName: item.source_name,
    category: item.category,
  });
}

function prepareResponse(
  rows: Opportunity[],
  options: z.infer<typeof querySchema>,
  source: "supabase" | "fallback",
  lastUpdated: string | null,
) {
  const { limit, page, category, countryGroup, timeRange, q } = options;
  const offset = (page - 1) * limit;
  const now = new Date();

  const scopedRows = rows
    .map(sanitizeNasaSbirOpportunityDates)
    .filter((item) => matchesCountryGroup(item.location, countryGroup))
    .filter((item) => matchesTimeRange(item, timeRange, now))
    .filter((item) => matchesOpportunitySearch(item, q));

  const categoryCounts = Object.fromEntries(
    OPPORTUNITY_CATEGORIES.map((itemCategory) => [
      itemCategory,
      scopedRows.filter(
        (item) =>
          item.category === itemCategory &&
          isAllowedForCategory(item, itemCategory),
      ).length,
    ]),
  );

  const filteredRows = sortOpportunities(
    scopedRows.filter(
      (item) =>
        (!category || item.category === category) &&
        isAllowedForCategory(item, category ?? item.category),
    ),
    now,
  );
  const data = filteredRows.slice(offset, offset + limit);

  return NextResponse.json({
    data,
    meta: {
      source,
      count: filteredRows.length,
      total: scopedRows.length,
      categoryCounts,
      lastUpdated,
      page,
      limit,
      hasMore: offset + data.length < filteredRows.length,
      timeRange,
      query: q ?? "",
    },
  });
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Geçersiz sorgu parametreleri", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = createAdminSupabaseClient();
      const [
        rows,
        { data: latestRows, error: latestError },
      ] = await Promise.all([
        getAllOpportunityRows(),
        supabase
          .from("opportunities")
          .select("fetched_at")
          .order("fetched_at", { ascending: false })
          .limit(1),
      ]);

      if (latestError) throw latestError;

      return prepareResponse(
        rows,
        parsed.data,
        "supabase",
        latestRows?.[0]?.fetched_at ?? null,
      );
    } catch (error) {
      console.error("Supabase opportunities query failed:", error);
    }
  }

  return prepareResponse(
    fallbackOpportunities,
    parsed.data,
    "fallback",
    fallbackOpportunities[0]?.fetched_at ?? null,
  );
}
