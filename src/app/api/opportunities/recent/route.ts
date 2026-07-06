import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  CONTENT_VIEWS,
  type ContentView,
} from "@/lib/opportunities/opportunityQueryFilters";
import { selectRecentOpportunities } from "@/lib/opportunities/recentOpportunities";
import {
  createAdminSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/admin";
import type { Opportunity } from "@/types/opportunity";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  since: z.string().datetime().optional(),
  minutes: z.coerce.number().int().min(1).max(1440).default(5),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  view: z.enum(CONTENT_VIEWS).default("all"),
});

function cutoffFromQuery(options: z.infer<typeof querySchema>, now: Date): Date {
  if (options.since) return new Date(options.since);
  return new Date(now.getTime() - options.minutes * 60 * 1000);
}

function toRecentPayload(item: Opportunity, contentView: ContentView) {
  return {
    id: item.id,
    title: item.title,
    source_name: item.source_name,
    category: item.category,
    created_at: item.created_at,
    published_at: item.published_at,
    source_url: item.source_url,
    application_url: item.application_url,
    contentView,
  };
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

  const now = new Date();
  const since = cutoffFromQuery(parsed.data, now);

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      data: [],
      meta: {
        source: "fallback",
        count: 0,
        since: since.toISOString(),
        view: parsed.data.view,
      },
    });
  }

  try {
    const { data, error } = await createAdminSupabaseClient()
      .from("opportunities")
      .select(
        "id,unique_key,title,summary,category,source_name,source_url,application_url,image_url,published_at,deadline_at,fetched_at,location,is_featured,created_at,updated_at",
      )
      .gt("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const recent = selectRecentOpportunities((data ?? []) as Opportunity[], {
      since,
      contentView: parsed.data.view,
      now,
      limit: parsed.data.limit,
    });

    return NextResponse.json({
      data: recent.map((item) => toRecentPayload(item, parsed.data.view)),
      meta: {
        source: "supabase",
        count: recent.length,
        since: since.toISOString(),
        view: parsed.data.view,
      },
    });
  } catch (error) {
    console.error("Recent opportunities query failed:", error);
    return NextResponse.json(
      { error: "Yeni kayıtlar alınamadı." },
      { status: 500 },
    );
  }
}
