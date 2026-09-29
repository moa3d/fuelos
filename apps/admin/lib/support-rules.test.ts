import assert from "node:assert/strict";
import { test } from "node:test";
import { hoursUntilSla, matchesSearch, slaText } from "./support-rules.ts";

test("hours until the SLA, null once resolved or with no due date", () => {
  const now = Date.parse("2026-09-29T00:00:00Z");
  assert.equal(hoursUntilSla("2026-09-29T06:00:00Z", now, "open"), 6);
  assert.equal(hoursUntilSla("2026-09-28T18:00:00Z", now, "in_progress"), -6);
  assert.equal(hoursUntilSla("2026-09-29T06:00:00Z", now, "resolved"), null);
  assert.equal(hoursUntilSla(null, now, "open"), null);
});

test("SLA countdown text, as in the design (45 hours -> يومين once rounded, or a past-due warning)", () => {
  assert.deepEqual(slaText(45), { tone: "info", label: "متبقٍّ يومين" });
  assert.deepEqual(slaText(5), { tone: "danger", label: "متبقٍّ 5 ساعة" });
  assert.deepEqual(slaText(12), { tone: "warning", label: "متبقٍّ 12 ساعة" });
  assert.deepEqual(slaText(0), { tone: "danger", label: "تجاوزت مهلة الرد" });
  assert.deepEqual(slaText(-3), { tone: "danger", label: "تجاوزت مهلة الرد" });
});

test("search matches the ticket subject or its station, case-insensitively; an empty query matches everything", () => {
  assert.equal(matchesSearch("فواتير لا تظهر للزبائن", "محطة الساحل", ""), true);
  assert.equal(matchesSearch("فواتير لا تظهر للزبائن", "محطة الساحل", "فواتير"), true);
  assert.equal(matchesSearch("فواتير لا تظهر للزبائن", "محطة الساحل", "الساحل"), true);
  assert.equal(matchesSearch("Invoices missing", null, "invoices"), true);
  assert.equal(matchesSearch("فواتير لا تظهر للزبائن", "محطة الساحل", "مزامنة"), false);
});
