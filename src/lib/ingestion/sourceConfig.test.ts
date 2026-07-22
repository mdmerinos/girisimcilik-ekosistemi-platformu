import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  HttpError,
  RequestTimeoutError,
} from "@/lib/ingestion/fetchWithRetry";
import {
  classifyInvestmentCategory,
  INVESTMENT_CATEGORY,
} from "@/lib/ingestion/investmentClassification";
import { isEntrepreneurshipRelevant } from "@/lib/ingestion/isEntrepreneurshipRelevant";
import { buildSourceDiagnostics } from "@/lib/ingestion/sourceDiagnostics";
import { mapWithConcurrency } from "@/lib/ingestion/mapWithConcurrency";
import {
  isWorkerAuthorized,
  processWorkerOpportunities,
  workerEnvelopeSchema,
} from "@/lib/ingestion/workerOpportunities";
import {
  getCountryGroup,
  matchesCountryGroup,
} from "@/lib/opportunities/countryGroup";
import { getOpportunityDateDisplay } from "@/lib/opportunities/opportunityDate";
import { calculateOpportunityStats } from "@/lib/opportunities/opportunityStats";
import { decideRefreshIfStale } from "@/lib/ingestion/refreshDecision";
import { toPublicIngestionResult } from "@/lib/ingestion/publicIngestionResult";
import { sourceConfigs } from "@/lib/ingestion/sourceConfig";
import {
  classifySourceError,
  EmptySourceError,
  SOURCE_STATUSES,
  SOURCE_STATUS_PRESENTATION,
} from "@/lib/ingestion/sourceStatus";
import { OPPORTUNITY_CATEGORIES } from "@/types/opportunity";

test("every ingestion source exposes operational metadata", () => {
  assert.ok(sourceConfigs.length >= 40);

  for (const source of sourceConfigs) {
    assert.equal(typeof source.enabled, "boolean");
    assert.equal(typeof source.fragile, "boolean");
    assert.equal(typeof source.requiresApiKey, "boolean");
    assert.ok(OPPORTUNITY_CATEGORIES.includes(source.category));
    assert.ok(source.opportunityType.length > 0);
    assert.ok(source.country.length > 0);
    assert.ok(source.notes.length > 0);
  }
});

test("API-key sources declare their environment variable", () => {
  const keyedSources = sourceConfigs.filter((source) => source.requiresApiKey);
  assert.ok(keyedSources.length > 0);
  assert.ok(keyedSources.every((source) => source.requiredEnv));
});

test("source errors map to operational statuses and friendly messages", () => {
  assert.equal(
    classifySourceError(new HttpError(403, "https://example.com")).status,
    "fragile",
  );
  assert.equal(
    classifySourceError(new EmptySourceError("https://example.com")).status,
    "empty",
  );
  assert.equal(classifySourceError(new TypeError("fetch failed")).status, "fragile");
  assert.equal(
    classifySourceError(new RequestTimeoutError("https://example.com")).status,
    "fragile",
  );
  assert.equal(
    classifySourceError(new HttpError(404, "https://example.com")).status,
    "skipped",
  );
});

test("every source status has an admin badge mapping", () => {
  for (const status of SOURCE_STATUSES) {
    assert.equal(SOURCE_STATUS_PRESENTATION[status].label, status);
    assert.ok(SOURCE_STATUS_PRESENTATION[status].className.includes("bg-"));
    assert.ok(SOURCE_STATUS_PRESENTATION[status].className.includes("text-"));
  }
});

test("a fragile source does not stop another ingestion source", async () => {
  const [blockedResult, healthyResult] = await mapWithConcurrency(
    ["blocked-source", "healthy-source"],
    2,
    async (source) => {
      if (source === "blocked-source") {
        throw new HttpError(403, "https://example.com/blocked");
      }
      return { source, status: "success" };
    },
    async (source, error) => ({
      source,
      status: classifySourceError(error).status,
    }),
  );

  assert.equal(blockedResult.status, "fragile");
  assert.equal(healthyResult.status, "success");
});

test("entrepreneurship relevance accepts ecosystem opportunities", () => {
  for (const title of [
    "KOBİ Dijital Dönüşüm Destek Programı",
    "Startup funding round",
    "Accelerator application deadline",
    "TÜBİTAK Ar-Ge ve inovasyon destek çağrısı",
    "Technology transfer and commercialization programme",
    "Angel investment network backs deep tech founders",
    "İnovasyon ekosistemi ve teknoloji ticarileştirme programı",
  ]) {
    assert.equal(
      isEntrepreneurshipRelevant({
        title,
        category: "Ulusal Destek ve Fonlar",
        sourceName: "Test Kaynağı",
        type: "funding",
      }).relevant,
      true,
      title,
    );
  }
});

