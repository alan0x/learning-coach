// Marks on a function plot (OLL decision 0018 §1) through the real path, from the model's reply to the
// lesson, judged by the plot judge (testsuite/plot-judge-cases.json). The marks are a trial option,
// offered only when LEARNING_COACH_TRIAL_RECIPES names function_plot_extensions, which Coach reads as it
// loads; this file sets it first. Replies are run 5's reply (number-line-run5-replies.json, pair 42)
// rewritten in the model's format for a function plot: no reply with marks is recorded yet.
process.env.LEARNING_COACH_TRIAL_RECIPES = "function_plot_extensions";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveExecutionRequirements, normalizeAuthoringLesson } from "octos-lesson-language";

const { generateLessonPlanWithModel } = await import(new URL("../lesson-plan.js", import.meta.url));
const { judgePlot } = await import(new URL("../scripts/plot-judge.mjs", import.meta.url));
const run5 = JSON.parse(await readFile(new URL("./fixtures/number-line-run5-replies.json", import.meta.url), "utf8"));
const cases = Object.fromEntries(JSON.parse(await readFile(new URL("../testsuite/plot-judge-cases.json", import.meta.url), "utf8")).cases.map((item) => [item.id, item]));
const decimal = (value) => ({ mantissa: Math.round(value * 10), scale: 1 });

/** Run 5's reply, rewritten: a function plot of `formula` with `marks`, and these numbers and moments. */
const plotReply = ({ formula, marks, pieces, numbers = [], moments, language }) => {
  const reply = structuredClone(run5.turns.find((turn) => turn.pair === 42).replies[0]);
  const outline = reply.course.outline;
  outline.numbers = numbers.map(([initial, min, max, label]) => ({ initial: decimal(initial), min: decimal(min), max: decimal(max), label, unit: "" }));
  outline.course_visuals = [{ required_features: ["cartesian_function_curve"], use_sections: [1], relation: "primary" }];
  reply.course.first_section = {
    moments: moments.map((moment, index) => ({
      narration: moment.say, delivery: "patient",
      ...(index === 0 ? {
        visual_creates: [{ course_visual: 1, content: { parameters: pieces
          // Pieces as the model writes them: formulas repeats each piece's formula, an unbounded side is left out.
          ? { formulas: pieces.map(([piece]) => piece), pieces: pieces.map(([piece, from, to, ends]) => ({ formula: piece, ...(from === null ? {} : { x_from: decimal(from) }), ...(to === null ? {} : { x_to: decimal(to) }), ends })) }
          : { formulas: [formula], marks }, numbers: numbers.map((_number, position) => position + 1) } }],
        math_creates: [{ reusable_item: 1, content: { latex: `y = ${formula ?? pieces.map(([piece]) => piece).join("; ")}` } }],
      } : {}),
      ...(moment.animations ? { animations: moment.animations.map(([number, value]) => ({ number, end_value: decimal(value), duration_intent: "normal" })) } : {}),
    })),
    number_activities: [],
  };
  return JSON.stringify(reply);
};

const generate = async (reply, prompt = "画出函数图像并标出关键点。", language = "zh-CN") => {
  const requests = [];
  const rejected = [];
  let lesson;
  class Stop extends Error {}
  try {
    await generateLessonPlanWithModel(async (request) => {
      requests.push(request);
      if (requests.length > 1) throw new Stop();
      return reply;
    }, { turn_id: "marks", learner_request: prompt, language, input_modality: "text", request_source: "self_contained" }, {
      on_playable_prefix: ({ compiled }) => { lesson ??= compiled.lesson; throw new Stop(); },
      on_rejected_part: (part) => rejected.push(`${part.error.code} ${part.error.message}`),
    });
  } catch (caught) {
    if (!(caught instanceof Stop)) rejected.push(caught.message);
  }
  return { lesson, rejected, requests };
};
const plotContent = (lesson) => lesson.steps.flatMap((step) => step.beats).flatMap((beat) => beat.actions).find((action) => action.do === "write" && action.kind === "plot").content;
const passes = async (id, reply) => {
  const { lesson, rejected } = await generate(reply);
  assert.ok(lesson, rejected.join(" | "));
  const verdict = judgePlot(cases[id], lesson);
  assert.deepEqual(verdict.hard, [], `${id}: ${verdict.hard.join(" | ")}`);
  return lesson;
};

