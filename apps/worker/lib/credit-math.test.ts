import assert from "node:assert/strict";
import { test } from "node:test";
import { overBy, possibleLiters, remainingPercent } from "./credit-math.ts";

test("S9: 26,000 left at 125 per liter pays for 208 whole liters", () => {
  assert.equal(possibleLiters(2_600_000n, 12_500n), 208);
  assert.equal(possibleLiters(0n, 12_500n), 0);
  assert.equal(possibleLiters(2_600_000n, 0n), 0);
});

test("S9: 300 L × 125 = 37,500 goes 11,500 over a 26,000 remainder", () => {
  assert.equal(overBy(3_750_000n, 2_600_000n), 1_150_000n);
  assert.equal(overBy(2_000_000n, 2_600_000n), 0n);
});

test("the S8 bar shows the remaining share of the limit", () => {
  assert.equal(remainingPercent(2_600_000n, 25_000_000n), 10);
  assert.equal(remainingPercent(0n, 25_000_000n), 0);
  assert.equal(remainingPercent(5n, 0n), 0);
});
