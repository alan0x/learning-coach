// The number line recipe (OLL decision 0013) is a trial recipe: compiled and
// tested, offered to the model only when LEARNING_COACH_TRIAL_RECIPES names it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NUMBER_LINE_CASES, judgeNumberLine } from "../scripts/eval-trial-recipe-speed.mjs";

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

// Offline replay of speed gate run 4 (2026-11-11), from the recorded lessons
// (eval/...-run4.json rows and the compiled parts beside them). Every known input is kept as recorded:
// starting values, slider steps, animations and practice targets. The slider ranges are the recorded
// ones; they come after run 4's fitting, which never widens, so they are the narrowest the model can
// have written. The replay judges the compiler on what the model actually wrote; it cannot say how the
// model will write once `denominator` is gone (NL-03, NL-09: see the separate hypothesis tests below).
const recorded = (initial, min, max, step) => ({ initial, min, max, label: "n", student_control: { kind: "slider", step } });
const RUN4 = [
  { id: "NL-01", numbers: [recorded(3, -10, 10, 0.1), recorded(-5, -5, -4, 0.1)], extra: { task: { number: 2, value: -4, tolerance: 0.05 } } },
  { id: "NL-02", numbers: [recorded(-2, -10, 10, 0.1), recorded(7, -10, 7, 0.1)], extra: { animate: [{ number: 2, end_value: 7 }], task: { number: 2, value: -10, tolerance: 0.05 } } },
  { id: "NL-03", numbers: [recorded(0, 0, 1, 0.25), recorded(3, 0, 3, 0.25)], extra: { task: { number: 2, value: 0, tolerance: 0.125 } } },
  { id: "NL-04", numbers: [recorded(0, 0, 1, 0.25), recorded(0.25, 0, 1, 0.25)], extra: { animate: [{ number: 2, end_value: 0.25 }], task: { number: 2, value: 1, tolerance: 0.125 } } },
  { id: "NL-05", numbers: [recorded(-3, -6, 6, 0.1), recorded(8, -10, 10, 0.1)], extra: { task: { number: 1, value: -5, tolerance: 0.05 } } },
  { id: "NL-06", numbers: [recorded(6, -10, 7, 1), recorded(-9, -10, 10, 1)], extra: { task: { number: 1, value: -10, tolerance: 0.5 } } },
  { id: "NL-07", numbers: [recorded(0, 0, 1, 0.1), recorded(0.5, 0, 1, 0.1)], extra: { animate: [{ number: 2, end_value: 0.5 }, { number: 2, end_value: 0.8 }], task: { number: 2, value: 0, tolerance: 0.05 } } },
  { id: "NL-08", numbers: [recorded(-1, -6, 1, 1), recorded(-3, -5, 5, 1)], extra: { animate: [{ number: 1, end_value: -4 }], task: { number: 1, value: -4, tolerance: 0.5 } } },
  { id: "NL-09", numbers: [recorded(1, -3, 3, 1 / 3), recorded(2, 1, 2, 1 / 3)], extra: { task: { number: 2, value: 1, tolerance: 1 / 6 } } },
  { id: "NL-10", numbers: [recorded(0, 0, 2, 0.25), recorded(0, 0, 2, 0.25)], extra: { animate: [{ number: 2, end_value: 1 }, { number: 2, end_value: 2 }], task: { number: 2, value: 1, tolerance: 0.125 } } },
];

// Judged as a live run is judged: the expectations each case carries in the harness, written
// before run 5, and the same judge (hard misses block adoption; soft ones are reported).
const caseById = new Map(NUMBER_LINE_CASES.map((item) => [item.id, item]));
const judge = (id, result) => judgeNumberLine(caseById.get(id), result);

