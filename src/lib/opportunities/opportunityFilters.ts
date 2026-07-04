import type { Opportunity } from "@/types/opportunity";

export const TIME_RANGES = ["near", "active", "all"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];
export const TODAY_FILTERS = [
  "all",
  "ingested",
  "published",
  "deadline",
] as const;
export type TodayFilter = (typeof TODAY_FILTERS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

function validTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function startOfDay(value: Date): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dateKey(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isSameIstanbulDay(
  value: string | null | undefined,
  now = new Date(),
): boolean {
  return Boolean(value && dateKey(value) === dateKey(now));
}

export function matchesTodayFilter(
  item: Pick<
    Opportunity,
    "created_at" | "fetched_at" | "published_at" | "deadline_at"
  >,
  filter: TodayFilter,
  now = new Date(),
): boolean {
  if (filter === "all") return true;
  const today = dateKey(now);
  if (!today) return false;

  if (filter === "ingested") {
    return (
      dateKey(item.created_at) === today || dateKey(item.fetched_at) === today
    );
  }
  if (filter === "published") {
    return isSameIstanbulDay(item.published_at, now);
  }
  return isSameIstanbulDay(item.deadline_at, now);
}

export function nearRangeEnd(now: Date): number {
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 1);
  return end.getTime();
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("tr-TR")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function matchesOpportunitySearch(
  item: Opportunity,
  query?: string,
): boolean {
  const normalizedQuery = normalizeSearchText(query ?? "");
  if (!normalizedQuery) return true;

  const searchable = normalizeSearchText(
    [
      item.title,
      item.summary,
      item.source_name,
      item.category,
      item.location,
      item.source_url,
      item.application_url,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return normalizedQuery
    .split(" ")
    .every((term) => searchable.includes(term));
}

export function matchesTimeRange(
  item: Pick<Opportunity, "deadline_at" | "published_at">,
  timeRange: TimeRange,
  now = new Date(),
): boolean {
  if (timeRange === "all") return true;

  const today = startOfDay(now);
  const deadline = validTime(item.deadline_at);
  const published = validTime(item.published_at);

  if (deadline !== null) {
    if (deadline < today) return false;
    return timeRange === "active" || deadline <= nearRangeEnd(now);
  }

  if (published === null) return false;
  if (timeRange === "active") return true;
  return published >= today - 90 * DAY_MS;
}

function sortBucket(
  item: Pick<Opportunity, "deadline_at" | "published_at">,
  now: Date,
): number {
  const today = startOfDay(now);
  const deadline = validTime(item.deadline_at);
  const published = validTime(item.published_at);

  if (
    deadline !== null &&
    deadline >= today &&
    deadline <= nearRangeEnd(now)
  ) {
    return 0;
  }
  if (deadline === null && published !== null) return 1;
  if (deadline !== null && deadline > nearRangeEnd(now)) return 2;
  if (deadline !== null && deadline < today) return 3;
  return 4;
}

export function sortOpportunities(
  opportunities: Opportunity[],
  now = new Date(),
): Opportunity[] {
  return [...opportunities].sort((left, right) => {
    const bucketDifference =
      sortBucket(left, now) - sortBucket(right, now);
    if (bucketDifference !== 0) return bucketDifference;

    const bucket = sortBucket(left, now);
    if (bucket === 0 || bucket === 2 || bucket === 3) {
      return (
        (validTime(left.deadline_at) ?? Number.MAX_SAFE_INTEGER) -
        (validTime(right.deadline_at) ?? Number.MAX_SAFE_INTEGER)
      );
    }

    if (bucket === 1) {
      return (
        (validTime(right.published_at) ?? 0) -
        (validTime(left.published_at) ?? 0)
      );
    }

    return left.title.localeCompare(right.title, "tr-TR");
  });
}

export type OpportunityStatus =
  | "Başvuruya açık"
  | "Gelecek çağrı"
  | "Kapandı"
  | "Tarih belirsiz";

export function getOpportunityStatus(
  item: Pick<Opportunity, "deadline_at" | "published_at">,
  now = new Date(),
): OpportunityStatus {
  const today = startOfDay(now);
  const deadline = validTime(item.deadline_at);
  const published = validTime(item.published_at);

  if (deadline !== null && deadline < today) return "Kapandı";
  if (
    deadline !== null &&
    deadline > nearRangeEnd(now)
  ) {
    return "Gelecek çağrı";
  }
  if (
    deadline !== null &&
    published !== null &&
    published > now.getTime()
  ) {
    return "Gelecek çağrı";
  }
  if (deadline !== null && deadline >= today) return "Başvuruya açık";
  if (published !== null && published > now.getTime()) return "Gelecek çağrı";
  return "Tarih belirsiz";
}
