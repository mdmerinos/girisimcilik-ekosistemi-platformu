import assert from "node:assert/strict";
import test from "node:test";

import {
  HttpError,
  RequestTimeoutError,
} from "@/lib/ingestion/fetchWithRetry";
import { isEntrepreneurshipRelevant } from "@/lib/ingestion/isEntrepreneurshipRelevant";
import { mapWithConcurrency } from "@/lib/ingestion/mapWithConcurrency";
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
  assert.deepEqual(
    classifySourceError(new HttpError(403, "https://example.com")),
    {
      status: "fragile",
      message: "Kaynak güvenlik politikası nedeniyle bot isteklerini engelliyor.",
    },
  );
  assert.deepEqual(
    classifySourceError(new EmptySourceError("https://example.com")),
    {
      status: "empty",
      message:
        "Kaynak sayfa yapısı değişmiş olabilir veya şu an uygun kayıt bulunamadı.",
    },
  );
  assert.deepEqual(classifySourceError(new TypeError("fetch failed")), {
    status: "fragile",
    message: "Kaynağa geçici olarak ulaşılamadı.",
  });
  assert.deepEqual(
    classifySourceError(new RequestTimeoutError("https://example.com")),
    {
      status: "fragile",
      message: "Kaynak zamanında yanıt vermedi.",
    },
  );
  assert.deepEqual(
    classifySourceError(new HttpError(404, "https://example.com")),
    {
      status: "skipped",
      message: "Kaynak sayfa şu anda bulunamadı veya taşınmış olabilir.",
    },
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
