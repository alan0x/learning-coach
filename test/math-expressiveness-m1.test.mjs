import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarize } from "../scripts/m1-summary.mjs";

const read = (name) => JSON.parse(readFileSync(new URL(`../testsuite/${name}`, import.meta.url), "utf8"));
const set = read("math-expressiveness-question-set.json");
// The baseline (2026-11-13) and each re-tag after a switch-on (plan §7): every file follows the same rules.
for (const file of ["math-expressiveness-m1-baseline.json", "math-expressiveness-m1-2026-11-15.json"]) {
const m1 = read(file);

test(`${file}: every question of the frozen set has exactly one M1 tag`, () => {
  assert.deepEqual(Object.keys(m1.tags).sort(), set.questions.map((q) => q.id).sort());
});

test(`${file}: tags follow the rules: components exist, candidates are listed, held-out notes are left out`, () => {
  const heldOut = new Set(set.questions.filter((q) => q.held_out).map((q) => q.id));
  for (const [id, tag] of Object.entries(m1.tags)) {
    assert.ok(Object.hasOwn(m1.rules, tag.coverage), `${id} ${tag.coverage}`);
    if (tag.coverage === "fully" || tag.coverage === "partly") assert.ok(m1.existing_components.includes(tag.component), `${id} ${tag.component}`);
    else assert.equal(tag.component, undefined, id);
    assert.equal(tag.coverage === "fully", tag.completes_with === undefined, id);
    if (tag.completes_with) assert.ok(Object.hasOwn(m1.candidates, tag.completes_with), `${id} ${tag.completes_with}`);
    if (tag.completes_with && tag.coverage !== "partly") assert.equal(m1.candidates[tag.completes_with].split, tag.coverage, id);
    if (heldOut.has(id)) assert.equal(tag.note, undefined, `${id} is held out`);
  }
});

test(`${file}: the stored summary is what the tags give`, () => {
  assert.deepEqual(m1.summary, summarize(set.questions, m1.tags));
});
}
