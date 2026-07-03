import { OPPORTUNITY_CATEGORIES } from "@/types/opportunity";

const CODES: Record<string, string> = {
  Tümü: "ALL",
  "Ulusal Destek ve Fonlar": "ULS-FON",
  "Uluslararası Fonlar": "INT-FON",
  "Yatırım ve Sermaye Ağları": "YAT-AG",
  "Etkinlik ve Programlar": "ETK-PRG",
  "Haber ve Sosyal Medya Akışı": "HBR-SOS",
};

type CategorySidebarProps = {
  selected: string;
  counts: Record<string, number>;
  total: number;
  onChange: (category: string) => void;
};

export function CategorySidebar({
  selected,
  counts,
  total,
  onChange,
}: CategorySidebarProps) {
  return (
    <aside className="atlas-sidebar lg:border-r">
      <p className="atlas-muted px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.16em]">
        Kategoriler
      </p>
      <div className="atlas-scrollbar flex max-w-full gap-2 overflow-x-auto pb-3 lg:block lg:space-y-1 lg:overflow-visible">
        {["Tümü", ...OPPORTUNITY_CATEGORIES].map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => onChange(category)}
            className={`atlas-nav-item flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs lg:w-full ${
              selected === category ? "is-active" : ""
            }`}
          >
            <span className="min-w-0">{category}</span>
            <span className="atlas-code shrink-0 rounded-full px-2 py-0.5 text-[9px]">
              {CODES[category]} ·{" "}
              {category === "Tümü" ? total : counts[category] ?? 0}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
