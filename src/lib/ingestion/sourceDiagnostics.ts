import type { SourceIngestionResult } from "@/lib/ingestion/ingestionRuns";
import type { OpportunityInput } from "@/types/opportunity";

const DAY_MS = 24 * 60 * 60 * 1000;

type SourceDiagnostics = NonNullable<SourceIngestionResult["diagnostics"]>;

export function buildSourceDiagnostics(options: {
  fetchUrls: string[];
  fallbackStatus?: SourceDiagnostics["fallbackStatus"];
  httpStatus: number | null;
  collected: OpportunityInput[];
  accepted: OpportunityInput[];
  filtered: SourceDiagnostics["filtered"];
  inserted: number;
  updated: number;
  now?: Date;
  fallbackMessage?: string;
  staleMessage?: string;
}): SourceDiagnostics {
  const dated = options.collected
    .filter((item) => item.published_at)
    .sort(
      (left, right) =>
        new Date(right.published_at ?? 0).getTime() -
        new Date(left.published_at ?? 0).getTime(),
    );
  const newestPublishedAt = dated[0]?.published_at ?? null;
  const age = newestPublishedAt
    ? (options.now ?? new Date()).getTime() -
      new Date(newestPublishedAt).getTime()
    : null;
  const freshness =
    age === null || !Number.isFinite(age)
      ? "unknown"
      : age <= DAY_MS
        ? "last24Hours"
        : age <= 7 * DAY_MS
          ? "last7Days"
          : age <= 30 * DAY_MS
            ? "last30Days"
            : "older";
  const freshnessMessage =
    options.fallbackMessage ??
    (freshness === "unknown"
      ? "Kaynak yayın tarihi yakalanmadı."
      : freshness === "last24Hours"
        ? "Son 24 saatte yayımlanmış kayıt döndü."
        : freshness === "last7Days"
          ? "Son 7 günde yayımlanmış kayıt döndü."
          : freshness === "last30Days"
            ? "Son 30 günde yayımlanmış kayıt döndü."
            : (options.staleMessage ?? "Kaynak güncel kayıt döndürmedi."));
  const filteredTotal = Object.values(options.filtered).reduce(
    (sum, count) => sum + count,
    0,
  );
  const reason =
    options.fallbackMessage ??
    (options.collected.length === 0
      ? (options.staleMessage ?? "Kaynakta bu taramada yeni/güncel kayıt bulunamadı.")
      : options.inserted === 0 && options.updated > 0
        ? "Kayıtlar daha önce eklenmiş; duplicate/güncelleme olarak işlendi."
        : options.inserted === 0 && filteredTotal > 0
          ? "Kayıtlar filtrelerle elendi veya duplicate olarak sayıldı."
          : options.inserted > 0
            ? "Yeni kayıt Supabase'e yazıldı."
            : freshnessMessage);
  const acceptedCategories = options.accepted.reduce<Record<string, number>>(
    (counts, item) => ({
      ...counts,
      [item.category]: (counts[item.category] ?? 0) + 1,
    }),
    {},
  );

  return {
    fetchUrls: options.fetchUrls,
    fallbackStatus: options.fallbackStatus ?? "not_configured",
    httpStatus: options.httpStatus,
    raw: options.collected.length,
    accepted: options.accepted.length,
    filtered: options.filtered,
    upserted: options.inserted + options.updated,
    reason,
    newestPublishedAt,
    newestTitles: [
      ...dated,
      ...options.collected.filter((item) => !item.published_at),
    ]
      .slice(0, 5)
      .map((item) => item.title),
    freshness,
    freshnessMessage,
    acceptedCategories,
  };
}
