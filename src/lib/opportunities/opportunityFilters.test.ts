import assert from "node:assert/strict";
import test from "node:test";

import {
  getOpportunityStatus,
  matchesOpportunitySearch,
  matchesTimeRange,
  normalizeSearchText,
  sortOpportunities,
} from "@/lib/opportunities/opportunityFilters";
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
