// The trading mat's development cases (OLL decision 0023). The judge itself is tested on lessons the
// compiler makes, in base-ten-recipe.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const valueOf = ([h, t, o]) => h * 100 + t * 10 + o;

test("every development case names a pile the mat can start with, or is a near miss", async () => {
  const { cases } = JSON.parse(await readFile(new URL("../testsuite/base-ten-dev-cases.json", import.meta.url), "utf8"));
  // 20 English (BT-01–20) and 13 Chinese (BT-21–33), each language with its own near misses.
  assert.equal(cases.length, 33);
  assert.equal(cases.filter((each) => each.language === "zh-CN").length, 13);
  assert.equal(cases.filter((each) => each.language === "zh-CN" && each.expect.forbid).length, 3);
  for (const each of cases) {
    if (each.expect.forbid) continue;
    const [h, t, o] = each.expect.lesson_pile;
    assert.ok(h <= 9 && t <= 19 && o <= 59 && valueOf([h, t, o]) <= 999, `${each.id} ${each.expect.lesson_pile}`);
  }
});
