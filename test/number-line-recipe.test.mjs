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

const compile = (numbers, parameters = {}, extra = {}) => {
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
    const extra = ${JSON.stringify(extra)};
    for (const animation of extra.animate ?? []) plan.sections[0].moments[0].actions.push({ action: "animate", number: animation.number, end_value: animation.end_value, easing: "linear", duration_intent: "normal", timing: "during_speech" });
    if (extra.task) plan.sections[0].student_activities = [{ kind: "number_target", prompt: "把移动量调到目标。", number_controls: [{ number: extra.task.number, controls: ["slider"] }], value: extra.task.value, tolerance: extra.task.tolerance ?? 0.005, hints: ["看刻度。"] }];
    if (extra.shared) plan.sections[0].moments[0].actions.push({ action: "create", kind: "visual", role: "supporting_visual", content: { capability: "number_line", parameters: {}, numbers: [extra.shared] }, placement: { relation: "new_region" } });
    try {
      const compiled = api.compileAndValidateLessonPlan(plan);
      const write = compiled.lesson.steps[0].beats[0].actions.find((action) => action.do === "write");
      const animations = compiled.lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions.filter((action) => action.do === "animate").map((action) => [action.variable, action.value])));
      console.log(JSON.stringify({ matched: api.matchLessonPlanCapability(["number_line"]), kind: write.kind, content: write.content, variables: compiled.lesson.lesson.variables, tasks: compiled.lesson.lesson.tasks ?? [], animations }));
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
  // The lesson uses 0, 3 and −2. The start, which nothing moves, is kept near 3 (2 to 3), and
  // the change keeps its −5 to 0, so the line runs from −4 to 4 (it was −6 to 4 before fitting).
  assert.deepEqual(result.content.range, { min: -4, max: 4 });
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

