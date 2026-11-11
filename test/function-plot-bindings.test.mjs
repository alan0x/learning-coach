import assert from "node:assert/strict";
import test from "node:test";

import { evaluateMathExpression } from "octos-lesson-language";
import { generateLessonPlanWithModel, LESSON_PLAN_CAPABILITY_REGISTRY } from "../lesson-plan.js";
import { completeLessonPlanFixtures } from "./lesson-plan-course-fixtures.mjs";
import { modelResponseHelpers } from "./model-responses.mjs";

const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } =
  modelResponseHelpers(LESSON_PLAN_CAPABILITY_REGISTRY);

const literalFormula = "-(x+1)^2+4";
const parameterizedFormula = "-(x-n1)^2+n2";
const vertexInstruction = "请试着调整顶点的横坐标。";
const sampleInstruction = "用滑块移动点 A 或点 B，观察割线。";
const range = [
  { label: "顶点横坐标h", initial: -1, min: -3, max: 3 },
  { label: "顶点纵坐标k", initial: 4, min: -2, max: 6 },
];

function graph(lesson) {
  return lesson.steps[0].beats[0].actions.find(action => action.do === "write" && action.kind === "plot").content;
}

function plotDraft({
  formula = literalFormula, numbers, samples, narration = "先观察二次函数的图像。",
  exercise = false, animation,
} = {}) {
  const plan = structuredClone(completeLessonPlanFixtures.quadratic_translation);
  plan.title = "二次函数 y = -(x+1)² + 4 的图像";
  plan.goals = ["观察二次函数的图像"];
  plan.numbers = range.map((number) => ({ ...number, student_control: { kind: "slider", step: 0.25 } }));
  const [first, , last] = plan.sections;
  first.moments[0].narration = narration;
  if (exercise) {
    first.student_activities = [structuredClone(last.student_activities[0])];
    first.student_activities[0].prompt = vertexInstruction;
  }
  if (animation) first.moments[0].actions.push({
    action: "animate", number: animation.number, end_value: animation.value, timing: "during_speech",
  });
  last.moments[0].actions = last.moments[0].actions.filter(action => action.action !== "animate");
  delete last.student_activities;

  const drafts = plan.sections.map(({ moments, student_activities }, index) =>
    toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
  const outline = stagedOutline(plan, drafts);
  drafts[0].course_visual_creates.visual_1.content = {
    parameters: { formulas: [formula], ...(samples ? { sample_x_numbers: samples } : {}) },
    ...(numbers ? { numbers } : {}),
  };
  return { outline, drafts };
}

async function run({ outline, drafts }, { fix, learnerRequest = "画出并解释这个二次函数" } = {}) {
  const calls = [], rejections = [], adjustments = [], prefixes = [];
  const generated = await generateLessonPlanWithModel(async request => {
    const prompt = JSON.parse(request.prompt);
    calls.push({ section: request.section, label: request.label, feedback: prompt.previous_validation_error });
    if (calls.length > 6) throw new Error("Unexpected extra model request");
    if (request.label === "lesson-plan-bootstrap") {
      return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
    }
    const draft = structuredClone(drafts[request.section - 1]);
    if (prompt.previous_validation_error) fix?.(draft, request.section);
    return JSON.stringify(draft);
  }, { turn_id: "plot-binding-regression", learner_request: learnerRequest }, {
    max_attempts_per_part: 2,
    on_rejected_part: event => rejections.push(event),
    on_program_adjustment: event => adjustments.push(event),
    on_playable_prefix: ({ compiled, completed_sections }) => {
      prefixes.push({ plot: graph(compiled.lesson), calls: calls.length, section: completed_sections });
    },
  });
  assert.equal(generated.model_calls, calls.length);
  assert.deepEqual(prefixes.map(prefix => prefix.section), [1, 2, 3]);
  return { calls, rejections, adjustments, prefixes, plot: graph(generated.lesson), lesson: generated.lesson };
}

test("the reconstructed E2E vertex exercise recovers before a second model request", async () => {
  for (const numbers of [[1, 2], undefined]) {
    const { plot, prefixes, rejections, adjustments, lesson } = await run(plotDraft({ numbers, exercise: true }));
    assert.equal(prefixes[0].calls, 1);
    assert.deepEqual(rejections, []);
    assert.ok(adjustments.some(event => event.reason === "quadratic_vertex_from_confirmed_roles"));
    assert.equal(plot.points, undefined);
    assert.equal(plot.measurement, undefined);
    assert.equal(lesson.lesson.tasks[0].prompt, vertexInstruction);
    const expression = plot.curves[0].expression;
    const y = (x, h, k) => evaluateMathExpression(expression, { x, number_01: h, number_02: k });
    assert.equal(y(-1, -1, 4), 4);
    assert.equal(y(1, 1, 4), 4);
    assert.equal(y(-1, 1, 4), 0);
    assert.equal(y(-1, -1, 6), 6);
    assert.ok(plot.axes.x.min <= -3 && plot.axes.x.max >= 3);
    assert.ok(plot.axes.y.min < 0 && plot.axes.y.max >= 6);
    assert.deepEqual(plot, prefixes[0].plot);
  }
});

test("explicit fixed-curve samples remain a secant even with matching vertex labels and values", async () => {
  const { plot, prefixes, rejections } = await run(plotDraft({ samples: [1, 2], narration: sampleInstruction }));
  assert.equal(prefixes[0].calls, 1);
  assert.deepEqual(rejections, []);
  assert.deepEqual(plot.points.map(({ x, y, label }) => [x, y, label]), [[-1, 4, "A"], [4, -21, "B"]]);
  assert.equal(plot.measurement, "secant");
  assert.ok(plot.axes.y.min < -21 && plot.axes.y.min > -45, "the unvisited slider extreme must not widen the view");
  const values = { number_01: 0, number_02: 2 };
  const boundY = plot.bindings.filter(binding => binding.target.endsWith(".y"));
  assert.deepEqual(boundY.map(binding => evaluateMathExpression(binding.expression, values)), [3, -5]);
  assert.doesNotMatch(plot.curves[0].expression, /number_/u);
  assert.deepEqual(plot, prefixes[0].plot);
});

test("a creation-section animation endpoint is visible, including when it expands the x range", async () => {
  const { plot, prefixes } = await run(plotDraft({ samples: [1, 2], animation: { number: 2, value: 7 } }));
  assert.equal(prefixes[0].calls, 1);
  assert.ok(plot.axes.y.min < -60);
  assert.ok(plot.axes.x.max >= 7);
  assert.deepEqual(plot, prefixes[0].plot);
});

test("an explicit single point renders a function with a singularity inside the view", async () => {
  const { plot, prefixes, rejections } = await run(plotDraft({
    formula: "1/x", samples: [1], animation: { number: 1, value: -0.5 },
  }));
  assert.equal(prefixes[0].calls, 1);
  assert.deepEqual(rejections, []);
  assert.deepEqual(plot.points.map(({ x, y }) => [x, y]), [[-1, -1]]);
  assert.equal(plot.measurement, undefined);
  assert.ok(Number.isFinite(plot.axes.y.min) && Number.isFinite(plot.axes.y.max));
});

test("numbers alone leave the plot static even with matching vertex values", async () => {
  for (const narration of ["先观察顶点的位置。", "这一步不要移动顶点。", "上一节曾经调整顶点的横坐标。"]) {
    const { plot, prefixes, rejections, adjustments, lesson } = await run(plotDraft({ numbers: [1, 2], narration }));
    assert.equal(prefixes[0].calls, 1);
    assert.deepEqual(rejections, []);
    assert.equal(plot.points, undefined);
    assert.doesNotMatch(plot.curves[0].expression, /number_/u);
    assert.ok(lesson.lesson.variables.every(variable => !variable.control));
    assert.ok(adjustments.some(event => event.reason === "unused_plot_numbers"));
  }
});

test("a necessary sample binding receives field-specific feedback for the first section alone", async () => {
  for (const [numbers, narration] of [
    [[1], "请移动点 P，观察它的高度。"],
    [[1, 2], sampleInstruction],
  ]) {
    const { plot, prefixes, calls, rejections } = await run(plotDraft({ numbers, narration }), {
      fix(draft, section) {
        assert.equal(section, 1);
        draft.course_visual_creates.visual_1.content = {
          parameters: { formulas: [literalFormula], sample_x_numbers: numbers },
        };
      },
    });
    assert.equal(prefixes[0].calls, 2);
    assert.deepEqual(calls.slice(1).map(call => call.section), [1, 2, 3]);
    assert.equal(rejections.length, 1);
    assert.match(calls[1].feedback, /sample_x_numbers/u);
    assert.equal(plot.points.length, numbers.length);
  }
});

test("a vertex lesson with a conflicting literal formula is repaired rather than guessed", async () => {
  const { plot, prefixes, rejections } = await run(plotDraft({
    formula: "-(x+2)^2+4", numbers: [1, 2], exercise: true,
  }), {
    fix(draft, section) {
      assert.equal(section, 1);
      draft.course_visual_creates.visual_1.content.parameters.formulas = [parameterizedFormula];
    },
  });
  assert.equal(prefixes[0].calls, 2);
  assert.equal(rejections.length, 1);
  assert.match(rejections[0].error.path, /\.formulas$/u);
  assert.match(plot.curves[0].expression, /number_01/u);
});

test("a changing curve drops unused samples locally but repairs a required mixed interaction", async () => {
  const unused = await run(plotDraft({ formula: parameterizedFormula, samples: [1, 2], narration: vertexInstruction }));
  assert.equal(unused.prefixes[0].calls, 1);
  assert.deepEqual(unused.rejections, []);
  assert.ok(unused.adjustments.some(event => event.reason === "unused_samples_on_parameterized_curve"));
  assert.equal(unused.plot.points, undefined);

  const required = await run(plotDraft({ formula: parameterizedFormula, samples: [1, 2], narration: sampleInstruction }), {
    fix(draft, section) {
      assert.equal(section, 1);
      draft.course_visual_creates.visual_1.content.parameters.formulas = [literalFormula];
    },
  });
  assert.equal(required.prefixes[0].calls, 2);
  assert.equal(required.rejections.length, 1);
  assert.match(required.rejections[0].error.path, /\.sample_x_numbers$/u);
  assert.equal(required.plot.measurement, "secant");
});

test("later use of a dropped control repairs only the later section", async () => {
  const fixture = plotDraft({ numbers: [1, 2] });
  fixture.drafts[1].moments[0].animations = [{ number: 1, end_value: 2 }];
  const { prefixes, calls, plot, rejections } = await run(fixture, {
    fix(draft, section) {
      assert.equal(section, 2);
      delete draft.moments[0].animations;
    },
  });
  assert.equal(prefixes[0].calls, 1);
  assert.deepEqual(calls.slice(1).map(call => call.section), [2, 2, 3]);
  assert.equal(rejections.length, 1);
  assert.match(rejections[0].error.message, /no control in the published graph/u);
  assert.deepEqual(plot, prefixes[0].plot);
});

test("later demonstrations cannot change a previously published viewport", async () => {
  const fixture = plotDraft({ samples: [1, 2] });
  fixture.drafts[1].moments[0].animations = [{ number: 2, end_value: 7 }];
  const { prefixes, calls, plot, rejections } = await run(fixture, {
    fix(draft, section) {
      assert.equal(section, 2);
      draft.moments[0].animations[0].end_value = 5;
      draft.moments[0].narration += "把第二个点移动到横坐标 5。";
    },
  });
  assert.equal(prefixes[0].calls, 1);
  assert.deepEqual(calls.slice(1).map(call => call.section), [2, 2, 3]);
  assert.equal(rejections.length, 1);
  assert.match(rejections[0].error.message, /published graph.*range/u);
  assert.deepEqual(plot, prefixes[0].plot);
  assert.ok(plot.axes.y.min > -32, "the later animation target is outside the first screen");
});

test("a stray reset of a removed sample is cleared without another request", async () => {
  const fixture = plotDraft({ formula: "x+n1", samples: [2] });
  fixture.drafts[1].moments[0].restart_numbers = [2];
  const { calls, plot, adjustments, rejections } = await run(fixture);
  assert.equal(calls.length, 3);
  assert.deepEqual(rejections, []);
  assert.ok(adjustments.some(event => event.section === 2 && event.reason === "unused_restart_for_omitted_plot_control"));
  assert.equal(plot.points, undefined);
});

test("a later visual cannot narrow a published plot range by reusing its input", async () => {
  const fixture = plotDraft({ samples: [1] });
  fixture.outline.course_visuals.push({
    required_features: [...LESSON_PLAN_CAPABILITY_REGISTRY.coordinate_circle.required_features],
    create_section: 2, use_sections: [2], relation: "supporting", related_visual: 1,
  });
  fixture.drafts[1].course_visual_creates = {
    visual_2: { moment: 1, content: { parameters: { radius: 2 }, numbers: [1] } },
  };
  const { prefixes, calls, plot, rejections } = await run(fixture, {
    fix(draft, section) {
      assert.equal(section, 2);
      delete draft.course_visual_creates.visual_2.content.numbers;
    },
  });
  assert.equal(prefixes[0].calls, 1);
  assert.deepEqual(calls.slice(1).map(call => call.section), [2, 2, 3]);
  assert.equal(rejections.length, 1);
  assert.match(rejections[0].error.message, /without changing number 1 in the published graph/u);
  assert.deepEqual(plot, prefixes[0].plot);
});

test("a parameterized curve's legend uses the sliders' readable symbols, not internal aliases", async () => {
  const { plot, prefixes, rejections } = await run(plotDraft({ formula: parameterizedFormula, exercise: true }));
  assert.equal(prefixes[0].calls, 1);
  assert.deepEqual(rejections, []);
  assert.equal(plot.curves[0].label, "y = −(x − h)² + k");
  assert.match(plot.curves[0].expression, /number_01/u, "evaluation keeps the stable aliases");
  assert.doesNotMatch(plot.curves[0].label, /number_/u);
});

test("a model-authored curve label still wins over the derived display label", async () => {
  const fixture = plotDraft({ formula: parameterizedFormula, exercise: true });
  fixture.drafts[0].course_visual_creates.visual_1.content.parameters.curve_label = "抛物线 y=(x-n1)²+n2";
  const { plot } = await run(fixture);
  assert.equal(plot.curves[0].label, "抛物线 y=(x-h)²+k");
});

test("a malformed redundant sample field is dropped before validation, without a model request", async () => {
  for (const samples of [[1, 1], [1, 9], [1, 2, 3]]) {
    const { prefixes, rejections, adjustments, plot } = await run(
      plotDraft({ formula: parameterizedFormula, samples, narration: vertexInstruction, exercise: true }));
    assert.equal(prefixes[0].calls, 1, JSON.stringify(samples));
    assert.deepEqual(rejections, []);
    const removal = adjustments.find(event => event.reason === "unused_samples_on_parameterized_curve");
    assert.ok(removal, JSON.stringify(samples));
    assert.match(removal.detail ?? "", /sample_x_numbers=/u);
    assert.equal(plot.points, undefined);
  }
});

test("a malformed sample field that is still needed gets field-specific repair feedback", async () => {
  // "text": the narration asks for moving sample points. "animation": the text
  // stays on the vertex, but a creation-section animation references the number.
  for (const mode of ["text", "animation"]) {
    const fixture = plotDraft({
      formula: parameterizedFormula, samples: [3, 3],
      narration: mode === "text" ? sampleInstruction : vertexInstruction,
    });
    fixture.outline.numbers.push({ label: "点P的横坐标", initial: 0, min: -3, max: 3, student_control: { kind: "slider", step: 0.25 } });
    if (mode === "animation") fixture.drafts[0].moments[0].animations = [{ number: 3, end_value: 2 }];
    const { calls, rejections, plot } = await run(fixture, {
      fix(draft, section) {
        assert.equal(section, 1);
        delete draft.moments[0].animations;
        draft.moments[0].narration = sampleInstruction;
        draft.course_visual_creates.visual_1.content = {
          parameters: { formulas: [literalFormula], sample_x_numbers: [3] },
        };
      },
    });
    assert.equal(rejections.length, 1, mode);
    assert.match(rejections[0].error.path, /\.sample_x_numbers$/u, mode);
    assert.match(calls[1].feedback, /sample_x_numbers/u, mode);
    assert.equal(plot.points.length, 1, mode);
  }
});

test("mistyped sample references cannot silently discard a real animation and practice", async () => {
  for (const samples of [["3"], 3, { number: 3 }, []]) {
    const fixture = plotDraft({ formula: "x+n1", samples, exercise: true, animation: { number: 3, value: 2 } });
    fixture.outline.numbers.push({ label: "采样的横坐标 t", initial: 0, min: -3, max: 3, student_control: { kind: "slider", step: 0.25 } });
    Object.assign(fixture.drafts[0].number_activities[0], { number: 3, prompt: "请把 t 调到 2，观察对应的高度。" });
    fixture.drafts[0].moments[0].restart_numbers = [3];
    const { plot, prefixes, rejections, lesson } = await run(fixture, {
      fix(draft, section) {
        assert.equal(section, 1);
        draft.course_visual_creates.visual_1.content.parameters = { formulas: ["x"], sample_x_numbers: [3] };
      },
    });
    assert.equal(prefixes[0].calls, 2);
    assert.match(rejections[0].error.path, /sample_x_numbers$/u);
    assert.equal(lesson.lesson.tasks[0].prompt, "请把 t 调到 2，观察对应的高度。");
    assert.equal(plot.points.length, 1);
  }
});

test("an independent sample plot satisfies the shared section's sample intent", async () => {
  const fixture = plotDraft({ formula: "x+n1", samples: [9], narration: "在另一张图上用滑块移动点 P。" });
  fixture.outline.course_visuals.push({
    required_features: [...LESSON_PLAN_CAPABILITY_REGISTRY.function_plot.required_features],
    create_section: 1, use_sections: [1], relation: "comparison", related_visual: 1,
  });
  fixture.drafts[0].course_visual_creates.visual_2 = {
    moment: 1, content: { parameters: { formulas: ["x^2"], sample_x_numbers: [1] } },
  };
  const { prefixes, rejections, lesson } = await run(fixture);
  assert.equal(prefixes[0].calls, 1);
  assert.deepEqual(rejections, []);
  const plots = lesson.steps[0].beats.flatMap(beat => beat.actions).filter(action => action.kind === "plot");
  assert.equal(plots.length, 2);
  assert.equal(plots[0].content.points, undefined);
  assert.equal(plots[1].content.points.length, 1);
});

test("a later instruction for an omitted sample point repairs only that section", async () => {
  const fixture = plotDraft({ formula: "x+n1", samples: [1, 1] });
  fixture.drafts[1].moments[0].narration = "现在用滑块移动点 P，观察它的高度。";
  const { calls, rejections, prefixes, plot } = await run(fixture, {
    fix(draft, section) {
      assert.equal(section, 2);
      draft.moments[0].narration = "观察整条曲线。";
    },
  });
  assert.deepEqual(calls.slice(1).map(call => call.section), [2, 2, 3]);
  assert.match(rejections[0].error.message, /no moving sample point/u);
  assert.deepEqual(prefixes[0].plot, plot);
});

test("a curve parameter with the same number cannot substitute for a requested moving marker", async () => {
  const fixture = plotDraft({ formula: "x+n1", samples: [1, 1], narration: "调节滑块，让标记沿曲线移动到指定高度。" });
  const { prefixes, rejections, plot } = await run(fixture, {
    fix(draft) {
      draft.course_visual_creates.visual_1.content.parameters = { formulas: ["x"], sample_x_numbers: [1] };
    },
  });
  assert.equal(prefixes[0].calls, 2);
  assert.match(rejections[0].error.path, /sample_x_numbers$/u);
  assert.equal(plot.points.length, 1);
});

test("an unreadable earlier sample field does not hide later use of an unbound control", async () => {
  const fixture = plotDraft({ formula: "x+n1", samples: "unreadable" });
  fixture.drafts[1].moments[0].animations = [{ number: 2, end_value: 2 }];
  const { calls, rejections, prefixes, plot } = await run(fixture, {
    fix(draft, section) {
      assert.equal(section, 2);
      delete draft.moments[0].animations;
    },
  });
  assert.deepEqual(calls.slice(1).map(call => call.section), [2, 2, 3]);
  assert.match(rejections[0].error.message, /no visual binding/u);
  assert.deepEqual(prefixes[0].plot, plot);
});
