import assert from "node:assert/strict";
import { test } from "node:test";
import { canSetPin, isSelfRow, matchesSearch, statusBadge } from "./settings-rules.ts";

test("status badges", () => {
  assert.deepEqual(statusBadge("active"), { tone: "success", label: "نشط" });
  assert.deepEqual(statusBadge("invited"), { tone: "warning", label: "دعوة معلّقة" });
  assert.deepEqual(statusBadge("suspended"), { tone: "danger", label: "موقوف" });
});

test("search matches case-insensitively, empty query matches everything", () => {
  assert.equal(matchesSearch("خالد العمر", "خالد"), true);
  assert.equal(matchesSearch("Ahmad Salem", "salem"), true);
  assert.equal(matchesSearch("خالد العمر", "سامر"), false);
  assert.equal(matchesSearch("خالد العمر", ""), true);
});

test("you can't manage your own row from this screen", () => {
  assert.equal(isSelfRow("u1", "u1"), true);
  assert.equal(isSelfRow("u1", "u2"), false);
});

test("only attendants and shift managers get a PIN", () => {
  assert.equal(canSetPin("attendant"), true);
  assert.equal(canSetPin("shift_manager"), true);
  assert.equal(canSetPin("owner"), false);
  assert.equal(canSetPin("accountant"), false);
});
