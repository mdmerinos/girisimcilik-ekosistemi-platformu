"use client";

import { FormEvent, useState } from "react";

import {
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
  status: SourceResult["status"];
  collected_count: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  duration_ms: number;
  error_message: string | null;
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
};

type SourceCatalogItem = {
  id: string;
  name: string;
  fragile: boolean;
  requiresApiKey: boolean;
  configured: boolean;
  notes: string;
};

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
