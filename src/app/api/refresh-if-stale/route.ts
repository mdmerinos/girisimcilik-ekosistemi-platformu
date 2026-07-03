import { NextResponse } from "next/server";

import { refreshIfStale } from "@/lib/ingestion/refreshIfStale";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: false,
      status: "error",
      lastSuccessfulIngestionAt: null,
      message: "Veriler gösteriliyor, güncelleme daha sonra tekrar denenecek.",
    });
  }

  return NextResponse.json(await refreshIfStale());
}

export async function GET() {
  return POST();
}