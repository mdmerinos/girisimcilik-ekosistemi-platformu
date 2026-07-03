import type { CountryGroup } from "@/lib/opportunities/countryGroup";

const OPTIONS: Array<{ value: CountryGroup; label: string }> = [
  { value: "all", label: "Tümü" },
  { value: "turkiye", label: "Türkiye" },
  { value: "global", label: "Dünya" },
];

export function CountryFilterTabs({
  value,
  onChange,
}: {
  value: CountryGroup;
  onChange: (value: CountryGroup) => void;
}) {
  return (
    <div className="atlas-control inline-flex rounded-full p-1">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
            value === option.value ? "atlas-tab-active text-white" : ""
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
