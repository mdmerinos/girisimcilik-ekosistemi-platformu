import { NextResponse } from "next/server";

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

export async function GET() {
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

    return NextResponse.json({
      data: calculateOpportunityStats(
        opportunities,
        new Date(),
        latestRun?.finished_at ?? null,
      ),
      meta: { source: "supabase" },
    });
  } catch (error) {
    console.error("Public stats query failed:", error);
    return NextResponse.json({
      data: unavailableStats,
      meta: { source: "unavailable" },
    });
  }
}
