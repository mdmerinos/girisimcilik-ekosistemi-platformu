import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTurkishExplanation,
  getCardSummaryDisplay,
  getOriginalSummaryForCard,
  isBadSummary,
  isLikelyEnglish,
  isLikelyTurkish,
  shouldShowTurkishExplanationButton,
} from "@/lib/opportunities/opportunityDisplayText";
import {
  enrichOpportunityDescriptions,
  extractDescriptionFromHtml,
  fetchOpportunityDescription,
} from "@/lib/ingestion/extractOpportunityDescription";
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
  assert.match(buildTurkishExplanation(item), new RegExp(item.title));
  assert.match(buildTurkishExplanation(item), /NATO DIANA/);
});

test("Turkish summary is displayed without an unnecessary explanation button", () => {
  const summary =
    "Bu program, teknoloji girişimleri için başvuru ve destek bilgileri sunmaktadır.";
  const item = opportunity({ summary });

  assert.equal(isLikelyTurkish(summary), true);
  assert.equal(getOriginalSummaryForCard(item), summary);
  assert.equal(shouldShowTurkishExplanationButton(item), false);
});

test("posted boilerplate displays Turkish fallback directly without a button", () => {
  const item = opportunity({
    source_name: "Grants.gov",
    summary: "DFOP001281 · Bureau Of Educational and Cultural Affairs · posted",
    deadline_at: "2026-07-28T00:00:00.000Z",
  });
  const display = getCardSummaryDisplay(item);

  assert.equal(isBadSummary(item.summary, item.title), true);
  assert.equal(getOriginalSummaryForCard(item), null);
  assert.equal(display.usesTurkishFallback, true);
  assert.match(display.text, new RegExp(item.title));
  assert.match(display.text, /Grants\.gov/);
  assert.match(display.text, /Uluslararası Fonlar/);
  assert.match(display.text, /Son başvuru tarihi: 28\.07\.2026\.$/);
  assert.doesNotMatch(
    display.text,
    /Kaynakta anlamlı kısa açıklama bulunamadı/,
  );
  assert.equal(shouldShowTurkishExplanationButton(item), false);
});

