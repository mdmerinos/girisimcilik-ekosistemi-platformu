import { isOldArchiveOpportunity } from "@/lib/opportunities/opportunityFreshness";
import {
  type ContentView,
  matchesContentView,
} from "@/lib/opportunities/opportunityQueryFilters";
import type { Opportunity } from "@/types/opportunity";

function validTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function selectRecentOpportunities(
  rows: Opportunity[],
  options: {
    since: Date;
    contentView?: ContentView;
    now?: Date;
    limit?: number;
  },
): Opportunity[] {
  const sinceTime = options.since.getTime();
  const now = options.now ?? new Date();
  const contentView = options.contentView ?? "all";
  const limit = options.limit ?? 50;

  return rows
    .filter((item) => {
      const createdAt = validTime(item.created_at);
      return createdAt !== null && createdAt > sinceTime;
    })
    .filter((item) => matchesContentView(item, contentView))
    .filter((item) => !isOldArchiveOpportunity(item, now))
    .sort(
      (left, right) =>
        (validTime(right.created_at) ?? 0) -
        (validTime(left.created_at) ?? 0),
    )
    .slice(0, limit);
}
