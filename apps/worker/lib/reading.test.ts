import assert from "node:assert/strict";
import { test } from "node:test";
import { checkReading, normalizeDigits, parseCash, parseReadingTenths } from "./reading.ts";

test("Arabic-Indic digits and separators are accepted", () => {
  assert.equal(normalizeDigits("١٨٤٬٢٢٠٫٥"), "184220.5");
  assert.equal(parseReadingTenths("184,220.5"), 1842205);
  assert.equal(parseReadingTenths("١٨٤٢٢٠"), 1842200);
});

test("readings allow one decimal only", () => {
  assert.equal(parseReadingTenths("10.25"), null);
  assert.equal(parseReadingTenths("abc"), null);
  assert.equal(parseReadingTenths("-5"), null);
});

test("opening reading is compared with the last closing reading", () => {
  assert.deepEqual(checkReading("", 100), { kind: "empty" });
  assert.deepEqual(checkReading("184220.5", 184220.5), { kind: "equal", tenths: 1842205 });
  assert.deepEqual(checkReading("184230", 184220.5), { kind: "higher", tenths: 1842300, diffTenths: 95 });
  assert.deepEqual(checkReading("184220", 184220.5), { kind: "lower", tenths: 1842200, diffTenths: 5 });
  assert.deepEqual(checkReading("1.2.3", 1), { kind: "invalid" });
});

test("cash is whole units as a digit string, never a float", () => {
  assert.equal(parseCash("50,000"), "50000");
  assert.equal(parseCash("٥٠٠٠٠"), "50000");
  assert.equal(parseCash("007"), "7");
  assert.equal(parseCash("0"), "0");
  assert.equal(parseCash("12.5"), null);
  assert.equal(parseCash(""), null);
});
