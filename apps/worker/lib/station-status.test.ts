import assert from "node:assert/strict";
import { test } from "node:test";
import { statusRpcArgs } from "./station-status.ts";

test("crowd-only patch sends p_open: null", () => {
  assert.deepEqual(statusRpcArgs("station-1", { crowd: "medium" }), { p_station: "station-1", p_open: null, p_crowd: "medium" });
});

test("open-only patch sends p_crowd: null", () => {
  assert.deepEqual(statusRpcArgs("station-1", { open: true }), { p_station: "station-1", p_open: true, p_crowd: null });
  assert.deepEqual(statusRpcArgs("station-1", { open: false }), { p_station: "station-1", p_open: false, p_crowd: null });
});

test("both set sends both", () => {
  assert.deepEqual(statusRpcArgs("station-1", { open: true, crowd: "high" }), { p_station: "station-1", p_open: true, p_crowd: "high" });
});
