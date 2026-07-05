import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { COUNTRY_GROUPS } from "@/lib/opportunities/countryGroup";
import {
  STAT_FILTERS,
  TIME_RANGES,
} from "@/lib/opportunities/opportunityFilters";
import {
  CATEGORY_QUERY_FILTERS,
  TODAY_QUERY_FILTERS,
  filterOpportunityRows,
  resolveCategoryFilter,
  resolveTodayFilter,
} from "@/lib/opportunities/opportunityQueryFilters";
import { OPPORTUNITY_SOURCES } from "@/lib/opportunities/opportunitySource";
import {
  calculateOpportunityStats,
  type OpportunityStats,
} from "@/lib/opportunities/opportunityStats";
import {
  createAdminSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/admin";
import type { Opportunity } from "@/types/opportunity";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  category: z
    .enum(CATEGORY_QUERY_FILTERS)
    .optional()
    .transform(resolveCategoryFilter),
  countryGroup: z.enum(COUNTRY_GROUPS).default("all"),
  timeRange: z.enum(TIME_RANGES).default("all"),
  today: z
    .enum(TODAY_QUERY_FILTERS)
    .default("all")
    .transform(resolveTodayFilter),
  statFilter: z.enum(STAT_FILTERS).default("all"),
  source: z.enum(OPPORTUNITY_SOURCES).default("all"),
  q: z.string().trim().max(100).optional(),
});

const unavailableStats: OpportunityStats = {
  total: 0,
  totalCount: 0,
  addedToday: 0,
  todayIngestedCount: 0,
  todayPublishedCount: 0,
  todayDeadlineCount: 0,
  nearCount: 0,
  activeCount: 0,
  farFutureCount: 0,
  expiredCount: 0,
  noDateCount: 0,
  investmentNewsLast7Days: 0,
  upcomingEvents: 0,
  nationalSupports: 0,
  internationalFunds: 0,
  lastSuccessfulUpdate: null,
  lastDataAddedAt: null,
};

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

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      data: unavailableStats,
      meta: { source: "unavailable" },
    });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const [
      opportunities,
      { data: latestRun, error: latestRunError },
    ] = await Promise.all([
      getAllOpportunityRows(),
      supabase
        .from("ingestion_runs")
        .select("finished_at")
        .in("status", ["success", "partial"])
        .order("finished_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (latestRunError) throw latestRunError;

    const now = new Date();
    const filteredOpportunities = filterOpportunityRows(
      opportunities,
      {
        ...parsed.data,
        query: parsed.data.q,
      },
      now,
    );

    return NextResponse.json({
      data: calculateOpportunityStats(
        filteredOpportunities,
        now,
        latestRun?.finished_at ?? null,
      ),
      meta: {
        source: "supabase",
        filteredTotal: filteredOpportunities.length,
      },
    });
  } catch (error) {
    console.error("Public stats query failed:", error);
    return NextResponse.json({
      data: unavailableStats,
      meta: { source: "unavailable" },
    });
  }
}
