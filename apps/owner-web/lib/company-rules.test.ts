import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bucketOf, companyBadge, fifoAging, needsAttention, overdueDays, utilizationPercent,
} from "./company-rules.ts";

const now = Date.parse("2026-09-27T00:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

test("payments pay off the oldest sale first (FIFO)", () => {
  const sales = [{ amount: "38000", at: daysAgo(45) }, { amount: "35000", at: daysAgo(37) }, { amount: "37000", at: daysAgo(35) }];
  const payments = [{ amount: "38000", at: daysAgo(20) }];
  const { unpaid, totalCents } = fifoAging(sales, payments);
  assert.equal(unpaid.length, 2);
  assert.equal(unpaid[0].at, daysAgo(37));
  assert.equal(totalCents, 7_200_000n);   // 35,000 + 37,000 → cents
});

test("a payment split across two sales", () => {
  const sales = [{ amount: "100", at: daysAgo(10) }, { amount: "100", at: daysAgo(5) }];
  const { unpaid, totalCents } = fifoAging(sales, [{ amount: "150", at: daysAgo(1) }]);
  assert.equal(unpaid.length, 1);
  assert.equal(unpaid[0].amountCents, 5000n);   // 50 left of the second sale
  assert.equal(totalCents, 5000n);
});

test("fully paid leaves nothing outstanding, and overdueDays is null", () => {
  const { unpaid } = fifoAging([{ amount: "100", at: daysAgo(10) }], [{ amount: "100", at: daysAgo(1) }]);
  assert.equal(unpaid.length, 0);
  assert.equal(overdueDays(unpaid, now), null);
});

test("overdue age comes from the oldest unpaid lot", () => {
  const { unpaid } = fifoAging([{ amount: "38000", at: daysAgo(45) }, { amount: "35000", at: daysAgo(37) }], [{ amount: "38000", at: daysAgo(20) }]);
  assert.equal(overdueDays(unpaid, now), 37);
});

test("aging buckets: 0-30, 31-60, 60+", () => {
  assert.equal(bucketOf(0), "0-30");
  assert.equal(bucketOf(30), "0-30");
  assert.equal(bucketOf(31), "31-60");
  assert.equal(bucketOf(60), "31-60");
  assert.equal(bucketOf(61), "60+");
});

test("utilization: design's 212,000 of a 250,000 limit is 85%", () => {
  assert.equal(utilizationPercent(38_000_00n, 250_000_00n), 85);
  assert.equal(utilizationPercent(250_000_00n, 250_000_00n), 0);
  assert.equal(utilizationPercent(0n, 0n), 0);
});

test("badge priority: status, then overdue, then near-limit, else منتظم", () => {
  assert.deepEqual(companyBadge("suspended", 90, 95), { tone: "neutral", label: "موقوف" });
  assert.deepEqual(companyBadge("frozen", 90, 95), { tone: "neutral", label: "مجمّد" });
  assert.deepEqual(companyBadge("active", 45, 85), { tone: "danger", label: "متأخر 45 يوماً" });
  assert.deepEqual(companyBadge("active", 10, 82), { tone: "warning", label: "قرب الحد" });
  assert.deepEqual(companyBadge("active", null, 20), { tone: "success", label: "منتظم" });
  assert.deepEqual(companyBadge("active", 20, 20), { tone: "success", label: "منتظم" });   // 20 days: not yet «متأخر»
});

test("needsAttention flags an overdue company already near its limit", () => {
  assert.equal(needsAttention(45, 85), true);
  assert.equal(needsAttention(45, 50), false);
  assert.equal(needsAttention(10, 85), false);
  assert.equal(needsAttention(null, 95), false);
});
