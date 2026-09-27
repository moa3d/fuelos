import assert from "node:assert/strict";
import { test } from "node:test";
import { avgDailyFromSales, cardFlag, daysOfStock, levelTone, matchesFilter } from "./tank-rules.ts";

test("level tone follows the minimum, with an amber zone just above it", () => {
  assert.equal(levelTone(62, 20), "success");
  assert.equal(levelTone(18, 20), "danger");
  assert.equal(levelTone(22, 20), "warning");
  assert.equal(levelTone(25, 20), "success");
});

test("days of stock = book ÷ average daily draw", () => {
  assert.equal(daysOfStock(18_600, 6_000), 3.1);
  assert.equal(daysOfStock(5_400, 3_600), 1.5);
  assert.equal(daysOfStock(1_000, 0), null);
});

test("average daily draw over the sampled days", () => {
  assert.equal(avgDailyFromSales([6180, 5900], 2), 6040);
  assert.equal(avgDailyFromSales([], 7), 0);
  assert.equal(avgDailyFromSales([100], 0), 0);
});

test("one badge, most important first", () => {
  assert.deepEqual(cardFlag({ hasPendingAdjustment: true, belowMin: true, lastDeliveryMissingCost: true }), { tone: "danger", label: "فرق يتطلب سبباً" });
  assert.deepEqual(cardFlag({ hasPendingAdjustment: false, belowMin: true, lastDeliveryMissingCost: true }), { tone: "warning", label: "أقل من الحد الأدنى" });
  assert.deepEqual(cardFlag({ hasPendingAdjustment: false, belowMin: false, lastDeliveryMissingCost: true }), { tone: "info", label: "سعر الشراء الأخير غير مدخل" });
  assert.equal(cardFlag({ hasPendingAdjustment: false, belowMin: false, lastDeliveryMissingCost: false }), undefined);
});

test("the transfer filter matches both transfer directions", () => {
  assert.equal(matchesFilter("transfer_in", "transfer"), true);
  assert.equal(matchesFilter("transfer_out", "transfer"), true);
  assert.equal(matchesFilter("sale", "transfer"), false);
  assert.equal(matchesFilter("waste", "all"), true);
  assert.equal(matchesFilter("waste", "receipt"), false);
});
