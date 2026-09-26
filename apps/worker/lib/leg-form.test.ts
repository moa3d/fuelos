import assert from "node:assert/strict";
import { test } from "node:test";
import { validateClosing, validateOpening } from "./leg-form.ts";

const nozzles = [{ id: "a", lastReading: 1000 }, { id: "b", lastReading: 2000.5 }];

test("opening equal to the last reading is ready, no note needed", () => {
  const r = validateOpening(nozzles, { a: "1000", b: "2000.5" }, "");
  assert.equal(r.problem, undefined);
  assert.equal(r.gapTenths, 0);
  assert.deepEqual(r.readings, [{ nozzleId: "a", tenths: 10000 }, { nozzleId: "b", tenths: 20005 }]);
});

test("a higher opening needs a written reason (unrecorded liters)", () => {
  const r = validateOpening(nozzles, { a: "1012", b: "2000.5" }, "");
  assert.equal(r.gapTenths, 120);
  assert.equal(r.problem, "اكتب سبب الفرق عن آخر قراءة");
  assert.equal(validateOpening(nozzles, { a: "1012", b: "2000.5" }, "عطل في العداد").problem, undefined);
});

test("a lower or missing opening blocks the button", () => {
  assert.equal(validateOpening(nozzles, { a: "999", b: "2000.5" }, "x").problem, "صحّح القراءة الافتتاحية");
  assert.equal(validateOpening(nozzles, { a: "1000" }, "").problem, "أدخل القراءة الافتتاحية للعداد");
  assert.equal(validateOpening([], {}, "").problem, "لا يوجد مسدس مفعّل على هذه المضخة");
});

test("closing must not be below the leg's opening", () => {
  const leg = [{ nozzleId: "a", opening: 1000 }];
  assert.equal(validateClosing(leg, { a: "1000" }).problem, undefined);      // no sales on this pump
  assert.equal(validateClosing(leg, { a: "1500.5" }).problem, undefined);
  assert.equal(validateClosing(leg, { a: "999.9" }).problem, "صحّح القراءة النهائية");
  assert.equal(validateClosing(leg, {}).problem, "أدخل القراءة النهائية للعداد");
});
