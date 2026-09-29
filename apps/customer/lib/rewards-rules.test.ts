import assert from "node:assert/strict";
import { test } from "node:test";
import { nextTier, offerBadge, offerStatus } from "./rewards-rules.ts";

test("offer status by its own start/end window", () => {
  const now = Date.parse("2026-09-24T00:00:00Z");
  assert.equal(offerStatus("2026-09-01T00:00:00Z", "2026-09-30T00:00:00Z", now), "active");
  assert.equal(offerStatus("2026-09-01T00:00:00Z", "2026-09-20T00:00:00Z", now), "expired");
  assert.equal(offerStatus("2026-10-01T00:00:00Z", "2026-10-30T00:00:00Z", now), "expired"); // not started yet
});

test("offer badge tones", () => {
  assert.deepEqual(offerBadge("active"), { tone: "success", label: "فعّال" });
  assert.deepEqual(offerBadge("expired"), { tone: "neutral", label: "منتهٍ" });
});

test("the nearest tier still ahead, as in the design (1,240 of 1,500 → 260 left)", () => {
  const tiers = [{ title: "قهوة مجانية", pointsThreshold: 500 }, { title: "غسيل سيارة مجاني", pointsThreshold: 1500 }];
  assert.deepEqual(nextTier(tiers, 1240), { title: "غسيل سيارة مجاني", pointsNeeded: 260 });
  assert.equal(nextTier(tiers, 2000), null);
  assert.equal(nextTier([], 100), null);
});
