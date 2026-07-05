import assert from "node:assert/strict";
import test from "node:test";

import {
  getOpportunityStatus,
  matchesOpportunitySearch,
  matchesStatFilter,
  matchesTodayFilter,
  matchesTimeRange,
  normalizeSearchText,
  sortOpportunities,
} from "@/lib/opportunities/opportunityFilters";
import { matchesOpportunitySource } from "@/lib/opportunities/opportunitySource";
import {
  hasArchiveSignal,
  shouldKeepForIngestion,
} from "@/lib/opportunities/opportunityFreshness";
import {
  filterOpportunityRows,
  resolveCategoryFilter,
  resolveTodayFilter,
  type OpportunityQueryFilterOptions,
} from "@/lib/opportunities/opportunityQueryFilters";
import { calculateOpportunityStats } from "@/lib/opportunities/opportunityStats";
import { selectTickerItems } from "@/lib/opportunities/opportunityTicker";
import { formatDateTime } from "@/lib/utils/formatDateTime";
import type { Opportunity } from "@/types/opportunity";

const now = new Date("2026-07-04T12:00:00.000Z");

function opportunity(
  overrides: Partial<Opportunity> & Pick<Opportunity, "unique_key">,
): Opportunity {
  return {
    id: overrides.unique_key,
    title: "Girişim fırsatı",
    summary: null,
    category: "Etkinlik ve Programlar",
    source_name: "Test Kaynağı",
    source_url: "https://example.com/firsat",
    application_url: null,
    image_url: null,
    published_at: null,
    deadline_at: null,
    fetched_at: "2026-07-04T10:00:00.000Z",
    location: "Türkiye",
    is_featured: false,
    created_at: "2026-07-04T10:00:00.000Z",
    updated_at: "2026-07-04T10:00:00.000Z",
    ...overrides,
  };
}

test("Turkish search normalization removes diacritics and punctuation", () => {
  assert.equal(
    normalizeSearchText("  TÜBİTAK, ODTÜ; yatırım / girişim!  "),
    "tubitak odtu yatirim girisim",
  );
});

test("search covers all public opportunity fields", () => {
  const item = opportunity({
    unique_key: "search",
    title: "ODTÜ çağrısı",
    summary: "Yatırım başvurusu",
    source_name: "TÜBİTAK",
    category: "Ulusal Destek ve Fonlar",
    location: "Türkiye",
    source_url: "https://example.com/horizon",
    application_url: "https://apply.example.com/sbir",
  });

  for (const query of [
    "odtu",
    "cagri",
    "yatirim",
    "basvuru",
    "tubitak",
    "ulusal destek",
    "turkiye",
    "horizon",
    "sbir",
  ]) {
    assert.equal(matchesOpportunitySearch(item, query), true, query);
  }
});

test("near, active and all ranges preserve their date semantics", () => {
  const near = opportunity({
    unique_key: "near",
    deadline_at: "2026-10-01T00:00:00.000Z",
  });
  const far = opportunity({
    unique_key: "far",
    deadline_at: "2027-09-15T00:00:00.000Z",
  });
  const expired = opportunity({
    unique_key: "expired",
    deadline_at: "2026-06-01T00:00:00.000Z",
  });
  const recent = opportunity({
    unique_key: "recent",
    published_at: "2026-06-20T00:00:00.000Z",
  });
  const noDate = opportunity({ unique_key: "no-date" });

  assert.equal(matchesTimeRange(near, "near", now), true);
  assert.equal(matchesTimeRange(far, "near", now), false);
  assert.equal(matchesTimeRange(far, "active", now), true);
  assert.equal(matchesTimeRange(expired, "near", now), false);
  assert.equal(matchesTimeRange(expired, "active", now), false);
  assert.equal(matchesTimeRange(recent, "near", now), true);
  assert.equal(matchesTimeRange(noDate, "near", now), false);
  assert.equal(matchesTimeRange(noDate, "all", now), true);
});

