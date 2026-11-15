// Two model slips in a function plot that the program now corrects in place, with no second call (the
// trial of the plot options, docs/PLOT_TRIAL_2026-11-15.md on #93: each was refused and the section asked
// again, a median 16.9 s to the first playable section against 7.7 s). Both are on the default path:
// trial options stay off in this file. Replies are run 5's reply (number-line-run5-replies.json, pair 42)
// rewritten in the model's format for a function plot.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { generateLessonPlanWithModel } = await import(new URL("../lesson-plan.js", import.meta.url));
const run5 = JSON.parse(await readFile(new URL("./fixtures/number-line-run5-replies.json", import.meta.url), "utf8"));
const decimal = (value) => ({ mantissa: Math.round(value * 10), scale: 1 });

const plotReply = ({ formula, numbers, visualNumbers = numbers.map((_number, position) => position + 1), moments, samples }) => {
  const reply = structuredClone(run5.turns.find((turn) => turn.pair === 42).replies[0]);
  const outline = reply.course.outline;
  outline.numbers = numbers.map(([initial, min, max, label]) => ({ initial: decimal(initial), min: decimal(min), max: decimal(max), label, unit: "" }));
  outline.course_visuals = [{ required_features: ["cartesian_function_curve"], use_sections: [1], relation: "primary" }];
  reply.course.first_section = {
    moments: moments.map((moment, index) => ({
      narration: moment.say, delivery: "patient",
      ...(index === 0 ? {
        visual_creates: [{ course_visual: 1, content: { parameters: { formulas: [formula], ...(samples ? { sample_x_numbers: samples } : {}) }, numbers: visualNumbers } }],
        math_creates: [{ reusable_item: 1, content: { latex: `y = ${formula}` } }],
      } : {}),
      ...(moment.animations ? { animations: moment.animations.map(([number, value]) => ({ number, end_value: decimal(value), duration_intent: "normal" })) } : {}),
    })),
    number_activities: [],
  };
  return JSON.stringify(reply);
};

const generate = async (reply) => {
  const requests = [];
  const rejected = [];
  let lesson;
  class Stop extends Error {}
  try {
    await generateLessonPlanWithModel(async (request) => {
      requests.push(request);
      if (requests.length > 1) throw new Stop();
      return reply;
    }, { turn_id: "repairs", learner_request: "画出函数图像。", language: "zh-CN", input_modality: "text", request_source: "self_contained" }, {
      on_playable_prefix: ({ compiled }) => { lesson ??= compiled.lesson; throw new Stop(); },
      on_rejected_part: (part) => rejected.push(`${part.error.code} ${part.error.message}`),
    });
  } catch (caught) {
    if (!(caught instanceof Stop)) rejected.push(caught.message);
  }
  return { lesson, rejected, requests };
};
const plotContent = (lesson) => lesson.steps.flatMap((step) => step.beats).flatMap((beat) => beat.actions).find((action) => action.do === "write" && action.kind === "plot").content;
const curveReads = (content, variable) => (content.bindings ?? []).some((binding) => binding.target.startsWith("curve") && binding.expression.includes(variable))
  || (content.curves ?? []).some((curve) => String(curve.expression ?? "").includes(variable));

test("a formula naming a lesson number by its label's symbol reads that number, in one call", async () => {
  for (const [formula, label] of [["a*(x-2)^2+1", "a"], ["k*x + 1", "斜率 k"]]) {
    const { lesson, rejected, requests } = await generate(plotReply({ formula, numbers: [[1, -3, 3, label]], moments: [{ say: "看图像。" }, { say: "改变参数。", animations: [[1, 2]] }] }));
    assert.ok(lesson, `${formula}: ${rejected.join(" | ")}`);
    assert.deepEqual(rejected, [], formula);
    assert.equal(requests.length, 1, formula);
    assert.ok(curveReads(plotContent(lesson), "number_01"), `${formula}: ${JSON.stringify(plotContent(lesson)).slice(0, 400)}`);
  }
});

test("a name is left to the parser when no single number of the visual shows it", async () => {
  // Two numbers both labelled with "a": ambiguous. A number labelled "a" that the visual does not list: not its.
  for (const [numbers, visualNumbers] of [[[[1, -3, 3, "a"], [2, -3, 3, "系数 a"]], [1, 2]], [[[1, -3, 3, "a"]], []]]) {
    const { lesson, rejected } = await generate(plotReply({ formula: "a*x^2", numbers, visualNumbers, moments: [{ say: "看图像。" }] }));
    assert.equal(lesson, undefined);
    assert.ok(rejected.some((miss) => /unsupported formula name 'a'/u.test(miss)), rejected.join(" | "));
  }
});

