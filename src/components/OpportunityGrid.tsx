"use client";

import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { Filters } from "@/components/Filters";
import { OpportunityCard } from "@/components/OpportunityCard";
import { SearchBar } from "@/components/SearchBar";
import type { Opportunity } from "@/types/opportunity";

type RefreshStatus =
  | "fresh"
  | "started"
  | "already_running"
  | "cooldown"
  | "error";

type RefreshResponse = {
  ok: boolean;
  status: RefreshStatus;
  lastSuccessfulIngestionAt: string | null;
  message: string;
};

type ApiResponse = {
  data: Opportunity[];
  meta: {
    source: "supabase" | "fallback";
    count: number;
    total: number;
    categoryCounts: Record<string, number>;
    lastUpdated: string | null;
    hasMore: boolean;
  };
};

const PAGE_SIZE = 100;

export function OpportunityGrid() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tümü");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<ApiResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<RefreshResponse | null>(
    null,
  );

  useEffect(() => {
    fetch("/api/refresh-if-stale", { method: "POST", cache: "no-store" })
      .then((response) => response.json() as Promise<RefreshResponse>)
      .then(setRefreshStatus)
      .catch(() => {
        setRefreshStatus({
          ok: false,
          status: "error",
          lastSuccessfulIngestionAt: null,
          message: "Veriler gösteriliyor, güncelleme daha sonra tekrar denenecek.",
        });
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        page: "1",
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
        .then((response) => {
          setOpportunities(response.data);
          setMeta(response.meta);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          console.error(error);
        })
        .finally(() => setLoading(false));
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [category, query]);

  async function loadMore() {
    const nextPage = page + 1;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      page: String(nextPage),
    });
    if (category !== "Tümü") params.set("category", category);
    if (query.trim()) params.set("q", query.trim());

    setLoadingMore(true);
    try {
      const response = await fetch(`/api/opportunities?${params}`);
      if (!response.ok) throw new Error("Daha fazla kayıt alınamadı.");
      const payload = (await response.json()) as ApiResponse;
      setOpportunities((current) => {
        const merged = new Map(
          [...current, ...payload.data].map((item) => [item.unique_key, item]),
        );
        return [...merged.values()];
      });
      setMeta(payload.meta);
      setPage(nextPage);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMore(false);
    }
  }

  const selectedCategoryCount =
    category === "Tümü" ? meta?.total : meta?.categoryCounts[category];

  return (
    <section id="firsatlar" className="bg-[#f6f7f3] px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#73944c]">
              Güncel akış
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#142219] sm:text-4xl">
              Radarımıza takılanlar
            </h2>
            {meta && (
              <div className="mt-4 space-y-1 text-sm text-[#657168]">
                <p>
                  Veritabanında toplam{" "}
                  <strong className="text-[#263c2e]">{meta.total}</strong> güncel
                  kayıt var.
                </p>
                {meta.lastUpdated && (
                  <p>
                    Son güncelleme:{" "}
                    {dayjs(meta.lastUpdated).format("DD.MM.YYYY HH:mm")}
                  </p>
                )}
                {refreshStatus && (
                  <p
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                      refreshStatus.status === "error"
                        ? "border-[#e8c7c7] bg-[#fff4f4] text-[#9b464d]"
                        : "border-[#dfe8d8] bg-white text-[#607d40]"
                    }`}
                  >
                    {refreshStatus.message}
                  </p>
                )}
              </div>
            )}
          </div>
          <SearchBar value={query} onChange={setQuery} />
        </div>

        <div id="kategoriler" className="mt-8">
          <Filters
            selected={category}
            onChange={setCategory}
            counts={meta?.categoryCounts}
          />
          {meta && (
            <p className="mt-3 text-sm text-[#657168]">
              {category === "Tümü" ? "Tüm kategorilerde" : category}{" "}
              <strong>{selectedCategoryCount ?? 0}</strong> kayıt
            </p>
          )}
        </div>

        {meta?.source === "fallback" && (
          <p className="mt-5 rounded-xl border border-[#dfd7b7] bg-[#fffbee] px-4 py-3 text-xs text-[#77682e]">
            Supabase henüz bağlı değil; arayüz örnek fallback kayıtlarıyla
            gösteriliyor.
          </p>
        )}

        {loading ? (
          <div className="grid gap-4 pt-8 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-80 animate-pulse rounded-2xl border border-[#e2e7e2] bg-white"
              />
            ))}
          </div>
        ) : opportunities.length > 0 ? (
          <>
            <div className="grid gap-4 pt-8 md:grid-cols-2 lg:grid-cols-3">
              {opportunities.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.unique_key}
                  opportunity={opportunity}
                />
              ))}
            </div>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              {meta?.hasMore && (
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="rounded-full bg-[#142219] px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  {loadingMore ? "Yükleniyor…" : "Daha fazla göster"}
                </button>
              )}
              {category !== "Tümü" && opportunities.length < 9 && (
                <button
                  type="button"
                  onClick={() => setCategory("Tümü")}
                  className="rounded-full border border-[#cfd8ce] bg-white px-6 py-3 text-sm font-semibold text-[#304137]"
                >
                  Tüm kategorileri göster
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-[#cfd8ce] px-6 py-16 text-center text-sm text-[#6d796f]">
            Bu filtrelerle eşleşen bir fırsat bulunamadı.
            {category !== "Tümü" && (
              <button
                type="button"
                onClick={() => setCategory("Tümü")}
                className="ml-2 font-semibold text-[#607d40] underline"
              >
                Tüm kategorileri göster
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}