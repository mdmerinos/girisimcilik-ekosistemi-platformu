import { NextRequest, NextResponse } from "next/server";

import { upsertOpportunities } from "@/lib/ingestion/upsertOpportunities";
import {
  isWorkerAuthorized,
  processWorkerOpportunities,
  workerEnvelopeSchema,
} from "@/lib/ingestion/workerOpportunities";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

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
    const result = await processWorkerOpportunities(envelope.data.items, {
      upsert: upsertOpportunities,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Worker opportunity ingestion failed:", error);
    return NextResponse.json(
      { error: "Worker kayıtları işlenemedi." },
      { status: 500 },
    );
  }
}
