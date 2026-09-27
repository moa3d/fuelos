import assert from "node:assert/strict";
import { test } from "node:test";
import { offerBadge, offerStatus } from "./rewards-rules.ts";

test("offer status by its own start/end window", () => {
  const now = Date.parse("2026-09-24T00:00:00Z");
  assert.equal(offerStatus("2026-09-01T00:00:00Z", "2026-09-30T00:00:00Z", now), "active");
  assert.equal(offerStatus("2026-09-01T00:00:00Z", "2026-09-20T00:00:00Z", now), "expired");
  assert.equal(offerStatus("2026-10-01T00:00:00Z", "2026-10-30T00:00:00Z", now), "expired"); // not started yet
});

test("offer badge tones", () => {
  assert.deepEqual(offerBadge("active"), { tone: "success", label: "فعّال" });
  assert.deepEqual(offerBadge("expired"), { tone: "neutral", label: "منتهٍ" });
});
