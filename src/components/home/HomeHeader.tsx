import Link from "next/link";

import { ThemeToggle } from "@/components/home/ThemeToggle";
import { formatDateTime } from "@/lib/utils/formatDateTime";

type HomeHeaderProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  refreshLabel?: string;
  lastScanAt: string | null;
  lastDataAddedAt: string | null;
};

export function HomeHeader({
  query,
  onQueryChange,
  onRefresh,
  refreshing,
  refreshLabel,
  lastScanAt,
  lastDataAddedAt,
}: HomeHeaderProps) {
  return (
    <header className="atlas-header mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-6 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <Link href="/" className="inline-flex items-center gap-3">
          <span className="atlas-pulse size-2.5 rounded-full" />
          <span className="atlas-brand text-lg font-black tracking-[0.08em] sm:text-xl">
            GİRİŞİM ATLASI
          </span>
        </Link>
        <p className="atlas-muted mt-2 text-xs">
          Türkiye ve dünyadan girişimcilik fırsatları, fonlar, yatırımlar ve
          etkinlikler.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="atlas-control flex items-center gap-2 rounded-full px-4 py-2">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Fırsatlarda ara</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Program, fon veya kaynak ara…"
            className="w-full min-w-0 bg-transparent text-xs outline-none sm:w-56"
          />
        </label>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="atlas-refresh rounded-full px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
        >
          {refreshing ? refreshLabel ?? "Kaynaklar kontrol ediliyor…" : "Yenile"}
        </button>
        <ThemeToggle />
        <Link
          href="/admin/ingestion"
          className="atlas-control rounded-full px-3 py-2 text-center text-xs font-semibold"
        >
          Yönetim
        </Link>
      </div>

      <div className="atlas-muted space-y-2 text-xs lg:text-right">
        <div>
          <span className="block text-[10px] uppercase tracking-[0.14em]">
            Son kaynak taraması
          </span>
          <strong className="atlas-text mt-1 block font-medium">
            {formatDateTime(lastScanAt)}
          </strong>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-[0.14em]">
            Son veri eklenme
          </span>
          <strong className="atlas-text mt-1 block font-medium">
            {formatDateTime(lastDataAddedAt)}
          </strong>
        </div>
      </div>
    </header>
  );
}
