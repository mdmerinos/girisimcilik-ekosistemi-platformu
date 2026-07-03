import { normalizeText } from "@/lib/utils/normalizeText";
import type { OpportunityCategory, OpportunityInput } from "@/types/opportunity";

export const INVESTMENT_CATEGORY: OpportunityCategory =
  "Yatırım ve Sermaye Ağları";
export const NEWS_CATEGORY: OpportunityCategory = "Haber ve Sosyal Medya Akışı";

const DIRECT_INVESTMENT_SIGNALS = [
  "yatırım aldı",
  "yatirim aldi",
  "yatırım turu",
  "yatirim turu",
  "tohum yatırım",
  "tohum yatirim",
  "ön tohum",
  "on tohum",
  "fon topladı",
  "fon topladi",
  "finansman aldı",
  "finansman aldi",
  "değerleme",
  "degerleme",
  "investment round",
  "funding round",
  "seed round",
  "pre-seed",
  "series a",
  "series b",
  "series c",
  "raises",
  "raised",
  "raise",
  "backs",
  "backed by",
  "venture-backed",
  "new investors",
  "angel investment",
  "angel investor",
  "term sheet",
  "valuation",
] as const;

const BROAD_INVESTMENT_TERMS = [
  "funding",
  "fund",
  "funded",
  "venture capital",
  "vc",
  "capital",
  "investor",
  "investors",
  "investment firm",
  "venture fund",
  "melek yatırım",
  "melek yatirim",
  "melek yatırımcı",
  "melek yatirimci",
  "yatırımcı",
  "yatirimci",
  "sermaye",
  "yatırım ağı",
  "yatirim agi",
  "yatırım fonu",
  "yatirim fonu",
] as const;

const ECOSYSTEM_CONTEXT_KEYWORDS = [
  "startup",
  "start-up",
  "founder",
  "founders",
  "company",
  "tech company",
  "ai company",
  "ai startup",
  "fintech",
  "saas",
  "biotech",
  "cleantech",
  "deeptech",
  "deep tech",
  "venture-backed",
  "backed by",
  "seed",
  "pre-seed",
  "series a",
  "series b",
  "series c",
  "round",
  "valuation",
  "investor",
  "investors",
  "angel investor",
  "venture fund",
  "investment firm",
  "early-stage founders",
  "startup ecosystem",
  "angellist",
  "andreessen horowitz",
  "blackrock",
  "girişim",
  "girisim",
  "teknoloji girişimi",
  "teknoloji girisimi",
  "yerli girişim",
  "yerli girisim",
  "girişimci",
  "girisimci",
  "kurucu",
  "yatırım aldı",
  "yatirim aldi",
  "yatırım turu",
  "yatirim turu",
  "tohum yatırım",
  "tohum yatirim",
  "ön tohum",
  "on tohum",
  "melek yatırım",
  "melek yatirim",
  "melek yatırımcı",
  "melek yatirimci",
  "yatırımcı",
  "yatirimci",
  "değerleme",
  "degerleme",
  "fon topladı",
  "fon topladi",
  "finansman aldı",
  "finansman aldi",
] as const;

const EXCLUDED_WITHOUT_ECOSYSTEM_CONTEXT = [
  /\bgovernment funding cuts?\b/i,
  /\bfunding cuts?\b/i,
  /\bpublic funding\b/i,
  /\bresearch grant funding\b/i,
  /\bacademic research grant\b/i,
  /\bhiv funding\b/i,
  /\bclimate funding cuts?\b/i,
  /\bocean .*funding cuts?\b/i,
  /\bscience funding cuts?\b/i,
  /\bpolitical (?:campaign )?funding\b/i,
  /\bad war funding\b/i,
  /\bfar[-\s]?right\b/i,
  /\bfunding rate arbitrage\b/i,
  /\barbitrage strategy\b/i,
  /\bcrypto price\b/i,
  /\bcrypto arbitrage\b/i,
  /\bmemecoin\b/i,
  /\bsports? team ownership\b/i,
  /\bsell piece of team\b/i,
  /\bstock market\b/i,
  /\bpublic policy funding\b/i,
  /\blaw\b.*\bfunding\b/i,
  /\bregulation\b.*\bfunding\b/i,
  /\bborsa\b/i,
  /\bhisse senedi\b/i,
  /\bkripto(?: para)?\b/i,
  /\bbanka kampanyası\b/i,
  /\bbanka kampanyasi\b/i,
  /\bkredi kartı kampanyası\b/i,
  /\bkredi karti kampanyasi\b/i,
  /\byatırım tavsiyesi\b/i,
  /\byatirim tavsiyesi\b/i,
] as const;