test("entrepreneurship relevance rejects unrelated announcements", () => {
  for (const title of [
    "Personel alımı duyurusu",
    "Spor etkinliği duyurusu",
    "Teknik bakım çalışması",
    "Genel kurum duyurusu",
    "Kültür sanat festivali programı",
    "Diplomatik heyetler arası genel siyasi görüşme",
  ]) {
    const result = isEntrepreneurshipRelevant({
      title,
      category: "Haber ve Sosyal Medya Akışı",
      sourceName: "Test Kaynağı",
      type: "news",
    });

    assert.equal(result.relevant, false, title);
    assert.equal(
      result.reason,
      "Girişimcilik kapsamı dışında olduğu için atlandı.",
    );
  }
});

test("investment filter rejects noisy funding and VC content", () => {
  for (const title of [
    "Trump administration to phase out HIV funding",
    "Ocean sensors will go dark under funding cuts",
    "Implementing a Funding Rate Arbitrage Strategy with Backtesting",
    "Proton is funding the French far right on YouTube",
    "Research grant funding peer review",
    "SF Giants sell piece of team to venture capital firm",
    "Memecoin Venture Capital",
  ]) {
    assert.notEqual(
      classifyInvestmentCategory({
        title,
        category: "Yatırım ve Sermaye Ağları",
        sourceName: "Hacker News",
        sourceId: "hacker-news-funding",
        type: "investment",
      }),
      INVESTMENT_CATEGORY,
      title,
    );
    assert.equal(
      isEntrepreneurshipRelevant({
        title,
        category: "Yatırım ve Sermaye Ağları",
        sourceName: "Hacker News",
        sourceId: "hacker-news-funding",
        type: "investment",
      }).relevant,
      false,
      title,
    );
  }
});

test("investment filter accepts startup investment and VC ecosystem content", () => {
  for (const title of [
    "AI startup raises $15M Series A led by venture capital investors",
    "Yerli fintech girişimi yatırım turunu tamamladı",
    "VC fund backs early-stage founders",
    "Substack raises $100M from Andreessen Horowitz",
    "Amazon Alexa Fund backs AI startups",
    "Sam Altman-backed Coco Robotics raises $80M",
  ]) {
    assert.equal(
      classifyInvestmentCategory({
        title,
        category: "Haber ve Sosyal Medya Akışı",
        sourceName: "Test Kaynağı",
        sourceId: "techcrunch-funding-rss",
        type: "investment",
      }),
      INVESTMENT_CATEGORY,
      title,
    );
    assert.equal(
      isEntrepreneurshipRelevant({
        title,
        category: "Haber ve Sosyal Medya Akışı",
        sourceName: "Test Kaynağı",
        sourceId: "techcrunch-funding-rss",
        type: "investment",
      }).relevant,
      true,
      title,
    );
  }
});

test("refresh-if-stale decision handles freshness and duplicate protection", () => {
  const now = new Date("2026-07-03T12:00:00.000Z");

  assert.equal(
    decideRefreshIfStale({
      now,
      lastSuccessfulIngestionAt: "2026-07-03T11:30:00.000Z",
      lastAttemptAt: "2026-07-03T11:30:00.000Z",
      isRunning: false,
    }).status,
    "fresh",
  );
  assert.equal(
    decideRefreshIfStale({
      now,
      lastSuccessfulIngestionAt: "2026-07-02T20:00:00.000Z",
      lastAttemptAt: "2026-07-02T20:00:00.000Z",
      isRunning: false,
    }).status,
    "started",
  );
  assert.equal(
    decideRefreshIfStale({
      now,
      lastSuccessfulIngestionAt: "2026-07-02T20:00:00.000Z",
      lastAttemptAt: "2026-07-03T11:45:00.000Z",
      isRunning: false,
    }).status,
    "cooldown",
  );
  assert.equal(
    decideRefreshIfStale({
      now,
      lastSuccessfulIngestionAt: "2026-07-02T20:00:00.000Z",
      lastAttemptAt: "2026-07-03T11:45:00.000Z",
      isRunning: true,
    }).status,
    "already_running",
  );
});

