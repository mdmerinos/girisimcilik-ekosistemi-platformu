import assert from "node:assert/strict";
import test from "node:test";

import {
  createUniqueKey,
  normalizeOriginalUrl,
} from "@/lib/utils/createUniqueKey";

test("normalizeOriginalUrl removes tracking data and fragments", () => {
  assert.equal(
    normalizeOriginalUrl(
      "https://Example.com/call/?utm_source=newsletter&b=2&a=1#details",
    ),
    "https://example.com/call?a=1&b=2",
  );
});

test("createUniqueKey is stable for equivalent original URLs", () => {
  const first = createUniqueKey(
    "TÜBİTAK",
    "https://tubitak.gov.tr/tr/duyuru/test/?utm_source=x",
  );
  const second = createUniqueKey(
    "TÜBİTAK",
    "https://tubitak.gov.tr/tr/duyuru/test",
  );

  assert.equal(first, second);
  assert.equal(first.length, 64);
});
