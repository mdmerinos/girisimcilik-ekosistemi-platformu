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
  q: z.string().trim().max(100).optional(),
});

function isAllowedForCategory(item: Opportunity, category?: string): boolean {
  if (category !== INVESTMENT_CATEGORY) return true;
  return isStrictInvestmentOpportunity({
    title: item.title,
    summary: item.summary,
    sourceName: item.source_name,
    category: item.category,
  });
}

function matchesSearch(item: Opportunity, q?: string): boolean {
  const normalizedQuery = q?.toLocaleLowerCase("tr-TR");
  return (
    !normalizedQuery ||
    `${item.title} ${item.summary ?? ""}`
      .toLocaleLowerCase("tr-TR")
      .includes(normalizedQuery)
  );
}

async function getStrictInvestmentCount() {
  const { data, error } = await createAdminSupabaseClient()
    .from("opportunities")
    .select("*")
    .eq("category", INVESTMENT_CATEGORY)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1000);

  if (error) throw error;
  return ((data ?? []) as Opportunity[]).filter((item) =>
    isAllowedForCategory(item, INVESTMENT_CATEGORY),
  ).length;
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

  const { limit, page, category, countryGroup, q } = parsed.data;

  if (isSupabaseConfigured()) {
    try {
      const supabase = createAdminSupabaseClient();
      const offset = (page - 1) * limit;
      const isInvestmentRequest = category === INVESTMENT_CATEGORY;
      let data: Opportunity[] = [];
      let count = 0;

      if (countryGroup !== "all") {
        const [
          { data: rows, error: rowsError },
          { data: latestRows, error: latestError },
        ] = await Promise.all([
          supabase
            .from("opportunities")
            .select("*")
            .order("is_featured", { ascending: false })
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(5000),
          supabase
            .from("opportunities")
            .select("fetched_at")
            .order("fetched_at", { ascending: false })
            .limit(1),
        ]);
        if (rowsError) throw rowsError;
        if (latestError) throw latestError;

        const countryRows = ((rows ?? []) as Opportunity[])
          .map(sanitizeNasaSbirOpportunityDates)
          .filter((item) => matchesCountryGroup(item.location, countryGroup));
        const filteredRows = countryRows.filter(
          (item) =>
            (!category || item.category === category) &&
            matchesSearch(item, q) &&
            isAllowedForCategory(item, category),
        );
        const categoryCounts = Object.fromEntries(
          OPPORTUNITY_CATEGORIES.map((itemCategory) => [
            itemCategory,
            countryRows.filter(
              (item) =>
                item.category === itemCategory &&
                isAllowedForCategory(item, itemCategory),
            ).length,
          ]),
        );

        return NextResponse.json({
          data: filteredRows.slice(offset, offset + limit),
          meta: {
            source: "supabase",
            count: filteredRows.length,
            total: countryRows.length,
            categoryCounts,
            lastUpdated: latestRows?.[0]?.fetched_at ?? null,
            page,
            limit,
            hasMore: offset + limit < filteredRows.length,
          },
        });
      }

      if (isInvestmentRequest) {
        let investmentQuery = supabase
          .from("opportunities")
          .select("*")
          .eq("category", INVESTMENT_CATEGORY)
          .order("is_featured", { ascending: false })
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(1000);

        if (q) {
          investmentQuery = investmentQuery.or(`title.ilike.%${q}%,summary.ilike.%${q}%`);
        }

        const { data: investmentRows, error } = await investmentQuery;
        if (error) throw error;
        const filteredInvestmentRows = ((investmentRows ?? []) as Opportunity[]).filter(
          (item) => isAllowedForCategory(item, category),
        );
        count = filteredInvestmentRows.length;
        data = filteredInvestmentRows
          .slice(offset, offset + limit)
          .map(sanitizeNasaSbirOpportunityDates);
      } else {
        let query = supabase
          .from("opportunities")
          .select("*", { count: "exact" })
          .order("is_featured", { ascending: false })
          .order("published_at", { ascending: false, nullsFirst: false })
          .range(offset, offset + limit - 1);

        if (category) query = query.eq("category", category);
        if (q) query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%`);

        const { data: rows, error, count: rowCount } = await query;
        if (error) throw error;
        data = ((rows ?? []) as Opportunity[]).map(
          sanitizeNasaSbirOpportunityDates,
        );
        count = rowCount ?? 0;
      }

      const [
        { count: totalCount, error: totalError },
        { data: latestRows, error: latestError },
        strictInvestmentCount,
        ...categoryResults
      ] = await Promise.all([
        supabase
          .from("opportunities")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("opportunities")
          .select("fetched_at")
          .order("fetched_at", { ascending: false })
          .limit(1),
        getStrictInvestmentCount(),
        ...OPPORTUNITY_CATEGORIES.filter(
          (itemCategory) => itemCategory !== INVESTMENT_CATEGORY,
        ).map((itemCategory) =>
          supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("category", itemCategory),
        ),
      ]);
      if (totalError) throw totalError;
      if (latestError) throw latestError;
      const categoryError = categoryResults.find((result) => result.error)?.error;
      if (categoryError) throw categoryError;

      const nonInvestmentCategories = OPPORTUNITY_CATEGORIES.filter(
        (itemCategory) => itemCategory !== INVESTMENT_CATEGORY,
      );
      const categoryCounts = Object.fromEntries(
        nonInvestmentCategories.map((itemCategory, index) => [
          itemCategory,
          categoryResults[index].count ?? 0,
        ]),
      );
      categoryCounts[INVESTMENT_CATEGORY] = strictInvestmentCount;

      return NextResponse.json({
        data,
        meta: {
          source: "supabase",
          count,
          total: totalCount ?? 0,
          categoryCounts,
          lastUpdated: latestRows?.[0]?.fetched_at ?? null,
          page,
          limit,
          hasMore: offset + data.length < count,
        },
      });
    } catch (error) {
      console.error("Supabase opportunities query failed:", error);
    }
  }

  const countryRows = fallbackOpportunities.filter((item) =>
    matchesCountryGroup(item.location, countryGroup),
  );
  const filtered = countryRows.filter((item) => {
    const matchesCategory = !category || item.category === category;
    return (
      matchesCategory &&
      matchesSearch(item, q) &&
      isAllowedForCategory(item, category)
    );
  });
  const offset = (page - 1) * limit;

  return NextResponse.json({
    data: filtered.slice(offset, offset + limit),
    meta: {
      source: "fallback",
      count: filtered.length,
      total: countryRows.length,
      categoryCounts: Object.fromEntries(
        OPPORTUNITY_CATEGORIES.map((itemCategory) => [
          itemCategory,
          countryRows.filter(
            (item) =>
              item.category === itemCategory &&
              isAllowedForCategory(item, itemCategory),
          ).length,
        ]),
      ),
      lastUpdated: fallbackOpportunities[0]?.fetched_at ?? null,
      page,
      limit,
      hasMore: offset + limit < filtered.length,
    },
  });
}