test("refresh-if-stale response does not expose secrets", () => {
  const result = decideRefreshIfStale({
    now: new Date("2026-07-03T12:00:00.000Z"),
    lastSuccessfulIngestionAt: null,
    lastAttemptAt: null,
    isRunning: false,
  });

  assert.deepEqual(Object.keys(result).sort(), [
    "lastSuccessfulIngestionAt",
    "message",
    "ok",
    "status",
  ]);
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
});

test("stage 3C ecosystem source inventory is configured with honest access modes", () => {
  const expectedIds = [
    "webrazzi-rss",
    "egirisim-rss",
    "startupcentrum-news",
    "swipeline-rss",
    "tubitak",
    "kosgeb-announcements",
    "itu-cekirdek",
    "itu-ari-teknokent",
    "odtu-teknokent",
    "analiz-gazetesi",
    "techcrunch-rss",
    "crunchbase-news",
    "eu-startups-rss",
    "sifted-latest",
    "reuters-technology",
    "the-information",
    "nato-diana",
  ];
  const byId = new Map(sourceConfigs.map((source) => [source.id, source]));

  for (const id of expectedIds) assert.ok(byId.has(id), id);
  for (const id of [
    "crunchbase-news",
    "sifted-latest",
    "reuters-technology",
    "the-information",
  ]) {
    assert.equal(byId.get(id)?.fragile, true, id);
  }
  for (const id of [
    "webrazzi-rss",
    "egirisim-rss",
    "startupcentrum-news",
    "swipeline-rss",
    "eu-startups-rss",
  ]) {
    assert.equal(byId.get(id)?.kind, "rss", id);
  }
});

test("Hacker News accepts strong startup funding signals and rejects funding alone", () => {
  assert.equal(
    classifyInvestmentCategory({
      title: "Funding for a municipal road repair study",
      sourceName: "Hacker News",
      sourceId: "hacker-news-funding",
      type: "investment",
    }),
    null,
  );
  assert.equal(
    classifyInvestmentCategory({
      title: "AI startup raises $15M in seed funding",
      sourceName: "Hacker News",
      sourceId: "hacker-news-funding",
      type: "investment",
    }),
    INVESTMENT_CATEGORY,
  );
});

test("source diagnostics report filters, duplicates and upsert results", () => {
  const item = {
    unique_key: "diagnostic-item",
    title: "AI startup raises $5M seed round",
    summary: "Technology startup funding news.",
    category: "Yatırım ve Sermaye Ağları" as const,
    source_name: "TechCrunch",
    source_url: "https://techcrunch.com/2026/07/05/startup-round/",
    application_url: "https://techcrunch.com/2026/07/05/startup-round/",
    image_url: null,
    published_at: "2026-07-05T08:00:00.000Z",
    deadline_at: null,
    fetched_at: "2026-07-05T09:00:00.000Z",
    location: "Global",
    is_featured: false,
  };
  const diagnostics = buildSourceDiagnostics({
    fetchUrls: ["https://techcrunch.com/feed/"],
    httpStatus: 200,
    collected: [item, item],
    accepted: [item],
    filtered: {
      archive: 0,
      old: 0,
      relevance: 0,
      invalid: 0,
      duplicate: 1,
    },
    inserted: 1,
    updated: 0,
    now: new Date("2026-07-05T12:00:00.000Z"),
  });

  assert.equal(diagnostics.raw, 2);
  assert.equal(diagnostics.accepted, 1);
  assert.equal(diagnostics.filtered.duplicate, 1);
  assert.equal(diagnostics.upserted, 1);
  assert.equal(diagnostics.freshness, "last24Hours");
});

test("manual refresh source set includes the new ecosystem news sources", () => {
  for (const id of [
    "webrazzi-rss",
    "egirisim-rss",
    "startupcentrum-news",
    "techcrunch-rss",
    "techcrunch-startups-rss",
    "techcrunch-funding-rss",
    "eu-startups-rss",
    "tubitak",
    "tubitak-bigg",
    "kosgeb-announcements",
    "kosgeb-supports",
    "itu-ari-teknokent",
    "odtu-teknokent",
    "nato-diana",
  ]) {
    assert.equal(
      sourceConfigs.find((source) => source.id === id)?.enabled,
      true,
      id,
    );
  }
});

