import { buildSpecificFallbackDescription } from "@/lib/opportunities/specificFallbackDescription";
import { extractCleanSummary } from "@/lib/scrapers/cleanOpportunitySummary";
import type { Opportunity } from "@/types/opportunity";

type DisplayOpportunity = Pick<
  Opportunity,
  "title" | "summary" | "source_name" | "category" | "deadline_at"
>;

const TURKISH_WORDS = new Set([
  "acik",
  "basvuru",
  "bir",
  "bu",
  "cagri",
  "destek",
  "duyuru",
  "icin",
  "ile",
  "program",
  "programi",
  "teknoloji",
  "ve",
  "veya",
  "yatirim",
]);

const ENGLISH_WORDS = new Set([
  "and",
  "applicants",
  "applications",
  "are",
  "award",
  "call",
  "challenge",
  "deadline",
  "eligible",
  "expected",
  "for",
  "funding",
  "grant",
  "in",
  "innovation",
  "is",
  "of",
  "open",
  "opportunity",
  "outcomes",
  "posted",
  "program",
  "project",
  "support",
  "technology",
  "the",
  "this",
  "to",
  "will",
]);

function comparable(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("tr-TR")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function words(value: string): string[] {
  return comparable(value).split(" ").filter(Boolean);
}

function countMatches(tokens: string[], dictionary: Set<string>): number {
  return tokens.filter((token) => dictionary.has(token)).length;
}

export function isLikelyTurkish(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const tokens = words(text);
  const wordScore = countMatches(tokens, TURKISH_WORDS);
  const characterScore = (text.match(/[çğıöşüÇĞİÖŞÜ]/g) ?? []).length;

  return wordScore >= 2 || (characterScore >= 2 && wordScore >= 1);
}

export function isLikelyEnglish(text: string | null | undefined): boolean {
  if (!text?.trim() || isLikelyTurkish(text)) return false;
  const tokens = words(text);
  const wordScore = countMatches(tokens, ENGLISH_WORDS);

  return wordScore >= 2 || (tokens.length >= 7 && wordScore >= 1);
}

export function isBoilerplateSummary(
  summary: string | null | undefined,
): boolean {
  if (!summary?.trim()) return false;
  const normalized = comparable(summary);

  if (
    normalized === "posted" ||
    /^(?:u s )?mission to .+ posted$/.test(normalized) ||
    (/\bposted$/.test(normalized) && words(normalized).length <= 14)
  ) {
    return true;
  }

  return [
    /^click here (?:for|to) (?:details|learn more)$/,
    /^find out more (?:at|on|via) (?:the )?(?:official )?(?:page|website)$/,
    /^detayli bilgi icin kaynak sayfasini goruntuleyin/,
    /^(?:nato )?diana s (?:mission|vision|purpose) is\b/,
    /^the defence innovation accelerator for the north atlantic is\b/,
  ].some((pattern) => pattern.test(normalized));
}

function isNearTitleRepeat(summary: string, title: string): boolean {
  const summaryTokens = new Set(words(summary));
  const titleTokens = new Set(words(title));
  if (summaryTokens.size === 0 || titleTokens.size === 0) return false;

  const overlap = [...summaryTokens].filter((token) =>
    titleTokens.has(token),
  ).length;
  return overlap / Math.max(summaryTokens.size, titleTokens.size) >= 0.85;
}

export function isBadSummary(
  summary: string | null | undefined,
  title: string,
  sourceName?: string,
): boolean {
  const cleaned = extractCleanSummary(summary, title);
  if (!cleaned) return true;

  const tokens = words(cleaned);
  if (cleaned.length < 24 || tokens.length < 4) return true;
  if (isBoilerplateSummary(cleaned)) return true;
  if (isNearTitleRepeat(cleaned, title)) return true;
  if (sourceName && comparable(cleaned) === comparable(sourceName)) return true;

  return false;
}

export function getOriginalSummaryForCard(
  opportunity: DisplayOpportunity,
): string | null {
  if (
    isBadSummary(
      opportunity.summary,
      opportunity.title,
      opportunity.source_name,
    )
  ) {
    return null;
  }

  return extractCleanSummary(opportunity.summary, opportunity.title);
}

export function buildTurkishExplanation(
  opportunity: DisplayOpportunity,
): string {
  return buildSpecificFallbackDescription(opportunity);
}

export function getCardSummaryDisplay(
  opportunity: DisplayOpportunity,
): { text: string; usesTurkishFallback: boolean } {
  const originalSummary = getOriginalSummaryForCard(opportunity);
  if (originalSummary) {
    return { text: originalSummary, usesTurkishFallback: false };
  }

  return {
    text: buildTurkishExplanation(opportunity),
    usesTurkishFallback: true,
  };
}

export function shouldShowTurkishExplanationButton(
  opportunity: DisplayOpportunity,
): boolean {
  const originalSummary = getOriginalSummaryForCard(opportunity);
  return Boolean(originalSummary && isLikelyEnglish(originalSummary));
}
