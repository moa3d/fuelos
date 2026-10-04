import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPhotoShots, type RawLegReading } from "./photo-rules.ts";

function reading(over: Partial<RawLegReading> = {}): RawLegReading {
  return {
    legId: "leg-1", pumpNumber: 1, nozzleLabel: "1", openingReading: 100, closingReading: 140,
    openingPhotoPath: null, closingPhotoPath: null,
    legStartedAt: "2026-10-01T08:00:00Z", legEndedAt: "2026-10-01T16:00:00Z",
    ...over,
  };
}

test("buildPhotoShots: no photos means no shots", () => {
  assert.deepEqual(buildPhotoShots([reading()]), []);
});

test("buildPhotoShots: one shared photo for two nozzles merges into a single shot with both readings", () => {
  const rows = [
    reading({ nozzleLabel: "1", openingReading: 100, openingPhotoPath: "s/leg-1/a-opening-x.jpg" }),
    reading({ nozzleLabel: "2", openingReading: 200, openingPhotoPath: "s/leg-1/a-opening-x.jpg" }),
  ];
  const shots = buildPhotoShots(rows);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].path, "s/leg-1/a-opening-x.jpg");
  assert.deepEqual(shots[0].readings, [{ nozzleLabel: "1", value: 100 }, { nozzleLabel: "2", value: 200 }]);
});

test("buildPhotoShots: two nozzles photographed separately stay as two shots", () => {
  const rows = [
    reading({ nozzleLabel: "1", openingPhotoPath: "s/leg-1/1-opening-a.jpg" }),
    reading({ nozzleLabel: "2", openingPhotoPath: "s/leg-1/2-opening-b.jpg" }),
  ];
  const shots = buildPhotoShots(rows);
  assert.equal(shots.length, 2);
  assert.deepEqual(shots.map((s) => s.path).sort(), ["s/leg-1/1-opening-a.jpg", "s/leg-1/2-opening-b.jpg"]);
});

test("buildPhotoShots: the same path on two different legs stays two shots (never cross-leg merged)", () => {
  const rows = [
    reading({ legId: "leg-1", openingPhotoPath: "same.jpg" }),
    reading({ legId: "leg-2", openingPhotoPath: "same.jpg" }),
  ];
  assert.equal(buildPhotoShots(rows).length, 2);
});

test("buildPhotoShots: a closing photo is skipped when the leg has no closing reading yet (still open)", () => {
  const rows = [reading({ closingReading: null, closingPhotoPath: "x-closing.jpg" })];
  assert.equal(buildPhotoShots(rows).length, 0);
});

test("buildPhotoShots: order is pump number, then opening before closing", () => {
  const rows = [
    reading({ legId: "leg-2", pumpNumber: 3, openingPhotoPath: "p3-open.jpg", closingPhotoPath: "p3-close.jpg" }),
    reading({ legId: "leg-1", pumpNumber: 1, openingPhotoPath: "p1-open.jpg", closingPhotoPath: "p1-close.jpg" }),
  ];
  const order = buildPhotoShots(rows).map((s) => `${s.pumpNumber}-${s.kind}`);
  assert.deepEqual(order, ["1-opening", "1-closing", "3-opening", "3-closing"]);
});

test("buildPhotoShots: opening uses the leg's started_at, closing uses ended_at", () => {
  const rows = [reading({ openingPhotoPath: "o.jpg", closingPhotoPath: "c.jpg", legStartedAt: "2026-10-01T08:00:00Z", legEndedAt: "2026-10-01T16:00:00Z" })];
  const shots = buildPhotoShots(rows);
  assert.equal(shots.find((s) => s.kind === "opening")!.at, "2026-10-01T08:00:00Z");
  assert.equal(shots.find((s) => s.kind === "closing")!.at, "2026-10-01T16:00:00Z");
});
