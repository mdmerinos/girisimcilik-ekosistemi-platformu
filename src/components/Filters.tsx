"use client";

import { OPPORTUNITY_CATEGORIES } from "@/types/opportunity";

type FiltersProps = {
  selected: string;
  onChange: (category: string) => void;
  counts?: Record<string, number>;
};

export function Filters({ selected, onChange, counts = {} }: FiltersProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {["Tümü", ...OPPORTUNITY_CATEGORIES].map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onChange(category)}
          className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${
            selected === category
              ? "bg-[#16271c] text-white"
              : "border border-[#dce3dc] bg-white text-[#5d6a61] hover:border-[#9bad8e]"
          }`}
        >
          {category}
          <span className="ml-1.5 opacity-60">
            {category === "Tümü"
              ? Object.values(counts).reduce((sum, count) => sum + count, 0)
              : counts[category] ?? 0}
          </span>
        </button>
      ))}
    </div>
  );
}
