import assert from "node:assert/strict";
import { test } from "node:test";
import {
  averageOf, costPerKm, consumptionPer100km, distancesSinceLast, kmUntilService, lastMonthKeys, monthKey,
  spendByMonth, type Fill,
} from "./vehicle-rules.ts";

test("month key and the last N months, oldest first", () => {
  assert.equal(monthKey("2026-09-24T10:00:00Z"), "2026-09");
  assert.deepEqual(lastMonthKeys("2026-09-24T00:00:00Z", 3), ["2026-07", "2026-08", "2026-09"]);
  assert.deepEqual(lastMonthKeys("2026-01-15T00:00:00Z", 2), ["2025-12", "2026-01"]);
});

test("spend grouped by month, zero for months with no fills", () => {
  const fills: Fill[] = [
    { receivedAt: "2026-08-05T00:00:00Z", amount: 10000, liters: 40, odometerKm: 1000 },
    { receivedAt: "2026-09-05T00:00:00Z", amount: 20000, liters: 40, odometerKm: 1400 },
    { receivedAt: "2026-09-20T00:00:00Z", amount: 5000, liters: 10, odometerKm: 1500 },
  ];
  assert.deepEqual(spendByMonth(fills, ["2026-07", "2026-08", "2026-09"]), [
    { month: "2026-07", amount: 0 }, { month: "2026-08", amount: 10000 }, { month: "2026-09", amount: 25000 },
  ]);
});

test("distance since the last fill needs both odometer readings to increase", () => {
  const fills: Fill[] = [
    { receivedAt: "2026-08-05T00:00:00Z", amount: 10000, liters: 40, odometerKm: 1000 },
    { receivedAt: "2026-09-05T00:00:00Z", amount: 20000, liters: 40, odometerKm: 1400 },
    { receivedAt: "2026-09-20T00:00:00Z", amount: 5000, liters: 10, odometerKm: null },
    { receivedAt: "2026-10-01T00:00:00Z", amount: 5000, liters: 10, odometerKm: 1200 }, // odometer went backwards
  ];
  assert.deepEqual(distancesSinceLast(fills), [null, 400, null, null]);
});

test("consumption and cost per km, one decimal place, null without a distance", () => {
  assert.equal(consumptionPer100km(40, 400), 10);
  assert.equal(consumptionPer100km(31.2, 400), 7.8);
  assert.equal(consumptionPer100km(40, null), null);
  assert.equal(consumptionPer100km(40, 0), null);
  assert.equal(costPerKm(3920, 400), 9.8);
  assert.equal(costPerKm(40, null), null);
});

test("average of the computable legs only", () => {
  assert.equal(averageOf([10, null, 20]), 15);
  assert.equal(averageOf([null, null]), null);
  assert.equal(averageOf([]), null);
});

test("km until the next service, null unless both fields are set", () => {
  assert.equal(kmUntilService(80_000, 10_000, 88_000), 2_000);
  assert.equal(kmUntilService(80_000, 10_000, null), 10_000); // no fills yet: full interval remains
  assert.equal(kmUntilService(null, 10_000, 88_000), null);
  assert.equal(kmUntilService(80_000, null, 88_000), null);
});
