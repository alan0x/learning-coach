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
    if (extra.task) plan.sections[0].student_activities = [{ kind: "number_target", prompt: "把移动量调到目标。", number_controls: [{ number: extra.task.number, controls: ["slider"] }], value: extra.task.value, tolerance: extra.task.tolerance ?? 0.005, hints: ["看刻度。"], ...(extra.task.expression ? { expression: extra.task.expression } : {}) }];
    if (extra.plotSample) plan.sections[0].moments[0].actions.push({ action: "create", kind: "visual", role: "supporting_visual", content: { capability: "function_plot", parameters: { expression: "x^2", sample_x_numbers: [extra.plotSample] } }, placement: { relation: "new_region" } });
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
  assert.equal(api.RECIPE_SCHEMA_PROPERTIES.number_line, undefined, "no number-line parameters: a denominator made the model write numerators (run 4)");
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

test("a far start is kept near its value, while the change slider a learner moves keeps its whole range", () => {
  const result = compile([
    { initial: 20, min: 0, max: 100, label: "起点" },
    { initial: -7, min: -50, max: 50, label: "加上", student_control: { kind: "slider", step: 1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  // The start (no slider, not driven) shrinks to 19–21. The change keeps −50 to 50: a wide line with
  // coarser ticks and one arc, rather than a change the learner cannot drag where the narration goes.
  assert.deepEqual([result.variables[0].min, result.variables[0].max], [19, 21]);
  assert.deepEqual([result.variables[1].min, result.variables[1].max], [-50, 50]);
  assert.equal(result.content.ticks.step, 5);
  assert.equal(result.content.jumps[0].hops, false);
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

test("counting by fourths, where the numbers alone are whole, follows the slider's quarter step", () => {
  const result = compile([
    { initial: 0, min: 0, max: 2, label: "起点" },
    { initial: 0, min: 0, max: 2, label: "加上", student_control: { kind: "slider", step: 0.25 } },
  ], {}, { animate: [{ number: 2, end_value: 2 }] });
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
  ], {}, { animate: [{ number: 2, end_value: 1.24 }] });
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result.animations, [["number_02", 1.25]]);
});

test("a practice target is snapped to the ticks, with a tolerance of half a tick and a prompt naming the snapped value", () => {
  const result = compile([
    { initial: 0, min: 0, max: 1, label: "起点" },
    { initial: 0, min: 0, max: 1, label: "加上", student_control: { kind: "slider", step: 0.01 } },
  ], {}, { task: { number: 2, value: 0.74 } });
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

// Run 4 (2026-11-11): the shapes behind its failures.
test("run 4: a fine 0.1 change step on an integer lesson gives whole-number ticks, a whole step and hops (NL-01, NL-02, NL-05)", () => {
  const result = compile([
    { initial: 3, min: -10, max: 10, label: "起点", student_control: { kind: "slider", step: 1 } },
    { initial: -5, min: -10, max: 10, label: "加上", student_control: { kind: "slider", step: 0.1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 1);
  assert.equal(result.variables[1].control.step, 1, "the integer lesson's slider steps by whole units");
  assert.equal(result.content.jumps[0].hops, true);
  assert.ok(result.content.range.max - result.content.range.min <= 24, `24 units at most, got ${JSON.stringify(result.content.range)}`);
});

test("run 4: a start slider nothing drives is kept near its value, so the line stays short (NL-06)", () => {
  const result = compile([
    { initial: 6, min: -10, max: 10, label: "起点", student_control: { kind: "slider", step: 1 } },
    { initial: -9, min: -10, max: 10, label: "减去", student_control: { kind: "slider", step: 1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual([result.variables[0].min, result.variables[0].max], [5, 7]);
  assert.ok(result.content.range.max - result.content.range.min <= 24, `24 units at most, got ${JSON.stringify(result.content.range)}`);
  assert.equal(result.content.jumps[0].hops, true);
  assert.ok(result.variables[1].min <= -9, "−9 stays reachable");
});

test("no number-line parameter is accepted: the schema offers none", () => {
  assert.match(compile([{ initial: 0, min: 0, max: 1, label: "起点" }], { denominator: 4 }).error ?? "", /unsupported capability parameter/);
});
// Advisor review of the fit (2026-11-11).
for (const reach of [12, 15]) {
  test(`6 − 9 with a change slider of ±${reach} that nothing drives keeps −9 reachable`, () => {
    const result = compile([
      { initial: 6, min: 0, max: 10, label: "起点" },
      { initial: 0, min: -reach, max: reach, label: "减去", student_control: { kind: "slider", step: 1 } },
    ]);
    assert.equal(result.error, undefined, result.error);
    assert.ok(result.variables[1].min <= -9, `the change reaches −9 (min ${result.variables[1].min})`);
  });
}

test("a number a function plot binds through its sample point is not refitted", () => {
  const result = compile([
    { initial: 3, min: -10, max: 10, label: "起点" },
    { initial: -5, min: -10, max: 10, label: "加上", student_control: { kind: "slider", step: 1 } },
  ], {}, { plotSample: 1 });
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual([result.variables[0].min, result.variables[0].max], [-10, 10]);
});

test("a practice task judged by an expression keeps its numbers, value, tolerance and prompt as written", () => {
  // change + 3 = −2: reads only the number the learner moves.
  const expression = [{ kind: "number", number: 2 }, { kind: "literal", value: 3 }, { kind: "operator", operator: "add" }];
  const result = compile([
    { initial: 3, min: -10, max: 10, label: "起点" },
    { initial: 0, min: -10, max: 10, label: "加上", student_control: { kind: "slider", step: 1 } },
  ], {}, { task: { number: 2, value: -2, tolerance: 0.5, expression } });
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual([result.variables[0].min, result.variables[0].max], [-10, 10]);
  assert.equal(result.variables[1].control.step, 1);
  assert.equal(result.tasks[0].prompt, "把移动量调到目标。");
});

// Offline replay of speed gate run 4 (2026-11-11): each number-line lesson, rebuilt from its recorded
// row (starting values, slider steps, animations and practice targets; ranges as the model writes
// them, ±10, since a driven number's original range is not recorded), compiled under the current
// rules and judged by the run 5 criteria, including the values drawn. NL-03 and NL-09 use the values
// the model wrote in run 3 (0.75; 0.33 and 0.67): run 4's numerators came from the parameter since removed.
const slider = (initial, step, min = -10, max = 10) => ({ initial, min, max, label: "n", student_control: { kind: "slider", step } });
const RUN4 = [
  { id: "NL-01", numbers: [slider(3, 0.1), slider(-5, 0.1)], extra: { task: { number: 2, value: -4, tolerance: 0.05 } }, integer: -5 },
  { id: "NL-02", numbers: [slider(-2, 0.1), slider(7, 0.1)], extra: { animate: [{ number: 2, end_value: 7 }] }, integer: 7 },
  { id: "NL-03", numbers: [slider(0, 0.25, 0, 1), slider(0.75, 0.25, 0, 1)], extra: {}, parts: 4, end: 0.75 },
  { id: "NL-04", numbers: [slider(0.25, 0.25, 0, 1), slider(0.5, 0.25, 0, 1)], extra: {}, parts: 4, end: 0.75 },
  { id: "NL-05", numbers: [slider(-3, 0.1, -6, 6), slider(8, 0.1)], extra: {}, integer: 8 },
  { id: "NL-06", numbers: [slider(6, 1), slider(-9, 1)], extra: {}, integer: -9 },
  { id: "NL-07", numbers: [slider(0, 0.1, 0, 1), slider(0.5, 0.1, 0, 1)], extra: { animate: [{ number: 2, end_value: 0.8 }] }, parts: 10 },
  { id: "NL-08", numbers: [slider(-1, 1, -6, 1), slider(-3, 1, -5, 5)], extra: {}, integer: -3 },
  { id: "NL-09", numbers: [slider(0.33, 0.1, 0, 1), slider(0.67, 0.1, 0, 1)], extra: {}, parts: 3, end: 1 },
  { id: "NL-10", numbers: [slider(0, 0.25, 0, 2), slider(0, 0.25, 0, 2)], extra: { animate: [{ number: 2, end_value: 1 }, { number: 2, end_value: 2 }] }, parts: 4 },
];
for (const item of RUN4) {
  test(`run 4 replay ${item.id} meets the run 5 criteria`, () => {
    const result = compile(item.numbers, {}, item.extra);
    assert.equal(result.error, undefined, result.error);
    const { range, ticks, jumps, points } = result.content;
    if (item.parts) {
      assert.equal(ticks.subdivisions, item.parts, "the request's denominator");
      for (const point of points) assert.ok(Math.abs(point.value * item.parts - Math.round(point.value * item.parts)) < 1e-9, `${point.as} = ${point.value} sits on a tick`);
      if (item.end !== undefined) assert.ok(Math.abs(points.find((point) => point.as === "end").value - item.end) < 1e-9, `the end is ${item.end}`);
    }
    if (item.integer !== undefined) {
      assert.ok(range.max - range.min <= 24, `24 units at most, got ${range.min}..${range.max}`);
      assert.equal(jumps[0].hops, true);
      const change = result.variables[1];
      const animated = result.animations.filter(([variable]) => variable === "number_02").map(([, value]) => value);
      assert.ok((change.min <= item.integer && item.integer <= change.max) || animated.includes(item.integer), `the change reaches ${item.integer}`);
    }
  });
}