test("old KOSGEB press clippings stay out of near and active views", () => {
  const archive = opportunity({
    unique_key: "kosgeb-archive",
    title: "KOBİ’lere 1 milyon TL dijitalleşme desteği",
    summary: "Türkiye Gazetesi basın kupürü",
    source_name: "KOSGEB Duyuruları",
    source_url:
      "https://www.kosgeb.gov.tr/site/tr/genel/detay/1234/turkiye-gazetesi",
    published_at: "2020-07-23T00:00:00.000Z",
    deadline_at: null,
  });

  assert.equal(hasArchiveSignal(archive), true);
  assert.equal(matchesTimeRange(archive, "near", now), false);
  assert.equal(matchesTimeRange(archive, "active", now), false);
  assert.equal(matchesTimeRange(archive, "all", now), true);
  assert.equal(getOpportunityStatus(archive, now), "Eski arşiv kaydı");
  assert.equal(shouldKeepForIngestion(archive, now), false);
});

test("undated Milliyet and Sabah press records stay out of default flows", () => {
  const milliyet = opportunity({
    unique_key: "kosgeb-milliyet",
    title: "Milliyet Gazetesi Maske Üreticisine Destek Verilecek devamı için",
    summary: null,
    source_name: "KOSGEB Duyuruları",
    source_url:
      "https://www.kosgeb.gov.tr/site/tr/genel/detay/1111/milliyet",
    published_at: null,
    deadline_at: null,
  });
  const sabah = opportunity({
    unique_key: "kosgeb-sabah",
    title:
      "Sabah Gazetesi 25 Şehirde 25 Teknoloji Geliştirme Merkezi devamı için",
    summary: null,
    source_name: "KOSGEB Duyuruları",
    source_url: "https://www.kosgeb.gov.tr/site/tr/genel/detay/2222/sabah",
    published_at: null,
    deadline_at: null,
  });

  assert.equal(hasArchiveSignal(milliyet), true);
  assert.equal(hasArchiveSignal(sabah), true);
  assert.equal(matchesTimeRange(milliyet, "near", now), false);
  assert.equal(matchesTimeRange(sabah, "active", now), false);
  assert.equal(matchesTimeRange(milliyet, "all", now), true);
  assert.equal(getOpportunityStatus(milliyet, now), "Eski arşiv kaydı");
});

test("current official calls and active deadlines are preserved", () => {
  const recentKosgeb = opportunity({
    unique_key: "kosgeb-current",
    title: "KOBİ Dijital Dönüşüm Destek Programı başvuruları",
    summary:
      "KOBİ'lerin güncel dijital dönüşüm başvurularına ilişkin resmi duyuru.",
    source_name: "KOSGEB Duyuruları",
    source_url:
      "https://www.kosgeb.gov.tr/site/tr/genel/detay/9999/guncel-duyuru",
    category: "Ulusal Destek ve Fonlar",
    published_at: "2026-07-01T00:00:00.000Z",
  });
  const recentTubitak = opportunity({
    unique_key: "tubitak-current",
    title: "TÜBİTAK 1507 güncel çağrısı",
    summary: "KOBİ Ar-Ge başlangıç destek programı için güncel çağrı duyurusu.",
    source_name: "TÜBİTAK",
    source_url: "https://tubitak.gov.tr/tr/duyuru/1507-guncel-cagri",
    category: "Ulusal Destek ve Fonlar",
    published_at: "2026-07-02T00:00:00.000Z",
  });
  const oldPublicationWithActiveDeadline = opportunity({
    unique_key: "active-deadline",
    title: "Resmî destek programı",
    source_name: "KOSGEB Destekleri",
    source_url:
      "https://www.kosgeb.gov.tr/site/tr/genel/destekdetay/9998/program",
    category: "Ulusal Destek ve Fonlar",
    published_at: "2020-07-23T00:00:00.000Z",
    deadline_at: "2026-09-01T00:00:00.000Z",
  });

  for (const item of [
    recentKosgeb,
    recentTubitak,
    oldPublicationWithActiveDeadline,
  ]) {
    assert.equal(matchesTimeRange(item, "near", now), true, item.unique_key);
    assert.equal(matchesTimeRange(item, "active", now), true, item.unique_key);
    assert.equal(shouldKeepForIngestion(item, now), true, item.unique_key);
  }
});

