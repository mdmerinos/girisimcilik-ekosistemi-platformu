import type { SourceStatus } from "@/lib/ingestion/sourceStatus";

type PublicSourceResult = {
  sourceId: string;
  sourceName: string;
  status: SourceStatus;
  collected: number;
  inserted: number;
  updated: number;
  skipped: number;
  diagnostics?: {
    raw: number;
    accepted: number;
    filtered: {
      archive: number;
      old: number;
      relevance: number;
      invalid: number;
      duplicate: number;
    };
    reason: string;
  };
  error: string | null;
  workerRequired: boolean;
};

export type RefreshState = {
  ok: boolean;
  status:
    | "fresh"
    | "started"
    | "completed"
    | "already_running"
    | "cooldown"
    | "error";
  lastSuccessfulIngestionAt: string | null;
  message: string;
  result?: {
    runId: string;
    status: "success" | "partial" | "failed";
    sources: PublicSourceResult[];
    totals: {
      collected: number;
      inserted: number;
      updated: number;
      skipped: number;
      errors: number;
      successfulSources: number;
      issueSources: number;
    };
  };
};

function sourceMessage(source: PublicSourceResult): string {
  if (source.workerRequired && source.status !== "success") {
    return "Normal fetch bot korumasına takılabilir; harici worker ayarı gerekiyor.";
  }
  if (source.error) return source.error;
  if (source.diagnostics?.reason) return source.diagnostics.reason;
  if (source.status === "empty") {
    return "Bu kaynak geçici olarak veri döndürmedi.";
  }
  return `${source.collected} kayıt bulundu, ${source.inserted} yeni, ${source.updated} güncellendi.`;
}

export function RefreshStatus({ state }: { state: RefreshState | null }) {
  if (!state) return null;

  return (
    <section
      className={`atlas-panel rounded-2xl p-4 ${
        state.status === "error" ? "is-error" : ""
      }`}
      aria-live="polite"
    >
      <p className="text-sm font-semibold" role="status">
        <span className="mr-2" aria-hidden="true">
          {state.status === "error" ? "!" : "●"}
        </span>
        {state.message}
      </p>

      {state.result && (
        <>
          <div className="atlas-muted mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span>{state.result.totals.inserted} yeni kayıt</span>
            <span>{state.result.totals.updated} güncelleme</span>
            <span>
              {state.result.totals.successfulSources} başarılı kaynak
            </span>
            <span>{state.result.totals.issueSources} sorunlu/boş kaynak</span>
          </div>
          <p className="atlas-muted mt-3 text-xs leading-5">
            NATO DIANA ve ODTÜ browser worker’ları GitHub Actions üzerinde
            çalışır. Manuel workflow tamamlandıktan sonra gelen kayıtlar kaynak
            filtrelerinde görünür.
          </p>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold">
              Kaynak bazlı yenileme raporu
            </summary>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {state.result.sources.map((source) => (
                <article
                  key={source.sourceId}
                  className="atlas-control rounded-xl p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong>{source.sourceName}</strong>
                    <span className="atlas-muted">{source.status}</span>
                  </div>
                  <p className="atlas-muted mt-1 leading-5">
                    {sourceMessage(source)}
                  </p>
                  {source.diagnostics && (
                    <p className="atlas-muted mt-2 leading-5">
                      Ham {source.diagnostics.raw}, kabul{" "}
                      {source.diagnostics.accepted}, yeni {source.inserted},
                      duplicate {source.diagnostics.filtered.duplicate},
                      elenen {source.skipped}.
                    </p>
                  )}
                </article>
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
