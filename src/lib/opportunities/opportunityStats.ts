import type { Opportunity } from "@/types/opportunity";

export type OpportunityStats = {
  total: number;
  addedToday: number;
  investmentNewsLast7Days: number;
  upcomingEvents: number;
  nationalSupports: number;
  internationalFunds: number;
  lastSuccessfulUpdate: string | null;
};

export function calculateOpportunityStats(
  opportunities: Opportunity[],
  now = new Date(),
  lastSuccessfulUpdate: string | null = null,
): OpportunityStats {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return {
    total: opportunities.length,
    addedToday: opportunities.filter(
      (item) => new Date(item.created_at) >= startOfToday,
    ).length,
    investmentNewsLast7Days: opportunities.filter((item) => {
      const date = item.published_at ?? item.created_at;
      return (
        item.category === "Yatırım ve Sermaye Ağları" &&
        new Date(date) >= sevenDaysAgo
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