test("PJ-02: a line's two intercepts", async () => {
  const lesson = await passes("PJ-02", plotReply({ formula: "-2x+4", marks: ["intercepts"], moments: [{ say: "看这条直线和两条坐标轴的交点。" }] }));
  assert.deepEqual(plotContent(lesson).points.map((point) => [point.label, point.x, point.y]), [["y 截距", 0, 4], ["x 截距", 2, 0]]);
});

test("PJ-03: a parabola's vertex, axis and x-intercepts", async () => {
  const lesson = await passes("PJ-03", plotReply({ formula: "(x-1)^2-4", marks: ["vertex", "symmetry_axis", "intercepts"], moments: [{ say: "看顶点、对称轴和交点。" }] }));
  assert.deepEqual(plotContent(lesson).guides.map((guide) => [guide.label, guide.kind, guide.value]), [["对称轴", "vertical_line", 1]]);
});

test("PJ-04: a vertex with no x-intercept: the missing intercepts are left out, not drawn", async () => {
  const lesson = await passes("PJ-04", plotReply({ formula: "(x+1)^2+2", marks: ["vertex", "intercepts"], moments: [{ say: "看顶点。" }] }));
  assert.deepEqual(plotContent(lesson).points.map((point) => point.label), ["顶点", "y 截距"]);
});

test("PJ-05: the vertex and axis follow a slider through 0, hidden at 0", async () => {
  const lesson = await passes("PJ-05", plotReply({
    formula: "n1(x-2)^2+1", marks: ["vertex", "symmetry_axis"], numbers: [[1, -2, 2, "开口系数 a"]],
    moments: [{ say: "看顶点。" }, { say: "把 a 变成负数，开口向下。", animations: [[1, -1]] }],
  }));
  const content = plotContent(lesson);
  assert.ok(content.bindings.filter((binding) => binding.target.startsWith("mark-")).every((binding) => binding.hide_when_undefined === true));
});

test("PJ-06: a line through k = 0: the x-intercept hides while it does not exist", async () => {
  await passes("PJ-06", plotReply({
    formula: "n1x+1", marks: ["intercepts"], numbers: [[1, -2, 2, "斜率 k"]],
    moments: [{ say: "看两个截距。" }, { say: "把 k 调大。", animations: [[1, 2]] }],
  }));
});

test("a mark the formula cannot give is refused in the section, and the section is asked again", async () => {
  const { lesson, rejected, requests } = await generate(plotReply({ formula: "x^3-x", marks: ["vertex"], moments: [{ say: "看顶点。" }] }));
  assert.equal(lesson, undefined);
  assert.ok(rejected.some((miss) => /LESSON_PLAN_CAPABILITY_PARAMETER .*marks.*vertex mark/u.test(miss)), rejected.join(" | "));
  assert.match(requests[1]?.label ?? "", /section/u);
  const line = await generate(plotReply({ formula: "2x+1", marks: ["symmetry_axis"], moments: [{ say: "看对称轴。" }] }));
  assert.ok(line.rejected.some((miss) => /symmetry_axis mark needs a quadratic/u.test(miss)), line.rejected.join(" | "));
});

test("marks need OLL 0.11's hidden guide and secant features only when drawn; English lessons get English labels", async () => {
  const { lesson } = await generate(plotReply({
    formula: "n1(x-2)^2+1", marks: ["symmetry_axis"], numbers: [[1, -2, 2, "a"]], moments: [{ say: "Watch the axis." }],
  }), "Graph it.", "en");
  const requirements = deriveExecutionRequirements(normalizeAuthoringLesson(lesson, { lessonId: "m", boardId: "b", baseRevision: 0, regionIntent: "new_topic" }));
  assert.equal(requirements.minimumPlayerVersion, "0.11.0");
  assert.deepEqual(plotContent(lesson).guides.map((guide) => guide.label), ["Axis of symmetry"]);
});

// The slope triangle (0018 §1, second step): the program places A and B two units apart, off x = 0.
test("PJ-01: the slope triangle of a line, between x = 1 and x = 3", async () => {
  const lesson = await passes("PJ-01", plotReply({ formula: "3x-2", marks: ["slope_triangle"], moments: [{ say: "看斜率三角形：前进多少，上升多少。" }] }));
  const content = plotContent(lesson);
  assert.equal(content.measurement, "secant");
  assert.deepEqual(content.points.map((point) => [point.label, point.x]), [["A", 1], ["B", 3]]);
});

