import {
  matchesTodayFilter,
  matchesTimeRange,
  sortOpportunities,
} from "@/lib/opportunities/opportunityFilters";
import { isOldArchiveOpportunity } from "@/lib/opportunities/opportunityFreshness";
import type { Opportunity } from "@/types/opportunity";

const DAY_MS = 24 * 60 * 60 * 1000;

function identity(item: Opportunity): string {
  return `${item.source_name}::${item.title}`
    .normalize("NFKD")
    .toLocaleLowerCase("tr-TR")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueByTitleAndSource(items: Opportunity[]): Opportunity[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = identity(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function descendingDate(
  field: "created_at" | "published_at",
): (left: Opportunity, right: Opportunity) => number {
  return (left, right) =>
    new Date(right[field] ?? 0).getTime() -
    new Date(left[field] ?? 0).getTime();
}

export function selectTickerItems(
  items: Opportunity[],
  now = new Date(),
  limit = 15,
): Opportunity[] {
  const uniqueItems = uniqueByTitleAndSource(items).filter(
    (item) => !isOldArchiveOpportunity(item, now),
  );
  const recentBoundary = now.getTime() - 7 * DAY_MS;
  const ingestedToday = uniqueItems
    .filter((item) => matchesTodayFilter(item, "ingested", now))
    .sort(descendingDate("created_at"));
  const recentlyPublished = uniqueItems
    .filter((item) => {
      if (!item.published_at) return false;
      const published = new Date(item.published_at).getTime();
      return (
        Number.isFinite(published) &&
        published >= recentBoundary &&
        published <= now.getTime()
      );
    })
    .sort(descendingDate("published_at"));
  const near = sortOpportunities(
    uniqueItems.filter((item) => matchesTimeRange(item, "near", now)),
    now,
  );

  return uniqueByTitleAndSource([
    ...ingestedToday,
    ...recentlyPublished,
    ...near,
  ]).slice(0, Math.max(0, limit));
}
