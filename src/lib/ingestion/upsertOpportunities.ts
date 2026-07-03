import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { OpportunityInput } from "@/types/opportunity";

export type UpsertResult = {
  inserted: number;
  updated: number;
};

export async function upsertOpportunities(
  opportunities: OpportunityInput[],
): Promise<UpsertResult> {
  if (opportunities.length === 0) return { inserted: 0, updated: 0 };

  const supabase = createAdminSupabaseClient();
  const keys = opportunities.map((item) => item.unique_key);
  const { data: existingRows, error: lookupError } = await supabase
    .from("opportunities")
    .select("unique_key")
    .in("unique_key", keys);

  if (lookupError) throw lookupError;

  const existingKeys = new Set(
    (existingRows ?? []).map((row) => row.unique_key as string),
  );
  const { error: upsertError } = await supabase
    .from("opportunities")
    .upsert(opportunities, { onConflict: "unique_key" });

  if (upsertError) throw upsertError;

  const updated = opportunities.filter((item) =>
    existingKeys.has(item.unique_key),
  ).length;

  return {
    inserted: opportunities.length - updated,
    updated,
  };
}