test("source-specific Turkish fallbacks remain factual", () => {
  const cases = [
    ["Grants.gov", "Grants.gov"],
    ["EU Funding & Tenders", "EU Funding & Tenders Portal"],
    ["NATO DIANA", "NATO DIANA kaynaklı"],
    ["ODTÜ Teknokent", "ODTÜ Teknokent ekosisteminden"],
    ["KOSGEB Duyuruları", "KOSGEB kaynaklı"],
    ["TÜBİTAK BİGG", "TÜBİTAK kaynaklı"],
    ["NASA SBIR/STTR", "NASA SBIR/STTR kaynaklı"],
  ] as const;

  for (const [sourceName, expected] of cases) {
    const item = opportunity({
      title: `${sourceName} özel fırsatı`,
      source_name: sourceName,
    });
    const explanation = buildTurkishExplanation(item);
    assert.match(explanation, new RegExp(item.title.replace("/", "\\/")));
    assert.match(explanation, new RegExp(expected.replace("/", "\\/")));
    assert.match(explanation, /Uluslararası Fonlar/);
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

test("specific fallback changes with the title and rejects title repetition", () => {
  const first = opportunity({
    title: "Birinci KOSGEB çağrısı",
    summary: "Birinci KOSGEB çağrısı",
    source_name: "KOSGEB Duyuruları",
    category: "Ulusal Destek ve Fonlar",
  });
  const second = opportunity({
    title: "İkinci KOSGEB programı",
    summary: "İkinci KOSGEB programı",
    source_name: "KOSGEB Duyuruları",
    category: "Ulusal Destek ve Fonlar",
  });

  assert.equal(isBadSummary(first.summary, first.title), true);
  assert.equal(isBadSummary(second.summary, second.title), true);
  assert.notEqual(
    getCardSummaryDisplay(first).text,
    getCardSummaryDisplay(second).text,
  );
  assert.match(getCardSummaryDisplay(first).text, /Birinci KOSGEB çağrısı/);
  assert.match(getCardSummaryDisplay(second).text, /İkinci KOSGEB programı/);
});

test("description extractor follows meta, OG and JSON-LD priority", () => {
  const title = "Startup innovation opportunity";
  const meta = extractDescriptionFromHtml(
    `<meta name="description" content="This detailed programme description explains the innovation opportunity and the application context for eligible technology startups.">
     <meta property="og:description" content="This secondary Open Graph description should not win when a useful standard meta description exists.">`,
    title,
  );
  const openGraph = extractDescriptionFromHtml(
    `<meta property="og:description" content="This Open Graph description provides meaningful context about the technology opportunity for startup applicants.">`,
    title,
  );
  const jsonLd = extractDescriptionFromHtml(
    `<script type="application/ld+json">
      {"@type":"Grant","description":"This JSON-LD description provides meaningful details about the research and innovation funding opportunity."}
    </script>`,
    title,
  );

  assert.match(meta ?? "", /^This detailed programme description/);
  assert.match(openGraph ?? "", /^This Open Graph description/);
  assert.match(jsonLd ?? "", /^This JSON-LD description/);
});

test("description extractor rejects short posting text and accepts useful paragraphs", () => {
  const title = "Community exchange opportunity";
  assert.equal(
    extractDescriptionFromHtml(
      `<meta name="description" content="U.S. Mission to India · posted">
       <main><p>Apply</p><p>Read more</p></main>`,
      title,
    ),
    null,
  );
  assert.match(
    extractDescriptionFromHtml(
      `<main><article><p>This opportunity supports a structured exchange for participating organizations and provides detailed application information on the official page.</p></article></main>`,
      title,
    ) ?? "",
    /^This opportunity supports/,
  );
});

test("description extractor reads objective, synopsis, scope and abstract fields", () => {
  const title = "Official innovation call";
  const cases = [
    `<section class="objective">This objective explains the official innovation call and provides substantial context for potential applicants on the source page.</section>`,
    `<h2>Opportunity synopsis</h2><p>This synopsis explains the official opportunity with enough source-specific context for organizations considering an application.</p>`,
    `<div id="scope">This scope describes the intended research and innovation context in sufficient detail for the official call record.</div>`,
    `<div class="abstract">This abstract contains a meaningful description of the official programme and its documented innovation focus.</div>`,
  ];

  for (const html of cases) {
    assert.notEqual(extractDescriptionFromHtml(html, title), null, html);
  }
});

test("KOSGEB description enrichment uses the real detail page when available", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(`
      <html>
        <head>
          <meta name="description" content="KOSGEB'in resmî detay sayfasında yer alan bu açıklama, güncel destek duyurusuna ilişkin doğrulanabilir kaynak bilgisini içerir.">
        </head>
      </html>
    `);

  try {
    const [enriched] = await enrichOpportunityDescriptions(
      [
        {
          unique_key: "kosgeb:current",
          title: "Güncel KOSGEB destek duyurusu",
          summary: "Devamını oku",
          category: "Ulusal Destek ve Fonlar",
          source_name: "KOSGEB Duyuruları",
          source_url:
            "https://www.kosgeb.gov.tr/site/tr/genel/detay/9999/guncel",
          application_url: null,
          published_at: "2026-07-04T00:00:00.000Z",
          deadline_at: null,
          fetched_at: "2026-07-05T10:00:00.000Z",
          location: "Türkiye",
          is_featured: false,
        },
      ],
      "kosgeb-announcements",
    );

    assert.match(enriched.summary ?? "", /^KOSGEB'in resmî detay sayfasında/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("blocked detail pages return fallback without breaking enrichment", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 403 });

  try {
    assert.equal(
      await fetchOpportunityDescription(
        "https://www.grants.gov/search-results-detail/test",
        "Community exchange opportunity",
      ),
      null,
    );

    const [enriched] = await enrichOpportunityDescriptions(
      [
        {
          unique_key: "grants:test",
          title: "Community exchange opportunity",
          summary: "posted",
          category: "Uluslararası Fonlar",
          source_name: "Grants.gov",
          source_url:
            "https://www.grants.gov/search-results-detail/test",
          application_url: null,
          published_at: null,
          deadline_at: null,
          fetched_at: "2026-07-05T10:00:00.000Z",
          location: "Global",
          is_featured: false,
        },
      ],
      "grants-gov",
    );

    assert.match(enriched.summary ?? "", /Community exchange opportunity/);
    assert.match(enriched.summary ?? "", /Grants\.gov/);
    assert.doesNotMatch(enriched.summary ?? "", /\d{2}\.\d{2}\.\d{4}/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
