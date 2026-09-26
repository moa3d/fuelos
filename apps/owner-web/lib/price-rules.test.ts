import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avgCostCents, changePercentTenths, currentPrices, isLargeChange, marginOf, parsePriceCents, scheduledPrices, suggestedAvailability,
} from "./price-rules.ts";

test("a typed price: Arabic digits accepted, at most two decimals, positive only", () => {
  assert.equal(parsePriceCents("96"), 9_600n);
  assert.equal(parsePriceCents("٩٦٫٥"), 9_650n);
  assert.equal(parsePriceCents("1,250.75"), 125_075n);
  assert.equal(parsePriceCents("96.555"), null);
  assert.equal(parsePriceCents("0"), null);
  assert.equal(parsePriceCents("-5"), null);
  assert.equal(parsePriceCents(""), null);
  assert.equal(parsePriceCents("abc"), null);
});

test("change in tenths of a percent, rounded half away from zero", () => {
  assert.equal(changePercentTenths(9_500n, 9_600n), 11);      // 95 → 96 = +1.05% → 1.1
  assert.equal(changePercentTenths(12_500n, 10_000n), -200);  // −20%
  assert.equal(changePercentTenths(0n, 100n), 0);
});

test("a change beyond 25% must be confirmed (12.5 typed as 125)", () => {
  assert.equal(isLargeChange(1_250n, 12_500n), true);
  assert.equal(isLargeChange(11_000n, 12_000n), false);
  assert.equal(isLargeChange(10_000n, 7_400n), true);
  assert.equal(isLargeChange(10_000n, 7_500n), false);       // exactly −25%
});

test("margin as in the design: 125 with cost 112 = 13 (10.4%), diesel 96 with 86 = 10 (10.4%)", () => {
  assert.deepEqual(marginOf(12_500n, 11_200n), { marginC: 1_300n, percentTenths: 104 });
  assert.deepEqual(marginOf(9_600n, 8_600n), { marginC: 1_000n, percentTenths: 104 });
  assert.deepEqual(marginOf(11_000n, 9_900n), { marginC: 1_100n, percentTenths: 100 });
  assert.equal(marginOf(9_000n, 10_000n).marginC, -1_000n);   // selling below cost shows a negative margin
});

test("average cost is the liters-weighted price plus extra costs, priced deliveries only (like tank_avg_cost)", () => {
  const rows = [
    { liters: "4000.000", unit_cost: "110.00", extra_costs: "0" },
    { liters: "6000.000", unit_cost: "114.00", extra_costs: "3000.00" },
    { liters: "9000.000", unit_cost: null, extra_costs: "0" },       // no price yet: ignored
  ];
  // (4000×110 + 6000×114 + 3000) / 10000 = 112.7
  assert.equal(avgCostCents(rows), 11_270n);
  assert.equal(avgCostCents([{ liters: 100, unit_cost: null, extra_costs: 0 }]), null);
  assert.equal(avgCostCents([]), null);
});

test("availability is suggested from the book stock and the tank's minimum", () => {
  assert.equal(suggestedAvailability(18, 20), "limited");
  assert.equal(suggestedAvailability(41, 20), "available");
  assert.equal(suggestedAvailability(20, 20), "available");
});

test("the published price is the latest already in force; later rows are scheduled", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  const rows = [
    { product_id: "d", price: 95, effective_at: "2026-09-01T00:00:00Z" },
    { product_id: "d", price: 96, effective_at: "2026-09-20T00:00:00Z" },
    { product_id: "d", price: 99, effective_at: "2026-10-01T00:00:00Z" },
    { product_id: "g", price: 125, effective_at: "2026-09-15T00:00:00Z" },
  ];
  const cur = currentPrices(rows, now);
  assert.equal(cur.get("d")?.price, 96);
  assert.equal(cur.get("g")?.price, 125);
  assert.deepEqual(scheduledPrices(rows, now).map((r) => r.price), [99]);
});
