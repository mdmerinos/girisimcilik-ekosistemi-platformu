import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOpportunity } from "@/lib/ingestion/normalizeOpportunity";
import {
  cleanOpportunitySummary,
  SUMMARY_FALLBACK,
} from "@/lib/scrapers/cleanOpportunitySummary";

test("normalizeOpportunity trims fields and accepts the current taxonomy", () => {
  const result = normalizeOpportunity({
    unique_key: "12345678",
    title: "  Açık   çağrı  ",
    summary: "  Girişimler için   destek ",
    category: "Ulusal Destek ve Fonlar",
    source_name: "  TÜBİTAK ",
    source_url: "https://tubitak.gov.tr/call",
    application_url: null,
    published_at: "2026-07-02T00:00:00.000Z",
    deadline_at: null,
    fetched_at: "2026-07-02T08:00:00.000Z",
    location: " Türkiye ",
    is_featured: false,
  });

  assert.equal(result.title, "Açık çağrı");
  assert.equal(result.summary, "Girişimler için destek");
  assert.equal(result.source_name, "TÜBİTAK");
  assert.equal(result.location, "Türkiye");
});

test("normalizeOpportunity preserves social platform and technopark metadata", () => {
  const result = normalizeOpportunity({
    unique_key: "social-input-key",
    title: "  Girişim hızlandırma programı başvuruları başladı ",
    summary: "Teknoloji girişimleri programa başvurabilir.",
    category: "Etkinlik ve Programlar",
    source_name: " İTÜ ARI Teknokent ",
    source_url: "https://x.com/ariteknokent/status/123",
    application_url: "https://example.com/basvuru",
    published_at: "2026-07-22T08:00:00.000Z",
    deadline_at: null,
    fetched_at: "2026-07-22T09:00:00.000Z",
    location: "Türkiye",
    is_featured: false,
    platform: "x",
    related_technopark: " İTÜ ARI Teknokent ",
  });

  assert.equal(result.platform, "x");
  assert.equal(result.related_technopark, "İTÜ ARI Teknokent");
  assert.equal(result.source_name, "İTÜ ARI Teknokent");
  assert.equal(result.unique_key.length, 64);
});

test("normalizeOpportunity never invents a summary for missing real content", () => {
  const result = normalizeOpportunity({
    unique_key: "missing-summary",
    title: "Teknoloji girişimleri için açık program",
    summary: "https://example.com/program",
    category: "Etkinlik ve Programlar",
    source_name: "Örnek Teknokent",
    source_url: "https://example.com/program/gercek-duyuru",
    application_url: null,
    published_at: "2026-07-22T08:00:00.000Z",
    deadline_at: null,
    fetched_at: "2026-07-22T09:00:00.000Z",
    location: "Türkiye",
    is_featured: false,
  });

  assert.equal(result.summary, null);
});

test("summary cleaner removes URL labels and HTML", () => {
  const result = cleanOpportunitySummary(
    `<p>Girişimler için yatırım haberi.</p>
     <p>Article URL: https://example.com/article</p>
     <p>Comments URL: https://example.com/comments</p>`,
  );

  assert.equal(result, "Girişimler için yatırım haberi.");
});

test("summary cleaner uses fallback for URL-only descriptions", () => {
  assert.equal(
    cleanOpportunitySummary("https://example.com/article"),
    SUMMARY_FALLBACK,
  );
});

test("summary cleaner removes repeated Expected Outcome language", () => {
  assert.equal(
    cleanOpportunitySummary(
      "Expected Outcome: Projects should contribute to all expected outcomes.",
    ),
    SUMMARY_FALLBACK,
  );
});

test("summary cleaner preserves real content after EU outcome boilerplate", () => {
  assert.equal(
    cleanOpportunitySummary(
      "Expected Outcome:Project results are expected to contribute to the following outcomes:Increasing the market footprint of European startups in strategic digital markets.",
    ),
    "Increasing the market footprint of European startups in strategic digital markets.",
  );
  assert.equal(
    cleanOpportunitySummary(
      "Expected Outcome:Projects should contribute to all of the following expected outcomes:Evidence-based policy frameworks and guidelines promoting convergence.",
    ),
    "Evidence-based policy frameworks and guidelines promoting convergence.",
  );
});

test("summary cleaner uses neutral fallback for HN URL boilerplate", () => {
  assert.equal(
    cleanOpportunitySummary(
      "Article URL: https://example.com/article\nComments URL: https://news.ycombinator.com/item?id=123",
    ),
    "Detaylı bilgi için kaynak sayfasını görüntüleyin.",
  );
});

