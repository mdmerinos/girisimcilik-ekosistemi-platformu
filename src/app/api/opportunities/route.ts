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
  TODAY_FILTERS,
  TIME_RANGES,
  matchesOpportunitySearch,
  matchesTodayFilter,
  matchesTimeRange,
  sortOpportunities,
} from "@/lib/opportunities/opportunityFilters";
import {
  OPPORTUNITY_SOURCES,
  matchesOpportunitySource,
} from "@/lib/opportunities/opportunitySource";
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
  today: z.enum(TODAY_FILTERS).default("all"),
  source: z.enum(OPPORTUNITY_SOURCES).default("all"),
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
  lastScanAt: string | null,
  sourceWorkerStatus: {
    status: string;
    message: string | null;
    lastRunAt: string | null;
  } | null,
) {
  const {
    limit,
    page,
    category,
    countryGroup,
    timeRange,
    today,
    source: sourceFilter,
    q,
  } = options;
  const offset = (page - 1) * limit;
  const now = new Date();

  const scopedRows = rows
    .map(sanitizeNasaSbirOpportunityDates)
    .filter((item) => matchesCountryGroup(item.location, countryGroup))
    .filter(
      (item) => today !== "all" || matchesTimeRange(item, timeRange, now),
    )
    .filter((item) => matchesTodayFilter(item, today, now))
    .filter((item) => matchesOpportunitySource(item, sourceFilter))
    .filter((item) => matchesOpportunitySearch(item, q));

  const lastDataAddedAt =
    rows
      .map((item) => item.created_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

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
      lastUpdated: lastDataAddedAt,
      lastDataAddedAt,
      lastScanAt,
      page,
      limit,
      hasMore: offset + data.length < filteredRows.length,
      timeRange,
      today,
      sourceFilter,
      sourceWorkerStatus,
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
        { data: latestRun, error: latestError },
        { data: workerLog, error: workerLogError },
      ] = await Promise.all([
        getAllOpportunityRows(),
        supabase
          .from("ingestion_runs")
          .select("finished_at")
          .in("status", ["success", "partial"])
          .order("finished_at", { ascending: false, nullsFirst: false })
          .limit(1),
        ["nato-diana", "odtu-teknokent"].includes(parsed.data.source)
          ? supabase
              .from("ingestion_logs")
              .select("status,error_message,finished_at,created_at")
              .eq("source_id", parsed.data.source)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (latestError) throw latestError;
      if (workerLogError) throw workerLogError;

      return prepareResponse(
        rows,
        parsed.data,
        "supabase",
        latestRun?.[0]?.finished_at ?? null,
        workerLog
          ? {
              status: workerLog.status as string,
              message: (workerLog.error_message as string | null) ?? null,
              lastRunAt:
                (workerLog.finished_at as string | null) ??
                (workerLog.created_at as string | null) ??
                null,
            }
          : null,
      );
    } catch (error) {
      console.error("Supabase opportunities query failed:", error);
    }
  }

  return prepareResponse(
    fallbackOpportunities,
    parsed.data,
    "fallback",
    null,
    null,
  );
}
