import assert from "node:assert/strict";
import { test } from "node:test";
import { alreadyApplied, backoffMs, classifyFailure, errorCodeOf, parseDetail } from "./outbox-policy.ts";

test("network, timeout and server errors are retried", () => {
  assert.equal(classifyFailure({ status: 0, message: "TypeError: Failed to fetch" }), "retry");
  assert.equal(classifyFailure({ status: 503 }), "retry");
  assert.equal(classifyFailure({ status: 429 }), "retry");
});

test("an expired session keeps the row and asks for sign-in", () => {
  assert.equal(classifyFailure({ status: 401, code: "PGRST301" }), "auth");
});

test("business rules and permissions stop the queue", () => {
  assert.equal(classifyFailure({ status: 400, code: "P0001", message: "FUELOS_PUMP_BUSY" }), "permanent");
  assert.equal(classifyFailure({ status: 403, code: "42501", message: "FUELOS_PERMISSION_DENIED" }), "permanent");
});

test("backoff doubles from 2 s and stops at 5 minutes", () => {
  assert.deepEqual([1, 2, 3, 4].map(backoffMs), [2_000, 4_000, 8_000, 16_000]);
  assert.equal(backoffMs(20), 300_000);
});

test("error code comes from the RPC message", () => {
  assert.equal(errorCodeOf({ status: 400, code: "P0001", message: "FUELOS_READING_BELOW_LAST" }), "FUELOS_READING_BELOW_LAST");
  assert.equal(errorCodeOf({ status: 403, code: "42501", message: "permission denied for table shifts" }), "FUELOS_PERMISSION_DENIED");
});

test("detail is parsed as JSON when it is an object", () => {
  assert.deepEqual(parseDetail('{"remaining": 1000, "possible_liters": 5.2}'), { remaining: 1000, possible_liters: 5.2 });
  assert.deepEqual(parseDetail("nozzle 1: 10 < last 20"), { detail: "nozzle 1: 10 < last 20" });
  assert.equal(parseDetail(null), undefined);
});

test("a submit replayed after its answer was lost counts as sent", () => {
  const f = { status: 400, code: "P0001", message: "FUELOS_BAD_SHIFT_TRANSITION", details: "submitted" };
  assert.equal(alreadyApplied("submit_shift", f), true);
  assert.equal(alreadyApplied("submit_shift", { ...f, details: "approved" }), true);
  assert.equal(alreadyApplied("submit_shift", { ...f, details: "open" }), false);
  assert.equal(alreadyApplied("record_sale", f), false);
  assert.equal(alreadyApplied("submit_shift", { status: 400, code: "P0001", message: "FUELOS_REASON_REQUIRED" }), false);
});
