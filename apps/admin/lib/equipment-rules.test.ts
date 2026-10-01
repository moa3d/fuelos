import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPayload, draftFromTemplate, readinessCount, readinessItems, type ReadinessData,
} from "./equipment-rules.ts";

test("draftFromTemplate: pump count matches the template", () => {
  assert.equal(draftFromTemplate("small").pumps.length, 4);
  assert.equal(draftFromTemplate("medium").pumps.length, 6);
  assert.equal(draftFromTemplate("large").pumps.length, 10);
});

test("draftFromTemplate: one tank per default product, two nozzles per pump", () => {
  const d = draftFromTemplate("small");
  assert.equal(d.tanks.length, 3);
  for (const p of d.pumps) assert.equal(p.nozzles.length, 2);
});

test("buildPayload: a valid draft builds tank_key-linked nozzles", () => {
  const payload = buildPayload(draftFromTemplate("small"));
  assert.ok(payload);
  assert.equal(payload!.tanks.length, 3);
  assert.equal(payload!.pumps.length, 4);
  assert.equal(payload!.pumps[0].nozzles[0].tank_key, payload!.tanks.find((t) => t.key === payload!.pumps[0].nozzles[0].tank_key)!.key);
});

test("buildPayload: rejects a non-numeric reading", () => {
  const d = draftFromTemplate("small");
  d.pumps[0].nozzles[0].lastReading = "abc";
  assert.equal(buildPayload(d), null);
});

test("buildPayload: rejects a min_level_pct over 100", () => {
  const d = draftFromTemplate("small");
  d.tanks[0].minLevelPct = "120";
  assert.equal(buildPayload(d), null);
});

const BASE: ReadinessData = {
  station_status: "setup", products: 3, tanks: 0, pumps: 0, nozzles: 0, prices_set: 0, owner_signed_in: false,
  attendants: 0, attendants_with_pin: 0, devices: 0, subscription: false, first_shift_at: null,
};

test("readinessItems: nothing done but the station itself", () => {
  const items = readinessItems(BASE);
  assert.equal(items.find((i) => i.key === "station")!.done, true);
  assert.equal(items.filter((i) => i.done).length, 1);
});

test("readinessItems: equipment needs both tanks and nozzles", () => {
  const items = readinessItems({ ...BASE, tanks: 3, nozzles: 0 });
  assert.equal(items.find((i) => i.key === "equipment")!.done, false);
});

test("readinessCount: counts done vs the 7 total", () => {
  const items = readinessItems({ ...BASE, tanks: 3, nozzles: 8, prices_set: 1 });
  const { done, total } = readinessCount(items);
  assert.equal(total, 7);
  assert.equal(done, 3);
});
