import assert from "node:assert/strict";
import { test } from "node:test";
import { parseIdentifier } from "./identifier.ts";

test("emails are trimmed and lower-cased", () => {
  assert.deepEqual(parseIdentifier("  Owner@Demo.FuelOS.app "), { kind: "email", value: "owner@demo.fuelos.app" });
  assert.equal(parseIdentifier("owner@demo"), null);
});

test("phones become E.164; a local Syrian number gets +963", () => {
  assert.deepEqual(parseIdentifier("+963 933 000 111"), { kind: "phone", value: "+963933000111" });
  assert.deepEqual(parseIdentifier("0933000111"), { kind: "phone", value: "+963933000111" });
  assert.deepEqual(parseIdentifier("00963933000111"), { kind: "phone", value: "+963933000111" });
  assert.deepEqual(parseIdentifier("٠٩٣٣٠٠٠١١١"), { kind: "phone", value: "+963933000111" });
});

test("anything else is refused", () => {
  assert.equal(parseIdentifier(""), null);
  assert.equal(parseIdentifier("12345"), null);
  assert.equal(parseIdentifier("خالد"), null);
});
