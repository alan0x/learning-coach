// The number line recipe (OLL decision 0013) is a trial recipe: compiled and
// tested, offered to the model only when LEARNING_COACH_TRIAL_RECIPES names it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NUMBER_LINE_CASES, NUMBER_LINE_QUALITY_CASES, judgeNumberLine } from "../scripts/eval-trial-recipe-speed.mjs";

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
    visual.capability = ${JSON.stringify(extra.capability ?? "number_line")};
    visual.parameters = ${JSON.stringify(parameters)};
    visual.numbers = ${JSON.stringify(numbers.map((_number, index) => index + 1))};
    plan.sections[0].reusable_items[0].capability = ${JSON.stringify(extra.capability ?? "number_line")};
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
    env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "number_line,number_line_compare" },
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
    { initial: 2.3, min: 0, max: 2.7, label: "加上", student_control: { kind: "slider", step: 0.1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 10);
  assert.equal(result.content.jumps[0].hops, false, "27 tenth-hops exceed the 24-hop limit, so one arc");
  // A change of 1.3 narrows to its window, and its tenth-hops fit.
  assert.equal(compile([
    { initial: 0, min: 0, max: 1, label: "起点" },
    { initial: 1.3, min: 0, max: 2.7, label: "加上", student_control: { kind: "slider", step: 0.1 } },
  ]).content.jumps[0].hops, true);
  // The only model parameter is how labels are written; nothing that changes what a number means
  // (a denominator made the model write numerators in run 4).
  assert.deepEqual(Object.keys(api.RECIPE_SCHEMA_PROPERTIES.number_line), ["label_style"]);
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

test("a far start is kept near its value, while a change slider starting at 0, for the learner to set, keeps its whole range", () => {
  const result = compile([
    { initial: 20, min: 0, max: 100, label: "起点" },
    { initial: 0, min: -50, max: 50, label: "加上", student_control: { kind: "slider", step: 1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  // The start (no slider, not driven) shrinks to 19–21. The change keeps −50 to 50: a wide line and
  // one arc, rather than a change the learner cannot drag where the narration goes. The ticks are
  // whole numbers, so 20 sits on a labelled tick wherever the learner takes the end.
  assert.deepEqual([result.variables[0].min, result.variables[0].max], [19, 21]);
  assert.deepEqual([result.variables[1].min, result.variables[1].max], [-50, 50]);
  assert.equal(result.content.ticks.step, 1);
  assert.equal(result.content.jumps[0].hops, false);
  assert.deepEqual(judgeNumberLine({ expect: { values: [20] } }, result).hard, []);
  // A change that starts at −7 states the change the lesson is about: it narrows, and −7 stays.
  const stated = compile([
    { initial: 20, min: 0, max: 100, label: "起点" },
    { initial: -7, min: -50, max: 50, label: "加上", student_control: { kind: "slider", step: 1 } },
  ]);
  assert.ok(stated.variables[1].min <= -7 && stated.variables[1].max < 50, JSON.stringify(stated.variables[1]));
  assert.deepEqual(judgeNumberLine({ expect: { values: [20, 13], change: -7 } }, stated), { hard: [], soft: [] });
});
test("whole numbers far apart are counted in the smallest of 2, 5 or 10 that fits: ticks hold every value, and the slider steps by it", () => {
  const result = compile([
    { initial: 0, min: 0, max: 10, label: "起点" },
    { initial: 100, min: 0, max: 100, label: "加上", student_control: { kind: "slider", step: 1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  // 0 and 100 are even, and 0 to 100 in twos fits the window: the slider steps by 2.
  assert.equal(result.variables[1].control.step, 2);
  assert.equal(result.content.ticks.step, 2);
  assert.deepEqual(judgeNumberLine({ expect: { values: [0, 100], change: 100 } }, result).hard, []);
});
test("whole numbers close together still count in ones, even when they share a factor", () => {
  // −6 + 6: multiples of 2 and 6, but the line is short, so a learner can still try 5.
  const result = compile([
    { initial: -6, min: -10, max: 10, label: "起点", student_control: { kind: "slider", step: 1 } },
    { initial: 6, min: -10, max: 10, label: "移动", student_control: { kind: "slider", step: 1 } },
  ]);
  assert.equal(result.variables[1].control.step, 1);
  assert.equal(result.content.ticks.step, 1);
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

test("values no ticks can hold are refused, so the model can choose another visual (2/3 and 1/25 need 75ths, beyond 24 parts)", () => {
  const result = compile([
    { initial: 0.04, min: 0, max: 1, label: "起点" },
    { initial: 2 / 3 - 0.04, min: 0, max: 1, label: "差", student_control: { kind: "slider", step: 1 / 75 } },
  ]);
  assert.match(result.error ?? "", /at most 24 equal parts/);
});

test("2/3 and 3/5 now share fifteenths (decision 0016: up to 24 parts per unit)", () => {
  const result = compile([
    { initial: 0.6, min: 0, max: 1, label: "起点" },
    { initial: 2 / 3 - 0.6, min: 0, max: 1, label: "差", student_control: { kind: "slider", step: 1 / 15 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 15);
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

test("run 3: 3 + (−5) on two sliders of −10 to 10 is drawn on −4 to 5, not −21 to 21, with hops", () => {
  const result = compile([
    { initial: 3, min: -10, max: 10, label: "起点" },
    { initial: -5, min: -10, max: 10, label: "加上", student_control: { kind: "slider", step: 1 } },
  ]);
  assert.equal(result.error, undefined, result.error);
  // The change starts at −5, the change the lesson is about, so it narrows to the window around 0, 3 and −2.
  assert.deepEqual(result.content.range, { min: -4, max: 5 });
  assert.ok(result.variables[1].min <= -5);
  assert.equal(result.content.jumps[0].hops, true);
});

test("an animation target rounded from a repeating fraction is snapped to its ticks (1.33 is 4/3)", () => {
  const result = compile([
    { initial: 0, min: 0, max: 2, label: "起点" },
    { initial: 0, min: 0, max: 2, label: "加上", student_control: { kind: "slider", step: 0.01 } },
  ], {}, { animate: [{ number: 2, end_value: 1.33 }] });
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 3);
  assert.ok(Math.abs(result.animations[0][1] - 4 / 3) < 1e-9, String(result.animations[0][1]));
});

test("a practice target rounded from a repeating fraction is snapped to its ticks, with a tolerance of half a tick (0.67 is 2/3)", () => {
  const result = compile([
    { initial: 0, min: 0, max: 1, label: "起点" },
    { initial: 0, min: 0, max: 1, label: "加上", student_control: { kind: "slider", step: 0.01 } },
  ], {}, { task: { number: 2, value: 0.67 } });
  assert.equal(result.error, undefined, result.error);
  const task = result.tasks[0];
  assert.ok(Math.abs(task.completion.value - 2 / 3) < 1e-9, String(task.completion.value));
  assert.ok(Math.abs(task.completion.tolerance - 1 / 6) < 1e-9);
});

// Review of #67: the numbers a lesson names keep their positions. A terminating value is never rounded
// onto a coarser grid; only a value rounded from a repeating fraction (0.33 for 1/3) is read as one.
test("a terminating value is never moved onto a coarser grid (0.51 stays 0.51, refused rather than drawn at 0.5)", () => {
  const result = compile([
    { initial: 0.5, min: 0, max: 1, label: "起点" },
    { initial: 0.01, min: 0, max: 1, label: "加上", student_control: { kind: "slider", step: 0.01 } },
  ]);
  assert.match(result.error ?? "", /at most 24 equal parts/);
});

test("comparing 0.5 and 0.51: the values are kept, and a line that cannot show them both is refused (review of #67)", () => {
  const result = compile([
    { initial: 0.5, min: 0, max: 2, label: "0.5", student_control: { kind: "slider", step: 0.01 } },
    { initial: 0.51, min: 0, max: 2, label: "0.51", student_control: { kind: "slider", step: 0.01 } },
  ], {}, { capability: "number_line_compare" });
  // No grid up to 24 parts holds 0.51: the outline is asked again without the number line.
  assert.match(result.error ?? "", /LESSON_PLAN_OUTLINE_VISUAL|at most 24 equal parts/);
});

test("comparing 5/24 and 19/24: both stay where they are, on 24ths, not moved to 1/5 and 4/5 (review of #67)", () => {
  const result = compile([
    { initial: 5 / 24, min: 0, max: 2, label: "5/24", student_control: { kind: "slider", step: 0.01 } },
    { initial: 19 / 24, min: 0, max: 2, label: "19/24", student_control: { kind: "slider", step: 0.01 } },
  ], {}, { capability: "number_line_compare" });
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.content.ticks.subdivisions, 24);
  assert.deepEqual(result.content.points.map((point) => [point.as, point.label]), [["first", "5/24"], ["second", "19/24"]]);
  const values = result.variables.map((variable) => variable.initial);
  assert.ok(Math.abs(values[0] - 5 / 24) < 1e-9 && Math.abs(values[1] - 19 / 24) < 1e-9, JSON.stringify(values));
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

test("label_style decimal labels a decimal question in decimals, only where decimals are exact", () => {
  const tenths = compile([
    { initial: 0.5, min: 0, max: 1, label: "起点" },
    { initial: 0.3, min: 0, max: 1, label: "移动", student_control: { kind: "slider", step: 0.1 } },
  ], { label_style: "decimal" });
  assert.equal(tenths.content.ticks.format, "decimal");
  assert.deepEqual(judgeNumberLine({ expect: { values: [0.5, 0.8], parts: 10, format: "decimal" } }, tenths), { hard: [], soft: [] });
  const halves = compile([
    { initial: -2.5, min: -3, max: -2, label: "起点" },
    { initial: 4, min: 0, max: 5, label: "移动", student_control: { kind: "slider", step: 0.5 } },
  ], { label_style: "decimal" });
  assert.equal(halves.content.ticks.format, "decimal");
  // Thirds have no exact decimal: they stay fractions, never 0.333.
  const thirds = compile([
    { initial: 1 / 3, min: 0, max: 1, label: "起点" },
    { initial: 2 / 3, min: 0, max: 1, label: "移动", student_control: { kind: "slider", step: 1 / 3 } },
  ], { label_style: "decimal" });
  assert.equal(thirds.content.ticks.subdivisions, 3);
  assert.equal(thirds.content.ticks.format, undefined);
  // Without it, and with "fraction", labels stay fractions; anything else is refused.
  assert.equal(compile([{ initial: 0.5, min: 0, max: 1, label: "起点" }, { initial: 0.3, min: 0, max: 1, label: "移动" }], {}).content.ticks.format, undefined);
  assert.match(compile([{ initial: 0, min: 0, max: 1, label: "起点" }], { label_style: "percent" }).error ?? "", /label_style/);
});

test("a value is read as a repeating fraction only when it shows that fraction rounded or cut (review of #67)", () => {
  // 0.8333 and 0.875 are 5/6 and 7/8 (as the model wrote them in compare probe 1): 24ths.
  const shown = compile([
    { initial: 0.8333, min: 0, max: 1, label: "5/6", student_control: { kind: "slider", step: 0.01 } },
    { initial: 0.875, min: 0, max: 1, label: "7/8", student_control: { kind: "slider", step: 0.01 } },
  ], {}, { capability: "number_line_compare" });
  assert.equal(shown.error, undefined, shown.error);
  assert.equal(shown.content.ticks.subdivisions, 24);
  // 0.34 is not 1/3 (which shows as 0.33): compared with 1/3 it keeps its own place, or the line is refused.
  const offByOne = compile([
    { initial: 0.34, min: 0, max: 1, label: "0.34", student_control: { kind: "slider", step: 0.01 } },
    { initial: 1 / 3, min: 0, max: 1, label: "1/3", student_control: { kind: "slider", step: 0.01 } },
  ], {}, { capability: "number_line_compare" });
  assert.ok(offByOne.error || Math.abs(offByOne.variables[0].initial - 0.34) < 1e-12, JSON.stringify(offByOne.variables ?? offByOne.error));
  // 0.04 is 1/25, not 1/21 cut to two places: with 2/3 no ticks hold it, and the line is refused.
  const twoPlaces = compile([
    { initial: 0.04, min: 0, max: 1, label: "1/25", student_control: { kind: "slider", step: 0.01 } },
    { initial: 2 / 3, min: 0, max: 1, label: "2/3", student_control: { kind: "slider", step: 0.01 } },
  ], {}, { capability: "number_line_compare" });
  assert.match(twoPlaces.error ?? "", /at most 24 equal parts/);
});

