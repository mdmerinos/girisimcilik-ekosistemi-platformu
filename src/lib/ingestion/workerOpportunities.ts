import { z } from "zod";

import { isEntrepreneurshipRelevant } from "@/lib/ingestion/isEntrepreneurshipRelevant";
import { normalizeOpportunity } from "@/lib/ingestion/normalizeOpportunity";
import type { UpsertResult } from "@/lib/ingestion/upsertOpportunities";
import { createUniqueKey } from "@/lib/utils/createUniqueKey";
import { OPPORTUNITY_CATEGORIES, type OpportunityInput } from "@/types/opportunity";

export const workerEnvelopeSchema = z.object({
  items: z.array(z.unknown()).min(1).max(100),
});

export const workerOpportunitySchema = z.object({
  title: z.string().trim().min(3).max(240),
  summary: z.string().trim().max(5000).nullable().optional(),
  category: z.enum(OPPORTUNITY_CATEGORIES),
  source_name: z.string().trim().min(2).max(120),
  source_url: z.url(),
  application_url: z.url().nullable().optional(),
  image_url: z.url().nullable().optional(),
  published_at: z.iso.datetime().nullable().optional(),
  deadline_at: z.iso.datetime().nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  is_featured: z.boolean().optional(),
});

type WorkerOpportunity = z.infer<typeof workerOpportunitySchema>;

type WorkerDependencies = {
  upsert: (items: OpportunityInput[]) => Promise<UpsertResult>;
  now?: () => Date;
};

function opportunityType(category: WorkerOpportunity["category"]) {
  if (category === "Yatırım ve Sermaye Ağları") return "investment";
  if (
    category === "Ulusal Destek ve Fonlar" ||
    category === "Uluslararası Fonlar"
  ) {
    return "funding";
  }
  if (category === "Etkinlik ve Programlar") return "program";
  return "news";
}

export function isWorkerAuthorized(
  authorization: string | null,
  secrets: Array<string | undefined>,
): boolean {
  const supplied = authorization?.replace(/^Bearer\s+/i, "").trim();
  const configured = secrets.filter(
    (secret): secret is string => Boolean(secret),
  );
  return Boolean(
    supplied && configured.some((expected) => supplied === expected),
  );
}

export async function processWorkerOpportunities(
  rawItems: unknown[],
  dependencies: WorkerDependencies,
) {
  const fetchedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const normalized = new Map<string, OpportunityInput>();
  let rejected = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const rawItem of rawItems) {
    const parsed = workerOpportunitySchema.safeParse(rawItem);
    if (!parsed.success) {
      rejected += 1;
      continue;
    }

    try {
      const item = parsed.data;
      const normalizedItem = normalizeOpportunity({
        unique_key: createUniqueKey(item.source_name, item.source_url),
        title: item.title,
        summary: item.summary ?? null,
        category: item.category,
        source_name: item.source_name,
        source_url: item.source_url,
        application_url: item.application_url ?? item.source_url,
        image_url: item.image_url ?? null,
        published_at: item.published_at ?? null,
        deadline_at: item.deadline_at ?? null,
        fetched_at: fetchedAt,
        location: item.location ?? null,
        is_featured: item.is_featured ?? false,
      });
      const relevance = isEntrepreneurshipRelevant({
        title: normalizedItem.title,
        summary: normalizedItem.summary,
        category: normalizedItem.category,
        sourceName: normalizedItem.source_name,
        sourceId: "external-worker",
        type: opportunityType(normalizedItem.category),
      });

      if (!relevance.relevant) {
        skipped += 1;
        continue;
      }

      if (normalized.has(normalizedItem.unique_key)) duplicates += 1;
      normalized.set(normalizedItem.unique_key, normalizedItem);
    } catch {
      rejected += 1;
    }
  }

  const items = [...normalized.values()];
  const upsert = await dependencies.upsert(items);

  return {
    received: rawItems.length,
    accepted: items.length,
    inserted: upsert.inserted,
    updated: upsert.updated,
    skipped,
    rejected,
    duplicates,
  };
}
