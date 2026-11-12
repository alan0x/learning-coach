import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MOTION_CASES, NUMBER_LINE_CASES, OTHER_CASE_IDS, TRIAL_CASES, numberLineInPart, recipesInPart, summarize } from "../scripts/eval-trial-recipe-speed.mjs";

test("trial-recipe cases pair motion requests with held-out requests from other subjects", async () => {
  const heldOut = new Set(JSON.parse(await readFile(new URL("../eval/subject-routing-heldout.json", import.meta.url), "utf8")).cases.map((item) => item.id));
  assert.equal(MOTION_CASES.length, OTHER_CASE_IDS.length);
  for (const id of OTHER_CASE_IDS) assert.ok(heldOut.has(id), id);
  assert.equal(new Set(MOTION_CASES.map((item) => item.id)).size, MOTION_CASES.length);
});

test("a first part built by the motion builder is recognised", () => {
  const part = (writes) => ({ steps: [{ beats: [{ actions: writes }] }] });
  assert.deepEqual(recipesInPart(part([{ do: "write", as: "v1-track", kind: "geometry", content: { points: [{ as: "start" }, { as: "object" }] } }])), ["constant_speed_motion"]);
  assert.deepEqual(recipesInPart(part([{ do: "write", as: "v1", kind: "plot", content: {} }])), []);
});

test("the summary splits motion and other requests", () => {
  const row = (pair, kind, arm, ms, recipes = []) => ({ pair, kind, arm, outcome: "first_playable", first_playable_ms: ms, prompt_tokens: 100, recipes });
  const summary = summarize([row(0, "motion", "baseline", 9000), row(0, "motion", "candidate", 9200, ["constant_speed_motion"]), row(1, "other", "baseline", 8000), row(1, "other", "candidate", 7900)]);
  assert.equal(summary.motion.paired_difference_ms.median, 200);
  assert.equal(summary.other.paired_difference_ms.median, -100);
  assert.equal(summary.all.candidate_used_trial_recipe, 1);
});

test("the number line trial has its own fitting requests, and its card is recognised", () => {
  assert.equal(NUMBER_LINE_CASES.length, OTHER_CASE_IDS.length);
  assert.deepEqual(Object.keys(TRIAL_CASES), ["constant_speed_motion", "number_line"]);
  assert.deepEqual(MOTION_CASES, TRIAL_CASES.constant_speed_motion);
  const part = { steps: [{ beats: [{ actions: [{ do: "write", as: "v1", kind: "number_line", content: { range: { min: 0, max: 1 } } }] }] }] };
  assert.deepEqual(recipesInPart(part), ["number_line"]);
});

test("a first part's number line is summarised for judging quality", () => {
  const part = { lesson: { variables: [{ as: "number_02", min: 0, max: 1, initial: 0.75, control: { kind: "slider", step: 0.25 } }] },
    steps: [{ beats: [{ actions: [{ do: "write", as: "v1", kind: "number_line", content: {
      range: { min: -1, max: 3 }, ticks: { step: 1, subdivisions: 4 },
      points: [{ as: "start", value: 0 }, { as: "end", value: 0.75 }], jumps: [{ as: "move", from: "start", by: 0.75, hops: true }],
      bindings: [{ target: "move.by", expression: "number_02" }],
    } }] }] }] };
  assert.deepEqual(numberLineInPart(part), {
    span: 4, range: { min: -1, max: 3 }, subdivisions: 4, step: 1, hops: true, by: 0.75, start: 0, end: 0.75,
    start_slider: null, change_slider: { min: 0, max: 1, initial: 0.75, step: 0.25 },
  });
  assert.equal(numberLineInPart({ steps: [] }), undefined);
});

// The number line judge (hard and soft checks, set before run 5).
const { judgeNumberLine, numberLineStates, NUMBER_LINE_QUALITY_CASES, TRIAL_QUALITY_CASES } = await import("../scripts/eval-trial-recipe-speed.mjs");
const lineLesson = ({ range = { min: -4, max: 4 }, ticks = { step: 1 }, start = 3, change = -5, changeRange = [-5, 0], animations = [], tasks = [], latentEnd = false } = {}) => ({
  content: {
    range, ticks,
    points: [{ as: "start", value: start, label: "起点" }, { as: "end", value: start + change, label: "终点", ...(latentEnd ? { shown: "when_emphasized" } : {}) }],
    jumps: [{ as: "move", from: "start", by: change, hops: true }],
    bindings: [{ target: "start.value", expression: "number_01" }, { target: "end.value", expression: "(number_01)+(number_02)" }, { target: "move.by", expression: "number_02" }],
  },
  variables: [{ as: "number_01", initial: start, min: start - 1, max: start + 1 }, { as: "number_02", initial: change, min: changeRange[0], max: changeRange[1] }],
  tasks, animations,
});

