import { NextRequest, NextResponse } from "next/server";

import {
  getIngestionAdminStats,
  getRecentIngestionRuns,
} from "@/lib/ingestion/ingestionRuns";
import { runIngestion } from "@/lib/ingestion/runIngestion";
import { publicSourceCatalog } from "@/lib/ingestion/sourceConfig";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const expectedSecret = process.env.INGESTION_SECRET;
  const suppliedSecret = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  return Boolean(expectedSecret && suppliedSecret === expectedSecret);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz istek" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase bağlantısı yapılandırılmamış." },
      { status: 503 },
    );
  }

  try {
    const [runs, stats] = await Promise.all([
      getRecentIngestionRuns(),
      getIngestionAdminStats(),
    ]);
    return NextResponse.json({
      ok: true,
      runs,
      stats,
      sources: publicSourceCatalog,
    });
  } catch (error) {
    console.error("Ingestion history query failed:", error);
    return NextResponse.json(
      { error: "Ingestion geçmişi alınamadı." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz istek" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase bağlantısı yapılandırılmamış." },
      { status: 503 },
    );
  }

  try {
    const result = await runIngestion("manual");
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Manual ingestion failed:", error);
    return NextResponse.json(
      { error: "Veri toplama işlemi tamamlanamadı." },
      { status: 500 },
    );
  }
}
