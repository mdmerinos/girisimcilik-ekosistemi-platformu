"use client";

import { useEffect, useState } from "react";

import type { OpportunityStats } from "@/lib/opportunities/opportunityStats";
import { formatDateTime } from "@/lib/utils/formatDateTime";

type StatsResponse = {
  data: OpportunityStats;
  meta: { source: "supabase" | "unavailable" };
};

const EMPTY: OpportunityStats = {
  total: 0,
  totalCount: 0,
  addedToday: 0,
  todayIngestedCount: 0,
  todayPublishedCount: 0,
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

export function StatsCards({ refreshToken = 0 }: { refreshToken?: number }) {
  const [stats, setStats] = useState<OpportunityStats>(EMPTY);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    fetch("/api/stats", { cache: "no-store" })
      .then((response) => response.json() as Promise<StatsResponse>)
      .then((payload) => {
        setStats(payload.data);
        setAvailable(payload.meta.source === "supabase");
      })
      .catch(() => setAvailable(false));
  }, [refreshToken]);

  const cards = [
    ["Yakın fırsatlar", stats.nearCount],
    ["Tüm aktif fırsatlar", stats.activeCount],
    ["Gelecek çağrılar", stats.farFutureCount],
    ["Tarihi belirtilmemiş", stats.noDateCount],
    ["Bugün sisteme eklenen", stats.todayIngestedCount],
    ["Bugün yayımlanan", stats.todayPublishedCount],
    [
      "Son başarılı kaynak taraması",
      formatDateTime(stats.lastSuccessfulUpdate),
    ],
    ["Son veri eklenme zamanı", formatDateTime(stats.lastDataAddedAt)],
  ] as const;

  return (
    <section aria-label="Platform istatistikleri">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={label} className="atlas-panel rounded-2xl p-4">
            <p className="atlas-muted text-[10px] font-bold uppercase tracking-[0.12em]">
              {label}
            </p>
            <p className="mt-3 text-xl font-bold">{available ? value : "—"}</p>
          </article>
        ))}
      </div>
      {!available && (
        <p className="atlas-muted mt-2 text-[10px]">
          İstatistikler Supabase bağlantısı kullanılabilir olduğunda gösterilir.
        </p>
      )}
    </section>
  );
}
