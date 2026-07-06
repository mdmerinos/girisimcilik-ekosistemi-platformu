"use client";

import { useEffect, useState } from "react";

import { OpportunityCard } from "@/components/OpportunityCard";
import { CategorySidebar } from "@/components/home/CategorySidebar";
import { ContentViewTabs } from "@/components/home/ContentViewTabs";
import { CountryFilterTabs } from "@/components/home/CountryFilterTabs";
import { HomeHeader } from "@/components/home/HomeHeader";
import {
  RefreshStatus,
  type RefreshState,
} from "@/components/home/RefreshStatus";
import { SourceFilter } from "@/components/home/SourceFilter";
import {
  StatsCards,
  type StatsCardFilter,
} from "@/components/home/StatsCards";
import { TickerBar } from "@/components/home/TickerBar";
import { TimeRangeTabs } from "@/components/home/TimeRangeTabs";
import { TodayFilterTabs } from "@/components/home/TodayFilterTabs";
import type { CountryGroup } from "@/lib/opportunities/countryGroup";
import type { ContentView } from "@/lib/opportunities/opportunityQueryFilters";
import type {
  StatFilter,
  TimeRange,
  TodayFilter,
} from "@/lib/opportunities/opportunityFilters";
import {
  OPPORTUNITY_SOURCE_OPTIONS,
  type OpportunitySource,
} from "@/lib/opportunities/opportunitySource";
import { selectTickerItems } from "@/lib/opportunities/opportunityTicker";
import type { Opportunity } from "@/types/opportunity";

type ApiResponse = {
  data: Opportunity[];
  meta: {
    source: "supabase" | "fallback";
    count: number;
    total: number;
    categoryCounts: Record<string, number>;
    lastUpdated: string | null;
    lastDataAddedAt: string | null;
    lastScanAt: string | null;
    page: number;
    limit: number;
    hasMore: boolean;
    timeRange: TimeRange;
    today: TodayFilter;
    statFilter: StatFilter;
    sourceFilter: OpportunitySource;
    sourceWorkerStatus: {
      status: string;
      message: string | null;
      lastRunAt: string | null;
    } | null;
    query: string;
    filterDiagnostics: {
      totalRows: number;
      hiddenByInvestmentValidation: number;
      hiddenByContentView: number;
      hiddenByCountry: number;
      hiddenByTimeRange: number;
      hiddenByToday: number;
      hiddenByStat: number;
      hiddenBySource: number;
      hiddenBySearch: number;
      hiddenByCategory: number;
    };
  };
};

type TickerApiResponse = {
  data: Opportunity[];
  meta: { source: "supabase" | "fallback" };
};

type RecentApiResponse = {
  data: Array<{
    id: string;
    title: string;
    source_name: string;
    category: string;
    created_at: string;
    published_at: string | null;
    source_url: string;
    application_url: string | null;
    contentView: ContentView;
  }>;
  meta: {
    source: "supabase" | "fallback";
    count: number;
    since: string;
    view: ContentView;
  };
};

const PAGE_SIZE = 24;
const RECENT_POLL_MS = 3 * 60 * 1000;

function buildParams(options: {
  page: number;
  category: string;
  contentView: ContentView;
  countryGroup: CountryGroup;
  timeRange: TimeRange;
  today: TodayFilter;
  statFilter: StatFilter;
  source: OpportunitySource;
  query: string;
}) {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    page: String(options.page),
    countryGroup: options.countryGroup,
    timeRange: options.timeRange,
    today: options.today,
    statFilter: options.statFilter,
    source: options.source,
    view: options.contentView,
  });
  if (options.category !== "Tümü") params.set("category", options.category);
  if (options.query.trim()) params.set("q", options.query.trim());
  return params;
}

