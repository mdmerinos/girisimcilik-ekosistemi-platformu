export const OPPORTUNITY_CATEGORIES = [
  "Ulusal Destek ve Fonlar",
  "Uluslararası Fonlar",
  "Yatırım ve Sermaye Ağları",
  "Etkinlik ve Programlar",
  "Haber ve Sosyal Medya Akışı",
] as const;

export type OpportunityCategory = (typeof OPPORTUNITY_CATEGORIES)[number];

export type Opportunity = {
  id: string;
  unique_key: string;
  title: string;
  summary: string | null;
  category: OpportunityCategory;
  source_name: string;
  source_url: string;
  application_url: string | null;
  image_url: string | null;
  published_at: string | null;
  deadline_at: string | null;
  fetched_at: string;
  location: string | null;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
};

export type OpportunityInput = Omit<
  Opportunity,
  "id" | "created_at" | "updated_at" | "image_url"
> & {
  image_url?: string | null;
};
