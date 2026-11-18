// An animation to the value its number already holds draws nothing (plan 3.6, "animations that change
// nothing"). In the probe recordings (PA and PI cases, never the question set), 12 of 92 animations did this,
// and 10 of them repeated a change the lesson had already made, with narration that replays it ("as m
// increases from 1 to 3", after m went from 1 to 3). The compiler now starts that beat by putting the number
// back where its last change began (OLL's replay start), so the change plays again. It reads only the
// lesson's own structure, never its wording; a number that never changed is left alone. Expectations were
// written before the code.
import assert from "node:assert/strict";
import test from "node:test";

const api = await import(new URL(process.env.COACH_BUILD ? `${process.env.COACH_BUILD}/lesson-plan.js` : "../lesson-plan.js", import.meta.url));
const { completeLessonPlanFixtures } = await import(new URL("./lesson-plan-course-fixtures.mjs", import.meta.url));
const { compileAndValidateLessonPlan } = api;

const animate = (end_value, timing = "during_speech") => ({ action: "animate", number: 1, end_value, easing: "linear", duration_intent: "normal", timing });
/** The fixture's last section animates x from 0 to 3; `extra` moments follow it in the same section. */
const planWith = (extra, edit) => {
  const plan = structuredClone(completeLessonPlanFixtures.square_function);
  const section = plan.sections.at(-1);
  for (const actions of extra) section.moments.push({ narration: "Watch x change again.", actions });
  edit?.(plan);
  return plan;
};
const beats = (compiled) => compiled.lesson.steps.flatMap((step) => step.beats);
const replays = (compiled) => compiled.program_adjustments.filter((item) => item.reason === "animation_replays_change");

test("a repeated change replays from where it began", () => {
  const compiled = compileAndValidateLessonPlan(planWith([[animate(3)]]));
  const beat = beats(compiled).at(-1);
  assert.deepEqual(beat.start, { kind: "replay", variables: ["number_01"], values: { number_01: 0 } });
  assert.equal(replays(compiled).length, 1);
  assert.equal(replays(compiled)[0].kind, "change_replayed");
  assert.equal(compiled.view_adjustments.some((item) => item.reason === "animation_replays_change"), false);
});

test("the most recent change is the one replayed", () => {
  const compiled = compileAndValidateLessonPlan(planWith([[animate(-1)], [animate(-1)]]));
  assert.deepEqual(beats(compiled).at(-1).start, { kind: "replay", variables: ["number_01"], values: { number_01: 3 } });
});

test("a number that never changed is left alone", () => {
  const compiled = compileAndValidateLessonPlan(planWith([], (plan) => {
    plan.sections.at(-1).moments[0].actions[0].end_value = 0;
  }));
  assert.equal(beats(compiled).some((beat) => beat.start), false);
  assert.equal(replays(compiled).length, 0);
});

test("a beat the model already restarts is left alone", () => {
  const compiled = compileAndValidateLessonPlan(planWith([[animate(3)]], (plan) => {
    plan.sections.at(-1).moments.at(-1).restart_numbers = [1];
  }));
  assert.deepEqual(beats(compiled).at(-1).start, { kind: "replay", variables: ["number_01"] });
  assert.equal(replays(compiled).length, 0);
});

test("a repeat inside the beat that made the change is left alone", () => {
  const compiled = compileAndValidateLessonPlan(planWith([[animate(-1), animate(-1)]]));
  assert.equal(beats(compiled).at(-1).start, undefined);
  assert.equal(replays(compiled).length, 0);
});

test("actions are followed in the order they play: before, during, then after speech", () => {
  // Plays as: to 1 before speech, then to 3 after it. Neither is a repeat, whatever their written order.
  const compiled = compileAndValidateLessonPlan(planWith([[animate(3, "after_speech"), animate(1, "before_speech")]]));
  assert.equal(beats(compiled).at(-1).start, undefined);
  assert.equal(replays(compiled).length, 0);
});

test("a lesson with no repeat compiles exactly as before", () => {
  const plan = planWith([[animate(-2)]]);
  const compiled = compileAndValidateLessonPlan(plan);
  assert.equal(beats(compiled).some((beat) => beat.start), false);
  assert.equal(replays(compiled).length, 0);
});
