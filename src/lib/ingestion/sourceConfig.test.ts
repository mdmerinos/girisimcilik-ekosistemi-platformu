import assert from "node:assert/strict";
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
      lastSuccessfulIngestionAt: "2026-07-03T06:00:00.000Z",
      lastAttemptAt: "2026-07-03T06:00:00.000Z",
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
  assert.equal(stats.addedToday, 4);
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

test("worker payload requires a non-empty items array", () => {
  assert.equal(workerEnvelopeSchema.safeParse({}).success, false);
  assert.equal(workerEnvelopeSchema.safeParse({ items: [] }).success, false);
});

test("worker records are normalized, filtered and deduplicated before upsert", async () => {
  const upserted: unknown[] = [];
  const validItem = {
    title: "NATO DIANA startup accelerator challenge call",
    summary: "Innovators can apply to the public accelerator programme.",
    category: "Uluslararası Fonlar",
    source_name: "NATO DIANA",
    source_url: "https://www.diana.nato.int/connect/challenge-call.html",
    application_url:
      "https://www.diana.nato.int/connect/challenge-call.html",
    published_at: "2026-07-03T00:00:00.000Z",
    location: "Global",
  };
  const result = await processWorkerOpportunities(
    [
      validItem,
      validItem,
      { title: "Eksik URL" },
      {
        ...validItem,
        title: "Genel kurum duyurusu",
        summary: null,
        source_url: "https://www.diana.nato.int/connect/general-notice.html",
        application_url:
          "https://www.diana.nato.int/connect/general-notice.html",
      },
    ],
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
