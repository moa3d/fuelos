import assert from "node:assert/strict";
import { test } from "node:test";
import { localStatusOf, mergeServerShift, routeFor } from "./shift-merge.ts";

const leg = (over: Record<string, unknown> = {}) => ({
  legId: "l1", pumpId: "p1", pumpNumber: 1, startedAt: "2026-09-27T06:00:00Z",
  readings: [{ nozzleId: "n1", label: "بنزين 90", productId: "x", opening: 100, closing: 150 }],
  ...over,
});
const submitted = {
  userId: "u", shiftId: "s", stationId: "st", openedAt: "2026-09-27T06:00:00Z", openingCash: "50000",
  status: "submitted" as const, countedCash: "55000", diffReason: "خطأ", submittedAt: "2026-09-27T14:00:00Z",
  legs: [leg({ endedAt: "2026-09-27T14:00:00Z" })],
};

test("server statuses map to the device's", () => {
  assert.equal(localStatusOf("open"), "open");
  assert.equal(localStatusOf("reopened"), "open");
  assert.equal(localStatusOf("submitted"), "submitted");
  assert.equal(localStatusOf("approved"), "approved");
  assert.equal(localStatusOf("rejected"), "rejected");
});

test("the owner returned the close: the shift is open again with the last leg reopened and his note kept", () => {
  const server = {
    status: "reopened" as const, decisionNote: "أعد عدّ الصندوق", countedCash: null, diffReason: "خطأ",
    legs: [leg({ readings: [{ nozzleId: "n1", label: "بنزين 90", productId: "x", opening: 100 }] })],
  };
  const { shift, changed } = mergeServerShift(submitted, server);
  assert.equal(changed, true);
  assert.equal(shift.status, "open");
  assert.equal(shift.returnedNote, "أعد عدّ الصندوق");
  assert.equal(shift.legs[0].endedAt, undefined);
  assert.equal(shift.legs[0].readings[0].closing, undefined);
  assert.equal(shift.countedCash, undefined);
  assert.equal(shift.submittedAt, undefined);
  assert.equal(routeFor(shift), "/shift");
});

test("approved and rejected are shown on the closing screen", () => {
  const base = { countedCash: "55000", diffReason: "خطأ", legs: submitted.legs };
  const ok = mergeServerShift(submitted, { ...base, status: "approved", decisionNote: null });
  assert.equal(ok.changed, true);
  assert.equal(ok.shift.status, "approved");
  assert.equal(routeFor(ok.shift), "/shift/done");
  const no = mergeServerShift(submitted, { ...base, status: "rejected", decisionNote: "الصندوق ناقص" });
  assert.equal(no.shift.status, "rejected");
  assert.equal(no.shift.decisionNote, "الصندوق ناقص");
});

test("nothing changes when the server agrees", () => {
  const same = mergeServerShift(submitted, { status: "submitted", decisionNote: null, countedCash: "55000", diffReason: "خطأ", legs: submitted.legs });
  assert.equal(same.changed, false);
});

test("an open shift keeps the device's legs while the server also says open", () => {
  const open = { ...submitted, status: "open" as const, legs: [leg()] };
  const r = mergeServerShift(open, { status: "open", decisionNote: null, countedCash: null, diffReason: null, legs: [leg({ pumpNumber: 9 })] });
  assert.equal(r.changed, false);
  assert.equal(r.shift.legs[0].pumpNumber, 1);
});

test("an open shift the server already closed (submitted for the attendant) moves to the closing screen", () => {
  const open = { ...submitted, status: "open" as const, legs: [leg()] };
  const r = mergeServerShift(open, { status: "submitted", decisionNote: null, countedCash: "1000", diffReason: null, legs: [leg({ endedAt: "2026-09-27T14:00:00Z" })] });
  assert.equal(r.changed, true);
  assert.equal(r.shift.status, "submitted");
  assert.equal(routeFor(r.shift), "/shift/done");
});
