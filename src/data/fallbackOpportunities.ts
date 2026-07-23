import type { Opportunity } from "@/types/opportunity";

// Configuration failures must not look like collected opportunities. The
// public API returns an empty list until a real ingestion record is available.
export const fallbackOpportunities: Opportunity[] = [];
