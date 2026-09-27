import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateAging, limitBadge, litersSharePercent, marginPercent, percentChange, priorMonth, priorWindow, wasteSharePercent,
} from "./report-rules.ts";

test("the prior window is the same length, immediately before", () => {
  const from = Date.parse("2026-09-21T00:00:00Z"); // «هذا الأسبوع» = 7 days
  const to = Date.parse("2026-09-28T00:00:00Z");
  assert.deepEqual(priorWindow(from, to), { fromMs: Date.parse("2026-09-14T00:00:00Z"), toMs: from });
});

test("the prior month keeps the day of month, clamped to the shorter month", () => {
  assert.equal(priorMonth("2026-09-24T00:00:00.000Z"), "2026-08-24T00:00:00.000Z");
  assert.equal(priorMonth("2026-03-31T00:00:00.000Z"), "2026-02-28T00:00:00.000Z"); // Feb has no 31st
});

test("margin, as in the design: 3,230,000 net of 48,630,000 revenue is 6.6%", () => {
  assert.equal(marginPercent(3_230_000_00n, 48_630_000_00n), 6.6);
  assert.equal(marginPercent(-100_00n, 1_000_00n), -10);
  assert.equal(marginPercent(0n, 0n), null);
});

test("percent change, as in the design: 3,230,000 vs 2,870,000 is +12.5%", () => {
  assert.equal(percentChange(3_230_000_00n, 2_870_000_00n), 12.5);
  assert.equal(percentChange(80_00n, 100_00n), -20);
  assert.equal(percentChange(100_00n, 0n), null);
});

test("the limit badge flips on any issue", () => {
  assert.deepEqual(limitBadge(false), { tone: "success", label: "ضمن الحد" });
  assert.deepEqual(limitBadge(true), { tone: "danger", label: "يحتاج انتباهاً" });
});

test("waste share of revenue, one decimal place", () => {
  assert.equal(wasteSharePercent(145_800_00n, 48_630_000_00n), 0.3);
  assert.equal(wasteSharePercent(0n, 48_630_000_00n), 0);
  assert.equal(wasteSharePercent(100_00n, 0n), 0);
});

test("aging buckets sum unpaid lots by their own age", () => {
  const lots = [
    { amountCents: 100_000_00n, ageDays: 5 },
    { amountCents: 150_000_00n, ageDays: 30 },
    { amountCents: 200_000_00n, ageDays: 45 },
    { amountCents: 72_000_00n, ageDays: 90 },
  ];
  assert.deepEqual(aggregateAging(lots), { "0-30": 250_000_00n, "31-60": 200_000_00n, "60+": 72_000_00n });
});

test("liters share of the mix, as in the design: 46% for gasoline 95", () => {
  assert.equal(litersSharePercent(179_216, 389_600), 46);
  assert.equal(litersSharePercent(0, 0), 0);
});
