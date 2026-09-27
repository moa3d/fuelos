import assert from "node:assert/strict";
import { test } from "node:test";
import { canCorrectInvoice, canHandle, hoursUntilSla, slaText, statusBadge } from "./complaint-rules.ts";

test("list badge: open and awaiting-station both mean the owner should reply", () => {
  assert.deepEqual(statusBadge("open"), { tone: "warning", label: "بانتظار ردك" });
  assert.deepEqual(statusBadge("awaiting_station"), { tone: "warning", label: "بانتظار ردك" });
  assert.deepEqual(statusBadge("resolved"), { tone: "success", label: "محلولة" });
  assert.deepEqual(statusBadge("escalated"), { tone: "danger", label: "مصعّدة للمنصة" });
});

test("hours until the SLA, whole hours, null once decided", () => {
  const due = "2026-09-20T12:00:00Z";
  assert.equal(hoursUntilSla(due, Date.parse("2026-09-20T10:00:00Z"), "open"), 2);
  assert.equal(hoursUntilSla(due, Date.parse("2026-09-19T12:00:00Z"), "awaiting_station"), 24);
  assert.equal(hoursUntilSla(due, Date.parse("2026-09-21T00:00:00Z"), "open"), -12);
  assert.equal(hoursUntilSla(due, Date.parse("2026-09-20T10:00:00Z"), "resolved"), null);
  assert.equal(hoursUntilSla(due, Date.parse("2026-09-20T10:00:00Z"), "escalated"), null);
});

test("SLA countdown text, as in the design (45 ساعة → يومين)", () => {
  assert.deepEqual(slaText(45), { tone: "warning", label: "متبقٍّ يومين قبل التصعيد" });
  assert.deepEqual(slaText(5), { tone: "danger", label: "متبقٍّ 5 ساعة قبل التصعيد" });
  assert.deepEqual(slaText(10), { tone: "warning", label: "متبقٍّ 10 ساعة قبل التصعيد" });
  assert.deepEqual(slaText(0), { tone: "danger", label: "تجاوز مهلة الرد — سيُصعَّد للمنصة" });
  assert.deepEqual(slaText(-3), { tone: "danger", label: "تجاوز مهلة الرد — سيُصعَّد للمنصة" });
  assert.deepEqual(slaText(24), { tone: "warning", label: "متبقٍّ يوم واحد قبل التصعيد" });
});

test("who may act: the screen is owner/shift_manager; invoice corrections need owner here", () => {
  assert.equal(canHandle("owner"), true);
  assert.equal(canHandle("shift_manager"), true);
  assert.equal(canHandle("accountant"), false);
  assert.equal(canCorrectInvoice("owner"), true);
  assert.equal(canCorrectInvoice("shift_manager"), false);
});