test("stage 4 technopark source inventory exposes group and access metadata", () => {
  const byId = new Map(sourceConfigs.map((source) => [source.id, source]));
  const expectedTechnoparkIds = [
    "innopark-events",
    "innopark-incubation-programs",
    "innopark-tto-supports",
    "innopark-info-program",
    "itu-ari-teknokent",
    "odtu-teknokent",
    "yildiz-teknopark",
    "teknopark-istanbul",
    "bilisim-vadisi",
    "bilkent-cyberpark",
    "hacettepe-teknokent",
    "gazi-teknopark",
    "ankara-universitesi-teknokent",
    "antalya-teknokent",
    "ege-teknopark",
    "depark",
    "erciyes-teknopark",
    "ulutek-teknopark",
    "marmara-teknokent",
    "konya-teknokent",
    "mersin-teknopark",
    "teknopark-izmir",
    "trabzon-teknokent",
    "entertech-istanbul-teknokent",
    "ostim-teknopark",
    "teknopark-ankara",
    "ata-teknokent",
    "bursa-teknopark",
    "samsun-teknopark",
    "van-teknokent",
    "tgbd-member-announcements",
  ];

  for (const id of expectedTechnoparkIds) {
    const source = byId.get(id);
    assert.ok(source, id);
    assert.equal(source?.enabled, true, id);
    assert.equal(source?.sourceGroup, "technopark", id);
    assert.ok(["html", "fragile"].includes(source?.accessMode ?? ""), id);
  }

  assert.equal(byId.get("innopark-events")?.fragile, false);
  assert.equal(byId.get("innopark-info-program")?.accessMode, "fragile");
  assert.equal(byId.get("teknopark-istanbul")?.accessMode, "fragile");
});

test("cron and manual ingestion use the same enabled source inventory", () => {
  const enabledIds = sourceConfigs
    .filter((source) => source.enabled)
    .map((source) => source.id);

  for (const id of [
    "webrazzi-rss",
    "egirisim-rss",
    "startupcentrum-news",
    "techcrunch-rss",
    "eu-startups-rss",
    "tubitak",
    "kosgeb-announcements",
    "odtu-teknokent",
    "nato-diana",
    "itu-ari-teknokent",
  ]) {
    assert.ok(enabledIds.includes(id), id);
  }
});

test("force refresh bypasses freshness but preserves the global cooldown", () => {
  const now = new Date("2026-07-03T12:00:00.000Z");

  assert.equal(
    decideRefreshIfStale({
      now,
      lastSuccessfulIngestionAt: "2026-07-03T11:00:00.000Z",
      lastAttemptAt: "2026-07-03T10:00:00.000Z",
      isRunning: false,
      force: true,
    }).status,
    "started",
  );
  assert.equal(
    decideRefreshIfStale({
      now,
      lastSuccessfulIngestionAt: "2026-07-03T11:00:00.000Z",
      lastAttemptAt: "2026-07-03T11:45:00.000Z",
      isRunning: false,
      force: true,
    }).status,
    "cooldown",
  );
});

test("public refresh result exposes source counts without secrets", () => {
  const result = toPublicIngestionResult({
    runId: "run-1",
    status: "partial",
    sources: [
      {
        sourceId: "odtu-teknokent",
        sourceName: "ODTÜ Teknokent",
        kind: "html",
        fragile: true,
        requiresApiKey: false,
        status: "success",
        collected: 12,
        inserted: 2,
        updated: 10,
        skipped: 0,
        durationMs: 100,
        error: null,
      },
      {
        sourceId: "nato-diana",
        sourceName: "NATO DIANA",
        kind: "html",
        fragile: true,
        requiresApiKey: false,
        status: "fragile",
        collected: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        durationMs: 100,
        error: "Bot koruması",
      },
    ],
    totals: {
      collected: 12,
      inserted: 2,
      updated: 10,
      skipped: 0,
      errors: 0,
      statuses: {
        success: 1,
        partial: 0,
        empty: 0,
        skipped: 0,
        fragile: 1,
        error: 0,
      },
    },
  });

  assert.equal(result.totals.successfulSources, 1);
  assert.equal(result.totals.issueSources, 1);
  assert.equal(result.sources[1].workerRequired, true);
  assert.equal(result.sources[0].skipped, 0);
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
});

test("country groups recognize Türkiye and global location variants", () => {
  for (const location of ["Türkiye", "Turkey", "TR", "Türkiye / Global"]) {
    assert.equal(getCountryGroup(location), "turkiye");
    assert.equal(matchesCountryGroup(location, "turkiye"), true);
  }
  for (const location of ["Global", "Uluslararası", "Avrupa", "ABD", "EU", "USA"]) {
    assert.equal(getCountryGroup(location), "global");
    assert.equal(matchesCountryGroup(location, "global"), true);
  }
  assert.equal(matchesCountryGroup("Türkiye", "all"), true);
  assert.equal(getCountryGroup("Online"), null);
});

