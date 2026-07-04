import assert from "node:assert/strict";
import test from "node:test";

import {
  MISSING_MEANINGFUL_SUMMARY,
  buildTurkishExplanation,
  getOriginalSummaryForCard,
  isBadSummary,
  isLikelyEnglish,
  isLikelyTurkish,
  shouldShowTurkishExplanationButton,
} from "@/lib/opportunities/opportunityDisplayText";
import type { Opportunity } from "@/types/opportunity";

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "display",
    unique_key: "display",
    title: "Open innovation challenge for startups",
    summary:
      "Applications are open for technology startups working on resilient communications.",
    category: "Uluslararası Fonlar",
    source_name: "NATO DIANA",
    source_url: "https://example.com/opportunity",
    application_url: null,
    image_url: null,
    published_at: null,
    deadline_at: null,
    fetched_at: "2026-07-05T10:00:00.000Z",
    location: "Global",
    is_featured: false,
    created_at: "2026-07-05T10:00:00.000Z",
    updated_at: "2026-07-05T10:00:00.000Z",
    ...overrides,
  };
}

test("English original summary is preserved and enables Turkish explanation", () => {
  const item = opportunity();

  assert.equal(isLikelyEnglish(item.summary), true);
  assert.equal(getOriginalSummaryForCard(item), item.summary);
  assert.equal(shouldShowTurkishExplanationButton(item), true);
  assert.match(buildTurkishExplanation(item), /^Bu kayıt, NATO DIANA/);
});

test("Turkish summary is displayed without an unnecessary explanation button", () => {
  const summary =
    "Bu program, teknoloji girişimleri için başvuru ve destek bilgileri sunmaktadır.";
  const item = opportunity({ summary });

  assert.equal(isLikelyTurkish(summary), true);
  assert.equal(getOriginalSummaryForCard(item), summary);
  assert.equal(shouldShowTurkishExplanationButton(item), false);
});

test("posted boilerplate is replaced with the honest missing-summary message", () => {
  const item = opportunity({
    source_name: "Grants.gov",
    summary: "DFOP001281 · Bureau Of Educational and Cultural Affairs · posted",
  });

  assert.equal(isBadSummary(item.summary, item.title), true);
  assert.equal(getOriginalSummaryForCard(item), MISSING_MEANINGFUL_SUMMARY);
  assert.equal(shouldShowTurkishExplanationButton(item), true);
  assert.match(buildTurkishExplanation(item), /^Bu kayıt, Grants\.gov/);
});

test("source-specific Turkish fallbacks remain factual", () => {
  const cases = [
    ["Grants.gov", "Grants.gov"],
    ["EU Funding & Tenders", "EU Funding & Tenders Portal"],
    ["NATO DIANA", "NATO DIANA tarafından"],
    ["ODTÜ Teknokent", "ODTÜ Teknokent ekosisteminden"],
    ["KOSGEB Duyuruları", "KOSGEB tarafından"],
    ["TÜBİTAK BİGG", "TÜBİTAK tarafından"],
    ["NASA SBIR/STTR", "NASA SBIR/STTR programı"],
  ] as const;

  for (const [sourceName, expected] of cases) {
    const explanation = buildTurkishExplanation(
      opportunity({ source_name: sourceName }),
    );
    assert.match(explanation, new RegExp(expected.replace("/", "\\/")));
    assert.doesNotMatch(explanation, /Son başvuru tarihi:/);
  }
});

test("deadline is appended only when a valid stored deadline exists", () => {
  const withoutDeadline = buildTurkishExplanation(opportunity());
  const withDeadline = buildTurkishExplanation(
    opportunity({ deadline_at: "2026-07-06T00:00:00.000Z" }),
  );

  assert.doesNotMatch(withoutDeadline, /\d{2}\.\d{2}\.\d{4}/);
  assert.match(withDeadline, /Son başvuru tarihi: 06\.07\.2026\.$/);
  assert.doesNotMatch(withDeadline, /(?:tutar|bütçe|milyon|milyar)/i);
});
