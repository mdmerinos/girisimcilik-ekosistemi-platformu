import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createUniqueKey } from "@/lib/utils/createUniqueKey";
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
  const sourceNames = [...new Set(opportunities.map((item) => item.source_name))];
  const { data: sameSourceRows, error: titleLookupError } = await supabase
    .from("opportunities")
    .select(
      "unique_key,title,source_name,source_url,application_url,platform,related_technopark",
    )
    .in("source_name", sourceNames);

  if (titleLookupError) throw titleLookupError;

  const existingByTitle = new Map(
    (sameSourceRows ?? []).map((row) => [
      createUniqueKey(
        row.source_name as string,
        row.source_url as string,
        row.title as string,
      ),
      row,
    ]),
  );
  const prepared = [
    ...new Map(
      opportunities.map((item) => {
        const titleKey = createUniqueKey(
          item.source_name,
          item.source_url,
          item.title,
        );
        const existing = existingByTitle.get(titleKey);
        if (!existing) return [titleKey, { ...item, unique_key: titleKey }];

        const keepWebsiteCanonical =
          Boolean(item.platform) && !existing.platform;
        return [
          existing.unique_key as string,
          {
            ...item,
            unique_key: existing.unique_key as string,
            source_url: keepWebsiteCanonical
              ? (existing.source_url as string)
              : item.source_url,
            application_url: keepWebsiteCanonical
              ? ((existing.application_url as string | null) ??
                item.application_url)
              : item.application_url,
            platform: keepWebsiteCanonical
              ? (existing.platform as OpportunityInput["platform"])
              : item.platform,
            related_technopark:
              item.related_technopark ??
              (existing.related_technopark as string | null),
          },
        ];
      }),
    ).values(),
  ];
  const keys = prepared.map((item) => item.unique_key);
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
    .upsert(prepared, { onConflict: "unique_key" });

  if (upsertError) throw upsertError;

  const updated = prepared.filter((item) =>
    existingKeys.has(item.unique_key),
  ).length;

  return {
    inserted: prepared.length - updated,
    updated,
  };
}
