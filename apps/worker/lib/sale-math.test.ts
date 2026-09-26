import assert from "node:assert/strict";
import { test } from "node:test";
import { amountFromLiters, litersFromAmount, milliToString, parseLitersMilli } from "./sale-math.ts";

test("liters accept up to three decimals and Arabic digits", () => {
  assert.equal(parseLitersMilli("40"), 40_000);
  assert.equal(parseLitersMilli("40.5"), 40_500);
  assert.equal(parseLitersMilli("٤٠٫١٢٥"), 40_125);
  assert.equal(parseLitersMilli("40.1234"), null);
  assert.equal(parseLitersMilli(""), null);
});

test("amount → liters at the locked price (design: 5,000 at 125 = 40.00 L)", () => {
  assert.equal(litersFromAmount(500_000n, 12_500n), 40_000);
  assert.equal(litersFromAmount(500_000n, 11_000n), 45_455);          // 45.4545… → 45.455
  assert.equal(litersFromAmount(100n, 0n), 0);
});

test("recorded amount = round(liters × price, 2), like record_sale", () => {
  assert.equal(amountFromLiters(40_000, 12_500n), 500_000n);
  assert.equal(amountFromLiters(45_455, 11_000n), 500_005n);           // 5,000.05: shown to the attendant
  assert.equal(amountFromLiters(1, 5n), 0n);                            // 0.001 × 0.05 = 0.00005 → 0.00
});

test("p_liters is sent as a plain decimal string", () => {
  assert.equal(milliToString(40_000), "40.000");
  assert.equal(milliToString(45_455), "45.455");
  assert.equal(milliToString(5), "0.005");
});
