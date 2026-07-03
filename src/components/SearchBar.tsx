"use client";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <label className="relative block w-full sm:max-w-sm">
      <span className="sr-only">Fırsatlarda ara</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#506158]"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Program, fon veya kaynak ara..."
        className="w-full rounded-full border border-[#dfe5df] bg-white py-3 pl-11 pr-4 text-sm text-[#142219] outline-none transition placeholder:text-[#8c978f] focus:border-[#6e8f48] focus:ring-4 focus:ring-[#b8f26a]/15"
      />
    </label>
  );
}
