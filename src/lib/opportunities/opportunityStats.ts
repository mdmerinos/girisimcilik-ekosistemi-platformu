import {
  matchesTimeRange,
  nearRangeEnd,
} from "@/lib/opportunities/opportunityFilters";
import type { Opportunity } from "@/types/opportunity";

export type OpportunityStats = {
  total: number;
  totalCount: number;
  addedToday: number;
  todayIngestedCount: number;
  todayPublishedCount: number;
  nearCount: number;
  activeCount: number;
  farFutureCount: number;
  expiredCount: number;
  noDateCount: number;
  investmentNewsLast7Days: number;
  upcomingEvents: number;
  nationalSupports: number;
  internationalFunds: number;
  lastSuccessfulUpdate: string | null;
};

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isSameLocalDay(value: string | null | undefined, now: Date): boolean {
  const date = validDate(value);
  return Boolean(
    date &&
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate(),
  );
}

export function calculateOpportunityStats(
  opportunities: Opportunity[],
  now = new Date(),
  lastSuccessfulUpdate: string | null = null,
): OpportunityStats {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const farFutureBoundary = nearRangeEnd(now);
  const todayIngestedCount = opportunities.filter((item) =>
    isSameLocalDay(item.created_at ?? item.fetched_at, now),
  ).length;

  return {
    total: opportunities.length,
    totalCount: opportunities.length,
    addedToday: todayIngestedCount,
    todayIngestedCount,
    todayPublishedCount: opportunities.filter((item) =>
      isSameLocalDay(item.published_at, now),
    ).length,
    nearCount: opportunities.filter((item) =>
      matchesTimeRange(item, "near", now),
    ).length,
    activeCount: opportunities.filter((item) =>
      matchesTimeRange(item, "active", now),
    ).length,
    farFutureCount: opportunities.filter((item) => {
      const deadline = validDate(item.deadline_at);
      return Boolean(deadline && deadline.getTime() > farFutureBoundary);
    }).length,
    expiredCount: opportunities.filter((item) => {
      const deadline = validDate(item.deadline_at);
      return Boolean(deadline && deadline < today);
    }).length,
    noDateCount: opportunities.filter(
      (item) => !item.deadline_at && !item.published_at,
    ).length,
    investmentNewsLast7Days: opportunities.filter((item) => {
      const published = validDate(item.published_at);
      return (
        item.category === "Yatırım ve Sermaye Ağları" &&
        Boolean(published && published >= sevenDaysAgo)
      );
    }).length,
    upcomingEvents: opportunities.filter(
      (item) =>
        item.category === "Etkinlik ve Programlar" &&
        Boolean(item.deadline_at) &&
        new Date(item.deadline_at as string) >= now,
    ).length,
    nationalSupports: opportunities.filter(
      (item) => item.category === "Ulusal Destek ve Fonlar",
    ).length,
    internationalFunds: opportunities.filter(
      (item) => item.category === "Uluslararası Fonlar",
    ).length,
    lastSuccessfulUpdate,
  };
}
