import type { TodayFilter } from "@/lib/opportunities/opportunityFilters";

const OPTIONS: Array<{ value: TodayFilter; label: string }> = [
  { value: "all", label: "Tüm günler" },
  { value: "ingested", label: "Bugün sisteme eklenen" },
  { value: "published", label: "Bugün yayımlanan" },
  { value: "deadline", label: "Bugün son başvurusu olan" },
];

export function TodayFilterTabs({
  value,
  onChange,
}: {
  value: TodayFilter;
  onChange: (value: TodayFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Bugünün kayıtları">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-full border px-3 py-2 text-[11px] font-semibold transition ${
            value === option.value
              ? "atlas-count border-transparent text-white"
              : "atlas-control atlas-muted"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
