import { normalizeText } from "@/lib/utils/normalizeText";

export const COUNTRY_GROUPS = ["all", "turkiye", "global"] as const;
export type CountryGroup = (typeof COUNTRY_GROUPS)[number];

const TURKIYE_TOKENS = new Set(["türkiye", "turkiye", "turkey", "tr"]);
const GLOBAL_TOKENS = new Set([
  "global",
  "uluslararası",
  "uluslararasi",
  "international",
  "avrupa",
  "europe",
  "abd",
  "usa",
  "eu",
  "worldwide",
]);

export function getCountryGroup(
  location: string | null | undefined,
): Exclude<CountryGroup, "all"> | null {
  const normalized = normalizeText(location ?? "");
  if (!normalized) return null;
  const tokens = normalized
    .toLocaleLowerCase("tr-TR")
    .split(/[\s/,;()_-]+/)
    .filter(Boolean);
  if (tokens.some((token) => TURKIYE_TOKENS.has(token))) return "turkiye";
  if (tokens.some((token) => GLOBAL_TOKENS.has(token))) return "global";
  return null;
}

export function matchesCountryGroup(
  location: string | null | undefined,
  countryGroup: CountryGroup,
): boolean {
  return countryGroup === "all" || getCountryGroup(location) === countryGroup;
}
