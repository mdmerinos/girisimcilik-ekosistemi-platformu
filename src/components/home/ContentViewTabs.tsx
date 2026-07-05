import type { ContentView } from "@/lib/opportunities/opportunityQueryFilters";

const OPTIONS: Array<{ value: ContentView; label: string }> = [
  { value: "all", label: "Tüm kayıtlar" },
  { value: "funding", label: "Fırsatlar/Fonlar" },
  { value: "news", label: "Haberler" },
  { value: "investments", label: "Yatırımlar" },
  { value: "programs", label: "Etkinlikler/Programlar" },
];

type ContentViewTabsProps = {
  value: ContentView;
  onChange: (value: ContentView) => void;
};

export function ContentViewTabs({ value, onChange }: ContentViewTabsProps) {
  return (
    <div
      aria-label="Ana içerik filtresi"
      className="atlas-scrollbar flex max-w-full gap-2 overflow-x-auto pb-1"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`atlas-nav-item shrink-0 rounded-full px-4 py-2 text-xs font-semibold ${
            value === option.value ? "is-active" : ""
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
