import {
  createIngestionRun,
  finishIngestionRun,
  getRunningIngestionRun,
  type IngestionStatus,
  type IngestionTrigger,
  type SourceIngestionResult,
  writeSourceLog,
} from "@/lib/ingestion/ingestionRuns";
import { applyInvestmentCategoryPriority } from "@/lib/ingestion/investmentClassification";
import { enrichOpportunityDescriptions } from "@/lib/ingestion/extractOpportunityDescription";
import { isEntrepreneurshipRelevant } from "@/lib/ingestion/isEntrepreneurshipRelevant";
import { mapWithConcurrency } from "@/lib/ingestion/mapWithConcurrency";
import { normalizeOpportunity } from "@/lib/ingestion/normalizeOpportunity";
import { shouldKeepForIngestion } from "@/lib/opportunities/opportunityFreshness";
import {
  sourceConfigs,
  type SourceConfig,
} from "@/lib/ingestion/sourceConfig";
import {
  classifySourceError,
  SOURCE_STATUSES,
  type SourceStatus,
} from "@/lib/ingestion/sourceStatus";
import { upsertOpportunities } from "@/lib/ingestion/upsertOpportunities";
import type { OpportunityInput } from "@/types/opportunity";

type IngestSourceDependencies = {
  upsert: typeof upsertOpportunities;
  writeLog: typeof writeSourceLog;
};

const defaultDependencies: IngestSourceDependencies = {
  upsert: upsertOpportunities,
  writeLog: writeSourceLog,
};

export class IngestionAlreadyRunningError extends Error {
  constructor(public readonly runId: string) {
    super("Ingestion is already running.");
    this.name = "IngestionAlreadyRunningError";
  }
}

export type IngestionResult = {
  runId: string;
  status: Exclude<IngestionStatus, "running">;
  sources: SourceIngestionResult[];
  totals: {
    collected: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
    statuses: Record<SourceStatus, number>;
  };
};

export async function ingestSource(
  runId: string,
  source: SourceConfig,
  dependencies: IngestSourceDependencies = defaultDependencies,
): Promise<SourceIngestionResult> {
  const startedAt = Date.now();
  const baseResult = {
    sourceId: source.id,
    sourceName: source.name,
    kind: source.kind,
    fragile: source.fragile,
    requiresApiKey: source.requiresApiKey,
  };
  let result: SourceIngestionResult;

  if (source.requiredEnv && !process.env[source.requiredEnv]) {
    result = {
      ...baseResult,
      status: "skipped",
      collected: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      durationMs: Date.now() - startedAt,
      error: `${source.requiredEnv} tanımlı değil`,
    };
  } else {
    try {
      const collected = await source.collect();
      const freshnessFiltered = collected.filter((item) =>
        shouldKeepForIngestion(item),
      );
      const freshnessSkippedCount =
        collected.length - freshnessFiltered.length;
      const descriptionEnriched = await enrichOpportunityDescriptions(
        freshnessFiltered,
        source.id,
      );
      const normalized: OpportunityInput[] = [];
      let invalidCount = 0;
      let relevanceSkippedCount = 0;

      for (const item of descriptionEnriched) {
        try {
          const normalizedItem = applyInvestmentCategoryPriority(
            normalizeOpportunity(item),
            { sourceId: source.id, type: source.opportunityType },
          );
          const relevance = isEntrepreneurshipRelevant({
            title: normalizedItem.title,
            summary: normalizedItem.summary,
            category: normalizedItem.category,
            sourceName: normalizedItem.source_name,
            sourceId: source.id,
            type: source.opportunityType,
          });

          if (relevance.relevant) {
            normalized.push(normalizedItem);
          } else {
            relevanceSkippedCount += 1;
          }
        } catch {
          invalidCount += 1;
        }
      }

      const uniqueItems = [
        ...new Map(normalized.map((item) => [item.unique_key, item])).values(),
      ];
      const duplicateCount = normalized.length - uniqueItems.length;
      const upsert = await dependencies.upsert(uniqueItems);
      const status =
        collected.length === 0
          ? "empty"
          : normalized.length === 0
            ? "skipped"
            : invalidCount > 0 ||
                relevanceSkippedCount > 0 ||
                freshnessSkippedCount > 0
            ? "partial"
            : "success";

      result = {
        ...baseResult,
        status,
        collected: collected.length,
        inserted: upsert.inserted,
        updated: upsert.updated,
        skipped:
          invalidCount +
          duplicateCount +
          relevanceSkippedCount +
          freshnessSkippedCount,
        durationMs: Date.now() - startedAt,
        error:
          freshnessSkippedCount > 0
            ? `${freshnessSkippedCount} eski/arşiv kayıt güncel akıştan çıkarıldı.`
            : relevanceSkippedCount > 0
            ? relevanceSkippedCount === collected.length
              ? "Girişimcilik kapsamı dışında olduğu için atlandı."
              : `${relevanceSkippedCount} kayıt girişimcilik kapsamı dışında olduğu için atlandı.`
            : null,
      };
    } catch (error) {
      const classified = classifySourceError(error, source.fragile);
      result = {
        ...baseResult,
        status: classified.status,
        collected: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        durationMs: Date.now() - startedAt,
        error: classified.message,
      };
    }
  }

  try {
    await dependencies.writeLog(runId, result);
  } catch (error) {
    console.error(`Ingestion log could not be written for ${source.id}:`, error);
  }

  return result;
}

export async function runIngestion(
  trigger: IngestionTrigger,
): Promise<IngestionResult> {
  const activeRun = await getRunningIngestionRun();
  if (activeRun) {
    throw new IngestionAlreadyRunningError(activeRun.id);
  }

  const runId = await createIngestionRun(trigger);
  const enabledSources = sourceConfigs.filter((source) => source.enabled);
  const sourceResults = await mapWithConcurrency(
    enabledSources,
    5,
    (source) => ingestSource(runId, source),
    async (source, error) => {
      const classified = classifySourceError(error, source.fragile);
      const result: SourceIngestionResult = {
        sourceId: source.id,
        sourceName: source.name,
        kind: source.kind,
        fragile: source.fragile,
        requiresApiKey: source.requiresApiKey,
        status: classified.status,
        collected: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        durationMs: 0,
        error: classified.message,
      };

      try {
        await writeSourceLog(runId, result);
      } catch (logError) {
        console.error(
          `Emergency ingestion log could not be written for ${source.id}:`,
          logError,
        );
      }

      return result;
    },
  );

  const totals = sourceResults.reduce(
    (sum, source) => ({
      collected: sum.collected + source.collected,
      inserted: sum.inserted + source.inserted,
      updated: sum.updated + source.updated,
      skipped: sum.skipped + source.skipped,
      errors: sum.errors + (source.status === "error" ? 1 : 0),
      statuses: {
        ...sum.statuses,
        [source.status]: sum.statuses[source.status] + 1,
      },
    }),
    {
      collected: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      statuses: Object.fromEntries(
        SOURCE_STATUSES.map((sourceStatus) => [sourceStatus, 0]),
      ) as Record<SourceStatus, number>,
    },
  );
  const nonSuccessCount = sourceResults.filter(
    (source) => source.status !== "success",
  ).length;
  const status: IngestionResult["status"] =
    nonSuccessCount === 0
      ? "success"
      : totals.errors === sourceResults.length
        ? "failed"
        : "partial";

  await finishIngestionRun(runId, status, {
    ...totals,
    errorCount: totals.errors,
  });

  return { runId, status, sources: sourceResults, totals };
}
