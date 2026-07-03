import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fallbackOpportunities } from "@/data/fallbackOpportunities";
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
  q: z.string().trim().max(100).optional(),
});

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

  const { limit, page, category, q } = parsed.data;

  if (isSupabaseConfigured()) {
    try {
      const supabase = createAdminSupabaseClient();
      const offset = (page - 1) * limit;
      let query = supabase
        .from("opportunities")
        .select("*", { count: "exact" })
        .order("is_featured", { ascending: false })
        .order("published_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

      if (category) query = query.eq("category", category);
      if (q) query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%`);

      const [
        { data, error, count },
        { count: totalCount, error: totalError },
        { data: latestRows, error: latestError },
        ...categoryResults
      ] = await Promise.all([
        query,
        supabase
          .from("opportunities")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("opportunities")
          .select("fetched_at")
          .order("fetched_at", { ascending: false })
          .limit(1),
        ...OPPORTUNITY_CATEGORIES.map((itemCategory) =>
          supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("category", itemCategory),
        ),
      ]);
      if (error) throw error;
      if (totalError) throw totalError;
      if (latestError) throw latestError;
      const categoryError = categoryResults.find((result) => result.error)?.error;
      if (categoryError) throw categoryError;

      const categoryCounts = Object.fromEntries(
        OPPORTUNITY_CATEGORIES.map((itemCategory, index) => [
          itemCategory,
          categoryResults[index].count ?? 0,
        ]),
      );

      return NextResponse.json({
        data: (data ?? []) as Opportunity[],
        meta: {
          source: "supabase",
          count: count ?? 0,
          total: totalCount ?? 0,
          categoryCounts,
          lastUpdated: latestRows?.[0]?.fetched_at ?? null,
          page,
          limit,
          hasMore: offset + (data?.length ?? 0) < (count ?? 0),
        },
      });
    } catch (error) {
      console.error("Supabase opportunities query failed:", error);
    }
  }

  const filtered = fallbackOpportunities.filter((item) => {
    const matchesCategory = !category || item.category === category;
    const normalizedQuery = q?.toLocaleLowerCase("tr-TR");
    const matchesQuery =
      !normalizedQuery ||
      `${item.title} ${item.summary ?? ""}`
        .toLocaleLowerCase("tr-TR")
        .includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  });

  return NextResponse.json({
    data: filtered.slice(0, limit),
    meta: {
      source: "fallback",
      count: filtered.length,
      total: fallbackOpportunities.length,
      categoryCounts: Object.fromEntries(
        OPPORTUNITY_CATEGORIES.map((itemCategory) => [
          itemCategory,
          fallbackOpportunities.filter(
            (item) => item.category === itemCategory,
          ).length,
        ]),
      ),
      lastUpdated: fallbackOpportunities[0]?.fetched_at ?? null,
      page: 1,
      limit,
      hasMore: false,
    },
  });
}
