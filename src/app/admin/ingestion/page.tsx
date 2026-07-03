import Link from "next/link";

import { IngestionControl } from "@/components/IngestionControl";

export default function IngestionAdminPage() {
  return (
    <main className="min-h-screen bg-[#f5f7f3] px-5 py-16">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm font-semibold text-[#607d40]">
          ← Ana sayfa
        </Link>
        <div className="mt-8 rounded-3xl border border-[#dfe5df] bg-white p-7 shadow-sm sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#73944c]">
            Yönetim
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#142219]">
            Veri toplama
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#657168]">
            Etkin kaynak adapter’larını çalıştırır, normalize edilen kayıtları
            <code className="mx-1 rounded bg-[#f1f3ef] px-1.5 py-0.5">
              unique_key
            </code>
            üzerinden Supabase’e ekler veya günceller.
          </p>
          <IngestionControl />
        </div>
      </div>
    </main>
  );
}