test("public opportunity stats use stored dates and categories", () => {
  const now = new Date("2026-07-03T12:00:00.000Z");
  const base = {
    id: "1",
    unique_key: "test:1",
    title: "Test",
    summary: null,
    source_name: "Test",
    source_url: "https://example.com/detail",
    application_url: null,
    image_url: null,
    published_at: "2026-07-02T09:00:00.000Z",
    deadline_at: null,
    fetched_at: "2026-07-03T09:00:00.000Z",
    location: "Türkiye",
    is_featured: false,
    created_at: "2026-07-03T09:00:00.000Z",
    updated_at: "2026-07-03T09:00:00.000Z",
  };
  const stats = calculateOpportunityStats(
    [
      { ...base, category: "Yatırım ve Sermaye Ağları" },
      {
        ...base,
        id: "2",
        unique_key: "test:2",
        category: "Etkinlik ve Programlar",
        deadline_at: "2026-07-10T09:00:00.000Z",
      },
      {
        ...base,
        id: "3",
        unique_key: "test:3",
        category: "Ulusal Destek ve Fonlar",
      },
      {
        ...base,
        id: "4",
        unique_key: "test:4",
        category: "Uluslararası Fonlar",
      },
    ],
    now,
    "2026-07-03T10:00:00.000Z",
  );

  assert.equal(stats.total, 4);
  assert.equal(stats.totalCount, 4);
  assert.equal(stats.addedToday, 4);
  assert.equal(stats.todayIngestedCount, 4);
  assert.equal(stats.todayPublishedCount, 0);
  assert.equal(stats.nearCount, 4);
  assert.equal(stats.activeCount, 4);
  assert.equal(stats.farFutureCount, 0);
  assert.equal(stats.expiredCount, 0);
  assert.equal(stats.noDateCount, 0);
  assert.equal(stats.investmentNewsLast7Days, 1);
  assert.equal(stats.upcomingEvents, 1);
  assert.equal(stats.nationalSupports, 1);
  assert.equal(stats.internationalFunds, 1);
});

test("opportunity dates clearly distinguish deadline and publication", () => {
  assert.deepEqual(
    getOpportunityDateDisplay({
      deadline_at: "2027-09-15T00:00:00.000Z",
      published_at: "2026-07-03T00:00:00.000Z",
    }),
    {
      label: "Son başvuru",
      value: "2027-09-15T00:00:00.000Z",
    },
  );
  assert.deepEqual(
    getOpportunityDateDisplay({
      deadline_at: null,
      published_at: "2026-07-03T00:00:00.000Z",
    }),
    {
      label: "Yayın",
      value: "2026-07-03T00:00:00.000Z",
    },
  );
  assert.equal(
    getOpportunityDateDisplay({ deadline_at: null, published_at: null }),
    null,
  );
});

test("today ingestion and publication counts never substitute for each other", () => {
  const now = new Date("2026-07-03T12:00:00.000Z");
  const base = {
    id: "today-semantics",
    unique_key: "today-semantics",
    title: "Tarih semantiği",
    summary: null,
    category: "Ulusal Destek ve Fonlar" as const,
    source_name: "Test",
    source_url: "https://example.com/tarih",
    application_url: null,
    image_url: null,
    published_at: "2026-07-01T09:00:00.000Z",
    deadline_at: null,
    fetched_at: "2026-07-03T09:00:00.000Z",
    location: "Türkiye",
    is_featured: false,
    created_at: "2026-07-03T09:00:00.000Z",
    updated_at: "2026-07-03T09:00:00.000Z",
  };

  const stats = calculateOpportunityStats([base], now);
  assert.equal(stats.todayIngestedCount, 1);
  assert.equal(stats.todayPublishedCount, 0);
});

test("worker authorization rejects wrong secrets and accepts configured bearer", () => {
  assert.equal(
    isWorkerAuthorized("Bearer wrong", ["expected", undefined]),
    false,
  );
  assert.equal(
    isWorkerAuthorized("Bearer expected", ["expected", undefined]),
    true,
  );
});

test("worker payload requires an allowed sourceSlug and accepts zero-item reports", () => {
  assert.equal(workerEnvelopeSchema.safeParse({}).success, false);
  assert.equal(
    workerEnvelopeSchema.safeParse({
      sourceSlug: "nato-diana",
      sourceName: "NATO DIANA",
      items: [],
    }).success,
    true,
  );
  assert.equal(
    workerEnvelopeSchema.safeParse({
      sourceSlug: "odtu-teknokent",
      sourceName: "ODTÜ Teknokent",
      items: [],
    }).success,
    true,
  );
});