test("expired deadlines stay closed even when the record is archival", () => {
  const expiredArchive = opportunity({
    unique_key: "expired-archive",
    title: "Eski destek çağrısı",
    summary: "Arşiv sayfası",
    source_name: "KOSGEB Duyuruları",
    source_url: "https://www.kosgeb.gov.tr/arsiv/eski-cagri",
    published_at: "2020-07-23T00:00:00.000Z",
    deadline_at: "2021-01-01T00:00:00.000Z",
  });

  assert.equal(matchesTimeRange(expiredArchive, "active", now), false);
  assert.equal(getOpportunityStatus(expiredArchive, now), "Kapandı");
});

test("sorting prioritizes near deadlines, recent publications and far calls", () => {
  const rows = sortOpportunities(
    [
      opportunity({ unique_key: "no-date" }),
      opportunity({
        unique_key: "far",
        deadline_at: "2027-09-15T00:00:00.000Z",
      }),
      opportunity({
        unique_key: "published",
        published_at: "2026-07-03T00:00:00.000Z",
      }),
      opportunity({
        unique_key: "near-later",
        deadline_at: "2026-10-01T00:00:00.000Z",
      }),
      opportunity({
        unique_key: "near-sooner",
        deadline_at: "2026-08-01T00:00:00.000Z",
      }),
    ],
    now,
  );

  assert.deepEqual(
    rows.map((item) => item.unique_key),
    ["near-sooner", "near-later", "published", "far", "no-date"],
  );
});

test("status labels distinguish open, future, closed and unknown records", () => {
  assert.equal(
    getOpportunityStatus(
      opportunity({
        unique_key: "open",
        deadline_at: "2026-10-01T00:00:00.000Z",
      }),
      now,
    ),
    "Başvuruya açık",
  );
  assert.equal(
    getOpportunityStatus(
      opportunity({
        unique_key: "future",
        deadline_at: "2027-09-15T00:00:00.000Z",
      }),
      now,
    ),
    "Gelecek çağrı",
  );
  assert.equal(
    getOpportunityStatus(
      opportunity({
        unique_key: "closed",
        deadline_at: "2026-06-01T00:00:00.000Z",
      }),
      now,
    ),
    "Kapandı",
  );
  assert.equal(
    getOpportunityStatus(opportunity({ unique_key: "unknown" }), now),
    "Tarih belirsiz",
  );
});

test("today filters keep ingestion, publication and deadline semantics separate", () => {
  const item = opportunity({
    unique_key: "today",
    created_at: "2026-07-03T22:30:00.000Z",
    fetched_at: "2026-07-03T22:30:00.000Z",
    published_at: "2026-07-03T18:00:00.000Z",
    deadline_at: "2026-07-04T20:00:00.000Z",
  });
  const istanbulToday = new Date("2026-07-04T00:30:00.000Z");

  assert.equal(matchesTodayFilter(item, "ingested", istanbulToday), true);
  assert.equal(matchesTodayFilter(item, "published", istanbulToday), false);
  assert.equal(matchesTodayFilter(item, "deadline", istanbulToday), true);
});

test("today ingestion uses created_at but never fetched_at", () => {
  const fetchedToday = opportunity({
    unique_key: "fetched-only",
    created_at: "2026-07-01T10:00:00.000Z",
    fetched_at: "2026-07-04T10:00:00.000Z",
    published_at: null,
  });

  assert.equal(matchesTodayFilter(fetchedToday, "ingested", now), false);
  assert.equal(matchesTodayFilter(fetchedToday, "published", now), false);
});

test("an old record added today is ingested today but not published today", () => {
  const oldRecord = opportunity({
    unique_key: "old-added-today",
    source_name: "KOSGEB Duyuruları",
    source_url: "https://www.kosgeb.gov.tr/arsiv/eski-haber",
    published_at: "2020-07-23T00:00:00.000Z",
    created_at: "2026-07-04T10:00:00.000Z",
    fetched_at: "2026-07-04T10:00:00.000Z",
  });

  assert.equal(matchesTodayFilter(oldRecord, "ingested", now), true);
  assert.equal(matchesTodayFilter(oldRecord, "published", now), false);
});

