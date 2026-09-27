import assert from "node:assert/strict";
import { test } from "node:test";
import { hasTodayEntry, ledgerPreview, monthlyByCategory, sharePercent } from "./expense-rules.ts";

test("monthly totals per category, largest first, zero categories dropped, as in the design", () => {
  const rows = [
    { category: "salaries" as const, amount: "630000" }, { category: "salaries" as const, amount: "630000" },
    { category: "utilities" as const, amount: "312000" }, { category: "maintenance" as const, amount: "186000" },
    { category: "transport" as const, amount: "98000" }, { category: "other" as const, amount: "64000" },
  ];
  const { totalCents, rows: r } = monthlyByCategory(rows);
  assert.equal(totalCents, 192000000n);            // 1,920,000 in cents
  assert.deepEqual(r.map((x) => x.category), ["salaries", "utilities", "maintenance", "transport", "other"]);
  assert.equal(r[0].amountCents, 126000000n);       // 1,260,000 in cents
});

test("a category never mentioned contributes nothing", () => {
  assert.deepEqual(monthlyByCategory([]).rows, []);
});

test("share of the month, as in the design (1,260,000 of 1,920,000 ≈ 66%)", () => {
  assert.equal(sharePercent(1_260_000_00n, 1_920_000_00n), 65);
  assert.equal(sharePercent(0n, 0n), 0);
});

test("the ledger preview names the category and the cash source, no account codes", () => {
  assert.equal(ledgerPreview("utilities", "cash"), "سيُنشأ قيد: مصروف كهرباء ومياه — من الصندوق");
  assert.equal(ledgerPreview("salaries", "bank"), "سيُنشأ قيد: مصروف رواتب — من البنك");
});

test("today's reminder checks the exact ISO date", () => {
  assert.equal(hasTodayEntry(["2026-09-20", "2026-09-24"], "2026-09-24"), true);
  assert.equal(hasTodayEntry(["2026-09-20"], "2026-09-24"), false);
  assert.equal(hasTodayEntry([], "2026-09-24"), false);
});
