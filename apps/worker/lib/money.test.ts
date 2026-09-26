import assert from "node:assert/strict";
import { test } from "node:test";
import { amountCents, centsToString, toCents } from "./money.ts";
import { needsDiffReason, priceAt, shiftTotals, totalsWithServer } from "./shift-math.ts";

test("money strings become cents without floats", () => {
  assert.equal(toCents("927438"), 92_743_800n);
  assert.equal(toCents("1850.5"), 185_050n);
  assert.equal(toCents(125), 12_500n);
  assert.equal(toCents("-4500"), -450_000n);
  assert.equal(toCents("1.005"), null);
  assert.equal(centsToString(92_743_800n), "927438");
  assert.equal(centsToString(185_050n), "1850.50");
  assert.equal(centsToString(-450_000n), "-4500");
});

test("amount = round(liters × price, 2)", () => {
  assert.equal(amountCents(74_195, 12_500n), 92_743_750n);   // 7,419.5 L × 125 = 927,437.50
  assert.equal(amountCents(1, 3n), 0n);                        // 0.1 L × 0.03 = 0.003 → 0.00
  assert.equal(amountCents(5, 1n), 1n);                        // 0.5 L × 0.01 = 0.005 → 0.01 (half up)
});

test("price at shift open is the latest one not after it", () => {
  const prices = [
    { productId: "p95", price: "120", effectiveAt: "2026-09-01T00:00:00Z" },
    { productId: "p95", price: "125", effectiveAt: "2026-09-20T00:00:00Z" },
    { productId: "p95", price: "130", effectiveAt: "2026-09-30T00:00:00Z" },
  ];
  assert.equal(priceAt(prices, "p95", "2026-09-26T06:00:00Z"), 12_500n);
  assert.equal(priceAt(prices, "p95", "2026-08-01T00:00:00Z"), null);
  assert.equal(priceAt(prices, "diesel", "2026-09-26T06:00:00Z"), null);
});

test("expected cash sums every leg with the price at shift open", () => {
  const prices = [
    { productId: "p90", price: "100", effectiveAt: "2026-09-01T00:00:00Z" },
    { productId: "p95", price: "125", effectiveAt: "2026-09-01T00:00:00Z" },
    { productId: "p95", price: "999", effectiveAt: "2026-09-26T09:00:00Z" },  // published after the shift opened
  ];
  const legs = [
    { legId: "a", readings: [{ nozzleId: "n1", productId: "p90", openingTenths: 1_000, closingTenths: 1_500 }] },   // 50 L × 100
    { legId: "b", readings: [{ nozzleId: "n3", productId: "p95", openingTenths: 20_000, closingTenths: 20_400 }] }, // 40 L × 125
  ];
  const t = shiftTotals(legs, prices, "2026-09-26T06:00:00Z", toCents("50000")!);
  assert.equal(t.litersTenths, 900);
  assert.equal(t.meterSalesCents, 1_000_000n);                  // 5,000 + 5,000
  assert.equal(t.expectedCashCents, 6_000_000n);                // 50,000 + 10,000
  assert.deepEqual(t.legs.map((l) => l.amountCents), [500_000n, 500_000n]);
  assert.equal(t.missingPrice, false);
});

test("an open leg counts no liters; a missing price is flagged", () => {
  const t = shiftTotals(
    [{ legId: "a", readings: [{ nozzleId: "n", productId: "x", openingTenths: 10, closingTenths: 30 }] },
     { legId: "b", readings: [{ nozzleId: "m", productId: "x", openingTenths: 50 }] }],
    [], "2026-09-26T06:00:00Z", 0n);
  assert.equal(t.litersTenths, 20);
  assert.equal(t.meterSalesCents, 0n);
  assert.equal(t.missingPrice, true);
});

test("a reason is required only above the tolerance", () => {
  assert.equal(needsDiffReason(toCents("634938")!, toCents("639438")!, toCents("1000")!), true);
  assert.equal(needsDiffReason(toCents("639000")!, toCents("639438")!, toCents("1000")!), false);
  assert.equal(needsDiffReason(toCents("640438")!, toCents("639438")!, toCents("1000")!), false);  // exactly 1,000
});

test("online close: server summary for ended legs + current pump × the shift's price", () => {
  const summary = {
    liters: 50, meter_sales: 5000, expected_cash: 55000,             // opening 50,000 + leg 1
    nozzles: [{ nozzle_id: "n1", price: 100 }, { nozzle_id: "n3", price: "125.55" }],
    legs: [{ leg_id: "a", liters: 50, amount: 5000 }, { leg_id: "b", liters: 0, amount: 0 }],
  };
  const t = totalsWithServer(summary, "b", [{ nozzleId: "n3", openingTenths: 20_000, closingTenths: 20_401 }]);  // 40.1 L
  assert.equal(t.litersTenths, 901);
  assert.equal(t.legs[1].amountCents, 503_456n);                     // 40.1 × 125.55 = 5,034.555 → 5,034.56
  assert.equal(t.meterSalesCents, 1_003_456n);
  assert.equal(t.expectedCashCents, 6_003_456n);
  assert.equal(t.missingPrice, false);
});
