import {
  getLatestIngestionRun,
  getLatestSuccessfulIngestionRun,
  getRunningIngestionRun,
} from "@/lib/ingestion/ingestionRuns";
import { decideRefreshIfStale } from "@/lib/ingestion/refreshDecision";
import type { RefreshIfStaleResult } from "@/lib/ingestion/refreshDecision";
import {
  IngestionAlreadyRunningError,
  runIngestion,
} from "@/lib/ingestion/runIngestion";

export async function refreshIfStale(): Promise<RefreshIfStaleResult> {
  try {
    const [runningRun, latestSuccessfulRun, latestRun] = await Promise.all([
      getRunningIngestionRun(),
      getLatestSuccessfulIngestionRun(),
      getLatestIngestionRun(),
    ]);
    const decision = decideRefreshIfStale({
      now: new Date(),
      lastSuccessfulIngestionAt: latestSuccessfulRun?.finished_at ?? null,
      lastAttemptAt: latestRun?.started_at ?? null,
      isRunning: Boolean(runningRun),
    });

    if (decision.status !== "started") return decision;

    void runIngestion("cron").catch((error) => {
      if (error instanceof IngestionAlreadyRunningError) return;
      console.error("Stale refresh ingestion failed:", error);
    });

    return decision;
  } catch (error) {
    console.error("Refresh-if-stale check failed:", error);
    return {
      ok: false,
      status: "error",
      lastSuccessfulIngestionAt: null,
      message: "Veriler gösteriliyor, güncelleme daha sonra tekrar denenecek.",
    };
  }
}