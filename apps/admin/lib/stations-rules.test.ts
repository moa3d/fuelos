import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesSearch, stationBadge } from "./stations-rules.ts";

test("station status badges", () => {
  assert.deepEqual(stationBadge("setup"), { tone: "info", label: "قيد الإعداد" });
  assert.deepEqual(stationBadge("active"), { tone: "success", label: "نشطة" });
  assert.deepEqual(stationBadge("suspended"), { tone: "danger", label: "موقوفة" });
});

test("search matches name or city, case-insensitively; an empty query matches everything", () => {
  assert.equal(matchesSearch("محطة الوادي", "دمشق", ""), true);
  assert.equal(matchesSearch("محطة الوادي", "دمشق", "الوادي"), true);
  assert.equal(matchesSearch("محطة الوادي", "دمشق", "دمشق"), true);
  assert.equal(matchesSearch("Station Wadi", null, "wadi"), true);
  assert.equal(matchesSearch("محطة الوادي", "دمشق", "حلب"), false);
  assert.equal(matchesSearch("محطة الوادي", null, "دمشق"), false);
});
