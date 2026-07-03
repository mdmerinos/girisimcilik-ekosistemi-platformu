import { NextRequest, NextResponse } from "next/server";

import { runIngestion } from "@/lib/ingestion/runIngestion";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!expectedSecret || authorization !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Yetkisiz istek" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase bağlantısı yapılandırılmamış." },
      { status: 503 },
    );
  }

  try {
    const result = await runIngestion("cron");
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Scheduled ingestion failed:", error);
    return NextResponse.json(
      { error: "Zamanlanmış veri toplama işlemi tamamlanamadı." },
      { status: 500 },
    );
  }
}
