import assert from "node:assert/strict";
import { test } from "node:test";
import { invoiceStatusBadge, monthEnd, monthStart, monthTotals } from "./invoice-rules.ts";

test("invoice status badges", () => {
  assert.deepEqual(invoiceStatusBadge("confirmed"), { tone: "success", label: "مؤكدة" });
  assert.deepEqual(invoiceStatusBadge("pending"), { tone: "warning", label: "بانتظار المحطة" });
  assert.deepEqual(invoiceStatusBadge("corrected"), { tone: "info", label: "مصحّحة" });
  assert.deepEqual(invoiceStatusBadge("cancelled"), { tone: "neutral", label: "ملغاة" });
});

test("month navigation stays on the 1st, in UTC", () => {
  const sep = monthStart("2026-09-24T10:48:00Z");
  assert.equal(sep, "2026-09-01T00:00:00.000Z");
  assert.equal(monthStart(sep, -1), "2026-08-01T00:00:00.000Z");
  assert.equal(monthStart(sep, 1), "2026-10-01T00:00:00.000Z");
  assert.equal(monthEnd(sep), "2026-10-01T00:00:00.000Z");
});

test("month totals count only confirmed/corrected invoices as real spend", () => {
  const rows = [
    { status: "confirmed" as const, amount: "5000", liters: "40" },
    { status: "corrected" as const, amount: "31000", liters: "200" },
    { status: "pending" as const, amount: "12375", liters: "99" },
    { status: "cancelled" as const, amount: "9999", liters: "50" },
  ];
  assert.deepEqual(monthTotals(rows), { amount: 36000, liters: 240, fillCount: 2 });
  assert.deepEqual(monthTotals([]), { amount: 0, liters: 0, fillCount: 0 });
});
