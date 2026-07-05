import {
  hasStrictInvestmentSignal,
  INVESTMENT_CATEGORY,
} from "@/lib/ingestion/investmentClassification";
import { normalizeText } from "@/lib/utils/normalizeText";

export type RelevanceInput = {
  title: string;
  description?: string | null;
  summary?: string | null;
  category?: string | null;
  sourceName?: string | null;
  sourceId?: string | null;
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
  "angel investment",
  "melek yatırım",
  "melek yatirim",
  "tech transfer",
  "technology transfer",
  "teknoloji transferi",
  "commercialization",
  "ticarileştirme",
  "ticarilestirme",
  "innovation ecosystem",
  "inovasyon ekosistemi",
  "technology startup",
  "teknoloji girişimi",
  "teknoloji girisimi",
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

const GENERAL_FINANCE_PATTERNS = [
  /\bborsa\b/i,
  /\bhisse senedi\b/i,
  /\bkripto(?: para)?\b/i,
  /\bmakro ekonomi\b/i,
  /\bbanka\b/i,
  /\bkredi kartı kampanyası\b/i,
  /\bkredi karti kampanyasi\b/i,
  /\byatırım tavsiyesi\b/i,
  /\byatirim tavsiyesi\b/i,
  /\bfunding rate arbitrage\b/i,
  /\bresearch grant funding\b/i,
  /\bpublic funding\b/i,
  /\bhiv funding\b/i,
  /\bmemecoin\b/i,
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
    [input.category, input.sourceName, input.sourceId, input.type]
      .filter(Boolean)
      .join(" "),
  );
  const investmentSignal = hasStrictInvestmentSignal(input);
  const strongKeyword = findKeyword(content, STRONG_KEYWORDS);
  const trustedWorkerSource = /(?:odtu-teknokent|nato-diana)/.test(context);
  const trustedEditorialSource =
    /(?:webrazzi|egirisim|startupcentrum|swipeline|techcrunch|eu-startups|crunchbase-news|itu-ari-teknokent)/.test(
      context,
    );
  const editorialTechnologySignal =
    trustedEditorialSource &&
    /\b(?:teknoloji|technology|tech|yapay zeka|artificial intelligence|ai|software|saas|fintech|deep tech|robotik|robotics|siber guvenlik|cybersecurity|urun|product|lansman|launch|inovasyon|innovation|ekosistem|ecosystem|startup|girisim)\b/i.test(
      content,
    );
  const trustedTechnologySignal =
    trustedWorkerSource &&
    /\b(?:teknoloji|technology|deep tech|innovation|inovasyon|challenge|program|programme|commercialization|ticarileştirme|ticarilestirme)\b/i.test(
      content,
    );
  const excluded = EXCLUSION_PATTERNS.find((pattern) => pattern.test(content));
  const generalFinance = GENERAL_FINANCE_PATTERNS.find((pattern) =>
    pattern.test(content),
  );

  if (excluded && !strongKeyword && !investmentSignal) {
    return {
      relevant: false,
      reason: "Girişimcilik kapsamı dışında olduğu için atlandı.",
    };
  }

  if (generalFinance && !strongKeyword && !investmentSignal) {
    return {
      relevant: false,
      reason: "Girişimcilik kapsamı dışında olduğu için atlandı.",
    };
  }

  if (investmentSignal) {
    return {
      relevant: true,
      reason: `Yatırım sinyali eşleşti: ${INVESTMENT_CATEGORY}`,
    };
  }

  if (strongKeyword) {
    return {
      relevant: true,
      reason: `Girişimcilik anahtar kelimesi eşleşti: ${strongKeyword}`,
    };
  }

  if (trustedTechnologySignal) {
    return {
      relevant: true,
      reason: "Güvenilir worker kaynağında teknoloji veya program sinyali eşleşti.",
    };
  }

  if (editorialTechnologySignal) {
    return {
      relevant: true,
      reason: "Güvenilir ekosistem haber kaynağında teknoloji sinyali eşleşti.",
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
    /(destek|fon|yatırım|yatirim|kosgeb|tubitak|grants)/i.test(context);

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
