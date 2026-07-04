import { NextRequest, NextResponse } from "next/server";

import { upsertOpportunities } from "@/lib/ingestion/upsertOpportunities";
import {
  createIngestionRun,
  finishIngestionRun,
  writeSourceLog,
} from "@/lib/ingestion/ingestionRuns";
import {
  isWorkerAuthorized,
  processWorkerOpportunities,
  workerEnvelopeSchema,
} from "@/lib/ingestion/workerOpportunities";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import type { SourceStatus } from "@/lib/ingestion/sourceStatus";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (
    !isWorkerAuthorized(request.headers.get("authorization"), [
      process.env.BOT_INGESTION_SECRET,
      process.env.INGESTION_SECRET,
    ])
  ) {
    return NextResponse.json({ error: "Yetkisiz istek" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase bağlantısı yapılandırılmamış." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON gövdesi." }, { status: 400 });
  }

  const envelope = workerEnvelopeSchema.safeParse(body);
  if (!envelope.success) {
    return NextResponse.json(
      { error: "Geçersiz worker payload." },
      { status: 400 },
    );
  }

  try {
    const startedAt = Date.now();
    const result = await processWorkerOpportunities(envelope.data, {
      upsert: upsertOpportunities,
    });
    const sourceStatus: SourceStatus =
      result.received === 0
        ? "empty"
        : result.accepted === 0
          ? "skipped"
          : result.rejected > 0 || result.skipped > 0
            ? "partial"
            : "success";
    const runId = await createIngestionRun("manual");
    await writeSourceLog(runId, {
      sourceId: result.sourceSlug,
      sourceName: result.sourceName,
      kind: "html",
      fragile: true,
      requiresApiKey: false,
      status: sourceStatus,
      collected: result.received,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped + result.rejected,
      durationMs: Date.now() - startedAt,
      error:
        sourceStatus === "empty"
          ? "Worker çalıştı ancak uygun kayıt bulunamadı."
          : null,
    });
    await finishIngestionRun(
      runId,
      sourceStatus === "success" ? "success" : "partial",
      {
        collected: result.received,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped + result.rejected,
        errorCount: 0,
      },
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Worker opportunity ingestion failed:", error);
    return NextResponse.json(
      { error: "Worker kayıtları işlenemedi." },
      { status: 500 },
    );
  }
}
