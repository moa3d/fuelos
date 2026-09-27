import assert from "node:assert/strict";
import { test } from "node:test";
import { availabilityBadge, currencyLabel, groupByStation, type PriceRow } from "./prices-rules.ts";

test("availability badges", () => {
  assert.deepEqual(availabilityBadge("available"), { tone: "success", label: "متوفر" });
  assert.deepEqual(availabilityBadge("limited"), { tone: "warning", label: "كمية محدودة" });
  assert.deepEqual(availabilityBadge("unavailable"), { tone: "neutral", label: "غير متوفر" });
});

test("currency codes map to the Arabic label, unknown codes pass through", () => {
  assert.equal(currencyLabel("SYP"), "ل.س");
  assert.equal(currencyLabel("USD"), "USD");
});

test("rows group by station, products sorted by name, stations sorted by name", () => {
  const rows: PriceRow[] = [
    { station_id: "b", station_name: "محطة الربيع", city: "دمشق", currency_code: "SYP", product_id: "p2", product_name: "ديزل", price: "96", price_updated_at: "2026-09-27T07:00:00Z", availability: "available", availability_source: "manual", availability_updated_at: null },
    { station_id: "a", station_name: "محطة النور", city: "دمشق", currency_code: "SYP", product_id: "p1", product_name: "بنزين 95", price: "125", price_updated_at: "2026-09-27T07:30:00Z", availability: "available", availability_source: "manual", availability_updated_at: null },
    { station_id: "a", station_name: "محطة النور", city: "دمشق", currency_code: "SYP", product_id: "p0", product_name: "بنزين 90", price: "110", price_updated_at: "2026-09-27T07:30:00Z", availability: "limited", availability_source: "computed", availability_updated_at: null },
  ];
  const stations = groupByStation(rows);
  assert.equal(stations.length, 2);
  assert.equal(stations[0].name, "محطة الربيع");
  assert.equal(stations[1].name, "محطة النور");
  assert.deepEqual(stations[1].products.map((p) => p.name), ["بنزين 90", "بنزين 95"]);
  assert.equal(stations[1].currency, "ل.س");
});

test("an empty result groups to no stations", () => {
  assert.deepEqual(groupByStation([]), []);
});