function searchable(value: string): string {
  return normalizeText(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function includesKeyword(text: string, keywords: readonly string[]) {
  return keywords.some((keyword) => text.includes(searchable(keyword)));
}

function hasMoneyAmount(text: string): boolean {
  return /(?:[$€£]|\b(?:million|billion|milyon|milyar)\b|\b\d+(?:\.\d+)?\s*(?:m|b)\b)/i.test(
    text,
  );
}

export type InvestmentClassificationInput = {
  title: string;
  summary?: string | null;
  description?: string | null;
  sourceName?: string | null;
  sourceId?: string | null;
  category?: string | null;
  type?: string | null;
};

export function hasStrictInvestmentSignal(
  input: InvestmentClassificationInput,
): boolean {
  const content = searchable(
    [input.title, input.summary, input.description, input.sourceName]
      .filter(Boolean)
      .join(" "),
  );
  const sourceContext = searchable(
    [input.sourceId, input.sourceName, input.type].filter(Boolean).join(" "),
  );
  const hasDirectSignal = includesKeyword(content, DIRECT_INVESTMENT_SIGNALS);
  const hasBroadTerm =
    includesKeyword(content, BROAD_INVESTMENT_TERMS) || /\bvc\b/i.test(content);
  const hasEcosystemContext = includesKeyword(
    content,
    ECOSYSTEM_CONTEXT_KEYWORDS,
  );
  const hasExcludedPattern = EXCLUDED_WITHOUT_ECOSYSTEM_CONTEXT.some((pattern) =>
    pattern.test(content),
  );
  const isNoisyHnInvestmentSource =
    /hacker[-\s/]*news[-\s/]*(?:funding|venture[-\s/]*capital)/i.test(
      sourceContext,
    );
  const isTechCrunchFundingSource = /techcrunch[-\s/]*funding[-\s/]*rss/i.test(
    sourceContext,
  );

  if (!hasDirectSignal && !hasBroadTerm) return false;
  if (hasExcludedPattern && !hasDirectSignal && !hasEcosystemContext) {
    return false;
  }

  if (isNoisyHnInvestmentSource || isTechCrunchFundingSource) {
    return hasDirectSignal && (hasEcosystemContext || hasMoneyAmount(content));
  }

  if (hasDirectSignal) {
    return hasEcosystemContext || hasMoneyAmount(content);
  }

  return hasBroadTerm && hasEcosystemContext && !hasExcludedPattern;
}

export const hasInvestmentSignal = hasStrictInvestmentSignal;

export function classifyInvestmentCategory(
  input: InvestmentClassificationInput,
): OpportunityCategory | null {
  return hasStrictInvestmentSignal(input) ? INVESTMENT_CATEGORY : null;
}

export function applyInvestmentCategoryPriority(
  opportunity: OpportunityInput,
  context: Pick<InvestmentClassificationInput, "sourceId" | "type"> = {},
): OpportunityInput {
  const category = classifyInvestmentCategory({
    title: opportunity.title,
    summary: opportunity.summary,
    sourceName: opportunity.source_name,
    sourceId: context.sourceId,
    category: opportunity.category,
    type: context.type,
  });

  if (category) return { ...opportunity, category };
  if (opportunity.category === INVESTMENT_CATEGORY) {
    return { ...opportunity, category: NEWS_CATEGORY };
  }
  return opportunity;
}

export function isStrictInvestmentOpportunity(
  input: InvestmentClassificationInput,
): boolean {
  return hasStrictInvestmentSignal(input);
}