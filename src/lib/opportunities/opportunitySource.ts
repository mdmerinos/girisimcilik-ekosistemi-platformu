import { normalizeSearchText } from "@/lib/opportunities/opportunityFilters";
import type { Opportunity } from "@/types/opportunity";

export const OPPORTUNITY_SOURCES = [
  "all",
  "tubitak",
  "kosgeb",
  "eu-funding",
  "grants-gov",
  "odtu-teknokent",
  "technoparks",
  "social-media",
  "nato-diana",
  "nasa-sbir",
  "other",
] as const;

export type OpportunitySource = (typeof OPPORTUNITY_SOURCES)[number];

export const OPPORTUNITY_SOURCE_OPTIONS: Array<{
  value: OpportunitySource;
  label: string;
}> = [
  { value: "all", label: "Tümü" },
  { value: "tubitak", label: "TÜBİTAK" },
  { value: "kosgeb", label: "KOSGEB" },
  { value: "eu-funding", label: "EU Funding & Tenders" },
  { value: "grants-gov", label: "Grants.gov" },
  { value: "odtu-teknokent", label: "ODTÜ Teknokent" },
  { value: "technoparks", label: "Teknoparklar" },
  { value: "social-media", label: "Sosyal Medya" },
  { value: "nato-diana", label: "NATO DIANA" },
  { value: "nasa-sbir", label: "NASA SBIR/STTR" },
  { value: "other", label: "Diğer" },
];

const SOURCE_TERMS: Record<
  Exclude<OpportunitySource, "all" | "other" | "social-media">,
  string[]
> = {
  tubitak: ["tubitak"],
  kosgeb: ["kosgeb"],
  "eu-funding": ["eu funding tenders"],
  "grants-gov": ["grants gov"],
  "odtu-teknokent": ["odtu teknokent"],
  technoparks: [
    "teknopark",
    "teknokent",
    "innopark",
    "cyberpark",
    "bilisim vadisi",
    "depark",
    "ulutek",
    "entertech",
    "ari teknokent",
    "yildiz teknopark",
  ],
  "nato-diana": ["nato diana"],
  "nasa-sbir": ["nasa sbir sttr", "nasa sbir", "sbir gov"],
};

function matchesKnownSource(
  item: Pick<Opportunity, "source_name" | "title" | "platform">,
  source: keyof typeof SOURCE_TERMS,
) {
  const normalized = normalizeSearchText(
    source === "nasa-sbir"
      ? `${item.source_name} ${item.title}`
      : item.source_name,
  );
  return SOURCE_TERMS[source].some((term) => normalized.includes(term));
}

export function matchesOpportunitySource(
  item: Pick<Opportunity, "source_name" | "title" | "platform">,
  source: OpportunitySource,
): boolean {
  if (source === "all") return true;
  if (source === "social-media") return Boolean(item.platform);
  if (source === "other") {
    if (item.platform) return false;
    return !Object.keys(SOURCE_TERMS).some((knownSource) =>
      matchesKnownSource(item, knownSource as keyof typeof SOURCE_TERMS),
    );
  }
  return matchesKnownSource(item, source);
}
