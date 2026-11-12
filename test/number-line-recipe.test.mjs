// The number line recipe (OLL decision 0013) is a trial recipe: compiled and
// tested, offered to the model only when LEARNING_COACH_TRIAL_RECIPES names it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const api = await import(new URL("../lesson-plan.js", import.meta.url));

test("by default the number line is installed but not offered", () => {
  assert.ok(api.TRIAL_RECIPES.includes("number_line"));
  assert.equal(api.LESSON_PLAN_CAPABILITY_NAMES.includes("number_line"), false);
  assert.equal(api.RECIPE_PLUGIN.number_line, "math");
});

const compile = (numbers, parameters = {}) => {
  const script = `
    const api = await import(${JSON.stringify(new URL("../lesson-plan.js", import.meta.url).href)});
    const { samplePlan } = await import(${JSON.stringify(new URL("./sample-plans.mjs", import.meta.url).href)});
    const plan = samplePlan("spring_and_mass");
    const visual = plan.sections[0].moments[0].actions[0].content;
    visual.capability = "number_line";
    visual.parameters = ${JSON.stringify(parameters)};
    visual.numbers = ${JSON.stringify(numbers.map((_number, index) => index + 1))};
    plan.sections[0].reusable_items[0].capability = "number_line";
    plan.numbers = ${JSON.stringify(numbers)};
    plan.sections[0].moments[0].actions = plan.sections[0].moments[0].actions.filter((action) => action.action !== "animate");
    if (plan.sections[0].student_activities) delete plan.sections[0].student_activities;
    try {
      const compiled = api.compileAndValidateLessonPlan(plan);
      const write = compiled.lesson.steps[0].beats[0].actions.find((action) => action.do === "write");
      console.log(JSON.stringify({ matched: api.matchLessonPlanCapability(["number_line"]), kind: write.kind, content: write.content }));
    } catch (error) {
      console.log(JSON.stringify({ error: error.message }));
    }
  `;
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "number_line" },
    cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8",
  }));
};

test("3 + (−5): start and change are lesson numbers, the end is computed, and the line covers every reachable value", () => {
  const result = compile([
    { initial: 3, min: 0, max: 3, label: "起点" },
    { initial: -5, min: -5, max: 0, label: "加上的数", student_control: { kind: "slider", step: 1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.matched, "number_line");
  assert.equal(result.kind, "number_line");
  // Reachable values run from 0 + (−5) to 3 + 0, so the line runs from −6 to 4.
  assert.deepEqual(result.content.range, { min: -6, max: 4 });
  assert.deepEqual(result.content.jumps, [{ as: "move", from: "start", by: -5, hops: true }]);
  assert.deepEqual(result.content.bindings.map((binding) => [binding.target, binding.expression]), [
    ["start.value", "number_01"], ["end.value", "(number_01)+(number_02)"], ["move.by", "number_02"],
  ]);
  assert.equal(result.content.points.find((point) => point.as === "end").value, -2);
});

test("fractions choose the parts per unit that put every value on a tick", () => {
  const result = compile([
    { initial: 0.25, min: 0, max: 1, label: "起点" },
    { initial: 0.5, min: 0, max: 1, label: "加上", student_control: { kind: "slider", step: 0.25 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 4);
  assert.equal(result.content.ticks.labels, "all");
  assert.equal(result.content.jumps[0].hops, true);
});

test("hop by hop is refused when a change could not be counted in whole parts", () => {
  const result = compile([
    { initial: 0, min: 0, max: 1, label: "起点" },
    { initial: 1.3, min: 0, max: 2.7, label: "加上", student_control: { kind: "slider", step: 0.1 } },
  ], { hops: true, subdivisions: 1 });
  assert.match(result.error ?? "", /hop by hop needs a change of whole parts/);
});

// Regressions from the speed gate (2026-11-11): the model writes wide sliders
// and starts the change at 0, then animates it.
test("6 − 9 with wide sliders and a change starting at 0 compiles, hop by hop on whole-number ticks", () => {
  const result = compile([
    { initial: 6, min: 0, max: 10, label: "起点" },
    { initial: 0, min: -10, max: 10, label: "减去", student_control: { kind: "slider", step: 1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result.content.range, { min: -11, max: 21 });
  assert.deepEqual(result.content.ticks, { step: 1, subdivisions: 1, labels: "major" });
  assert.deepEqual(result.content.jumps[0], { as: "move", from: "start", by: 0, hops: true });
});

test("a long line uses coarser ticks and one arc instead of hops", () => {
  const result = compile([
    { initial: 20, min: 0, max: 100, label: "起点" },
    { initial: -7, min: -50, max: 50, label: "加上", student_control: { kind: "slider", step: 1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  // Reachable values run from −50 to 150: a 202-unit line gets a tick every 10.
  assert.equal(result.content.ticks.step, 10);
  assert.equal(result.content.jumps[0].hops, false);
});

test("a slider stepping by halves on a whole-number line is drawn as one arc", () => {
  const result = compile([
    { initial: 1, min: 0, max: 5, label: "起点" },
    { initial: 2, min: 0, max: 4, label: "加上", student_control: { kind: "slider", step: 0.5 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 1);
  assert.equal(result.content.jumps[0].hops, false);
});
