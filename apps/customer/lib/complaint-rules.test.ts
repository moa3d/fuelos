import assert from "node:assert/strict";
import { test } from "node:test";
import { complaintBadge, timelineStep } from "./complaint-rules.ts";

test("badges from the customer's own point of view", () => {
  assert.deepEqual(complaintBadge("open"), { tone: "warning", label: "قيد الرد" });
  assert.deepEqual(complaintBadge("awaiting_station"), { tone: "warning", label: "قيد الرد" });
  assert.deepEqual(complaintBadge("resolved"), { tone: "success", label: "تم الحل" });
  assert.deepEqual(complaintBadge("escalated"), { tone: "info", label: "مصعّدة للمنصة" });
});

test("the 3-step timeline", () => {
  assert.equal(timelineStep("open"), "sent");
  assert.equal(timelineStep("awaiting_station"), "in_progress");
  assert.equal(timelineStep("escalated"), "in_progress");
  assert.equal(timelineStep("resolved"), "resolved");
});
