import assert from "node:assert/strict";
import { test } from "node:test";
import { auditCategory, auditTag } from "./audit-rules.ts";

test("audit categories by entity", () => {
  assert.equal(auditCategory("station_members"), "security");
  assert.equal(auditCategory("access_grants"), "security");
  assert.equal(auditCategory("journal_entries"), "financial");
  assert.equal(auditCategory("expenses"), "financial");
  assert.equal(auditCategory("shifts"), "other");
});

test("audit tags fall back to the raw entity name when unknown", () => {
  assert.equal(auditTag("station_members"), "صلاحيات");
  assert.equal(auditTag("access_grants"), "وصول");
  assert.equal(auditTag("some_new_table"), "some_new_table");
});
