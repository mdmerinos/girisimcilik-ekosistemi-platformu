import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  sourceConfigs,
  type SourceKind,
} from "@/lib/ingestion/sourceConfig";
import { SOURCE_STATUSES, type SourceStatus } from "@/lib/ingestion/sourceStatus";

export type IngestionTrigger = "manual" | "cron";
export type IngestionStatus = "running" | "success" | "partial" | "failed";

// API ingestion routes have a 300 second execution limit. A run older than
// this grace period cannot still be doing useful work in that invocation and
// must not keep subsequent manual or cron runs locked for hours.
export const INGESTION_RUN_STALE_AFTER_MS = 6 * 60 * 1000;

export type SourceIngestionResult = {
  sourceId: string;
  sourceName: string;
  kind: SourceKind;
  fragile: boolean;
  requiresApiKey: boolean;
  status: SourceStatus;
  collected: number;
  inserted: number;
  updated: number;
  skipped: number;
  durationMs: number;
  error: string | null;
  diagnostics?: {
    fetchUrls: string[];
    fallbackStatus: "not_configured" | "not_needed" | "success" | "failed";
    httpStatus: number | null;
    raw: number;
    accepted: number;
    filtered: {
      archive: number;
      old: number;
      relevance: number;
      invalid: number;
      quality: number;
      duplicate: number;
    };
    upserted: number;
    reason: string;
    newestPublishedAt: string | null;
    newestTitles: string[];
    freshness: "last24Hours" | "last7Days" | "last30Days" | "older" | "unknown";
    freshnessMessage: string;
    acceptedCategories: Record<string, number>;
  };
};

export type IngestionRunRow = {
  id: string;
  trigger: IngestionTrigger;
  status: IngestionStatus;
  started_at: string;
  finished_at: string | null;
  collected_count: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
};

export async function createIngestionRun(
  trigger: IngestionTrigger,
): Promise<string> {
  const { data, error } = await createAdminSupabaseClient()
    .from("ingestion_runs")
    .insert({ trigger, status: "running" })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function writeSourceLog(
  runId: string,
  result: SourceIngestionResult,
): Promise<void> {
  const { error } = await createAdminSupabaseClient()
    .from("ingestion_logs")
    .insert({
      run_id: runId,
      source_id: result.sourceId,
      source_name: result.sourceName,
      source_kind: result.kind,
      status: result.status,
      collected_count: result.collected,
      inserted_count: result.inserted,
      updated_count: result.updated,
      skipped_count: result.skipped,
      duration_ms: result.durationMs,
      error_message: result.error,
      finished_at: new Date().toISOString(),
    });

  if (error) throw error;
}

export async function finishIngestionRun(
  runId: string,
  status: Exclude<IngestionStatus, "running">,
  totals: {
    collected: number;
    inserted: number;
    updated: number;
    skipped: number;
    errorCount: number;
  },
): Promise<void> {
  const { error } = await createAdminSupabaseClient()
    .from("ingestion_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      collected_count: totals.collected,
      inserted_count: totals.inserted,
      updated_count: totals.updated,
      skipped_count: totals.skipped,
      error_count: totals.errorCount,
    })
    .eq("id", runId);

  if (error) throw error;
}

export async function recoverStaleIngestionRuns(
  now = new Date(),
  maxAgeMs = INGESTION_RUN_STALE_AFTER_MS,
): Promise<string[]> {
  const staleBefore = new Date(now.getTime() - maxAgeMs).toISOString();
  const { data, error } = await createAdminSupabaseClient()
    .from("ingestion_runs")
    .update({
      status: "failed",
      finished_at: now.toISOString(),
      error_count: 1,
    })
    .eq("status", "running")
    .lt("started_at", staleBefore)
    .select("id");

  if (error) throw error;
  return (data ?? []).map((run) => run.id as string);
}

export async function getRecentIngestionRuns(limit = 50) {
  const supabase = createAdminSupabaseClient();
  const { data: runs, error: runsError } = await supabase
    .from("ingestion_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (runsError) throw runsError;
  if (!runs?.length) return [];

  const runIds = runs.map((run) => run.id as string);
  const { data: logs, error: logsError } = await supabase
    .from("ingestion_logs")
    .select("*")
    .in("run_id", runIds)
    .order("created_at", { ascending: true });

  if (logsError) throw logsError;

  return runs.map((run) => ({
    ...run,
    logs: (logs ?? []).filter((log) => log.run_id === run.id),
  }));
}

export async function getRunningIngestionRun(
  maxAgeMs = INGESTION_RUN_STALE_AFTER_MS,
) {
  const startedAfter = new Date(Date.now() - maxAgeMs).toISOString();
  const { data, error } = await createAdminSupabaseClient()
    .from("ingestion_runs")
    .select("*")
    .eq("status", "running")
    .gte("started_at", startedAfter)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as IngestionRunRow | null;
}

export async function getLatestSuccessfulIngestionRun() {
  const { data, error } = await createAdminSupabaseClient()
    .from("ingestion_runs")
    .select("*")
    .in("status", ["success", "partial"])
    .order("finished_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as IngestionRunRow | null;
}

export async function getLatestIngestionRun() {
  const { data, error } = await createAdminSupabaseClient()
    .from("ingestion_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as IngestionRunRow | null;
}

export async function getLatestSourceStatusCounts(runId: string | null) {
  if (!runId) {
    return Object.fromEntries(
      SOURCE_STATUSES.map((status) => [status, 0]),
    ) as Record<SourceStatus, number>;
  }

  const { data, error } = await createAdminSupabaseClient()
    .from("ingestion_logs")
    .select("status")
    .eq("run_id", runId);

  if (error) throw error;

  return (data ?? []).reduce(
    (sum, log) => ({
      ...sum,
      [log.status as SourceStatus]: sum[log.status as SourceStatus] + 1,
    }),
    Object.fromEntries(
      SOURCE_STATUSES.map((status) => [status, 0]),
    ) as Record<SourceStatus, number>,
  );
}

export async function getIngestionAdminStats() {
  await recoverStaleIngestionRuns();
  const supabase = createAdminSupabaseClient();
  const [
    { count: opportunityCount, error: countError },
    { data: latestRows, error: latestError },
    latestSuccessfulRun,
    latestRun,
    runningRun,
  ] = await Promise.all([
    supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("opportunities")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1),
    getLatestSuccessfulIngestionRun(),
    getLatestIngestionRun(),
    getRunningIngestionRun(),
  ]);

  if (countError) throw countError;
  if (latestError) throw latestError;

  const sourceStatusCounts = await getLatestSourceStatusCounts(
    latestRun?.id ?? null,
  );

  return {
    opportunityCount: opportunityCount ?? 0,
    sourceCount: sourceConfigs.length,
    enabledSourceCount: sourceConfigs.filter((source) => source.enabled).length,
    fragileSourceCount: sourceConfigs.filter((source) => source.fragile).length,
    socialMediaSourceCount: sourceConfigs.filter(
      (source) => source.sourceGroup === "social_media",
    ).length,
    lastOpportunityUpdate: latestRows?.[0]?.fetched_at ?? null,
    lastSuccessfulIngestionAt: latestSuccessfulRun?.finished_at ?? null,
    lastAttemptAt: latestRun?.started_at ?? null,
    latestRunStatus: latestRun?.status ?? null,
    runningIngestion: Boolean(runningRun),
    cronEnabled: true,
    cronSchedule: "0 * * * *",
    cronScheduleDescription: "Saatte bir; manuel Yenile aynı kaynak setini hemen çalıştırır",
    sourceStatusCounts,
  };
}