test("the model is not asked for subdivisions or hops: the schema offers neither, and the program decides both", () => {
  const result = compile([
    { initial: 0, min: 0, max: 1, label: "起点" },
    { initial: 1.3, min: 0, max: 2.7, label: "加上", student_control: { kind: "slider", step: 0.1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 10);
  assert.equal(result.content.jumps[0].hops, false, "27 tenth-hops exceed the 24-hop limit, so one arc");
  assert.deepEqual(api.RECIPE_SCHEMA_PROPERTIES.number_line, { denominator: { type: "integer", minimum: 1, maximum: 12 } }, "the model may give only the denominator");
  assert.match(compile([{ initial: 0, min: 0, max: 1, label: "起点" }], { hops: true }).error ?? "", /hops/);
});

// Regressions from the speed gate (2026-11-11): the model writes wide sliders
// and starts the change at 0, then animates it.
test("6 − 9 with wide sliders and a change starting at 0 compiles, hop by hop on whole-number ticks", () => {
  const result = compile([
    { initial: 6, min: 0, max: 10, label: "起点" },
    { initial: 0, min: -10, max: 10, label: "减去", student_control: { kind: "slider", step: 1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  // The start (0 to 10) is narrowed near 6; the change keeps −10 to 10 so −9 stays reachable: −6 to 18, not −11 to 21.
  assert.deepEqual(result.content.range, { min: -6, max: 18 });
  assert.deepEqual(result.content.ticks, { step: 1, subdivisions: 1, labels: "major" });
  assert.deepEqual(result.content.jumps[0], { as: "move", from: "start", by: 0, hops: true });
});

test("wide sliders around a far start shrink to a readable line with hops", () => {
  const result = compile([
    { initial: 20, min: 0, max: 100, label: "起点" },
    { initial: -7, min: -50, max: 50, label: "加上", student_control: { kind: "slider", step: 1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  // 20 − 7: the start is kept near 20 and the change, which would make the line 140 units long, is narrowed to −20 to 0.
  assert.deepEqual(result.content.range, { min: -2, max: 22 });
  assert.equal(result.content.jumps[0].hops, true);
});

test("values the lesson really uses far apart keep a long line with coarser ticks and one arc", () => {
  const result = compile([
    { initial: 0, min: 0, max: 10, label: "起点" },
    { initial: 100, min: 0, max: 100, label: "加上", student_control: { kind: "slider", step: 1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.step, 5);
  assert.equal(result.content.jumps[0].hops, false);
});
test("a slider stepping by halves gets half ticks, hop by hop", () => {
  const result = compile([
    { initial: 1, min: 0, max: 5, label: "起点" },
    { initial: 2, min: 0, max: 4, label: "加上", student_control: { kind: "slider", step: 0.5 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 2);
  assert.equal(result.content.jumps[0].hops, true);
});

// Review of #59: every supported count of parts, and the sliders' steps.
test("sevenths get seven parts per unit", () => {
  const result = compile([
    { initial: 1 / 7, min: 0, max: 1, label: "起点" },
    { initial: 2 / 7, min: 0, max: 1, label: "加上" },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 7);
  assert.equal(result.content.jumps[0].hops, true);
});

test("sliders stepping by quarters get quarter ticks, so every value they reach is a tick and each hop is a quarter", () => {
  const result = compile([
    { initial: 0, min: 0, max: 1, label: "起点", student_control: { kind: "slider", step: 0.25 } },
    { initial: 1, min: 0, max: 1, label: "加上", student_control: { kind: "slider", step: 0.25 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 4);
  assert.equal(result.content.jumps[0].hops, true);
});

test("ninths and elevenths are found too", () => {
  for (const parts of [9, 11]) {
    const result = compile([
      { initial: 0, min: 0, max: 1, label: "起点" },
      { initial: 1 / parts, min: 0, max: 1, label: "加上", student_control: { kind: "slider", step: 1 / parts } },
    ]);
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.content.ticks.subdivisions, parts);
  }
});

test("a slider step no count of parts can hold gives way to the values' own denominator", () => {
  const result = compile([
    { initial: 0, min: 0, max: 1, label: "起点" },
    { initial: 0.3, min: 0, max: 1.5, label: "加上", student_control: { kind: "slider", step: 0.15 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  // 0.3 is three tenths; the 0.15 step is replaced by a tenth.
  assert.equal(result.content.ticks.subdivisions, 10);
  assert.equal(result.content.jumps[0].hops, true);
});

test("values with no denominator up to 12 keep whole-number ticks and one arc", () => {
  const result = compile([
    { initial: 0, min: 0, max: 1, label: "起点" },
    { initial: 0.37, min: 0, max: 1, label: "加上", student_control: { kind: "slider", step: 0.01 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 1);
  assert.equal(result.content.jumps[0].hops, false);
});
// Shapes the model wrote in speed gate run 3 (2026-11-11), fitted to what the lesson teaches.
test("run 3: thirds written as 0.33 and 0.67 with a 0.1 step are drawn in thirds, exactly", () => {
  const result = compile([
    { initial: 0.33, min: 0, max: 1, label: "起点" },
    { initial: 0.67, min: 0, max: 1, label: "加上", student_control: { kind: "slider", step: 0.1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 3);
  assert.equal(result.variables[1].control.step, 1 / 3);
  assert.ok(Math.abs(result.content.points.find((point) => point.as === "end").value - 1) < 1e-9, "1/3 + 2/3 ends exactly at 1");
});

test("run 3: 3/4 with a 0.05 step is drawn in quarters", () => {
  const result = compile([
    { initial: 0, min: 0, max: 1, label: "起点" },
    { initial: 0.75, min: 0, max: 1, label: "加上", student_control: { kind: "slider", step: 0.05 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 4);
  assert.equal(result.content.jumps[0].hops, true);
});

test("run 3: counting by fourths, where the numbers alone say nothing, follows the model's denominator", () => {
  const result = compile([
    { initial: 0, min: 0, max: 2, label: "起点" },
    { initial: 0, min: 0, max: 2, label: "加上", student_control: { kind: "slider", step: 0.1 } },
  ], { denominator: 4 }, { animate: [{ number: 2, end_value: 2 }] });
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 4);
  assert.equal(result.variables[1].control.step, 0.25);
  assert.equal(result.content.jumps[0].hops, true);
});

test("run 3: 3 + (−5) on two sliders of −10 to 10 is drawn on −9 to 15, not −21 to 21, with hops", () => {
  const result = compile([
    { initial: 3, min: -10, max: 10, label: "起点" },
    { initial: -5, min: -10, max: 10, label: "加上", student_control: { kind: "slider", step: 1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result.content.range, { min: -9, max: 15 });
  assert.equal(result.content.jumps[0].hops, true);
});

test("an animation target is snapped to the ticks and stays inside the fitted range", () => {
  const result = compile([
    { initial: 0, min: 0, max: 2, label: "起点" },
    { initial: 0, min: 0, max: 2, label: "加上", student_control: { kind: "slider", step: 0.01 } },
  ], { denominator: 4 }, { animate: [{ number: 2, end_value: 1.24 }] });
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result.animations, [["number_02", 1.25]]);
});

test("a practice target is snapped to the ticks, with a tolerance of half a tick and a prompt naming the snapped value", () => {
  const result = compile([
    { initial: 0, min: 0, max: 1, label: "起点" },
    { initial: 0, min: 0, max: 1, label: "加上", student_control: { kind: "slider", step: 0.01 } },
  ], { denominator: 4 }, { task: { number: 2, value: 0.74 } });
  assert.equal(result.error, undefined, result.error);
  const task = result.tasks[0];
  assert.equal(task.completion.value, 0.75);
  assert.equal(task.completion.tolerance, 0.125);
  assert.match(task.prompt, /0\.75/);
});

test("a fit that would make a practice task already met leaves the numbers as the model wrote them", () => {
  const result = compile([
    { initial: 0, min: 0, max: 1, label: "起点" },
    { initial: 0.33, min: 0, max: 1, label: "加上", student_control: { kind: "slider", step: 0.01 } },
  ], {}, { task: { number: 2, value: 0.34 } });
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.variables[1].initial, 0.33, "not snapped to 1/3, where 0.34 would also land");
  assert.equal(result.tasks[0].completion.value, 0.34);
});

test("a number another visual also shows is not refitted", () => {
  const result = compile([
    { initial: 3, min: -10, max: 10, label: "起点" },
    { initial: -5, min: -10, max: 10, label: "加上", student_control: { kind: "slider", step: 1 } },
  ], {}, { shared: 1 });
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual([result.variables[0].min, result.variables[0].max], [-10, 10]);
});

test("a denominator out of range is clamped, never refused", () => {
  const result = compile([
    { initial: 0, min: 0, max: 1, label: "起点" },
    { initial: 0.5, min: 0, max: 1, label: "加上", student_control: { kind: "slider", step: 0.5 } },
  ], { denominator: 50 });
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 12);
});
