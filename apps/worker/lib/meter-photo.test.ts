import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_PHOTO_BYTES, validatePhoto } from "./meter-photo.ts";

function fakeFile(type: string, size: number): File {
  return { type, size } as File;
}

test("validatePhoto: accepts an ordinary jpeg under the size limit", () => {
  assert.equal(validatePhoto(fakeFile("image/jpeg", 1024)), undefined);
});

test("validatePhoto: rejects an unsupported type", () => {
  assert.match(validatePhoto(fakeFile("image/gif", 1024))!, /صيغة/);
});

test("validatePhoto: rejects a file over 5MB", () => {
  assert.match(validatePhoto(fakeFile("image/png", MAX_PHOTO_BYTES + 1))!, /حجم/);
});

test("validatePhoto: accepts exactly the size limit", () => {
  assert.equal(validatePhoto(fakeFile("image/webp", MAX_PHOTO_BYTES)), undefined);
});
