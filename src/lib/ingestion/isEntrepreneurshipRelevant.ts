import { normalizeText } from "@/lib/utils/normalizeText";

export type RelevanceInput = {
  title: string;
  description?: string | null;
  summary?: string | null;
  category?: string | null;
  sourceName?: string | null;
  type?: string | null;
};

export type RelevanceResult = {
  relevant: boolean;
  reason: string;
};

const STRONG_KEYWORDS = [
  "girişim",
  "girisim",
  "startup",
  "start-up",
  "entrepreneur",
  "founder",
  "scaleup",
  "scale-up",
  "kobi",
  "ar-ge",
  "arge",
  "r&d",
  "inovasyon",
  "innovation",
  "dijital dönüşüm",
  "dijital donusum",
  "yatırım",
  "yatirim",
  "investment",
  "venture capital",
  "angel investment",
  "melek yatırım",
  "melek yatirim",
  "funding",
  "accelerator",
  "incubation",
  "incubator",
  "kuluçka",
  "kulucka",
  "teknopark",
  "teknoloji geliştirme",
  "teknoloji gelistirme",
  "mentorluk",
  "mentorship",
  "demo day",
  "yapay zeka girişimi",
  "yapay zeka girisimi",
  "ai startup",
  "fintech",
  "biotech",
  "cleantech",
  "deeptech",
  "deep tech",
  "sosyal girişim",
  "sosyal girisim",
  "horizon europe",
] as const;

const OPPORTUNITY_KEYWORDS = [
  "hibe",
  "fon",
  "destek",
  "çağrı",
  "cagri",
  "başvuru",
  "basvuru",
  "accelerator",
  "webinar",
  "zirve",
  "summit",
  "demo day",
] as const;

const EXCLUSION_PATTERNS = [
  /\bpersonel (?:alımı|alimi|ilanı|ilani)\b/i,
  /\b(?:spor|futbol|basketbol|voleybol)\b/i,
  /\bteknik bakım\b/i,
  /\bbakım çalışması\b/i,
  /\bbakim calismasi\b/i,
  /\bplanlı kesinti\b/i,
  /\bplanli kesinti\b/i,
  /\bgenel kurum duyurusu\b/i,
  /\bmagazin\b/i,
] as const;

function searchable(value: string): string {
  return normalizeText(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findKeyword(text: string, keywords: readonly string[]) {
  return keywords.find((keyword) => text.includes(searchable(keyword)));
}

export function isEntrepreneurshipRelevant(
  input: RelevanceInput,
): RelevanceResult {
  const content = searchable(
    [input.title, input.description, input.summary].filter(Boolean).join(" "),
  );
  const context = searchable(
    [input.category, input.sourceName, input.type].filter(Boolean).join(" "),
  );
  const strongKeyword =
    findKeyword(content, STRONG_KEYWORDS) ??
    (/\bvc\b/i.test(content) ? "vc" : undefined);
  const excluded = EXCLUSION_PATTERNS.find((pattern) => pattern.test(content));

  if (excluded && !strongKeyword) {
    return {
      relevant: false,
      reason: "Girişimcilik kapsamı dışında olduğu için atlandı.",
    };
  }

  if (strongKeyword) {
    return {
      relevant: true,
      reason: `Girişimcilik anahtar kelimesi eşleşti: ${strongKeyword}`,
    };
  }

  const opportunityKeyword = findKeyword(content, OPPORTUNITY_KEYWORDS);
  const opportunityTypes = new Set([
    "funding",
    "investment",
    "accelerator",
    "program",
  ]);
  const hasOpportunityContext =
    opportunityTypes.has(input.type ?? "") ||
    /(destek|fon|yatırım|yatirim|kosgeb|tubitak|grants|funding)/i.test(context);

  if (opportunityKeyword && hasOpportunityContext) {
    return {
      relevant: true,
      reason: `Fırsat bağlamı eşleşti: ${opportunityKeyword}`,
    };
  }

  return {
    relevant: false,
    reason: "Girişimcilik kapsamı dışında olduğu için atlandı.",
  };
}
