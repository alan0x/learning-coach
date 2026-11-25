// The number line in steps (OLL decision 0017): a start and two or three moves, each its own jump. Offered
// by default since 2026-11-15 (a trial recipe until then). Each case here is compiled from lesson numbers through the real path and
// judged by the steps judge (test/number-line-steps-judge.test.mjs judges hand-written lines).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NUMBER_LINE_STEPS_CASES, judgeNumberLine } from "../scripts/eval-trial-recipe-speed.mjs";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const cases = Object.fromEntries(NUMBER_LINE_STEPS_CASES.map((item) => [item.id, item]));

const compile = (numbers, extra = {}) => {
  const script = `
    const api = await import(${JSON.stringify(new URL("../lesson-plan.js", import.meta.url).href)});
    const { samplePlan } = await import(${JSON.stringify(new URL("./sample-plans.mjs", import.meta.url).href)});
    const plan = samplePlan("spring_and_mass");
    const visual = plan.sections[0].moments[0].actions[0].content;
    visual.capability = "number_line_steps";
    visual.parameters = {};
    visual.numbers = ${JSON.stringify(numbers.map((_number, index) => index + 1))};
    plan.sections[0].reusable_items[0].capability = "number_line_steps";
    plan.numbers = ${JSON.stringify(numbers)};
    plan.sections[0].moments[0].actions = plan.sections[0].moments[0].actions.filter((action) => action.action !== "animate");
    if (plan.sections[0].student_activities) delete plan.sections[0].student_activities;
    const extra = ${JSON.stringify(extra)};
    for (const animation of extra.animate ?? []) plan.sections[0].moments[0].actions.push({ action: "animate", number: animation.number, end_value: animation.end_value, easing: "linear", duration_intent: "normal", timing: "during_speech" });
    try {
      const compiled = api.compileAndValidateLessonPlan(plan);
      const write = compiled.lesson.steps[0].beats[0].actions.find((action) => action.do === "write");
      const animations = compiled.lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions.filter((action) => action.do === "animate").map((action) => [action.variable, action.value])));
      console.log(JSON.stringify({ matched: api.matchLessonPlanCapability(["number_line", "number_steps"]), kind: write.kind, content: write.content, variables: compiled.lesson.lesson.variables, tasks: compiled.lesson.lesson.tasks ?? [], animations }));
    } catch (error) {
      console.log(JSON.stringify({ error: error.message }));
    }
  `;
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8",
  }));
};
// Numbers as the model writes them in recorded outlines: wide ranges it never uses, no slider (8 in 0 to 20,
// a move of 5 in 0 to 10).
const model = (initial, min, max, label = "数") => ({ initial, min, max, label });
const passes = (id, result) => {
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(judgeNumberLine(cases[id], result).hard, [], `${id}: ${JSON.stringify(result.content)}`);
};

test("the line in steps is offered by default, after the other number lines, where the trial put it (owner, 2026-11-15)", () => {
  assert.equal(api.TRIAL_RECIPES.includes("number_line_steps"), false);
  // solid_3d follows it since 2026-11-18.
  assert.deepEqual(api.LESSON_PLAN_CAPABILITY_NAMES.slice(-4, -1), ["number_line_rounding", "number_line_steps", "solid_3d"]);
  assert.equal(api.RECIPE_PLUGIN.number_line_steps, "math");
});

test("ST-01, make ten: 8 → 10 → 13, a jump per move, hops when both moves go the same way", () => {
  const result = compile([model(8, 0, 20, "起点"), model(2, 0, 10, "凑成十"), model(3, 0, 10, "再加")]);
  assert.equal(result.matched, "number_line_steps");
  passes("ST-01", result);
  assert.deepEqual(result.content.jumps.map((jump) => [jump.as, jump.hops]), [["move", true], ["move2", true]]);
  assert.deepEqual(result.content.bindings.map((binding) => [binding.target, binding.expression]), [
    ["start.value", "number_01"], ["end.value", "(number_01)+(number_02)+(number_03)"],
    ["move.by", "number_02"], ["move2.from", "(number_01)+(number_02)"], ["move2.by", "number_03"],
  ]);
  // The same sum in the other order never lands on 10, and the judge says so.
  const swapped = compile([model(8, 0, 20, "起点"), model(3, 0, 10, "先加"), model(2, 0, 10, "再加")]);
  assert.ok(judgeNumberLine(cases["ST-01"], swapped).hard.some((miss) => /wrong steps: expected 8 → 10, 10 → 13, drawn 8 → 11, 11 → 13/u.test(miss)));
});

test("ST-02, tens then ones on a moving card: each move animates from 0, and every landing stays on the line", () => {
  const slider = (label) => ({ initial: 0, min: 0, max: 20, label, student_control: { kind: "slider", step: 1 } });
  const result = compile([model(27, 0, 60, "起点"), slider("加十"), slider("再加十"), slider("加个位")], {
    animate: [{ number: 2, end_value: 10 }, { number: 3, end_value: 10 }, { number: 4, end_value: 5 }],
  });
  passes("ST-02", result);
  assert.equal(result.content.jumps.length, 3);
  assert.ok(result.content.range.min <= 27 && result.content.range.max >= 52, JSON.stringify(result.content.range));
  // Each move narrows to what the window leaves after the moves before it, never below the value it is
  // animated to: the first keeps the model's 0–20 (the window allows 25), the later ones are cut back.
  assert.deepEqual(result.variables.slice(1).map((variable) => [variable.min, variable.max]), [[0, 20], [0, 10], [0, 5]]);
});

test("ST-03, ST-05: a move that turns back is drawn without hops", () => {
  const up = compile([model(5, 0, 15, "起点"), model(4, 0, 10, "上升"), model(-6, -10, 10, "下降")]);
  passes("ST-03", up);
  assert.deepEqual(up.content.jumps.map((jump) => jump.hops), [false, false]);
  passes("ST-05", compile([model(-3, -10, 10, "起点"), model(7, 0, 10, "向右"), model(-2, -10, 0, "向左")]));
});

test("ST-04, ST-07: counting back in two jumps, and adding a ten too many then taking 2 away", () => {
  // −5 written in −10 to 10: its range crosses 0, but a fixed move goes only where its values go, so both
  // moves count back and keep their hops.
  const back = compile([model(32, 0, 40, "起点"), model(-10, -20, 0, "减十"), model(-5, -10, 10, "减五")]);
  passes("ST-04", back);
  assert.deepEqual(back.content.jumps.map((jump) => jump.hops), [true, true]);
  passes("ST-07", compile([model(46, 0, 100, "起点"), model(40, 0, 50, "加四十"), model(-2, -10, 10, "减二")]));
});

test("one move, or more than three, is refused as a fault the outline owns", () => {
  const one = compile([model(8, 0, 20, "起点"), model(5, 0, 10, "加上")]);
  assert.match(one.error ?? "", /two or three moves/u);
  // Four moves is past the recipe's four numbers: refused before it compiles.
  assert.ok(compile([model(6, 0, 40), model(7, 0, 10), model(8, 0, 10), model(9, 0, 10), model(10, 0, 10)]).error);
});
