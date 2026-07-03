"use client";

import { useEffect, useState } from "react";

import { OpportunityCard } from "@/components/OpportunityCard";
import { CategorySidebar } from "@/components/home/CategorySidebar";
import { CountryFilterTabs } from "@/components/home/CountryFilterTabs";
import { HomeHeader } from "@/components/home/HomeHeader";
import {
  RefreshStatus,
  type RefreshState,
} from "@/components/home/RefreshStatus";
import { StatsCards } from "@/components/home/StatsCards";
import { TickerBar } from "@/components/home/TickerBar";
import type { CountryGroup } from "@/lib/opportunities/countryGroup";
import type { Opportunity } from "@/types/opportunity";

type ApiResponse = {
  data: Opportunity[];
  meta: {
    source: "supabase" | "fallback";
    count: number;
    total: number;
    categoryCounts: Record<string, number>;
    lastUpdated: string | null;
    page: number;
    limit: number;
    hasMore: boolean;
  };
};

const PAGE_SIZE = 24;

export function OpportunityDashboard() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tümü");
  const [countryGroup, setCountryGroup] = useState<CountryGroup>("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<ApiResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshState, setRefreshState] = useState<RefreshState | null>(null);

  async function checkForRefresh() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/refresh-if-stale", {
        method: "POST",
        cache: "no-store",
      });
      setRefreshState((await response.json()) as RefreshState);
    } catch {
      setRefreshState({
        ok: false,
        status: "error",
        lastSuccessfulIngestionAt: null,
        message: "Veriler gösteriliyor, güncelleme daha sonra tekrar denenecek.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetch("/api/refresh-if-stale", {
      method: "POST",
      cache: "no-store",
    })
      .then((response) => response.json() as Promise<RefreshState>)
      .then(setRefreshState)
      .catch(() => {
        setRefreshState({
          ok: false,
          status: "error",
          lastSuccessfulIngestionAt: null,
          message:
            "Veriler gösteriliyor, güncelleme daha sonra tekrar denenecek.",
        });
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        page: "1",
        countryGroup,
      });
      if (category !== "Tümü") params.set("category", category);
      if (query.trim()) params.set("q", query.trim());

      setLoading(true);
      setPage(1);
      fetch(`/api/opportunities?${params}`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error("Fırsatlar alınamadı.");
          return response.json() as Promise<ApiResponse>;
        })
        .then((payload) => {
          setOpportunities(payload.data);
          setMeta(payload.meta);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          console.error(error);
        })
        .finally(() => setLoading(false));
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [category, countryGroup, query]);

  async function loadMore() {
    const nextPage = page + 1;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      page: String(nextPage),
      countryGroup,
    });
    if (category !== "Tümü") params.set("category", category);
    if (query.trim()) params.set("q", query.trim());

    setLoadingMore(true);
    try {
      const response = await fetch(`/api/opportunities?${params}`);
      if (!response.ok) throw new Error("Daha fazla kayıt alınamadı.");
      const payload = (await response.json()) as ApiResponse;
      setOpportunities((current) => [
        ...new Map(
          [...current, ...payload.data].map((item) => [item.unique_key, item]),
        ).values(),
      ]);
      setMeta(payload.meta);
      setPage(nextPage);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="atlas-shell min-h-screen">
      <TickerBar items={opportunities} />
      <HomeHeader
        query={query}
        onQueryChange={setQuery}
        onRefresh={() => void checkForRefresh()}
        refreshing={refreshing}
        lastUpdated={meta?.lastUpdated ?? null}
      />

      <div className="mx-auto max-w-[1440px] px-4 pb-8">
        <StatsCards />
        <div className="mt-6 grid gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
          <CategorySidebar
            selected={category}
            counts={meta?.categoryCounts ?? {}}
            total={meta?.total ?? 0}
            onChange={setCategory}
          />

          <main id="firsatlar" className="min-w-0">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="atlas-muted text-[10px] font-bold uppercase tracking-[0.16em]">
                  Canlı ekosistem panosu
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h1 className="text-xl font-bold sm:text-2xl">
                    {category === "Tümü" ? "Tüm fırsatlar" : category}
                  </h1>
                  <span className="atlas-count rounded-full px-3 py-1 text-[10px] font-bold text-white">
                    {meta?.count ?? 0} kayıt
                  </span>
                </div>
              </div>
              <CountryFilterTabs
                value={countryGroup}
                onChange={setCountryGroup}
              />
            </div>

            <RefreshStatus state={refreshState} />

            {meta?.source === "fallback" && (
              <p className="atlas-warning mt-4 rounded-xl px-4 py-3 text-xs">
                Supabase bağlantısı kullanılamıyor; gösterilen kayıtlar örnek
                fallback verisidir.
              </p>
            )}

            {loading ? (
              <div className="grid gap-4 pt-5 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((item) => (
                  <div
                    key={item}
                    className="atlas-panel h-72 animate-pulse rounded-2xl"
                  />
                ))}
              </div>
            ) : opportunities.length > 0 ? (
              <>
                <div className="grid gap-4 pt-5 md:grid-cols-2 xl:grid-cols-3">
                  {opportunities.map((opportunity) => (
                    <OpportunityCard
                      key={opportunity.unique_key}
                      opportunity={opportunity}
                    />
                  ))}
                </div>
                {meta?.hasMore && (
                  <div className="mt-8 text-center">
                    <button
                      type="button"
                      onClick={() => void loadMore()}
                      disabled={loadingMore}
                      className="atlas-refresh rounded-full px-6 py-3 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {loadingMore ? "Yükleniyor…" : "Daha fazla göster"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="atlas-panel mt-5 rounded-2xl px-6 py-16 text-center text-sm">
                Bu filtrelerle eşleşen bir fırsat bulunamadı.
              </div>
            )}
          </main>
        </div>

        <footer className="atlas-footer mt-8 flex flex-col gap-2 border-t py-5 text-[10px] sm:flex-row sm:justify-between">
          <span>Girişim Atlası · gerçek kaynaklardan güncel ekosistem verileri</span>
          <span className={meta?.source === "supabase" ? "atlas-success" : "atlas-muted"}>
            ●{" "}
            {meta?.source === "supabase"
              ? "Supabase veri kaynağı aktif"
              : "Fallback görünümü"}
          </span>
        </footer>
      </div>
    </div>
  );
}