test("worker records are normalized, filtered and deduplicated before upsert", async () => {
  const upserted: unknown[] = [];
  const validItem = {
    title: "NATO DIANA startup accelerator challenge call",
    summary: "Innovators can apply to the public accelerator programme.",
    category: "Uluslararası Fonlar",
    sourceUrl: "https://www.diana.nato.int/connect/challenge-call.html",
    applicationUrl:
      "https://www.diana.nato.int/connect/challenge-call.html",
    publishedAt: "2026-07-03T00:00:00.000Z",
    location: "Global",
  };
  const result = await processWorkerOpportunities(
    {
      sourceSlug: "nato-diana",
      sourceName: "NATO DIANA",
      items: [
      validItem,
      validItem,
      { title: "Eksik URL" },
      {
        ...validItem,
        title: "Genel kurum duyurusu",
        summary: null,
        sourceUrl: "https://www.diana.nato.int/connect/general-notice.html",
        applicationUrl:
          "https://www.diana.nato.int/connect/general-notice.html",
      },
      ],
    },
    {
      now: () => new Date("2026-07-03T12:00:00.000Z"),
      upsert: async (items) => {
        upserted.push(...items);
        return { inserted: items.length, updated: 0 };
      },
    },
  );

  assert.equal(result.received, 4);
  assert.equal(result.accepted, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.rejected, 1);
  assert.equal(result.skipped, 1);
  assert.equal(upserted.length, 1);
});

test("ODTÜ worker uses canonical identity and never invents dates", async () => {
  const upserted: unknown[] = [];
  const result = await processWorkerOpportunities(
    {
      sourceSlug: "odtu-teknokent",
      sourceName: "ODTÜ Teknokent",
      items: [
        {
          title: "ODTÜ Teknokent teknoloji girişimcilik programı",
          summary: "Teknoloji girişimleri için kuluçka ve mentorluk programı.",
          category: "Etkinlik ve Programlar",
          sourceUrl:
            "https://www.odtuteknokent.com.tr/tr/duyuru/girisimcilik-programi",
          applicationUrl:
            "https://portal.odtuteknokent.com.tr/basvuru/girisimcilik",
          publishedAt: null,
          deadlineAt: null,
          location: "Türkiye",
          countryGroup: "turkiye",
        },
      ],
    },
    {
      now: () => new Date("2026-07-04T12:00:00.000Z"),
      upsert: async (items) => {
        upserted.push(...items);
        return { inserted: items.length, updated: 0 };
      },
    },
  );

  assert.equal(result.accepted, 1);
  assert.equal(result.sourceSlug, "odtu-teknokent");
  assert.equal(
    (upserted[0] as { source_name: string }).source_name,
    "ODTÜ Teknokent",
  );
  assert.equal((upserted[0] as { published_at: null }).published_at, null);
  assert.equal((upserted[0] as { deadline_at: null }).deadline_at, null);
});

test("worker source ownership rejects a URL from another host", async () => {
  const result = await processWorkerOpportunities(
    {
      sourceSlug: "nato-diana",
      sourceName: "NATO DIANA",
      items: [
        {
          title: "NATO DIANA startup challenge",
          summary: "Deep tech accelerator programme.",
          category: "Uluslararası Fonlar",
          sourceUrl: "https://example.com/spoofed",
        },
      ],
    },
    {
      upsert: async () => ({ inserted: 0, updated: 0 }),
    },
  );

  assert.equal(result.accepted, 0);
  assert.equal(result.rejected, 1);
});

test("browser worker workflows exist without Next.js browser dependencies", () => {
  for (const path of [
    ".github/workflows/nato-diana-worker.yml",
    ".github/workflows/odtu-teknokent-worker.yml",
    "workers/nato-diana/nato_diana_worker.py",
    "workers/odtu-teknokent/odtu_teknokent_worker.py",
  ]) {
    assert.equal(existsSync(path), true, path);
  }

  const packageJson = readFileSync("package.json", "utf8").toLocaleLowerCase();
  for (const dependency of [
    "selenium",
    "playwright",
    "puppeteer",
    "chromedriver",
  ]) {
    assert.equal(packageJson.includes(`"${dependency}"`), false, dependency);
  }
});
