import assert from "node:assert/strict";
import { test } from "node:test";
import { canCloseperiod, canManage, entryBadge, isBalanced, matchesScope, sumLines } from "./journal-rules.ts";

test("balance needs at least two lines and equal, positive debit/credit", () => {
  assert.equal(isBalanced(sumLines([{ debitCents: 100n, creditCents: 0n }, { debitCents: 0n, creditCents: 100n }])), true);
  assert.equal(isBalanced(sumLines([{ debitCents: 100n, creditCents: 0n }, { debitCents: 0n, creditCents: 90n }])), false);
  assert.equal(isBalanced(sumLines([{ debitCents: 0n, creditCents: 0n }])), false);
  assert.equal(isBalanced(sumLines([{ debitCents: 100n, creditCents: 100n }])), false); // one line only
});

test("status badges match the design", () => {
  assert.deepEqual(entryBadge({ status: "draft", sourceTable: null, reversesEntryId: null }, false), { tone: "danger", label: "غير متوازن" });
  assert.deepEqual(entryBadge({ status: "draft", sourceTable: null, reversesEntryId: null }, true), { tone: "warning", label: "معلّق" });
  assert.deepEqual(entryBadge({ status: "posted", sourceTable: null, reversesEntryId: null }, true), { tone: "success", label: "معتمد" });
  assert.deepEqual(entryBadge({ status: "posted", sourceTable: "shifts", reversesEntryId: null }, true), { tone: "info", label: "آلي" });
  assert.deepEqual(entryBadge({ status: "posted", sourceTable: "shifts", reversesEntryId: "e1" }, true), { tone: "info", label: "قيد عكسي" });
});

test("scope tabs match by account code, «كل الحسابات» matches everything", () => {
  assert.equal(matchesScope(["1000", "4000"], "all"), true);
  assert.equal(matchesScope(["1000", "4000"], "cash"), true);
  assert.equal(matchesScope(["4000"], "cash"), false);
  assert.equal(matchesScope(["1200"], "inventory"), true);
  assert.equal(matchesScope(["1100"], "receivables"), true);
  assert.equal(matchesScope([], "sales"), false);
});

test("closing the period: owner only, blocked by any unposted draft in the period", () => {
  assert.deepEqual(canCloseperiod("accountant", 0), { allowed: false, reason: "إغلاق الفترة متاح لصاحب المحطة فقط" });
  assert.deepEqual(canCloseperiod("owner", 1), { allowed: false, reason: "قيد واحد غير مرحّل يمنع إغلاق الفترة" });
  assert.deepEqual(canCloseperiod("owner", 3), { allowed: false, reason: "3 قيود غير مرحّلة تمنع إغلاق الفترة" });
  assert.deepEqual(canCloseperiod("owner", 0), { allowed: true });
});

test("manual entries: owner and accountant only", () => {
  assert.equal(canManage("owner"), true);
  assert.equal(canManage("accountant"), true);
  assert.equal(canManage("shift_manager"), false);
});
