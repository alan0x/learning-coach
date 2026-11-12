// Number line lessons through the real path, from the model's reply to the lesson. The trial recipe
// is offered only when LEARNING_COACH_TRIAL_RECIPES names it, which Coach reads as it loads; this file
// sets it first (the recipe tests check the default in their own process).
process.env.LEARNING_COACH_TRIAL_RECIPES = "number_line";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The model never writes a slider step: its reply's numbers get one derived from the range
// (span / 200). These tests go through the real path, from the model's reply to the lesson, with the
// replies recorded in speed check run 5 (2026-11-11), so they see what a live lesson sees.
const { replayTurn } = await import(new URL("../scripts/replay-trial-recipe.mjs", import.meta.url));
const { NUMBER_LINE_CASES, NUMBER_LINE_QUALITY_CASES, judgeNumberLine, numberLineLesson } = await import(new URL("../scripts/eval-trial-recipe-speed.mjs", import.meta.url));
const run5 = JSON.parse(await readFile(new URL("./fixtures/number-line-run5-replies.json", import.meta.url), "utf8"));
const caseById = new Map([...NUMBER_LINE_CASES, ...NUMBER_LINE_QUALITY_CASES].map((item) => [item.id, item]));
const replay = (turn) => replayTurn(turn.replies.map((reply) => JSON.stringify(reply)), caseById.get(turn.case).prompt);

// Run 5's turns, judged as the live run judged them. 29 of 40 passed live; every unreadable line was the
// program's (targets rounded onto the derived step before the fit, the derived step read as the
// lesson's unit, a fit that discarded itself). NL-18 in pair 55 is the model's slip: 2/3 written with
// the wrong decimal scale (66,666,666,666.7) in the outline, which section retries cannot change.
for (const turn of run5.turns) {
  const modelSlip = turn.case === "NL-18" && turn.pair === 55;
  test(`run 5 replay ${turn.case} (pair ${turn.pair}): ${modelSlip ? "the model's slip stays a miss" : "passes the hard checks"}`, async () => {
    const { lesson, error } = await replay(turn);
    if (modelSlip) { assert.equal(lesson, undefined); assert.match(error, /exhausted/); return; }
    assert.ok(lesson, error);
    assert.deepEqual(judgeNumberLine(caseById.get(turn.case), numberLineLesson(lesson)).hard, []);
  });
}

test("a target the number already starts at: the line starts at 0, moves to 3/4 as it appears, and returns for the learner (owner, option a)", async () => {
  // Run 5's NL-03: the change starts at 0.75 and the task asks for 0.75; live, the target became 0.76.
  const { lesson } = await replay(run5.turns.find((turn) => turn.pair === 4));
  const line = numberLineLesson(lesson);
  const change = line.variables[1];
  assert.equal(change.initial, 0);
  assert.deepEqual(line.animations.filter(([variable]) => variable === change.as).map(([, value]) => value), [0.75, 0]);
  assert.deepEqual(line.tasks.map((task) => task.completion.value), [0.75]);
  assert.equal(line.content.ticks.subdivisions, 4);
  assert.equal(change.control.step, 0.25);
});

test("whole-number lessons get whole-number ticks however their derived slider step reads (23 + 48 had 0.5)", async () => {
  const { lesson } = await replay(run5.turns.find((turn) => turn.pair === 42));
  const line = numberLineLesson(lesson);
  assert.deepEqual([line.content.ticks.step, line.content.ticks.subdivisions], [1, 1]);
  assert.ok(line.variables.every((variable) => variable.control.step === 1));
});

test("an open question: counting by fourths with whole values only (0, 1, 2) draws whole ticks", async () => {
  // Nothing the model writes says "fourths" when every value is whole; a soft miss in run 5 (NL-10).
  const { lesson } = await replay(run5.turns.find((turn) => turn.case === "NL-10"));
  assert.deepEqual(judgeNumberLine(caseById.get("NL-10"), numberLineLesson(lesson)).soft, ["1 parts, not 4"]);
});

