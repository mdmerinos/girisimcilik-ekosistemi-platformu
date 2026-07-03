import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  sourceConfigs,
  type SourceKind,
} from "@/lib/ingestion/sourceConfig";
import type { SourceStatus } from "@/lib/ingestion/sourceStatus";

export type IngestionTrigger = "manual" | "cron";
export type IngestionStatus = "running" | "success" | "partial" | "failed";

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

export async function getRecentIngestionRuns(limit = 10) {
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

export async function getIngestionAdminStats() {
  const supabase = createAdminSupabaseClient();
  const [
    { count: opportunityCount, error: countError },
    { data: latestRows, error: latestError },
  ] = await Promise.all([
    supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("opportunities")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1),
  ]);

  if (countError) throw countError;
  if (latestError) throw latestError;

  return {
    opportunityCount: opportunityCount ?? 0,
    sourceCount: sourceConfigs.length,
    enabledSourceCount: sourceConfigs.filter((source) => source.enabled).length,
    fragileSourceCount: sourceConfigs.filter((source) => source.fragile).length,
    lastOpportunityUpdate: latestRows?.[0]?.fetched_at ?? null,
  };
}
