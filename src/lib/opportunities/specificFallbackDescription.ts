import dayjs from "dayjs";

import type { OpportunityInput } from "@/types/opportunity";

export type FallbackDescriptionOpportunity = Pick<
  OpportunityInput,
  "title" | "source_name" | "category" | "deadline_at"
>;

function sourceSentence(opportunity: FallbackDescriptionOpportunity): string {
  const source = opportunity.source_name
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i");
  const category = `“${opportunity.category}” kategorisinde`;

  if (source.includes("grants.gov")) {
    return `${opportunity.title} başlıklı bu kayıt, Grants.gov üzerindeki uluslararası fon/fırsat kayıtları arasında ${category} yer alıyor. Başvuru detayları resmi kaynak sayfasında incelenebilir.`;
  }
  if (source.includes("eu funding") || source.includes("funding & tenders")) {
    return `${opportunity.title} başlıklı bu kayıt, EU Funding & Tenders Portal üzerindeki Avrupa Birliği çağrı/fon kayıtları arasında ${category} yer alıyor. Detaylar resmi portal bağlantısında incelenebilir.`;
  }
  if (source.includes("nato diana")) {
    return `${opportunity.title} başlıklı bu kayıt, NATO DIANA kaynaklı kayıtlar arasında ${category} yer alıyor. Detaylar resmi NATO DIANA sayfasında incelenebilir.`;
  }
  if (source.includes("odtü teknokent")) {
    return `${opportunity.title} başlıklı bu kayıt, ODTÜ Teknokent ekosisteminden gelen kayıtlar arasında ${category} yer alıyor. Detaylar resmi kaynak bağlantısında incelenebilir.`;
  }
  if (source.includes("kosgeb")) {
    return `${opportunity.title} başlıklı bu kayıt, KOSGEB kaynaklı kayıtlar arasında ${category} yer alıyor. Başvuru ve detay bilgileri resmi kaynakta incelenebilir.`;
  }
  if (source.includes("tübitak")) {
    return `${opportunity.title} başlıklı bu kayıt, TÜBİTAK kaynaklı kayıtlar arasında ${category} yer alıyor. Detaylar resmi kaynak bağlantısında incelenebilir.`;
  }
  if (source.includes("nasa sbir") || source.includes("nasa sttr")) {
    return `${opportunity.title} başlıklı bu kayıt, NASA SBIR/STTR kaynaklı kayıtlar arasında ${category} yer alıyor. Detaylar resmi kaynak bağlantısında incelenebilir.`;
  }

  return `${opportunity.title} başlıklı bu kayıt, ${opportunity.source_name} kaynağında ${category} yer alıyor. Detaylar resmi kaynak bağlantısında incelenebilir.`;
}

export function buildSpecificFallbackDescription(
  opportunity: FallbackDescriptionOpportunity,
): string {
  const description = sourceSentence(opportunity);
  if (!opportunity.deadline_at) return description;

  const deadline = dayjs(opportunity.deadline_at);
  if (!deadline.isValid()) return description;

  return `${description} Son başvuru tarihi: ${deadline.format("DD.MM.YYYY")}.`;
}
