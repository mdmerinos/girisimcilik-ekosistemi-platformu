import type { Opportunity } from "@/types/opportunity";

export type OpportunityDateDisplay = {
  label: "Son başvuru" | "Açılış" | "Yayın";
  value: string;
};

export function getOpportunityDateDisplay(
  opportunity: Pick<Opportunity, "deadline_at" | "published_at">,
): OpportunityDateDisplay | null {
  if (opportunity.deadline_at) {
    return { label: "Son başvuru", value: opportunity.deadline_at };
  }
  if (opportunity.published_at) {
    return { label: "Yayın", value: opportunity.published_at };
  }
  return null;
}
