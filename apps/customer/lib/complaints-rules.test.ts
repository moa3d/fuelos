import assert from "node:assert/strict";
import { test } from "node:test";
import { pickLastMessages } from "./complaints-rules.ts";

test("pickLastMessages: picks the first (latest) row per complaint from a descending list", () => {
  const rows = [
    { complaintId: "a", authorSide: "station" as const, body: "ردّ المحطة الأخير", createdAt: "2026-01-03T00:00:00Z" },
    { complaintId: "a", authorSide: "customer" as const, body: "رسالتي الأولى", createdAt: "2026-01-01T00:00:00Z" },
    { complaintId: "b", authorSide: "customer" as const, body: "شكوى ب الوحيدة", createdAt: "2026-01-02T00:00:00Z" },
  ];
  const result = pickLastMessages(rows, ["a", "b"]);
  assert.deepEqual(result.get("a"), { body: "ردّ المحطة الأخير", authorSide: "station", createdAt: "2026-01-03T00:00:00Z" });
  assert.deepEqual(result.get("b"), { body: "شكوى ب الوحيدة", authorSide: "customer", createdAt: "2026-01-02T00:00:00Z" });
});

test("pickLastMessages: a complaint id with no rows at all gets null, not left out of the map", () => {
  const result = pickLastMessages([], ["c"]);
  assert.equal(result.get("c"), null);
  assert.equal(result.has("c"), true);
});

test("pickLastMessages: ids not present in the result are simply absent (no row leaks across ids)", () => {
  const rows = [{ complaintId: "x", authorSide: "customer" as const, body: "غير ذي صلة", createdAt: "2026-01-01T00:00:00Z" }];
  const result = pickLastMessages(rows, ["c"]);
  assert.equal(result.get("c"), null);
  assert.equal(result.has("x"), false);
});
