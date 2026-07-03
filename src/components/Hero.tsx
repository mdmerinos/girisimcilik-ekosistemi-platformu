export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#07140f] px-5 pb-20 pt-20 text-white lg:px-8 lg:pb-28 lg:pt-28">
      <div className="pointer-events-none absolute left-[12%] top-10 size-72 rounded-full bg-[#b8f26a]/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 size-96 rounded-full bg-[#47b8a4]/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl">
        <div className="max-w-4xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#b8f26a]/25 bg-[#b8f26a]/8 px-3 py-1.5 text-xs font-semibold text-[#c8f58d]">
            <span className="size-1.5 rounded-full bg-[#b8f26a] shadow-[0_0_12px_#b8f26a]" />
            Türkiye ve dünyadan güncel ekosistem verileri
          </div>

          <h1 className="text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-[84px]">
            Girişimin için doğru
            <span className="block font-serif italic text-[#b8f26a]">
              fırsat, tek akışta.
            </span>
          </h1>

          <p className="mt-8 max-w-2xl text-base leading-7 text-white/58 sm:text-lg">
            Fon çağrıları, destek programları, hızlandırıcılar ve ekosistem
            haberleri farklı kaynaklardan toplanır, ayıklanır ve sana sunulur.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href="#firsatlar"
              className="rounded-full bg-[#b8f26a] px-6 py-3 text-sm font-bold text-[#102116] transition hover:bg-[#ccfa8f]"
            >
              Fırsatları keşfet ↓
            </a>
            <a
              href="#nasil-calisir"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/5"
            >
              Nasıl çalışır?
            </a>
          </div>
        </div>

        <div
          id="nasil-calisir"
          className="mt-20 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3"
        >
          {[
            ["01", "Toplanır", "API, RSS ve güvenilir web kaynakları"],
            ["02", "Temizlenir", "Tekrarlar ayıklanır, içerik normalize edilir"],
            ["03", "Yayınlanır", "Güncel fırsatlar aranabilir tek akışa dönüşür"],
          ].map(([number, title, description]) => (
            <div key={number} className="bg-[#0b1a13] p-6">
              <span className="font-mono text-xs text-[#b8f26a]">{number}</span>
              <h2 className="mt-5 font-semibold text-white">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-white/45">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