test("summary cleaner truncates long descriptions at a readable boundary", () => {
  const result = cleanOpportunitySummary(
    "Girişimlerin yeni ürünler geliştirmesini destekleyen program. ".repeat(10),
  );

  assert.ok(result.length >= 180);
  assert.ok(result.length <= 260);
  assert.ok(result.endsWith("…"));
});

test("image_url is normalized and invalid media URLs become null", () => {
  const baseOpportunity = {
    unique_key: "image-url-test",
    title: "Görselli fırsat",
    summary: null,
    category: "Ulusal Destek ve Fonlar" as const,
    source_name: "Test Kaynağı",
    source_url: "https://example.com/call",
    application_url: null,
    published_at: null,
    deadline_at: null,
    fetched_at: "2026-07-03T08:00:00.000Z",
    location: null,
    is_featured: false,
  };

  assert.equal(
    normalizeOpportunity({
      ...baseOpportunity,
      image_url: "https://cdn.example.com/image.jpg",
    }).image_url,
    "https://cdn.example.com/image.jpg",
  );
  assert.equal(
    normalizeOpportunity({
      ...baseOpportunity,
      image_url: "javascript:alert(1)",
    }).image_url,
    null,
  );
});

test("investment signals upgrade news items to the investment category", () => {
  const baseOpportunity = {
    unique_key: "investment-category-test",
    summary: null,
    category: "Haber ve Sosyal Medya Akışı" as const,
    source_name: "Webrazzi",
    source_url: "https://example.com/news",
    application_url: null,
    published_at: null,
    deadline_at: null,
    fetched_at: "2026-07-03T08:00:00.000Z",
    location: null,
    is_featured: false,
  };

  assert.equal(
    normalizeOpportunity({
      ...baseOpportunity,
      title: "Türk girişimi 2 milyon dolar tohum yatırım aldı",
    }).category,
    "Yatırım ve Sermaye Ağları",
  );
  assert.equal(
    normalizeOpportunity({
      ...baseOpportunity,
      unique_key: "investment-category-test-2",
      title: "Startup raises $15M Series A led by venture capital investors",
    }).category,
    "Yatırım ve Sermaye Ağları",
  );
  assert.equal(
    normalizeOpportunity({
      ...baseOpportunity,
      unique_key: "investment-category-test-3",
      title: "Webrazzi: yerli fintech girişimi yatırım turunu tamamladı",
    }).category,
    "Yatırım ve Sermaye Ağları",
  );
});

test("ecosystem source headlines are classified as investment, program or official support", () => {
  const base = {
    summary: "Teknoloji girişimleri için güncel ekosistem duyurusu.",
    category: "Haber ve Sosyal Medya Akışı" as const,
    source_url: "https://example.com/news",
    application_url: null,
    published_at: "2026-07-04T08:00:00.000Z",
    deadline_at: null,
    fetched_at: "2026-07-04T09:00:00.000Z",
    location: "Türkiye",
    is_featured: false,
  };

  for (const [source_name, title] of [
    ["Webrazzi", "Yerli yapay zekâ girişimi yatırım aldı"],
    ["egirişim", "Fintech girişimi yatırım turunu tamamladı"],
    ["StartupCentrum", "SaaS startup raises $8M seed round"],
    ["TechCrunch", "AI startup raises $20M Series A"],
    ["Crunchbase News", "Startup raises $25M funding round"],
    ["EU-Startups", "European startup raises €12M seed round"],
  ]) {
    assert.equal(
      normalizeOpportunity({
        ...base,
        unique_key: `source-category-${source_name}`,
        source_name,
        title,
      }).category,
      "Yatırım ve Sermaye Ağları",
      source_name,
    );
  }

  assert.equal(
    normalizeOpportunity({
      ...base,
      unique_key: "program-category",
      source_name: "Swipeline",
      title: "Yeni hızlandırıcı program başvuruları başladı",
    }).category,
    "Etkinlik ve Programlar",
  );
  assert.equal(
    normalizeOpportunity({
      ...base,
      unique_key: "tubitak-category",
      source_name: "TÜBİTAK Duyuruları",
      title: "Teknoloji girişimleri için yeni çağrı",
    }).category,
    "Ulusal Destek ve Fonlar",
  );
  assert.equal(
    normalizeOpportunity({
      ...base,
      unique_key: "kosgeb-category",
      source_name: "KOSGEB Duyuruları",
      title: "KOBİ dijital dönüşüm destek duyurusu",
    }).category,
    "Ulusal Destek ve Fonlar",
  );
});
