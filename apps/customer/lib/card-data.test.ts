import assert from "node:assert/strict";
import { test } from "node:test";
import { groupedCode } from "./card-data.ts";

test("groupedCode: groups a 12-character token into 3 blocks of 4", () => {
  assert.equal(groupedCode("AB12CD34EF56"), "AB12 CD34 EF56");
});

test("groupedCode: a short/odd-length token still groups without throwing", () => {
  assert.equal(groupedCode("AB1"), "AB1");
});
