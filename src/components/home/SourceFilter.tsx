import {
  OPPORTUNITY_SOURCE_OPTIONS,
  type OpportunitySource,
} from "@/lib/opportunities/opportunitySource";

export function SourceFilter({
  value,
  onChange,
}: {
  value: OpportunitySource;
  onChange: (value: OpportunitySource) => void;
}) {
  return (
    <label className="atlas-muted flex flex-col gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]">
      Kaynak
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value as OpportunitySource)
        }
        className="atlas-control min-w-56 rounded-xl px-3 py-2.5 text-xs font-semibold normal-case tracking-normal outline-none"
      >
        {OPPORTUNITY_SOURCE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
