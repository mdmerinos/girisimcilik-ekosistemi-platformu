import type { Opportunity } from "@/types/opportunity";

const CATEGORY_CODES: Record<Opportunity["category"], string> = {
  "Ulusal Destek ve Fonlar": "ULS-FON",
  "Uluslararası Fonlar": "INT-FON",
  "Yatırım ve Sermaye Ağları": "YAT-AG",
  "Etkinlik ve Programlar": "ETK-PRG",
  "Haber ve Sosyal Medya Akışı": "HBR-SOS",
};

export function TickerBar({ items }: { items: Opportunity[] }) {
  if (items.length === 0) {
    return (
      <div className="atlas-ticker-shell px-4 py-3 text-center text-xs">
        Güncel fırsatlar yükleniyor…
      </div>
    );
  }

  const tickerItems = items.slice(0, 12);

  return (
    <div className="atlas-ticker-shell overflow-hidden py-3">
      <div className="atlas-ticker-track flex w-max">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center">
            {tickerItems.map((item) => (
              <span
                key={`${copy}-${item.unique_key}`}
                className="mx-6 inline-flex items-center gap-3 whitespace-nowrap text-xs"
              >
                <span className="atlas-code rounded-full px-2 py-1">
                  {CATEGORY_CODES[item.category]}
                </span>
                <strong>{item.source_name}</strong>
                <span className="atlas-muted">•</span>
                <span>{item.title}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
