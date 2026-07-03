import { z } from "zod";

import { applyInvestmentCategoryPriority } from "@/lib/ingestion/investmentClassification";
import { cleanOpportunitySummary } from "@/lib/scrapers/cleanOpportunitySummary";
import { resolveOpportunityUrl } from "@/lib/utils/opportunityUrl";
import { normalizeText } from "@/lib/utils/normalizeText";
import { OPPORTUNITY_CATEGORIES, type OpportunityInput } from "@/types/opportunity";

const opportunitySchema = z.object({
  unique_key: z.string().min(8),
  title: z.string().min(3),
  summary: z.string().nullable(),
  category: z.enum(OPPORTUNITY_CATEGORIES),
  source_name: z.string().min(2),
  source_url: z.url(),
  application_url: z.url().nullable(),
  image_url: z.url().nullable(),
  published_at: z.iso.datetime().nullable(),
  deadline_at: z.iso.datetime().nullable(),
  fetched_at: z.iso.datetime(),
  location: z.string().nullable(),
  is_featured: z.boolean(),
});

function normalizeImageUrl(value: string | null | undefined): string | null {
  if (!value || !URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === "http:" || url.protocol === "https:"
    ? url.toString()
    : null;
}

export function normalizeOpportunity(input: OpportunityInput): OpportunityInput {
  const title = normalizeText(input.title);
  const sourceUrl = resolveOpportunityUrl(input.source_url, input.source_url);
  if (!sourceUrl) {
    throw new Error("Opportunity source URL is not a valid HTTP(S) URL.");
  }

  const normalized = opportunitySchema.parse({
    ...input,
    title,
    summary: cleanOpportunitySummary(input.summary, title),
    source_name: normalizeText(input.source_name),
    source_url: sourceUrl,
    application_url: resolveOpportunityUrl(input.application_url, sourceUrl),
    image_url: normalizeImageUrl(input.image_url),
    location: input.location ? normalizeText(input.location) : null,
  });

  return applyInvestmentCategoryPriority(normalized);
}
