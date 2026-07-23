import { normalizeOriginalUrl } from "@/lib/utils/createUniqueKey";
import { normalizeText } from "@/lib/utils/normalizeText";
import type { Opportunity, OpportunityInput } from "@/types/opportunity";

type EvidenceOpportunity = Pick<
  OpportunityInput | Opportunity,
  "title" | "summary" | "source_url" | "published_at" | "platform"
>;

export type RealOpportunityEvidence = {
  valid: boolean;
  reasons: Array<"title" | "description" | "date" | "originalUrl">;
};

const PLACEHOLDER_DESCRIPTION_PATTERNS = [
  /^detaylı bilgi için kaynak sayfasını görüntüleyin/i,
  /^bu kayıt (?:şu )?kaynakta/i,
  /^bu kayıt .+ kaynağında/i,
  /^.+ başlıklı bu kayıt, .+ kaynağında/i,
  /kaynağın resmî sayfasında yayımlanan bu içerik/i,
  /başvuru koşulları ve güncel ayrıntılar için kaynak sayfasını/i,
];

const NAVIGATION_TITLE_PATTERN =
  /^(?:haberler|duyurular|etkinlikler|programlar|devamını oku|detay|ana sayfa|home|news|events|read more)$/i;

function comparable(value: string): string {
  return normalizeText(value)
    .normalize("NFKD")
    .toLocaleLowerCase("tr-TR")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasRealTitle(title: string): boolean {
  const cleaned = normalizeText(title);
  return (
    cleaned.length >= 8 &&
    cleaned.split(/\s+/).length >= 2 &&
    !NAVIGATION_TITLE_PATTERN.test(cleaned)
  );
}

export function isGeneratedOpportunityDescription(
  value: string | null | undefined,
): boolean {
  const cleaned = normalizeText(value ?? "");
  return PLACEHOLDER_DESCRIPTION_PATTERNS.some((pattern) =>
    pattern.test(cleaned),
  );
}

function hasRealDescription(
  summary: string | null | undefined,
  title: string,
  isSocial: boolean,
): boolean {
  const cleaned = normalizeText(summary ?? "");
  const minimumLength = isSocial ? 30 : 60;
  return (
    cleaned.length >= minimumLength &&
    cleaned.split(/\s+/).length >= (isSocial ? 5 : 8) &&
    (isSocial || comparable(cleaned) !== comparable(title)) &&
    !isGeneratedOpportunityDescription(cleaned)
  );
}

function hasRealPublishedAt(value: string | null | undefined): boolean {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

function hasOriginalContentUrl(
  value: string,
  listingUrl?: string | null,
): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) return false;

  if (listingUrl && URL.canParse(listingUrl)) {
    try {
      if (normalizeOriginalUrl(value) === normalizeOriginalUrl(listingUrl)) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return url.pathname !== "/" || url.searchParams.size > 0;
}

export function inspectRealOpportunityEvidence(
  item: EvidenceOpportunity,
  listingUrl?: string | null,
): RealOpportunityEvidence {
  const reasons: RealOpportunityEvidence["reasons"] = [];
  if (!hasRealTitle(item.title)) reasons.push("title");
  if (!hasRealDescription(item.summary, item.title, Boolean(item.platform))) {
    reasons.push("description");
  }
  if (!hasRealPublishedAt(item.published_at)) reasons.push("date");
  if (!hasOriginalContentUrl(item.source_url, listingUrl)) {
    reasons.push("originalUrl");
  }
  return { valid: reasons.length === 0, reasons };
}

export function hasRealOpportunityEvidence(
  item: EvidenceOpportunity,
  listingUrl?: string | null,
): boolean {
  return inspectRealOpportunityEvidence(item, listingUrl).valid;
}

export function filterRealSourceItems<T extends EvidenceOpportunity>(
  items: T[],
  source: {
    sourceGroup?: "technopark" | "social_media";
    url: string;
  },
): { items: T[]; rejectedCount: number } {
  if (!source.sourceGroup) return { items, rejectedCount: 0 };
  const accepted = items.filter((item) =>
    hasRealOpportunityEvidence(item, source.url),
  );
  return {
    items: accepted,
    rejectedCount: items.length - accepted.length,
  };
}