test("stat filters distinguish far-future and undated records", () => {
  const future = opportunity({
    unique_key: "future-stat",
    deadline_at: "2027-09-15T00:00:00.000Z",
  });
  const near = opportunity({
    unique_key: "near-stat",
    deadline_at: "2026-10-01T00:00:00.000Z",
  });
  const noDate = opportunity({ unique_key: "no-date-stat" });

  assert.equal(matchesStatFilter(future, "future", now), true);
  assert.equal(matchesStatFilter(near, "future", now), false);
  assert.equal(matchesStatFilter(noDate, "noDate", now), true);
  assert.equal(matchesStatFilter(future, "noDate", now), false);
});

test("source filters recognize named sources and keep other records separate", () => {
  assert.equal(
    matchesOpportunitySource(
      opportunity({
        unique_key: "odtu",
        source_name: "ODTÜ Teknokent",
      }),
      "odtu-teknokent",
    ),
    true,
  );
  assert.equal(
    matchesOpportunitySource(
      opportunity({
        unique_key: "nato",
        source_name: "NATO DIANA",
      }),
      "nato-diana",
    ),
    true,
  );
  assert.equal(
    matchesOpportunitySource(
      opportunity({
        unique_key: "other",
        source_name: "TechCrunch",
      }),
      "other",
    ),
    true,
  );
});

test("date-time formatting always uses two digits and Istanbul time", () => {
  assert.equal(
    formatDateTime("2026-07-04T15:53:00.000Z"),
    "04.07.2026 18:53",
  );
});

const queryDefaults: OpportunityQueryFilterOptions = {
  countryGroup: "all",
  timeRange: "all",
  today: "all",
  statFilter: "all",
  source: "all",
};

test("stats card counts and list totals share every query filter", () => {
  const rows = [
    opportunity({
      unique_key: "published-today",
      title: "Tech accelerator call",
      source_name: "Grants.gov",
      category: "Uluslararası Fonlar",
      location: "Global",
      created_at: "2026-07-01T10:00:00.000Z",
      fetched_at: "2026-07-04T10:00:00.000Z",
      published_at: "2026-07-04T08:00:00.000Z",
      deadline_at: "2026-09-01T00:00:00.000Z",
    }),
    opportunity({
      unique_key: "ingested-today",
      title: "Startup grant programme",
      source_name: "Grants.gov",
      category: "Uluslararası Fonlar",
      location: "Global",
      created_at: "2026-07-04T09:00:00.000Z",
      fetched_at: "2026-07-04T09:00:00.000Z",
      published_at: null,
      deadline_at: "2026-11-01T00:00:00.000Z",
    }),
    opportunity({
      unique_key: "deadline-today",
      title: "NATO technology challenge",
      source_name: "NATO DIANA",
      category: "Uluslararası Fonlar",
      location: "Global",
      created_at: "2026-06-01T09:00:00.000Z",
      fetched_at: "2026-07-04T09:00:00.000Z",
      published_at: "2026-06-01T09:00:00.000Z",
      deadline_at: "2026-07-04T18:00:00.000Z",
    }),
    opportunity({
      unique_key: "turkiye-tech",
      title: "Tech girişim destek programı",
      source_name: "TÜBİTAK",
      category: "Ulusal Destek ve Fonlar",
      location: "Türkiye",
      created_at: "2026-07-01T09:00:00.000Z",
      fetched_at: "2026-07-04T09:00:00.000Z",
      published_at: "2026-07-02T09:00:00.000Z",
      deadline_at: "2026-10-01T00:00:00.000Z",
    }),
    opportunity({
      unique_key: "fetched-not-published",
      title: "Fetched record",
      source_name: "Grants.gov",
      category: "Uluslararası Fonlar",
      location: "Global",
      created_at: "2026-07-01T09:00:00.000Z",
      fetched_at: "2026-07-04T11:00:00.000Z",
      published_at: null,
      deadline_at: null,
    }),
  ];
  const baseRows = filterOpportunityRows(rows, queryDefaults, now);
  const stats = calculateOpportunityStats(baseRows, now);

  assert.equal(
    stats.todayPublishedCount,
    filterOpportunityRows(
      rows,
      { ...queryDefaults, today: "published" },
      now,
    ).length,
  );
  assert.equal(
    stats.todayIngestedCount,
    filterOpportunityRows(
      rows,
      { ...queryDefaults, today: "ingested" },
      now,
    ).length,
  );
  assert.equal(
    stats.todayDeadlineCount,
    filterOpportunityRows(
      rows,
      { ...queryDefaults, today: "deadline" },
      now,
    ).length,
  );
  assert.equal(
    stats.nearCount,
    filterOpportunityRows(
      rows,
      { ...queryDefaults, timeRange: "near" },
      now,
    ).length,
  );

  for (const scope of [
    { category: "Uluslararası Fonlar" as const },
    { source: "grants-gov" as const },
    { countryGroup: "turkiye" as const },
    { query: "tech" },
  ]) {
    const scopedOptions = { ...queryDefaults, ...scope };
    const scopedRows = filterOpportunityRows(rows, scopedOptions, now);
    const scopedStats = calculateOpportunityStats(scopedRows, now);
    const publishedRows = filterOpportunityRows(
      rows,
      { ...scopedOptions, today: "published" },
      now,
    );
    assert.equal(scopedStats.todayPublishedCount, publishedRows.length);
  }

  assert.equal(stats.todayPublishedCount, 1);
  assert.equal(stats.todayIngestedCount, 1);
  assert.equal(resolveTodayFilter("todayPublished"), "published");
  assert.equal(resolveTodayFilter("todayIngested"), "ingested");
  assert.equal(resolveTodayFilter("deadlineToday"), "deadline");
  assert.equal(resolveCategoryFilter("INT-FON"), "Uluslararası Fonlar");
});

