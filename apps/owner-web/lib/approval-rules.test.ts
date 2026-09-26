import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canDecide, closeChoices, decisionSupported, defaultChoice, noteRequired, planFor, whoCanDecide,
} from "./approval-rules.ts";

test("only the owner decides closes and credit; stock adjustments also by the shift manager", () => {
  assert.equal(canDecide("owner", "shift_close"), true);
  assert.equal(canDecide("accountant", "shift_close"), false);
  assert.equal(canDecide("shift_manager", "shift_close"), false);
  assert.equal(canDecide("shift_manager", "credit_over_limit"), false);
  assert.equal(canDecide("shift_manager", "stock_adjustment"), true);
  assert.equal(canDecide("accountant", "stock_adjustment"), false);
  assert.equal(whoCanDecide("shift_close"), "اعتماد الإغلاق متاح لصاحب المحطة فقط");
});

test("a shortage asks where the difference goes; otherwise plain approval", () => {
  assert.deepEqual(closeChoices(-450_000n).map((c) => c.id), ["shortage_to_expense", "shortage_to_employee", "return"]);
  assert.deepEqual(closeChoices(0n).map((c) => c.id), ["approve", "return"]);
  assert.deepEqual(closeChoices(120_000n).map((c) => c.id), ["approve", "return"]);
  assert.equal(defaultChoice("shift_close", -1n), "shortage_to_expense");
  assert.equal(defaultChoice("credit_over_limit", 0n), "approve");
});

test("each choice maps to what the server expects", () => {
  assert.deepEqual(planFor("shortage_to_employee"), { approve: true, option: "shortage_to_employee", reopenAfter: false });
  assert.deepEqual(planFor("approve"), { approve: true, option: null, reopenAfter: false });
  assert.deepEqual(planFor("return"), { approve: false, option: null, reopenAfter: true });
  assert.deepEqual(planFor("reject"), { approve: false, option: null, reopenAfter: false });
});

test("rejections and returns need a note; so do stock adjustments", () => {
  assert.equal(noteRequired("shift_close", "reject"), true);
  assert.equal(noteRequired("shift_close", "return"), true);
  assert.equal(noteRequired("stock_adjustment", "approve"), true);
  assert.equal(noteRequired("shift_close", "shortage_to_expense"), false);
  assert.equal(noteRequired("credit_over_limit", "approve"), false);
});

test("shift_reopen decisions are not supported by the server yet", () => {
  assert.equal(decisionSupported("shift_reopen"), false);
  assert.equal(decisionSupported("shift_close"), true);
});
