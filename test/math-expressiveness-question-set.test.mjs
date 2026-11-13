import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drawHeldOut } from "../scripts/draw-math-question-set.mjs";

const set = JSON.parse(readFileSync(new URL("../testsuite/math-expressiveness-question-set.json", import.meta.url), "utf8"));
const natural = JSON.parse(readFileSync(new URL("../testsuite/math-natural-course-cases.json", import.meta.url), "utf8"));
const questions = set.questions;
const BANDS = { "K-2": 30, "3-5": 40, "6-8": 40, "9-12": 50 };

test("the question set has the plan's size per band and unique ids", () => {
  for (const [band, count] of Object.entries(BANDS)) assert.equal(questions.filter((q) => q.band === band).length, count, band);
  assert.equal(questions.length, 160);
  assert.equal(new Set(questions.map((q) => q.id)).size, questions.length);
  assert.deepEqual(set.counts.by_band, BANDS);
});

test("about a fifth is in Chinese, and each prompt is in its tagged language", () => {
  const chinese = questions.filter((q) => q.language === "zh-CN");
  assert.ok(chinese.length >= 28 && chinese.length <= 36, `${chinese.length} in Chinese`);
  for (const q of questions) assert.equal(/\p{Script=Han}/u.test(q.prompt), q.language === "zh-CN", q.id);
});

test("every tag is from the set's vocabulary, and every question says what a teacher would draw", () => {
  for (const q of questions) {
    assert.ok(Object.hasOwn(set.kinds, q.kind), `${q.id} kind ${q.kind}`);
    assert.ok(Object.hasOwn(set.picture_kinds, q.picture_kind), `${q.id} picture_kind ${q.picture_kind}`);
    assert.ok(q.teacher_picture.length > 10, q.id);
    assert.equal(q.picture_kind === "none", q.teacher_picture.startsWith("No visual needed"), q.id);
    if (q.band !== "9-12" && q.source === "star-map-draw") assert.match(q.catalog_topic_id, /^mt_/u, q.id);
  }
});

test("natural-set questions are copied verbatim and never held out", () => {
  const cases = new Map(natural.cases.map((c) => [c.id, c]));
  const reused = questions.filter((q) => q.source === "natural-set");
  assert.equal(reused.length, 12);
  assert.equal(new Set(reused.map((q) => cases.get(q.natural_case_id).topic_id)).size, 12, "one case per topic");
  for (const q of reused) {
    assert.equal(q.prompt, cases.get(q.natural_case_id).prompt, q.id);
    assert.equal(q.kind, cases.get(q.natural_case_id).variant, q.id);
    assert.equal(q.held_out, false, q.id);
  }
});

test("the held-out quarter is the seeded draw, a quarter of each band", () => {
  const drawn = drawHeldOut(questions);
  for (const q of questions) assert.equal(q.held_out, drawn.has(q.id), q.id);
  for (const [band, count] of Object.entries(BANDS)) {
    assert.equal(questions.filter((q) => q.band === band && q.held_out).length, Math.round(count / 4), band);
  }
  assert.equal(set.counts.held_out, drawn.size);
});
