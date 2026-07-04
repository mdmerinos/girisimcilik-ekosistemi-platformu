import type { TimeRange } from "@/lib/opportunities/opportunityFilters";

const OPTIONS: Array<{ value: TimeRange; label: string }> = [
  { value: "near", label: "Yakın fırsatlar" },
  { value: "active", label: "Tüm aktif fırsatlar" },
  { value: "all", label: "Tüm tarihler" },
];

type TimeRangeTabsProps = {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
};

export function TimeRangeTabs({ value, onChange }: TimeRangeTabsProps) {
  return (
    <div
      className="atlas-control flex flex-wrap gap-1 rounded-2xl p-1"
      aria-label="Tarih aralığı"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-xl px-3 py-2 text-[11px] font-semibold transition ${
            value === option.value
              ? "atlas-count text-white"
              : "atlas-muted hover:text-[var(--atlas-text)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
