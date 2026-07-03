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
  addedToday: 0,
  investmentNewsLast7Days: 0,
  upcomingEvents: 0,
  nationalSupports: 0,
  internationalFunds: 0,
  lastSuccessfulUpdate: null,
};

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
      { data: opportunities, error: opportunitiesError },
      { data: latestRun, error: latestRunError },
    ] = await Promise.all([
      supabase.from("opportunities").select("*").limit(5000),
      supabase
        .from("ingestion_runs")
        .select("finished_at")
        .in("status", ["success", "partial"])
        .order("finished_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (opportunitiesError) throw opportunitiesError;
    if (latestRunError) throw latestRunError;

    return NextResponse.json({
      data: calculateOpportunityStats(
        (opportunities ?? []) as Opportunity[],
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