test("number line states combine each variable's starting, animated and target values", () => {
  const states = numberLineStates(lineLesson({ animations: [["number_02", -4]], tasks: [{ completion: { kind: "expression_target", expression: "number_01", value: 2 } }] }));
  assert.deepEqual(states.map((state) => [state.start, state.end]), [[3, -2], [3, -1], [2, -3], [2, -2]]);
});

test("the judge passes a correct line and names each hard miss", () => {
  const item = { expect: { values: [3, -2], change: -5, integer: true } };
  assert.deepEqual(judgeNumberLine(item, lineLesson()), { hard: [], soft: [] });
  // The numerator mistake of run 4: 3/4 drawn as 3.
  assert.match(judgeNumberLine({ expect: { values: [0.75], parts: 4 } }, lineLesson({ range: { min: -1, max: 5 }, ticks: { step: 1, subdivisions: 4 }, start: 0, change: 3, changeRange: [0, 3] })).hard.join(), /wrong value: 0\.75 is never shown/);
  assert.match(judgeNumberLine(item, lineLesson({ changeRange: [-5, -4], change: -4 })).hard.join(), /cannot reach -5|wrong value/);
  // A point stopped between ticks has no number under it.
  assert.match(judgeNumberLine({ expect: {} }, lineLesson({ animations: [["number_02", -4.5]] })).hard.join(), /unreadable: end at -1\.5/);
  // A fourth under "major" labels is unlabelled: a point there is unreadable, as the learner sees it.
  assert.match(judgeNumberLine({ expect: {} }, lineLesson({ ticks: { step: 1, subdivisions: 4 }, start: 0, change: 0.75, changeRange: [0, 1] })).hard.join(), /unreadable: end at 0\.75/);
  // A hidden end is not judged for readability; it is kept back on purpose.
  assert.deepEqual(judgeNumberLine({ expect: {} }, lineLesson({ ticks: { step: 1, subdivisions: 4 }, start: 0, change: 0.75, changeRange: [0, 1], latentEnd: true })).hard, []);
  assert.match(judgeNumberLine(item, { error: "boom" }).hard.join(), /compile error/);
  assert.deepEqual(judgeNumberLine(item, undefined).hard, ["no number line"]);
});

test("width, hops and parts are soft", () => {
  const { hard, soft } = judgeNumberLine({ expect: { values: [3, -2], change: -5, integer: true, parts: 2 } }, lineLesson({ range: { min: -20, max: 20 } }));
  assert.deepEqual(hard, []);
  assert.deepEqual(soft, ["1 parts, not 2", "40 units wide"]);
});

test("quality cases are written before the run: every held-out case expects values, near misses are read by hand", () => {
  assert.equal(TRIAL_QUALITY_CASES.number_line, NUMBER_LINE_QUALITY_CASES);
  for (const item of NUMBER_LINE_QUALITY_CASES) assert.ok(item.nearMiss || item.expect?.values?.length, item.id);
  for (const item of NUMBER_LINE_CASES) assert.ok(item.expect?.values?.length, item.id);
  assert.equal(new Set([...NUMBER_LINE_CASES, ...NUMBER_LINE_QUALITY_CASES].map((item) => item.id)).size, 22);
});

test("speed is summarized over the pairs only; quality rows are summarized apart", () => {
  const row = (pair, arm, kind, ms, extra = {}) => ({ pair, arm, kind, case: `C-${pair}`, outcome: "first_playable", first_playable_ms: ms, prompt_tokens: 1, ...extra });
  const summary = summarize([
    row(0, "baseline", "motion", 1000), row(0, "candidate", "motion", 1100, { quality: { hard: [], soft: [] } }),
    row(1, "candidate", "quality", 99999, { quality: { hard: ["wrong value: 0.75 is never shown"], soft: [] } }),
    row(2, "candidate", "near_miss", 5000, { recipes: ["number_line"] }),
  ]);
  assert.equal(summary.all.p50_first_playable_ms.candidate, 1100);
  assert.equal(summary.quality.judged, 2);
  assert.equal(summary.quality.hard_pass, 1);
  assert.deepEqual(summary.quality.hard_misses, [{ case: "C-1", hard: ["wrong value: 0.75 is never shown"] }]);
  assert.deepEqual(summary.quality.near_misses_for_review, [{ case: "C-2", recipes: ["number_line"] }]);
});
