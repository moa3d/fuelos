import assert from "node:assert/strict";
import { test } from "node:test";
import { featureChecklist } from "./subscriptions-rules.ts";

test("the checklist covers every known feature, checked only when the plan has it", () => {
  const list = featureChecklist(["credit_accounts", "loyalty"]);
  assert.deepEqual(list.map((f) => f.included), [true, false, true, false]);
  assert.equal(list.find((f) => f.key === "credit_accounts")?.label, "حسابات الشركات والسائقين");
});

test("a plan with no extra features has everything unchecked", () => {
  assert.equal(featureChecklist([]).every((f) => !f.included), true);
});
