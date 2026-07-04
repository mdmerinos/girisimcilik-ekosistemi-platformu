import { z } from "zod";

import { isEntrepreneurshipRelevant } from "@/lib/ingestion/isEntrepreneurshipRelevant";
import { normalizeOpportunity } from "@/lib/ingestion/normalizeOpportunity";
import type { UpsertResult } from "@/lib/ingestion/upsertOpportunities";
import { createUniqueKey } from "@/lib/utils/createUniqueKey";
import {
  OPPORTUNITY_CATEGORIES,
  type OpportunityInput,
} from "@/types/opportunity";

export const WORKER_SOURCE_SLUGS = [
  "nato-diana",
  "odtu-teknokent",
] as const;
export type WorkerSourceSlug = (typeof WORKER_SOURCE_SLUGS)[number];

export const WORKER_SOURCE_CONFIG: Record<
  WorkerSourceSlug,
  { sourceName: string; hosts: string[]; defaultLocation: string }
> = {
  "nato-diana": {
    sourceName: "NATO DIANA",
    hosts: ["diana.nato.int", "www.diana.nato.int"],
    defaultLocation: "Global",
  },
  "odtu-teknokent": {
    sourceName: "ODTÜ Teknokent",
    hosts: [
      "odtuteknokent.com.tr",
      "www.odtuteknokent.com.tr",
      "portal.odtuteknokent.com.tr",
      "yfyi.odtuteknokent.com.tr",
      "yfyi.com",
      "www.yfyi.com",
      "atom.org.tr",
      "www.atom.org.tr",
      "etkim.gov.tr",
      "www.etkim.gov.tr",
      "metustars.com",
      "www.metustars.com",
    ],
    defaultLocation: "Türkiye",
  },
};

const sourceSlugSchema = z.enum(WORKER_SOURCE_SLUGS);

export const workerEnvelopeSchema = z
  .object({
    sourceSlug: sourceSlugSchema,
    sourceName: z.string().trim().min(2).max(120),
    items: z.array(z.unknown()).max(100),
  })
  .superRefine((value, context) => {
    if (value.sourceName !== WORKER_SOURCE_CONFIG[value.sourceSlug].sourceName) {
      context.addIssue({
        code: "custom",
        path: ["sourceName"],
        message: "sourceName, sourceSlug ile eşleşmiyor.",
      });
    }
  });

export const workerOpportunitySchema = z.object({
  title: z.string().trim().min(3).max(240),
  summary: z.string().trim().max(5000).nullable().optional(),
  category: z.enum(OPPORTUNITY_CATEGORIES),
  sourceUrl: z.url(),
  applicationUrl: z.url().nullable().optional(),
  imageUrl: z.url().nullable().optional(),
  publishedAt: z.iso.datetime().nullable().optional(),
  deadlineAt: z.iso.datetime().nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  countryGroup: z.enum(["turkiye", "global"]).optional(),
  isFeatured: z.boolean().optional(),
});

type WorkerOpportunity = z.infer<typeof workerOpportunitySchema>;
type WorkerEnvelope = z.infer<typeof workerEnvelopeSchema>;

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

function sourceUrlBelongsToWorker(
  sourceUrl: string,
  sourceSlug: WorkerSourceSlug,
): boolean {
  const hostname = new URL(sourceUrl).hostname.toLocaleLowerCase("en-US");
  return WORKER_SOURCE_CONFIG[sourceSlug].hosts.includes(hostname);
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
  envelope: WorkerEnvelope,
  dependencies: WorkerDependencies,
) {
  const sourceConfig = WORKER_SOURCE_CONFIG[envelope.sourceSlug];
  const fetchedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const normalized = new Map<string, OpportunityInput>();
  let rejected = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const rawItem of envelope.items) {
    const parsed = workerOpportunitySchema.safeParse(rawItem);
    if (!parsed.success) {
      rejected += 1;
      continue;
    }

    try {
      const item = parsed.data;
      if (!sourceUrlBelongsToWorker(item.sourceUrl, envelope.sourceSlug)) {
        rejected += 1;
        continue;
      }

      const normalizedItem = normalizeOpportunity({
        // Canonical sourceName keeps browser-worker and lightweight scraper
        // records on the same URL-based key, preventing cross-channel duplicates.
        unique_key: createUniqueKey(sourceConfig.sourceName, item.sourceUrl),
        title: item.title,
        summary: item.summary ?? null,
        category: item.category,
        source_name: sourceConfig.sourceName,
        source_url: item.sourceUrl,
        application_url: item.applicationUrl ?? item.sourceUrl,
        image_url: item.imageUrl ?? null,
        published_at: item.publishedAt ?? null,
        deadline_at: item.deadlineAt ?? null,
        fetched_at: fetchedAt,
        location: item.location ?? sourceConfig.defaultLocation,
        is_featured: item.isFeatured ?? false,
      });
      const relevance = isEntrepreneurshipRelevant({
        title: normalizedItem.title,
        summary: normalizedItem.summary,
        category: normalizedItem.category,
        sourceName: normalizedItem.source_name,
        sourceId: envelope.sourceSlug,
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
    sourceSlug: envelope.sourceSlug,
    sourceName: sourceConfig.sourceName,
    received: envelope.items.length,
    accepted: items.length,
    inserted: upsert.inserted,
    updated: upsert.updated,
    skipped,
    rejected,
    duplicates,
  };
}
