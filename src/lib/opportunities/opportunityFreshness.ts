import type { Opportunity, OpportunityInput } from "@/types/opportunity";

const DAY_MS = 24 * 60 * 60 * 1000;
export const ACTIVE_CONTENT_MAX_AGE_DAYS = 180;
export const INGESTION_CONTENT_MAX_AGE_DAYS = 365;

export type FreshnessOpportunity = Pick<
  Opportunity | OpportunityInput,
  | "title"
  | "summary"
  | "source_name"
  | "source_url"
  | "application_url"
  | "published_at"
  | "deadline_at"
>;

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("tr-TR")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

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

export function hasArchiveSignal(item: FreshnessOpportunity): boolean {
  const textContent = normalized(
    [
      item.title,
      item.summary,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const source = normalized(item.source_name);
  const urlContent = normalized(
    [item.source_url, item.application_url].filter(Boolean).join(" "),
  );
  const allContent = `${textContent} ${source} ${urlContent}`;
  const officialSource =
    /\b(kosgeb|tubitak|bakanlik|kalkinma ajansi|teknokent|sanayi ve teknoloji)\b/.test(
      source,
    );
  const strongArchiveSignal =
    /\b(milliyet gazetesi|sabah gazetesi|turkiye gazetesi|gazete kupuru|basinda biz|basin kupuru|medya yansimasi|arsiv sayfasi|devami icin)\b/.test(
      allContent,
    );
  const genericArchiveSignal =
    /\b(gazete|basinda|medya|kupur|arsiv)\b/.test(allContent);
  const archiveUrlSignal =
    /\b(turkiye gazetesi|milliyet|sabah|gazete|basinda|medya|arsiv|kupur)\b/.test(
      urlContent,
    );
  const officialMediaSignal =
    officialSource && /\bmedya\b/.test(textContent);

  return (
    strongArchiveSignal ||
    genericArchiveSignal ||
    archiveUrlSignal ||
    officialMediaSignal
  );
}

export function hasActiveDeadline(
  item: Pick<FreshnessOpportunity, "deadline_at">,
  now = new Date(),
): boolean {
  const deadline = validTime(item.deadline_at);
  return deadline !== null && deadline >= startOfDay(now);
}

export function isOldArchiveOpportunity(
  item: FreshnessOpportunity,
  now = new Date(),
  maxAgeDays = ACTIVE_CONTENT_MAX_AGE_DAYS,
): boolean {
  if (hasActiveDeadline(item, now)) return false;
  if (hasArchiveSignal(item)) return true;

  const published = validTime(item.published_at);
  return (
    published !== null &&
    published < startOfDay(now) - maxAgeDays * DAY_MS
  );
}

export function shouldKeepForIngestion(
  item: FreshnessOpportunity,
  now = new Date(),
): boolean {
  return !isOldArchiveOpportunity(
    item,
    now,
    INGESTION_CONTENT_MAX_AGE_DAYS,
  );
}
