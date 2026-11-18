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

// Review, round 1: the mark is made on the model's own plan, and only for the shape the probe recordings show.
test("a repeat after the speech is left alone: a replay start plays before the speech", () => {
  const compiled = compileAndValidateLessonPlan(planWith([[animate(3, "after_speech")]]));
  assert.equal(beats(compiled).at(-1).start, undefined);
  assert.equal(replays(compiled).length, 0);
});

test("after a restart there is no change to replay", () => {
  // x goes 0 → 3, a moment restarts it to 0, then a later moment animates to 0: the last thing seen was the
  // restart, not a change the model made, so nothing is replayed.
  const plan = planWith([[animate(0)], [animate(0)]], (built) => { built.sections.at(-1).moments.at(-2).restart_numbers = [1]; });
  const compiled = compileAndValidateLessonPlan(plan);
  assert.deepEqual(beats(compiled).at(-2).start, { kind: "replay", variables: ["number_01"] });
  assert.equal(beats(compiled).at(-1).start, undefined);
  assert.equal(replays(compiled).length, 0);
});

const twoNumbers = (extra, edit) => {
  const plan = structuredClone(completeLessonPlanFixtures.quadratic_translation);
  const section = plan.sections.at(-1);
  for (const actions of extra) section.moments.push({ narration: "Watch again.", actions });
  edit?.(plan);
  return plan;
};
const move = (number, end_value) => ({ action: "animate", number, end_value, easing: "linear", duration_intent: "normal", timing: "during_speech" });

test("a repeat held beside another number's change is left alone", () => {
  // The fixture's last moment moves h to 2 and k to -1. Holding h at 2 while k moves is one change, not two.
  const compiled = compileAndValidateLessonPlan(twoNumbers([[move(1, 2), move(2, 1)]]));
  assert.equal(beats(compiled).at(-1).start, undefined);
  assert.equal(replays(compiled).length, 0);
});

test("a replay joins the model's restart of another number in one start", () => {
  const compiled = compileAndValidateLessonPlan(twoNumbers([[move(1, 2)]], (plan) => { plan.sections.at(-1).moments.at(-1).restart_numbers = [2]; }));
  assert.deepEqual(beats(compiled).at(-1).start, { kind: "replay", variables: ["number_02", "number_01"], values: { number_01: 0 } });
  assert.equal(replays(compiled).length, 1);
  assert.match(replays(compiled)[0].detail, /number_01 is already 2; replayed from 0/);
});

// Review, round 2: the walk runs on the final plan, so a replay starts from a value the learner saw.
const { samplePlan } = await import(new URL("./sample-plans.mjs", import.meta.url));
test("a replay starts from the value shown, after the program rounds it", () => {
  // A polygon's side count is whole: the model's 12.4 is drawn as 12, so the replay starts at 12.
  const plan = samplePlan("circle_polygon_bounds");
  const moments = plan.sections[0].moments;
  for (const end_value of [12.4, 20, 20]) moments.push({ narration: "Watch the sides.", actions: [{ action: "animate", number: 1, end_value, timing: "during_speech" }] });
  const compiled = compileAndValidateLessonPlan(plan);
  assert.deepEqual(compiled.lesson.steps[0].beats.at(-1).start, { kind: "replay", variables: ["number_01"], values: { number_01: 12 } });
});

test("a repeat after another number has changed is left alone: that picture was never shown", () => {
  // h and k move together to 2 and -1; k then moves to 3; h "to 2" again would replay h from 0 beside k = 3.
  const compiled = compileAndValidateLessonPlan(twoNumbers([[move(2, 3)], [move(1, 2)]]));
  assert.equal(beats(compiled).at(-1).start, undefined);
  assert.equal(replays(compiled).length, 0);
});

test("the compiled plan keeps no program-only field", () => {
  const compiled = compileAndValidateLessonPlan(planWith([[animate(3)]]));
  assert.equal(JSON.stringify(compiled.resolved.plan).includes("replay_from"), false);
});

// Review, round 3: recipe hooks run before the walk, and values compare as the player shows them.
test("a replay never starts from a value a recipe hook moved", () => {
  // Two sample numbers both start at 0; the plot hook moves the second to about 1.2 so the points differ.
  // The model then writes x2 → 1.2 twice: the first moved nothing the learner saw, so nothing is replayed.
  const plan = structuredClone(completeLessonPlanFixtures.square_function);
  plan.numbers.push({ ...structuredClone(plan.numbers[0]), label: "x2" });
  for (const section of plan.sections) for (const moment of section.moments) for (const action of moment.actions) {
    if (action.action === "create" && action.kind === "visual" && action.content.capability === "function_plot") {
      action.content.numbers = [1, 2];
      action.content.parameters.sample_x_numbers = [1, 2];
    }
  }
  const last = plan.sections.at(-1);
  for (const moment of last.moments) moment.actions = moment.actions.filter((action) => action.action !== "animate");
  const toX2 = () => ({ action: "animate", number: 2, end_value: 1.2, easing: "linear", duration_intent: "normal", timing: "during_speech" });
  last.moments.push({ narration: "Watch.", actions: [toX2()] }, { narration: "Watch again.", actions: [toX2()] });
  const compiled = compileAndValidateLessonPlan(plan);
  assert.notEqual(compiled.lesson.lesson.variables[1].initial, 0, "the hook moved x2's start");
  assert.equal(beats(compiled).some((beat) => beat.start), false);
  assert.equal(replays(compiled).length, 0);
});