// What the recorded run 4 lessons give under the current rules. NL-03 and NL-09 show wrong values,
// because the model wrote numerators (3; 1 and 2) under the removed `denominator` parameter. NL-04
// never shows the sum 3/4: the model started at 0 and moved by 1/4, instead of starting at the first
// addend (the earlier criteria, which checked only the parts, passed it). NL-05
// and NL-06 pass the hard checks but are wide (34 and 39 units): their own practice tasks drive the
// start (to −5 and −10) while the change keeps its range for the answer.
const RUN4_EXPECTED = {
  "NL-03": { hard: /wrong value: 0\.75 is never shown/ },
  "NL-04": { hard: /wrong value: 0\.75 is never shown/ },
  "NL-05": { soft: /34 units wide/ },
  "NL-06": { soft: /39 units wide/ },
  "NL-09": { hard: /wrong value: 0\.3333 is never shown/ },
};
for (const item of RUN4) {
  const expected = RUN4_EXPECTED[item.id] ?? {};
  test(`run 4 replay ${item.id} (recorded inputs): ${expected.hard ? "hard miss" : expected.soft ? "hard pass, soft miss" : "passes"}`, () => {
    const { hard, soft } = judge(item.id, compile(item.numbers, {}, item.extra));
    if (expected.hard) assert.match(hard.join("; "), expected.hard);
    else assert.deepEqual(hard, []);
    if (expected.soft) assert.match(soft.join("; "), expected.soft);
    else if (!expected.hard) assert.deepEqual(soft, []);
  });
}

// A hypothesis, not a replay: if the model, without `denominator`, writes the values at their actual
// size (0.75; 0.33 and 0.67), NL-03 and NL-09 are drawn right. Nothing records what the model wrote in
// run 3 (its rows predate the number line summary and its work directory is gone), so only a live run
// can test the premise.
test("hypothesis: NL-03 written at actual size (0.75 with quarter steps) shows 3/4", () => {
  assert.deepEqual(judge("NL-03", compile([recorded(0, 0, 1, 0.25), recorded(0.75, 0, 1, 0.25)], {}, {})), { hard: [], soft: [] });
});
test("hypothesis: NL-09 written at actual size (0.33 and 0.67) shows 1/3 + 2/3 = 1", () => {
  assert.deepEqual(judge("NL-09", compile([recorded(0.33, 0, 1, 0.1), recorded(0.67, 0, 1, 0.1)], {}, {})), { hard: [], soft: [] });
});

// Review of #62: only a step of exactly 1/2 to 1/6 says what an integer lesson counts in.
test("an integer lesson with a 0.4 step is not a lesson in fifths: whole ticks, a whole step, hops", () => {
  const result = compile([
    { initial: 3, min: 0, max: 5, label: "起点" },
    { initial: 2, min: -4, max: 4, label: "加上", student_control: { kind: "slider", step: 0.4 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 1);
  assert.equal(result.variables[1].control.step, 1);
  assert.equal(result.content.jumps[0].hops, true);
});

test("sliders stepping by halves and by thirds share sixths, so both sliders' values stay on ticks", () => {
  const result = compile([
    { initial: 1, min: 0, max: 3, label: "起点", student_control: { kind: "slider", step: 0.5 } },
    { initial: 1, min: 0, max: 2, label: "加上", student_control: { kind: "slider", step: 1 / 3 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 6);
  assert.equal(result.variables[0].control.step, 1 / 6);
  assert.equal(result.variables[1].control.step, 1 / 6);
});

test("steps of 1/4 and 1/5 would need twentieths: the sliders are left as written", () => {
  const result = compile([
    { initial: 1, min: 0, max: 3, label: "起点", student_control: { kind: "slider", step: 0.25 } },
    { initial: 1, min: 0, max: 2, label: "加上", student_control: { kind: "slider", step: 0.2 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.variables[0].control.step, 0.25);
  assert.equal(result.variables[1].control.step, 0.2);
});

test("a third written as 0.33 still counts as a third step", () => {
  const result = compile([
    { initial: 0, min: 0, max: 2, label: "起点" },
    { initial: 1, min: 0, max: 2, label: "加上", student_control: { kind: "slider", step: 0.33 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 3);
});
