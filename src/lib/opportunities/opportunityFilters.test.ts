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
