import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => JSON.parse(readFileSync(new URL(`../testsuite/${name}`, import.meta.url), "utf8"));

// The stored sample is the source of truth (chosen once and kept), so later M1 re-measurements never move it.
test("the regression sample holds 15 known questions per band, each once, with a stratum", () => {
  const ids = new Map(read("math-expressiveness-question-set.json").questions.map((q) => [q.id, q]));
  const sample = read("math-expressiveness-regression-sample.json");
  for (const band of ["K-2", "3-5", "6-8", "9-12"]) assert.equal(sample.questions.filter((q) => q.band === band).length, 15, band);
  assert.equal(new Set(sample.questions.map((q) => q.id)).size, 60);
  for (const q of sample.questions) {
    assert.equal(ids.get(q.id)?.band, q.band, q.id);
    assert.ok(Object.hasOwn(sample.strata, q.stratum), `${q.id} ${q.stratum}`);
  }
});

test("the M2/M3 readings cover the sample, and every misleading lesson names its mechanism", () => {
  const sample = read("math-expressiveness-regression-sample.json");
  const baseline = read("math-expressiveness-m2m3-baseline.json");
  assert.deepEqual(baseline.readings.map((r) => r.id).sort(), sample.questions.map((q) => q.id).sort());
  for (const r of baseline.readings) {
    assert.equal(r.m3 === "misleading", Object.hasOwn(baseline.mechanisms, r.mechanism ?? ""), r.id);
    if (r.held_out) assert.equal(r.note, "", `${r.id} is held out`);
  }
});
