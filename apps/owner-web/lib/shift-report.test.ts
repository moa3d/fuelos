import assert from "node:assert/strict";
import { test } from "node:test";
import { cents, centsStr } from "./money.ts";
import { openHours, openLegFills, paymentBreakdown, statusOf } from "./shift-report.ts";

const now = Date.parse("2026-09-27T12:00:00Z");
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

test("money strings become cents and back without floats", () => {
  assert.equal(cents("927438.00"), 92_743_800n);
  assert.equal(cents(-4500), -450_000n);
  assert.equal(centsStr(-450_000n), "-4500");
  assert.equal(centsStr(92_743_850n), "927438.50");
});

test("status badges follow the design: long-open shifts turn red", () => {
  assert.deepEqual(statusOf("approved", hoursAgo(20), now, 12), { tone: "success", label: "معتمدة" });
  assert.deepEqual(statusOf("submitted", hoursAgo(20), now, 12), { tone: "warning", label: "بانتظار الاعتماد" });
  assert.deepEqual(statusOf("open", hoursAgo(3), now, 12), { tone: "info", label: "مفتوحة" });
  assert.deepEqual(statusOf("open", hoursAgo(13), now, 12), { tone: "danger", label: "مفتوحة طويلاً" });
  assert.deepEqual(statusOf("reopened", hoursAgo(2), now, 12), { tone: "warning", label: "أعيد فتحها" });
  assert.deepEqual(statusOf("rejected", hoursAgo(2), now, 12), { tone: "danger", label: "مرفوضة" });
  assert.equal(openHours(hoursAgo(13), now), 13);
});

test("payment breakdown of the design shift: cash is what the meter sold minus card, credit and voucher", () => {
  const summary = { meter_sales: 927_438, card: 180_000, credit: 96_000, voucher: 12_000 };
  const sale = (m: "cash" | "card" | "credit" | "voucher", status = "recorded") => ({ payment_method: m, status, amount: 1 });
  const sales = [...Array(94).fill(0).map(() => sale("cash")), ...Array(14).fill(0).map(() => sale("card")),
    ...Array(3).fill(0).map(() => sale("credit")), sale("voucher"), sale("voucher"), sale("cash", "voided")];
  const r = paymentBreakdown(summary, sales);
  assert.deepEqual(r.rows.map((x) => [x.method, x.count, centsStr(x.amountCents)]),
    [["cash", 94, "639438"], ["card", 14, "180000"], ["credit", 3, "96000"], ["voucher", 2, "12000"]]);
  assert.equal(r.totalCount, 113);
  assert.equal(centsStr(r.totalCents), "927438");
});

test("fills on a still-open pump are counted apart", () => {
  const sales = [
    { payment_method: "cash" as const, status: "recorded", amount: "5000.00", leg_id: "open" },
    { payment_method: "card" as const, status: "recorded", amount: 2500, leg_id: "open" },
    { payment_method: "cash" as const, status: "recorded", amount: 999, leg_id: "ended" },
    { payment_method: "cash" as const, status: "voided", amount: 100, leg_id: "open" },
  ];
  const r = openLegFills(sales, new Set(["open"]));
  assert.equal(r.count, 2);
  assert.equal(centsStr(r.cents), "7500");
});