test("on one fixed curve, an unread number labelled as an x position is the moving point", async () => {
  for (const label of ["x", "探针 x 坐标", "x-coordinate"]) {
    const { lesson, rejected, requests } = await generate(plotReply({ formula: "sqrt(x-3)+1", numbers: [[4, 3, 12, label]], moments: [{ say: "看曲线上的点。" }, { say: "移动它。", animations: [[1, 7]] }] }));
    assert.ok(lesson, `${label}: ${rejected.join(" | ")}`);
    assert.deepEqual(rejected, [], label);
    assert.equal(requests.length, 1, label);
    const content = plotContent(lesson);
    assert.ok((content.bindings ?? []).some((binding) => binding.target.endsWith(".x") && binding.expression.includes("number_01")), `${label}: ${JSON.stringify(content.bindings)}`);
  }
});

test("an unread number is not taken as a moving point where the label names no x position", async () => {
  // A vertex's 横坐标 h, a vertical shift: parameters the model forgot to write in; left to the existing checks.
  for (const label of ["顶点横坐标h", "Vertical shift"]) {
    const repaired = await generate(plotReply({ formula: "x^2", numbers: [[1, -3, 3, label]], moments: [{ say: "看图像。" }, { say: "移动。", animations: [[1, 2]] }] }));
    const points = repaired.lesson ? plotContent(repaired.lesson).points ?? [] : [];
    assert.ok(!points.some((point) => point.as === "moving-point"), label);
  }
});

// Review of #96 (default path): inputs that compile on main must compile the same way.
test("names the parser already reads are never replaced: e, x in any case, and the y = / f(x) = left side", async () => {
  const curveOf = (lesson) => JSON.stringify(plotContent(lesson).curves);
  const capitalE = await generate(plotReply({ formula: "E^x", numbers: [[1, -2, 2, "点 E"]], samples: [1], moments: [{ say: "看曲线上的点。" }] }));
  assert.ok(capitalE.lesson, capitalE.rejected.join(" | "));
  assert.ok(!curveOf(capitalE.lesson).includes("number_01"), curveOf(capitalE.lesson));
  assert.ok(plotContent(capitalE.lesson).points.some((point) => point.as === "moving-point"));
  for (const [formula, label] of [["f(x) = sin(n1*x)", "频率 f"], ["y = n1*x", "斜率 y"]]) {
    const { lesson, rejected } = await generate(plotReply({ formula, numbers: [[1, 1, 3, label]], moments: [{ say: "看图像。" }] }));
    assert.ok(lesson, `${formula}: ${rejected.join(" | ")}`);
  }
  const capitalX = await generate(plotReply({ formula: "X^2", numbers: [[1, -2, 2, "X"]], samples: [1], moments: [{ say: "看曲线上的点。" }] }));
  assert.ok(capitalX.lesson, capitalX.rejected.join(" | "));
});

test("an x number becomes a moving point only where the section moves it, its label names an x position, and the curve exists at its ends", async () => {
  // Never moved: compiles as a fixed curve, as on main (the unread number is dropped).
  for (const formula of ["x^2", "sqrt(x)"]) {
    const still = await generate(plotReply({ formula, numbers: [[1, -5, 5, "x"]], moments: [{ say: "看图像。" }] }));
    assert.ok(still.lesson, `${formula}: ${still.rejected.join(" | ")}`);
    assert.ok(!(plotContent(still.lesson).points ?? []).some((point) => point.as === "moving-point"), formula);
  }
  // Moved, but the curve does not exist at the slider's minimum (√x at −5): refused as on main.
  const outside = await generate(plotReply({ formula: "sqrt(x)", numbers: [[1, -5, 5, "x"]], moments: [{ say: "看。" }, { say: "移动。", animations: [[1, 4]] }] }));
  assert.ok(outside.rejected.some((miss) => /LESSON_PLAN_INTERACTION_MISMATCH/u.test(miss)), outside.rejected.join(" | "));
  // "x 的系数" (the coefficient of x) names no x position: refused as on main.
  const coefficient = await generate(plotReply({ formula: "2*x+1", numbers: [[2, -3, 3, "x 的系数"]], moments: [{ say: "看。" }, { say: "改变。", animations: [[1, 3]] }] }));
  assert.ok(coefficient.rejected.some((miss) => /LESSON_PLAN_INTERACTION_MISMATCH/u.test(miss)), coefficient.rejected.join(" | "));
});
