import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nextSort, periodRange, sortSalesRows, sumTotals, toExportRow, toExportTotalsRow, toISODate,
  type SalesRow, type SalesTotals,
} from "./sales-rules.ts";

test("toISODate: plain YYYY-MM-DD, no time", () => {
  assert.equal(toISODate(new Date(Date.UTC(2026, 9, 4, 13, 45))), "2026-10-04");
});

test("periodRange: today is a single day", () => {
  const now = Date.UTC(2026, 9, 4, 10, 0);
  assert.deepEqual(periodRange("today", now), { from: "2026-10-04", to: "2026-10-04" });
});

test("periodRange: last7 is 7 days inclusive, ending today", () => {
  const now = Date.UTC(2026, 9, 10, 0, 0);
  assert.deepEqual(periodRange("last7", now), { from: "2026-10-04", to: "2026-10-10" });
});

test("periodRange: thisMonth starts on the 1st, ends today", () => {
  const now = Date.UTC(2026, 9, 15, 0, 0);
  assert.deepEqual(periodRange("thisMonth", now), { from: "2026-10-01", to: "2026-10-15" });
});

test("periodRange: lastMonth is the full previous calendar month", () => {
  const now = Date.UTC(2026, 9, 4, 0, 0); // October
  assert.deepEqual(periodRange("lastMonth", now), { from: "2026-09-01", to: "2026-09-30" });
});

test("periodRange: lastMonth across a year boundary", () => {
  const now = Date.UTC(2026, 0, 15, 0, 0); // January
  assert.deepEqual(periodRange("lastMonth", now), { from: "2025-12-01", to: "2025-12-31" });
});

test("periodRange: custom passes the given range through", () => {
  const now = Date.UTC(2026, 9, 4);
  assert.deepEqual(periodRange("custom", now, { from: "2026-01-01", to: "2026-01-31" }), { from: "2026-01-01", to: "2026-01-31" });
});

function row(over: Partial<SalesRow> = {}): SalesRow {
  return {
    stationId: "s1", stationName: "محطة أ", organizationName: "منظمة أ", city: "دمشق",
    stationStatus: "active", planName: "أساسية", subscriptionStatus: "active",
    approvedShifts: 1, litersL: 100, salesCents: 10_000n, cashCents: 10_000n, cardCents: 0n, creditCents: 0n, voucherCents: 0n,
    lastApprovedShiftAt: "2026-10-01T00:00:00Z", lastDeviceSyncAt: "2026-10-01T00:00:00Z", deviceCount: 1,
    ...over,
  };
}

test("sortSalesRows: sales descending (the screen's default)", () => {
  const rows = [row({ stationId: "a", salesCents: 500n }), row({ stationId: "b", salesCents: 2000n }), row({ stationId: "c", salesCents: 1000n })];
  const sorted = sortSalesRows(rows, "salesCents", "desc").map((r) => r.stationId);
  assert.deepEqual(sorted, ["b", "c", "a"]);
});

test("sortSalesRows: nulls sort last in either direction", () => {
  const rows = [row({ stationId: "a", lastApprovedShiftAt: null }), row({ stationId: "b", lastApprovedShiftAt: "2026-10-02T00:00:00Z" })];
  assert.deepEqual(sortSalesRows(rows, "lastApprovedShiftAt", "desc").map((r) => r.stationId), ["b", "a"]);
  assert.deepEqual(sortSalesRows(rows, "lastApprovedShiftAt", "asc").map((r) => r.stationId), ["b", "a"]);
});

test("sortSalesRows: Arabic text sort (station name)", () => {
  const rows = [row({ stationId: "a", stationName: "ياسمين" }), row({ stationId: "b", stationName: "أبو الهيف" })];
  assert.deepEqual(sortSalesRows(rows, "stationName", "asc").map((r) => r.stationId), ["b", "a"]);
});

test("toExportRow: money becomes real numbers (cents -> decimal), not strings", () => {
  const r = row({ salesCents: 123_456n, cashCents: 123_456n });
  const out = toExportRow(r, () => "نشطة", () => "نشط");
  assert.equal(out[8], 1234.56);
  assert.equal(typeof out[8], "number");
  assert.equal(out[6], 1); // approvedShifts stays a plain number
});

test("toExportRow: a missing city/plan prints an em dash, not blank or null", () => {
  const r = row({ city: null, planName: null });
  const out = toExportRow(r, () => "نشطة", () => "نشط");
  assert.equal(out[2], "—");
  assert.equal(out[4], "—");
});

test("nextSort: clicking the active column flips direction", () => {
  assert.deepEqual(nextSort({ key: "salesCents", dir: "desc" }, "salesCents"), { key: "salesCents", dir: "asc" });
  assert.deepEqual(nextSort({ key: "salesCents", dir: "asc" }, "salesCents"), { key: "salesCents", dir: "desc" });
});

test("nextSort: a new numeric/date column defaults to desc, a new text column defaults to asc", () => {
  assert.deepEqual(nextSort({ key: "salesCents", dir: "desc" }, "lastApprovedShiftAt"), { key: "lastApprovedShiftAt", dir: "desc" });
  assert.deepEqual(nextSort({ key: "salesCents", dir: "desc" }, "stationName"), { key: "stationName", dir: "asc" });
});

test("sumTotals: adds every row's money/liters/counts, BigInt-safe", () => {
  const rows = [
    row({ approvedShifts: 2, litersL: 100, salesCents: 10_000n, cashCents: 6_000n, cardCents: 4_000n }),
    row({ approvedShifts: 3, litersL: 50, salesCents: 5_000n, cashCents: 5_000n, cardCents: 0n }),
  ];
  const t = sumTotals(rows);
  assert.equal(t.approvedShifts, 5);
  assert.equal(t.litersL, 150);
  assert.equal(t.salesCents, 15_000n);
  assert.equal(t.cashCents, 11_000n);
  assert.equal(t.cardCents, 4_000n);
});

test("sumTotals: an empty list sums to all zeros", () => {
  const t = sumTotals([]);
  assert.deepEqual(t, { approvedShifts: 0, litersL: 0, salesCents: 0n, cashCents: 0n, cardCents: 0n, creditCents: 0n, voucherCents: 0n });
});

test("toExportTotalsRow: labelled «الإجمالي», no station-identifying columns", () => {
  const t: SalesTotals = { approvedShifts: 9, litersL: 500, salesCents: 50_000n, cashCents: 40_000n, cardCents: 10_000n, creditCents: 0n, voucherCents: 0n };
  const out = toExportTotalsRow(t);
  assert.equal(out[0], "الإجمالي");
  assert.equal(out[1], "");
  assert.equal(out[8], 500);
  assert.equal(out[6], 9);
});