test("ticker uses only unique real input records in priority order", () => {
  const ingested = opportunity({
    unique_key: "ticker-ingested",
    title: "Bugün eklenen teknoloji çağrısı",
    source_name: "Grants.gov",
    created_at: "2026-07-04T09:00:00.000Z",
    deadline_at: "2026-09-01T00:00:00.000Z",
  });
  const duplicate = opportunity({
    ...ingested,
    id: "ticker-duplicate",
    unique_key: "ticker-duplicate",
  });
  const recent = opportunity({
    unique_key: "ticker-recent",
    title: "Yeni yayımlanan program",
    source_name: "NATO DIANA",
    created_at: "2026-06-01T09:00:00.000Z",
    published_at: "2026-07-03T09:00:00.000Z",
  });
  const selected = selectTickerItems([recent, duplicate, ingested], now, 15);

  assert.equal(selected.length, 2);
  assert.equal(selected[0].unique_key, "ticker-duplicate");
  assert.ok(
    selected.every((item) =>
      [recent, duplicate, ingested].some(
        (sourceItem) => sourceItem.unique_key === item.unique_key,
      ),
    ),
  );
  assert.equal(
    new Set(
      selected.map((item) => `${item.source_name}::${item.title}`),
    ).size,
    selected.length,
  );
});

test("ticker excludes KOSGEB press archives even when added today", () => {
  const archive = opportunity({
    unique_key: "ticker-kosgeb-archive",
    title: "Türkiye Gazetesi",
    summary: "Devamı için",
    source_name: "KOSGEB Duyuruları",
    source_url:
      "https://www.kosgeb.gov.tr/site/tr/genel/detay/3333/turkiye-gazetesi",
    created_at: "2026-07-04T11:00:00.000Z",
    fetched_at: "2026-07-04T11:00:00.000Z",
    published_at: null,
    deadline_at: null,
  });
  const current = opportunity({
    unique_key: "ticker-current-kosgeb",
    title: "Güncel KOSGEB destek çağrısı",
    summary: "KOBİ'ler için güncel destek ve başvuru duyurusu.",
    source_name: "KOSGEB Duyuruları",
    source_url:
      "https://www.kosgeb.gov.tr/site/tr/genel/detay/9999/guncel-cagri",
    created_at: "2026-07-04T10:00:00.000Z",
    published_at: "2026-07-04T09:00:00.000Z",
    deadline_at: "2026-09-01T00:00:00.000Z",
  });

  const selected = selectTickerItems([archive, current], now);
  assert.deepEqual(
    selected.map((item) => item.unique_key),
    ["ticker-current-kosgeb"],
  );
});
