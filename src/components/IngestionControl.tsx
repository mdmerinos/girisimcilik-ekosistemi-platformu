"use client";

import dayjs from "dayjs";
import { FormEvent, useState } from "react";

import {
  SOURCE_STATUSES,
  SOURCE_STATUS_PRESENTATION,
  type SourceStatus,
} from "@/lib/ingestion/sourceStatus";

type SourceResult = {
  sourceId: string;
  sourceName: string;
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

type RunResult = {
  runId: string;
  status: string;
  sources: SourceResult[];
  totals: {
    collected: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
  };
};

type StoredLog = {
  id: number;
  source_id: string;
  source_name: string;
  source_kind: "rss" | "html" | "api";
  status: SourceResult["status"];
  collected_count: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  duration_ms: number;
  error_message: string | null;
  finished_at: string | null;
  created_at: string;
};

type StoredRun = {
  id: string;
  status: string;
  trigger: "manual" | "cron";
  started_at: string;
  finished_at: string | null;
  collected_count: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  logs: StoredLog[];
};

type AdminStats = {
  opportunityCount: number;
  sourceCount: number;
  enabledSourceCount: number;
  fragileSourceCount: number;
  lastOpportunityUpdate: string | null;
  lastSuccessfulIngestionAt: string | null;
  lastAttemptAt: string | null;
  latestRunStatus: string | null;
  runningIngestion: boolean;
  cronEnabled: boolean;
  cronSchedule: string;
  cronScheduleDescription: string;
  sourceStatusCounts: Record<SourceStatus, number>;
};

type SourceCatalogItem = {
  id: string;
  name: string;
  kind: "rss" | "html" | "api";
  fragile: boolean;
  requiresApiKey: boolean;
  configured: boolean;
  notes: string;
};

function formatDate(value: string | null): string {
  return value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "Henüz yok";
}

export function IngestionControl() {
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<StoredRun[]>([]);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [sourceCatalog, setSourceCatalog] = useState<SourceCatalogItem[]>([]);

  async function loadRuns(currentSecret = secret) {
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/ingest", {
        headers: { Authorization: `Bearer ${currentSecret}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        error?: string;
        runs?: StoredRun[];
        stats?: AdminStats;
        sources?: SourceCatalogItem[];
      };
      if (!response.ok) throw new Error(payload.error ?? "Geçmiş alınamadı.");
      setRuns(payload.runs ?? []);
      setAdminStats(payload.stats ?? null);
      setSourceCatalog(payload.sources ?? []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      const payload = (await response.json()) as {
        error?: string;
        result?: RunResult;
      };

      if (!response.ok) throw new Error(payload.error ?? "İşlem başarısız.");
      if (payload.result) setLastResult(payload.result);
      setStatus(
        `${payload.result?.totals.inserted ?? 0} yeni, ${payload.result?.totals.updated ?? 0} güncellenen kayıt.`,
      );
      await loadRuns(secret);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Bilinmeyen hata");
      setLoading(false);
    }
  }

  const visibleLogs: SourceResult[] =
    lastResult?.sources ??
    runs[0]?.logs.map((log) => {
      const catalogItem = sourceCatalog.find(
        (source) => source.id === log.source_id,
      );
      return {
        sourceId: log.source_id,
        sourceName: log.source_name,
        fragile: catalogItem?.fragile ?? false,
        requiresApiKey: catalogItem?.requiresApiKey ?? false,
        status: log.status,
        collected: log.collected_count,
        inserted: log.inserted_count,
        updated: log.updated_count,
        skipped: log.skipped_count,
        durationMs: log.duration_ms,
        error: log.error_message,
      };
    }) ??
    [];
  const healthSummary = {
    producing: visibleLogs.filter(
      (log) =>
        (log.status === "success" || log.status === "partial") &&
        log.collected > 0,
    ).length,
    publicLimited: visibleLogs.filter((log) =>
      ["fragile", "skipped"].includes(log.status),
    ).length,
    workerRequired: visibleLogs.filter((log) =>
      ["nato-diana", "odtu-teknokent"].includes(log.sourceId),
    ).length,
    newData: visibleLogs.filter((log) => log.inserted > 0).length,
    filtered: visibleLogs.reduce((sum, log) => sum + log.skipped, 0),
  };

  const sourceRows = sourceCatalog.map((source) => {
    const latestRun = runs.find((run) =>
      run.logs.some((log) => log.source_id === source.id),
    );
    const latestLog = latestRun?.logs.find(
      (log) => log.source_id === source.id,
    );
    const successfulRun = runs.find((run) =>
      run.logs.some(
        (log) =>
          log.source_id === source.id &&
          (log.status === "success" || log.status === "partial"),
      ),
    );
    const successfulLog = successfulRun?.logs.find(
      (log) =>
        log.source_id === source.id &&
        (log.status === "success" || log.status === "partial"),
    );

    return {
      source,
      latestRun,
      latestLog,
      successfulRun,
      successfulLog,
    };
  });

  return (
    <div className="mt-8">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-[#304137]">
            Ingestion secret
          </span>
          <input
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            required
            autoComplete="off"
            className="w-full rounded-xl border border-[#dbe2db] px-4 py-3 text-sm outline-none focus:border-[#73944c]"
            placeholder="INGESTION_SECRET"
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-[#142219] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#263c2e] disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Çalışıyor…" : "Verileri Güncelle"}
          </button>
          <button
            type="button"
            onClick={() => void loadRuns()}
            disabled={loading || !secret}
            className="rounded-full border border-[#cfd8ce] px-5 py-3 text-sm font-semibold text-[#304137] disabled:opacity-50"
          >
            Son çalışmayı getir
          </button>
        </div>
        {status && (
          <p role="status" className="text-sm text-[#5e6d63]">
            {status}
          </p>
        )}
      </form>

      {adminStats && (
        <div className="mt-8 rounded-2xl border border-[#dfe8d8] bg-[#fbfdf8] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#73944c]">
                Otomatik güncelleme
              </p>
              <p className="mt-1 text-sm text-[#5e6d63]">
                Vercel Cron: {adminStats.cronEnabled ? "aktif" : "pasif"} ·{" "}
                {adminStats.cronScheduleDescription}
              </p>
            </div>
            <span className="rounded-full border border-[#dbe8d2] bg-white px-3 py-1 text-xs font-semibold text-[#607d40]">
              {adminStats.cronSchedule}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              ["Son başarılı", formatDate(adminStats.lastSuccessfulIngestionAt)],
              ["Son deneme", formatDate(adminStats.lastAttemptAt)],
              ["Running", adminStats.runningIngestion ? "Evet" : "Hayır"],
              ["Son durum", adminStats.latestRunStatus ?? "Henüz yok"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white p-3">
                <p className="text-xs text-[#748078]">{label}</p>
                <p className="mt-1 text-sm font-semibold text-[#142219]">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {SOURCE_STATUSES.filter(
              (itemStatus) => adminStats.sourceStatusCounts[itemStatus] > 0,
            ).map((itemStatus) => (
              <span
                key={itemStatus}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  SOURCE_STATUS_PRESENTATION[itemStatus].className
                }`}
              >
                {itemStatus}: {adminStats.sourceStatusCounts[itemStatus]}
              </span>
            ))}
          </div>
        </div>
      )}

      {adminStats && (
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            ["Toplam opportunities", adminStats.opportunityCount],
            [
              "Etkin kaynaklar",
              `${adminStats.enabledSourceCount}/${adminStats.sourceCount}`,
            ],
            ["Fragile kaynaklar", adminStats.fragileSourceCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-[#f5f7f3] p-4">
              <p className="text-xs text-[#748078]">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-[#142219]">
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {runs[0] && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Toplanan", runs[0].collected_count],
            ["Yeni", runs[0].inserted_count],
            ["Güncellenen", runs[0].updated_count],
            ["Atlanan", runs[0].skipped_count],
            ["Hata", runs[0].error_count],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-[#f5f7f3] p-3">
              <p className="text-xs text-[#748078]">{label}</p>
              <p className="mt-1 text-xl font-semibold text-[#142219]">{value}</p>
            </div>
          ))}
        </div>
      )}

      {visibleLogs.length > 0 && (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-b border-[#dfe5df] text-[#748078]">
              <tr>
                <th className="px-3 py-3 font-semibold">Kaynak</th>
                <th className="px-3 py-3 font-semibold">Durum</th>
                <th className="px-3 py-3 font-semibold">Toplanan</th>
                <th className="px-3 py-3 font-semibold">Yeni</th>
                <th className="px-3 py-3 font-semibold">Güncel</th>
                <th className="px-3 py-3 font-semibold">Atlanan</th>
                <th className="px-3 py-3 font-semibold">Süre</th>
              </tr>
            </thead>
            <tbody>
              {visibleLogs.map((log) => (
                <tr key={log.sourceId} className="border-b border-[#edf0ed]">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-[#25372c]">{log.sourceName}</p>
                    {log.fragile && (
                      <span className="mt-1 inline-block rounded-full bg-[#fff3d6] px-2 py-0.5 text-[10px] font-bold text-[#80621f]">
                        FRAGILE
                      </span>
                    )}
                    {log.error && (
                      <p
                        className={`mt-1 max-w-xs ${
                          log.status === "error"
                            ? "text-[#a04b52]"
                            : "text-[#78684a]"
                        }`}
                      >
                        {log.error}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-1 ${
                        SOURCE_STATUS_PRESENTATION[log.status].className
                      }`}
                    >
                      {SOURCE_STATUS_PRESENTATION[log.status].label}
                    </span>
                  </td>
                  <td className="px-3 py-3">{log.collected}</td>
                  <td className="px-3 py-3">{log.inserted}</td>
                  <td className="px-3 py-3">{log.updated}</td>
                  <td className="px-3 py-3">{log.skipped}</td>
                  <td className="px-3 py-3">
                    {(log.durationMs / 1000).toFixed(1)} sn
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sourceRows.length > 0 && (
        <div className="mt-8 overflow-x-auto">
          <h2 className="mb-3 text-sm font-semibold text-[#25372c]">
            Kaynak operasyon durumu
          </h2>
          <table className="w-full min-w-[1280px] text-left text-xs">
            <thead className="border-b border-[#dfe5df] text-[#748078]">
              <tr>
                <th className="px-3 py-3 font-semibold">Kaynak / slug</th>
                <th className="px-3 py-3 font-semibold">Yöntem</th>
                <th className="px-3 py-3 font-semibold">Son çalışma</th>
                <th className="px-3 py-3 font-semibold">Son başarılı</th>
                <th className="px-3 py-3 font-semibold">Bulunan</th>
                <th className="px-3 py-3 font-semibold">Yeni</th>
                <th className="px-3 py-3 font-semibold">Güncellenen</th>
                <th className="px-3 py-3 font-semibold">Durum</th>
                <th className="px-3 py-3 font-semibold">HTTP</th>
                <th className="px-3 py-3 font-semibold">Son mesaj</th>
              </tr>
            </thead>
            <tbody>
              {sourceRows.map(
                ({
                  source,
                  latestRun,
                  latestLog,
                  successfulRun,
                  successfulLog,
                }) => (
                  <tr key={source.id} className="border-b border-[#edf0ed]">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-[#25372c]">
                        {source.name}
                      </p>
                      <code className="text-[10px] text-[#748078]">
                        {source.id}
                      </code>
                    </td>
                    <td className="px-3 py-3">
                      {["nato-diana", "odtu-teknokent"].includes(source.id)
                        ? "Normal fetch + worker"
                        : `Normal ${source.kind.toUpperCase()}`}
                    </td>
                    <td className="px-3 py-3">
                      {formatDate(
                        latestLog?.finished_at ??
                          latestRun?.finished_at ??
                          latestRun?.started_at ??
                          null,
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {successfulLog
                        ? formatDate(
                            successfulLog.finished_at ??
                              successfulRun?.finished_at ??
                              null,
                          )
                        : "Henüz yok"}
                    </td>
                    <td className="px-3 py-3">
                      {latestLog?.collected_count ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      {latestLog?.inserted_count ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      {latestLog?.updated_count ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      {latestLog ? (
                        <span
                          className={`rounded-full px-2 py-1 ${
                            SOURCE_STATUS_PRESENTATION[latestLog.status]
                              .className
                          }`}
                        >
                          {latestLog.status}
                        </span>
                      ) : (
                        "Henüz yok"
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {source.id === "nato-diana" &&
                      latestLog?.status === "fragile"
                        ? "403"
                        : "—"}
                    </td>
                    <td className="max-w-xs px-3 py-3 text-[#78684a]">
                      {latestLog?.error_message ??
                        (["nato-diana", "odtu-teknokent"].includes(source.id)
                          ? "GitHub Actions browser worker kuruludur; repository secretları gerekir."
                          : "—")}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {visibleLogs.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Veri üreten kaynaklar", healthSummary.producing],
            ["Public erişimde sınırlı", healthSummary.publicLimited],
            ["Worker isteyen", healthSummary.workerRequired],
            ["Yeni kayıt getiren", healthSummary.newData],
            ["Arşiv/gürültü nedeniyle elenen", healthSummary.filtered],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-[#f5f7f3] p-3">
              <p className="text-xs text-[#748078]">{label}</p>
              <p className="mt-1 text-xl font-semibold text-[#142219]">
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {sourceCatalog.length > 0 && (
        <div className="mt-8 rounded-2xl border border-[#eadfbf] bg-[#fffaf0] p-5">
          <h2 className="text-sm font-semibold text-[#5f4b1f]">
            Fragile ve yapılandırma bekleyen kaynaklar
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {sourceCatalog
              .filter((source) => source.fragile || !source.configured)
              .map((source) => (
                <span
                  key={source.id}
                  title={source.notes}
                  className="rounded-full border border-[#e8d8a9] bg-white px-3 py-1.5 text-xs text-[#705b29]"
                >
                  {source.name}
                  {!source.configured ? " · key bekliyor" : " · fragile"}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
