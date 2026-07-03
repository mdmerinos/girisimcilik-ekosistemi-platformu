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