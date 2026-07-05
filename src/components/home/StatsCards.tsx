"use client";

import { useEffect, useState } from "react";

import type { CountryGroup } from "@/lib/opportunities/countryGroup";
import type { OpportunityStats } from "@/lib/opportunities/opportunityStats";
import type { OpportunitySource } from "@/lib/opportunities/opportunitySource";
import { formatDateTime } from "@/lib/utils/formatDateTime";

type StatsResponse = {
  data: OpportunityStats;
  meta: { source: "supabase" | "unavailable" };
};

export type StatsCardFilter =
  | "near"
  | "active"
  | "future"
  | "noDate"
  | "ingested"
  | "published"
  | "deadline";

const EMPTY: OpportunityStats = {
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

type StatsCardsProps = {
  refreshToken?: number;
  activeFilter: StatsCardFilter | null;
  onFilterSelect: (filter: StatsCardFilter) => void;
  category: string;
  countryGroup: CountryGroup;
  source: OpportunitySource;
  query: string;
};

export function StatsCards({
  refreshToken = 0,
  activeFilter,
  onFilterSelect,
  category,
  countryGroup,
  source,
  query,
}: StatsCardsProps) {
  const [stats, setStats] = useState<OpportunityStats>(EMPTY);
  const [available, setAvailable] = useState(false);
  const [loadedScopeKey, setLoadedScopeKey] = useState<string | null>(null);
  const scopeKey = [category, countryGroup, source, query.trim()].join("::");
  const statsAvailable = available && loadedScopeKey === scopeKey;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ countryGroup, source });
      if (category !== "Tümü") params.set("category", category);
      if (query.trim()) params.set("q", query.trim());

      fetch(`/api/stats?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error("İstatistikler alınamadı.");
          return response.json() as Promise<StatsResponse>;
        })
        .then((payload) => {
          setStats(payload.data);
          setAvailable(payload.meta.source === "supabase");
          setLoadedScopeKey(scopeKey);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setAvailable(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [category, countryGroup, query, refreshToken, scopeKey, source]);

  const filterCards: Array<{
    filter: StatsCardFilter;
    label: string;
    value: number;
  }> = [
    { filter: "near", label: "Yakın fırsatlar", value: stats.nearCount },
    {
      filter: "active",
      label: "Tüm aktif fırsatlar",
      value: stats.activeCount,
    },
    {
      filter: "future",
      label: "Gelecek çağrılar",
      value: stats.farFutureCount,
    },
    {
      filter: "noDate",
      label: "Tarihi belirtilmemiş",
      value: stats.noDateCount,
    },
    {
      filter: "ingested",
      label: "Bugün sisteme eklenen",
      value: stats.todayIngestedCount,
    },
    {
      filter: "published",
      label: "Bugün yayımlanan",
      value: stats.todayPublishedCount,
    },
    {
      filter: "deadline",
      label: "Bugün son başvurusu olan",
      value: stats.todayDeadlineCount,
    },
  ];
  const infoCards = [
    {
      label: "Son başarılı kaynak taraması",
      value: formatDateTime(stats.lastSuccessfulUpdate),
    },
    {
      label: "Son veri eklenme zamanı",
      value: formatDateTime(stats.lastDataAddedAt),
    },
  ];

  return (
    <section aria-label="Platform istatistikleri">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {filterCards.map(({ filter, label, value }) => (
          <button
            key={filter}
            type="button"
            disabled={!statsAvailable}
            onClick={() => onFilterSelect(filter)}
            aria-pressed={activeFilter === filter}
            className={`atlas-panel rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--atlas-border-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b6dff] disabled:cursor-not-allowed disabled:opacity-70 ${
              activeFilter === filter ? "atlas-stat-active" : ""
            }`}
          >
            <p className="atlas-muted text-[10px] font-bold uppercase tracking-[0.12em]">
              {label}
            </p>
            <p className="mt-3 text-xl font-bold">
              {statsAvailable ? value : "—"}
            </p>
          </button>
        ))}
        {infoCards.map(({ label, value }) => (
          <article key={label} className="atlas-panel rounded-2xl p-4">
            <p className="atlas-muted text-[10px] font-bold uppercase tracking-[0.12em]">
              {label}
            </p>
            <p className="mt-3 text-xl font-bold">
              {statsAvailable ? value : "—"}
            </p>
          </article>
        ))}
      </div>
      {!statsAvailable && (
        <p className="atlas-muted mt-2 text-[10px]">
          {available
            ? "İstatistikler seçili filtrelere göre güncelleniyor."
            : "İstatistikler Supabase bağlantısı kullanılabilir olduğunda gösterilir."}
        </p>
      )}
      <div className="atlas-muted mt-3 space-y-1 text-[10px] leading-4">
        <p>
          Bugün yayımlanan filtresi yalnızca resmi kaynak yayın tarihi yakalanan
          kayıtları gösterir.
        </p>
        <p>
          Bugün sisteme eklenen sayısı, resmi kaynakta bugün yayımlandığı
          anlamına gelmez; bugün veritabanına ilk kez eklenen kayıtları gösterir.
        </p>
      </div>
    </section>
  );
}