test("the slope triangle beside the intercepts: A is not on the y-intercept, which keeps its own mark", async () => {
  const lesson = await passes("PJ-02", plotReply({ formula: "-2x+4", marks: ["intercepts", "slope_triangle"], moments: [{ say: "看截距和斜率。" }] }));
  assert.deepEqual(plotContent(lesson).points.map((point) => [point.label, point.x, point.y]), [["A", 1, 2], ["B", 3, -2], ["y 截距", 0, 4], ["x 截距", 2, 0]]);
});

test("the slope triangle finds two points where the curve exists, and is refused where it cannot", async () => {
  const root = await generate(plotReply({ formula: "sqrt(x-5)", marks: ["slope_triangle"], moments: [{ say: "看两点。" }] }));
  assert.ok(root.lesson, root.rejected.join(" | "));
  assert.deepEqual(plotContent(root.lesson).points.map((point) => point.x), [6, 8]);
  const nowhere = await generate(plotReply({ formula: "sqrt(x-50)", marks: ["slope_triangle"], moments: [{ say: "看两点。" }] }));
  assert.ok(nowhere.rejected.some((miss) => /slope_triangle mark found no two points/u.test(miss)), nowhere.rejected.join(" | "));
});

// Pieces (0018 §2, third step): one formula per interval, ends open or closed as written.
test("PJ-07: two pieces, the constant one closed at 1", async () => {
  const lesson = await passes("PJ-07", plotReply({ pieces: [["x+2", null, 1, "()"], ["4", 1, null, "[)"]], moments: [{ say: "x 小于 1 时是 x+2，从 1 起是 4。" }] }));
  const curves = plotContent(lesson).curves;
  assert.deepEqual(curves.map((curve) => [curve.from ?? null, curve.from_closed ?? null, curve.to ?? null, curve.to_closed ?? null, curve.series]), [[null, null, 1, false, "f"], [1, true, null, null, "f"]]);
});

test("PJ-08 and PJ-09: a curved piece, and three constant steps", async () => {
  await passes("PJ-08", plotReply({ pieces: [["-x", null, 0, "(]"], ["x^2", 0, null, "()"]], moments: [{ say: "左边一段直线，右边一段抛物线。" }] }));
  await passes("PJ-09", plotReply({ pieces: [["1", null, 2, "()"], ["3", 2, 4, "[)"], ["5", 4, null, "[)"]], moments: [{ say: "三段台阶。" }] }));
});

test("overlapping pieces, and pieces with lesson numbers, are refused in the section", async () => {
  const overlap = await generate(plotReply({ pieces: [["x", null, 2, "(]"], ["2", 1, null, "[)"]], moments: [{ say: "两段。" }] }));
  assert.ok(overlap.rejected.some((miss) => /pieces overlap/u.test(miss)), overlap.rejected.join(" | "));
  const shared = await generate(plotReply({ pieces: [["x", null, 1, "()"], ["1", 1, null, "[)"]], moments: [{ say: "在 1 处相接。" }] }));
  assert.ok(shared.lesson, shared.rejected.join(" | "));
  const bothClosed = await generate(plotReply({ pieces: [["x", null, 1, "(]"], ["1", 1, null, "[)"]], moments: [{ say: "两段都含 1。" }] }));
  assert.ok(bothClosed.rejected.some((miss) => /pieces overlap/u.test(miss)), bothClosed.rejected.join(" | "));
  const moving = await generate(plotReply({ pieces: [["n1x", null, 1, "()"], ["1", 1, null, "[)"]], numbers: [[1, 0, 2, "k"]], moments: [{ say: "两段。" }] }));
  assert.ok(moving.rejected.some((miss) => /pieces are fixed formulas/u.test(miss)), moving.rejected.join(" | "));
});

// Review: a curve slider can take the curve away from A or B (√(x − h) with h up to 5): the pair must exist
// at the slider's ends too, or the lesson fails where the learner drags.
test("the slope triangle's points exist at every slider end, not only where the lesson stops", async () => {
  const { lesson, rejected } = await generate(plotReply({
    formula: "sqrt(x-n1)", marks: ["slope_triangle"], numbers: [[0, 0, 5, "h"]], moments: [{ say: "看两点之间的斜率。" }],
  }));
  assert.ok(lesson, rejected.join(" | "));
  assert.deepEqual(plotContent(lesson).points.map((point) => point.x), [6, 8]);
  assert.deepEqual(judgePlot({ id: "slider", expect: {} }, lesson).hard, []);
});
