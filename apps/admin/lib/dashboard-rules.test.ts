import assert from "node:assert/strict";
import { test } from "node:test";
import { daysUntil, mrrCents, subscriptionBadge, ticketBadge, trialEndingSoon } from "./dashboard-rules.ts";

test("MRR counts only active/past_due, multiplies per-station plans by station count", () => {
  const subs = [
    { status: "active" as const, planMonthlyPriceCents: 15_000_000n, perStation: false, stationCount: 1 },
    { status: "trial" as const, planMonthlyPriceCents: 30_000_000n, perStation: false, stationCount: 1 },
    { status: "past_due" as const, planMonthlyPriceCents: 25_000_000n, perStation: true, stationCount: 3 },
    { status: "cancelled" as const, planMonthlyPriceCents: 99_000_000n, perStation: false, stationCount: 1 },
  ];
  assert.equal(mrrCents(subs), 15_000_000n + 25_000_000n * 3n);
  assert.equal(mrrCents([]), 0n);
});

test("days until, negative once past", () => {
  const now = Date.parse("2026-09-24T00:00:00Z");
  assert.equal(daysUntil("2026-09-27T00:00:00Z", now), 3);
  assert.equal(daysUntil("2026-09-20T00:00:00Z", now), -4);
});

test("badges", () => {
  assert.deepEqual(subscriptionBadge("trial"), { tone: "info", label: "تجربة" });
  assert.deepEqual(subscriptionBadge("active"), { tone: "success", label: "نشط" });
  assert.deepEqual(subscriptionBadge("past_due"), { tone: "danger", label: "متأخر الدفع" });
  assert.deepEqual(ticketBadge("high"), { tone: "danger", label: "عالية" });
  assert.deepEqual(ticketBadge("low"), { tone: "neutral", label: "منخفضة" });
});

test("trial ending soon, within the window and not already expired", () => {
  const now = Date.parse("2026-09-24T00:00:00Z");
  assert.equal(trialEndingSoon("2026-09-26T00:00:00Z", now), true);
  assert.equal(trialEndingSoon("2026-09-30T00:00:00Z", now), false);
  assert.equal(trialEndingSoon("2026-09-20T00:00:00Z", now), false);
  assert.equal(trialEndingSoon(null, now), false);
});