export function OpportunityDashboard() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [tickerItems, setTickerItems] = useState<Opportunity[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tümü");
  const [contentView, setContentView] = useState<ContentView>("all");
  const [countryGroup, setCountryGroup] = useState<CountryGroup>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("near");
  const [today, setToday] = useState<TodayFilter>("all");
  const [statFilter, setStatFilter] = useState<StatFilter>("all");
  const [activeStatsCard, setActiveStatsCard] =
    useState<StatsCardFilter | null>("near");
  const [source, setSource] = useState<OpportunitySource>("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<ApiResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshLabel, setRefreshLabel] = useState<string>();
  const [refreshState, setRefreshState] = useState<RefreshState | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [recentNotice, setRecentNotice] = useState<{
    count: number;
    since: string;
  } | null>(null);
  const lastDataAddedAt = meta?.lastDataAddedAt ?? null;
  const metaSource = meta?.source ?? null;

  async function forceRefresh() {
    setRefreshing(true);
    setRefreshLabel("Yenileme başlatılıyor…");
    setRefreshState({
      ok: true,
      status: "started",
      lastSuccessfulIngestionAt: meta?.lastScanAt ?? null,
      message: "Yenileme başlatılıyor…",
    });

    window.setTimeout(
      () => setRefreshLabel("Kaynaklar kontrol ediliyor…"),
      0,
    );

    try {
      const response = await fetch("/api/refresh-if-stale?force=true", {
        method: "POST",
        cache: "no-store",
      });
      const payload = (await response.json()) as RefreshState & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Yenileme başlatılamadı.");
      }
      setRefreshState(payload);
      if (payload.status === "completed") {
        setDataVersion((value) => value + 1);
      }
    } catch (error) {
      setRefreshState({
        ok: false,
        status: "error",
        lastSuccessfulIngestionAt: meta?.lastScanAt ?? null,
        message:
          error instanceof Error
            ? error.message
            : "Yenileme daha sonra tekrar denenebilir.",
      });
    } finally {
      setRefreshing(false);
      setRefreshLabel(undefined);
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
    const common = new URLSearchParams({
      limit: "100",
      page: "1",
      countryGroup: "all",
      timeRange: "all",
      statFilter: "all",
      source: "all",
    });
    const allParams = new URLSearchParams(common);
    allParams.set("today", "all");
    const ingestedParams = new URLSearchParams(common);
    ingestedParams.set("today", "todayIngested");

    Promise.all(
      [allParams, ingestedParams].map((params) =>
        fetch(`/api/opportunities?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        }).then((response) => {
          if (!response.ok) throw new Error("Ticker kayıtları alınamadı.");
          return response.json() as Promise<TickerApiResponse>;
        }),
      ),
    )
      .then((payloads) => {
        if (payloads.some((payload) => payload.meta.source !== "supabase")) {
          setTickerItems([]);
          return;
        }
        setTickerItems(
          selectTickerItems(payloads.flatMap((payload) => payload.data)),
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setTickerItems([]);
      });

    return () => controller.abort();
  }, [dataVersion]);

  useEffect(() => {
    if (!lastDataAddedAt || metaSource !== "supabase") return;

    const controller = new AbortController();
    const since = lastDataAddedAt;

    async function checkRecent() {
      const params = new URLSearchParams({
        since,
        limit: "20",
        view: contentView,
      });
      try {
        const response = await fetch(`/api/opportunities/recent?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as RecentApiResponse;
        if (payload.meta.source !== "supabase" || payload.meta.count === 0) {
          setRecentNotice(null);
          return;
        }
        setRecentNotice({
          count: payload.meta.count,
          since: payload.meta.since,
        });
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    const interval = window.setInterval(() => void checkRecent(), RECENT_POLL_MS);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, [contentView, lastDataAddedAt, metaSource]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = buildParams({
        page: 1,
        category,
        contentView,
        countryGroup,
        timeRange,
        today,
        statFilter,
        source,
        query,
      });

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
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          console.error(error);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    category,
    contentView,
    countryGroup,
    dataVersion,
    query,
    source,
    statFilter,
    timeRange,
    today,
  ]);

  async function loadMore() {
    const nextPage = page + 1;
    const params = buildParams({
      page: nextPage,
      category,
      contentView,
      countryGroup,
      timeRange,
      today,
      statFilter,
      source,
      query,
    });

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

  function changeToday(value: TodayFilter) {
    setToday(value);
    setStatFilter("all");
    setActiveStatsCard(
      value === "ingested" || value === "published" || value === "deadline"
        ? value
        : null,
    );
    if (value !== "all") setTimeRange("all");
  }

  function changeTimeRange(value: TimeRange) {
    setTimeRange(value);
    setToday("all");
    setStatFilter("all");
    setActiveStatsCard(value === "near" || value === "active" ? value : null);
  }

  function selectStatsFilter(filter: StatsCardFilter) {
    setActiveStatsCard(filter);
    setToday("all");
    setStatFilter("all");

    if (filter === "near" || filter === "active") {
      setTimeRange(filter);
    } else if (filter === "future" || filter === "noDate") {
      setTimeRange(filter === "future" ? "active" : "all");
      setStatFilter(filter);
    } else {
      setTimeRange("all");
      setToday(filter);
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById("firsatlar")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function showRecentRecords() {
    setRecentNotice(null);
    setToday("ingested");
    setTimeRange("all");
    setStatFilter("all");
    setActiveStatsCard("ingested");
    setDataVersion((value) => value + 1);
    window.requestAnimationFrame(() => {
      document
        .getElementById("firsatlar")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const selectedSourceLabel =
    OPPORTUNITY_SOURCE_OPTIONS.find((option) => option.value === source)
      ?.label ?? "Bu kaynak";
  const listTitle =
    today === "ingested"
      ? "Bugün sisteme eklenen kayıtlar"
      : today === "published"
        ? "Bugün yayımlanan kayıtlar"
        : today === "deadline"
          ? "Bugün son başvurusu olan fırsatlar"
          : statFilter === "future"
            ? "Gelecek çağrılar"
            : statFilter === "noDate"
              ? "Tarihi belirtilmemiş kayıtlar"
              : contentView === "funding"
                ? "Fırsatlar ve fonlar"
                : contentView === "news"
                  ? "Güncel haberler"
                  : contentView === "investments"
                    ? "Yatırım haberleri"
                    : contentView === "programs"
                      ? "Etkinlikler ve programlar"
              : timeRange === "near"
                ? "Yakın fırsatlar"
                : timeRange === "active"
                  ? "Tüm aktif fırsatlar"
                  : category === "Tümü"
                    ? "Tüm fırsatlar"
                    : category;
  const resultCountLabel =
    meta && opportunities.length < meta.count
      ? `${meta.count} toplam kayıt · ${opportunities.length} kayıt gösteriliyor`
      : `${meta?.count ?? 0} kayıt`;

  return (
    <div className="atlas-shell min-h-screen">
      <TickerBar items={tickerItems} />
      <HomeHeader
        query={query}
        onQueryChange={setQuery}
        onRefresh={() => void forceRefresh()}
        refreshing={refreshing}
        refreshLabel={refreshLabel}
        lastScanAt={meta?.lastScanAt ?? null}
        lastDataAddedAt={meta?.lastDataAddedAt ?? null}
      />

      <div className="mx-auto max-w-[1440px] px-4 pb-8">
        <StatsCards
          refreshToken={dataVersion}
          activeFilter={activeStatsCard}
          onFilterSelect={selectStatsFilter}
          category={category}
          contentView={contentView}
          countryGroup={countryGroup}
          source={source}
          query={query}
        />
        <div className="mt-6 grid gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
          <CategorySidebar
            selected={category}
            counts={meta?.categoryCounts ?? {}}
            total={meta?.total ?? 0}
            onChange={(nextCategory) => {
              setCategory(nextCategory);
              setContentView("all");
            }}
          />

          <main id="firsatlar" className="min-w-0">
            <div className="mb-5 flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="atlas-muted text-[10px] font-bold uppercase tracking-[0.16em]">
                    Canlı ekosistem panosu
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h1 className="text-xl font-bold sm:text-2xl">
                      {listTitle}
                    </h1>
                    <span className="atlas-count rounded-full px-3 py-1 text-[10px] font-bold text-white">
                      {resultCountLabel}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <SourceFilter value={source} onChange={setSource} />
                  <CountryFilterTabs
                    value={countryGroup}
                    onChange={setCountryGroup}
                  />
                </div>
              </div>
              <ContentViewTabs
                value={contentView}
                onChange={(nextView) => {
                  setContentView(nextView);
                  setCategory("Tümü");
                  setTimeRange(nextView === "all" ? "near" : "all");
                  setToday("all");
                  setStatFilter("all");
                  setActiveStatsCard(nextView === "all" ? "near" : null);
                }}
              />
              <TimeRangeTabs value={timeRange} onChange={changeTimeRange} />
              <TodayFilterTabs value={today} onChange={changeToday} />
              <p className="atlas-muted text-[10px]">
                “Bugün açılan çağrılar” filtresi, opening date ayrı bir veritabanı
                alanında tutulmadığı için yanlış sonuç üretmemek adına henüz
                gösterilmiyor.
              </p>
            </div>

            <RefreshStatus state={refreshState} />

            {recentNotice && (
              <button
                type="button"
                onClick={showRecentRecords}
                className="atlas-refresh mt-4 rounded-full px-4 py-2 text-xs font-bold text-white"
                aria-live="polite"
                title={`Son kontrol: ${recentNotice.since}`}
              >
                {recentNotice.count} yeni kayıt var
              </button>
            )}

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
            ) : today === "published" ? (
              <div className="atlas-panel mt-5 rounded-2xl px-6 py-16 text-center">
                <p className="text-sm font-semibold">
                  Bu filtrede gösterilecek kayıt bulunamadı.
                </p>
                <p className="atlas-muted mx-auto mt-2 max-w-2xl text-xs leading-5">
                  Bugün kaynaklarda yayımlanmış ve yayın tarihi yakalanmış kayıt
                  bulunamadı.
                </p>
              </div>
            ) : today === "ingested" ? (
              <div className="atlas-panel mt-5 rounded-2xl px-6 py-16 text-center">
                <p className="text-sm font-semibold">
                  Bu filtrede gösterilecek kayıt bulunamadı.
                </p>
                <p className="atlas-muted mx-auto mt-2 max-w-2xl text-xs leading-5">
                  Bugün sisteme yeni kayıt eklenmedi. Yenile butonuyla kaynakları
                  tekrar kontrol edebilirsin.
                </p>
              </div>
            ) : source !== "all" ? (
              <div className="atlas-panel mt-5 rounded-2xl px-6 py-16 text-center">
                <p className="text-sm font-semibold">
                  Bu kaynaktan henüz kayıt gelmedi.
                </p>
                {source === "nato-diana" && (
                  <p className="atlas-muted mx-auto mt-2 max-w-2xl text-xs leading-5">
                    NATO DIANA kayıtları GitHub Actions worker üzerinden gelir.
                    Worker çalıştırıldıktan sonra kayıtlar görünebilir.
                  </p>
                )}
                {source === "odtu-teknokent" && (
                  <p className="atlas-muted mx-auto mt-2 max-w-2xl text-xs leading-5">
                    ODTÜ Teknokent kaynağından henüz uygun kayıt gelmedi.
                  </p>
                )}
                {source !== "nato-diana" && source !== "odtu-teknokent" && (
                  <p className="atlas-muted mt-2 text-xs">
                    {selectedSourceLabel} için filtreleri değiştirerek tekrar
                    deneyebilirsin.
                  </p>
                )}
              </div>
            ) : query.trim() ? (
              <div className="atlas-panel mt-5 rounded-2xl px-6 py-16 text-center">
                <p className="text-sm font-semibold">
                  Bu arama için sonuç bulunamadı.
                </p>
                <p className="atlas-muted mt-2 text-xs">
                  Farklı bir kelime deneyebilir veya Tüm tarihler filtresini
                  açabilirsin.
                </p>
                {timeRange !== "all" && (
                  <button
                    type="button"
                    onClick={() => setTimeRange("all")}
                    className="atlas-refresh mt-5 rounded-full px-5 py-2.5 text-xs font-bold text-white"
                  >
                    Tüm tarihlerde ara
                  </button>
                )}
              </div>
            ) : (
              <div className="atlas-panel mt-5 rounded-2xl px-6 py-16 text-center">
                <p className="text-sm font-semibold">
                  Bu filtrede gösterilecek kayıt bulunamadı.
                </p>
                {meta?.filterDiagnostics && (
                  <p className="atlas-muted mx-auto mt-2 max-w-2xl text-xs leading-5">
                    Aktif filtre tanısı: zaman aralığı{" "}
                    {meta.filterDiagnostics.hiddenByTimeRange}, içerik görünümü{" "}
                    {meta.filterDiagnostics.hiddenByContentView}, kategori{" "}
                    {meta.filterDiagnostics.hiddenByCategory}, kaynak{" "}
                    {meta.filterDiagnostics.hiddenBySource} kaydı saklıyor.
                  </p>
                )}
              </div>
            )}
          </main>
        </div>

        <footer className="atlas-footer mt-8 flex flex-col gap-2 border-t py-5 text-[10px] sm:flex-row sm:justify-between">
          <span>Girişim Atlası · gerçek kaynaklardan güncel ekosistem verileri</span>
          <span
            className={
              meta?.source === "supabase" ? "atlas-success" : "atlas-muted"
            }
          >
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
