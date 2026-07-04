import { NextRequest, NextResponse } from "next/server";

import { refreshIfStale } from "@/lib/ingestion/refreshIfStale";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export function isAllowedRefreshOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: false,
      status: "error",
      lastSuccessfulIngestionAt: null,
      message: "Veriler gösteriliyor, güncelleme daha sonra tekrar denenecek.",
    });
  }

  const force = request.nextUrl.searchParams.get("force") === "true";
  if (force && !isAllowedRefreshOrigin(request)) {
    return NextResponse.json(
      { error: "Geçersiz yenileme kaynağı." },
      { status: 403 },
    );
  }

  return NextResponse.json(
    await refreshIfStale({
      force,
      waitForCompletion: force,
    }),
  );
}

export async function GET() {
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
