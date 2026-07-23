import { hasRealOpportunityEvidence } from "@/lib/ingestion/realOpportunityEvidence";
import { sourceConfigs } from "@/lib/ingestion/sourceConfig";
import type { Opportunity } from "@/types/opportunity";

const technoparkListingBySourceName = new Map(
  sourceConfigs
    .filter((source) => source.sourceGroup === "technopark")
    .map((source) => [source.name, source.url]),
);

export function isStage5Opportunity(item: Opportunity): boolean {
  return (
    Boolean(item.platform) ||
    Boolean(item.related_technopark) ||
    technoparkListingBySourceName.has(item.source_name)
  );
}

export function shouldShowStage5Opportunity(item: Opportunity): boolean {
  if (!isStage5Opportunity(item)) return true;
  return hasRealOpportunityEvidence(
    item,
    technoparkListingBySourceName.get(item.source_name),
  );
}

export function filterStage5OpportunitiesForDisplay(
  items: Opportunity[],
): Opportunity[] {
  return items.filter(shouldShowStage5Opportunity);
}
