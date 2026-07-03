import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-white/10 bg-[#07140f]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#b8f26a] text-lg font-black text-[#0b1b13]">
            G
          </span>
          <span>
            <span className="block text-sm font-bold tracking-wide text-white">
              Girişim Atlası
            </span>
            <span className="block text-[10px] uppercase tracking-[0.24em] text-white/45">
              Fırsatları keşfet
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-white/65 md:flex">
          <a href="#firsatlar" className="transition hover:text-white">
            Fırsatlar
          </a>
          <a href="#kategoriler" className="transition hover:text-white">
            Kategoriler
          </a>
          <Link href="/admin/ingestion" className="transition hover:text-white">
            Yönetim
          </Link>
        </nav>

        <a
          href="#firsatlar"
          className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white transition hover:border-[#b8f26a]/60 hover:text-[#b8f26a]"
        >
          Akışı incele
        </a>
      </div>
    </header>
  );
}
