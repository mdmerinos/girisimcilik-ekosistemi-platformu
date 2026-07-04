import type { IngestionResult } from "@/lib/ingestion/runIngestion";

export type PublicIngestionResult = {
  runId: string;
  status: IngestionResult["status"];
  sources: Array<{
    sourceId: string;
    sourceName: string;
    status: IngestionResult["sources"][number]["status"];
    collected: number;
    inserted: number;
    updated: number;
    error: string | null;
    workerRequired: boolean;
  }>;
  totals: IngestionResult["totals"] & {
    successfulSources: number;
    issueSources: number;
  };
};

function publicSourceMessage(
  source: IngestionResult["sources"][number],
): string | null {
  if (source.status === "success") return null;
  if (source.sourceId === "nato-diana") {
    return "Kaynak bot koruması nedeniyle normal fetch ile veri döndürmedi; harici worker gerekebilir.";
  }
  if (source.status === "empty") {
    return "Bu kaynak geçici olarak veri döndürmedi.";
  }
  if (source.status === "fragile") {
    return "Kaynağa geçici olarak ulaşılamadı veya bot koruması yanıt verdi.";
  }
  if (source.status === "skipped") {
    return "Kaynak yapılandırması eksik veya uygun kayıt bulunamadı.";
  }
  if (source.status === "partial") {
    return "Kaynağın bazı kayıtları doğrulama veya kapsam filtresinden geçmedi.";
  }
  return "Kaynak taraması tamamlanamadı.";
}

export function toPublicIngestionResult(
  result: IngestionResult,
): PublicIngestionResult {
  const successfulSources = result.sources.filter((source) =>
    ["success", "partial"].includes(source.status),
  ).length;

  return {
    runId: result.runId,
    status: result.status,
    sources: result.sources.map((source) => ({
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      status: source.status,
      collected: source.collected,
      inserted: source.inserted,
      updated: source.updated,
      error: publicSourceMessage(source),
      workerRequired: source.sourceId === "nato-diana",
    })),
    totals: {
      ...result.totals,
      successfulSources,
      issueSources: result.sources.length - successfulSources,
    },
  };
}
