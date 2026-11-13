import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drawSample } from "../scripts/draw-math-regression-sample.mjs";

const read = (name) => JSON.parse(readFileSync(new URL(`../testsuite/${name}`, import.meta.url), "utf8"));

test("the regression sample is the seeded draw: 15 questions per band from the M1 strata", () => {
  const set = read("math-expressiveness-question-set.json");
  const m1 = read("math-expressiveness-m1-baseline.json");
  const sample = read("math-expressiveness-regression-sample.json");
  assert.deepEqual(sample.questions, drawSample(set.questions, m1.tags));
  for (const band of ["K-2", "3-5", "6-8", "9-12"]) assert.equal(sample.questions.filter((q) => q.band === band).length, 15, band);
  assert.equal(new Set(sample.questions.map((q) => q.id)).size, 60);
});
