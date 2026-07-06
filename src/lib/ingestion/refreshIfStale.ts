import {
  getLatestIngestionRun,
  getLatestSuccessfulIngestionRun,
  getRunningIngestionRun,
} from "@/lib/ingestion/ingestionRuns";
import { decideRefreshIfStale } from "@/lib/ingestion/refreshDecision";
import type { RefreshIfStaleResult } from "@/lib/ingestion/refreshDecision";
import {
  toPublicIngestionResult,
  type PublicIngestionResult,
} from "@/lib/ingestion/publicIngestionResult";
import {
  IngestionAlreadyRunningError,
  runIngestion,
} from "@/lib/ingestion/runIngestion";

export type RefreshResult = RefreshIfStaleResult & {
  result?: PublicIngestionResult;
};

export async function refreshIfStale(
  options: { force?: boolean; waitForCompletion?: boolean } = {},
): Promise<RefreshResult> {
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
      force: options.force,
    });

    if (decision.status !== "started") return decision;

    if (options.waitForCompletion) {
      const result = await runIngestion(options.force ? "manual" : "cron");
      return {
        ...decision,
        status: "completed",
        lastSuccessfulIngestionAt: new Date().toISOString(),
        message: `Kaynaklar kontrol edildi: ${result.sources.length} kaynak, ${result.totals.inserted} yeni kayıt, ${result.totals.updated} güncelleme.`,
        result: toPublicIngestionResult(result),
      };
    }

    void runIngestion("cron").catch((error) => {
      if (error instanceof IngestionAlreadyRunningError) return;
      console.error("Stale refresh ingestion failed:", error);
    });

    return decision;
  } catch (error) {
    if (error instanceof IngestionAlreadyRunningError) {
      return {
        ok: true,
        status: "already_running",
        lastSuccessfulIngestionAt: null,
        message: "Veriler şu anda güncelleniyor.",
      };
    }

    console.error("Refresh-if-stale check failed:", error);
    return {
      ok: false,
      status: "error",
      lastSuccessfulIngestionAt: null,
      message: "Veriler gösteriliyor, güncelleme daha sonra tekrar denenecek.",
    };
  }
}
