import assert from "node:assert/strict";
import { test } from "node:test";
import { credentialBadge, generateDeviceId, syncStale } from "./device-rules.ts";

test("credentialBadge: the three states", () => {
  assert.deepEqual(credentialBadge("active"), { tone: "success", label: "فعّال" });
  assert.deepEqual(credentialBadge("revoked"), { tone: "danger", label: "مُبطَل" });
  assert.deepEqual(credentialBadge("none"), { tone: "neutral", label: "غير مفعّل" });
});

test("syncStale: never synced is not stale", () => {
  assert.equal(syncStale(null, Date.now()), false);
});

test("syncStale: 2 days ago is not stale, 4 days ago is", () => {
  const now = Date.parse("2026-10-05T00:00:00Z");
  assert.equal(syncStale("2026-10-03T00:00:00Z", now), false);
  assert.equal(syncStale("2026-10-01T00:00:00Z", now), true);
});

test("generateDeviceId: a 'dev-' prefix plus 6 lowercase/digit characters", () => {
  const id = generateDeviceId(() => 0.5);
  assert.match(id, /^dev-[a-z0-9]{6}$/);
});

test("generateDeviceId: different draws give different ids", () => {
  let n = 0;
  const seq = [0.01, 0.99, 0.2, 0.8, 0.4, 0.6];
  const id = generateDeviceId(() => seq[n++]);
  assert.match(id, /^dev-[a-z0-9]{6}$/);
});
