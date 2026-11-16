// Points on a function plot as the model means them (OLL decision 0018 as amended, decision 0020): a fixed
// point {x, y}, checked against the curve, or a dragged point {slider: "n1"}. Replaces sample_x_numbers,
// where the model wrote an index and often put x positions instead (42 recorded slips). A point the program
// cannot draw is refused, never dropped: the narration talks about it.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { generateLessonPlanWithModel } = await import(new URL("../lesson-plan.js", import.meta.url));
const run5 = JSON.parse(await readFile(new URL("./fixtures/number-line-run5-replies.json", import.meta.url), "utf8"));
const decimal = (value) => ({ mantissa: Math.round(value * 10), scale: 1 });

const reply = ({ formula, points, numbers = [], marks, pieces, say = "看图像。", animations }) => {
  const base = structuredClone(run5.turns.find((turn) => turn.pair === 42).replies[0]);
  base.course.outline.numbers = numbers.map(([initial, min, max, label]) => ({ initial: decimal(initial), min: decimal(min), max: decimal(max), label, unit: "" }));
  base.course.outline.course_visuals = [{ required_features: ["cartesian_function_curve"], use_sections: [1], relation: "primary" }];
  base.course.first_section = {
    moments: [{ narration: say, delivery: "patient",
      visual_creates: [{ course_visual: 1, content: { parameters: { ...(pieces ? { pieces } : { formulas: [formula] }), ...(points ? { points } : {}), ...(marks ? { marks } : {}) }, numbers: numbers.map((_n, i) => i + 1) } }],
      math_creates: [{ reusable_item: 1, content: { latex: "f(x)" } }],
      ...(animations ? { animations: animations.map(([number, value]) => ({ number, end_value: decimal(value), duration_intent: "normal" })) } : {}) }],
    number_activities: [],
  };
  return JSON.stringify(base);
};

async function generate(text) {
  const rejected = []; let lesson; const requests = [];
  class Stop extends Error {}
  try {
    await generateLessonPlanWithModel(async (request) => { requests.push(request); if (requests.length > 1) throw new Stop(); return text; },
      { turn_id: "points", learner_request: "画出函数图像。", language: "zh-CN", input_modality: "text", request_source: "self_contained" },
      { on_playable_prefix: ({ compiled }) => { lesson ??= compiled.lesson; throw new Stop(); }, on_rejected_part: (part) => rejected.push(`${part.error.code} ${part.error.message}`) });
  } catch (error) { if (!(error instanceof Stop)) rejected.push(error.message); }
  return { lesson, rejected };
}
const plot = (lesson) => lesson.steps.flatMap((step) => step.beats).flatMap((beat) => beat.actions).find((action) => action.do === "write" && action.kind === "plot").content;
const refused = ({ rejected }, pattern) => assert.ok(rejected.some((miss) => miss.startsWith("LESSON_PLAN_POINT") && pattern.test(miss)), rejected.join(" | "));

test("two fixed points are A and B on the curve, in the model's order and with its labels, with the slope between them", async () => {
  const { lesson, rejected } = await generate(reply({ formula: "3*x - 2", points: [{ x: 3, y: 7 }, { x: 1, y: 1 }] }));
  assert.ok(lesson, rejected.join(" | "));
  const content = plot(lesson);
  // Each keeps its own label; drawn left to right, so the run and rise are positive.
  assert.deepEqual(content.points.slice(0, 2).map((point) => [point.label, point.x, point.y]), [["B", 1, 1], ["A", 3, 7]]);
  // A label the model wrote on one point is kept, and the other takes the letter left.
  const labelled = await generate(reply({ formula: "x^2", points: [{ x: 1, y: 1, label: "B" }, { x: 3, y: 9 }] }));
  assert.deepEqual(plot(labelled.lesson).points.slice(0, 2).map((point) => [point.label, point.x]), [["B", 1], ["A", 3]]);
  assert.equal(content.measurement, "secant");
});

test("one fixed point is drawn with its label and no slope readout", async () => {
  const { lesson, rejected } = await generate(reply({ formula: "x^2", points: [{ x: 2, y: 4, label: "M" }] }));
  assert.ok(lesson, rejected.join(" | "));
  const content = plot(lesson);
  assert.deepEqual(content.points.map((point) => [point.label, point.x, point.y]), [["M", 2, 4]]);
  assert.equal(content.measurement, undefined);
});

test("y is checked against the curve: a stand-in formula is refused with the fact, without reading text", async () => {
  // "x" written for the line through (1, 2) and (7, 10).
  refused(await generate(reply({ formula: "x", points: [{ x: 1, y: 2 }, { x: 7, y: 10 }] })), /gives y = 1 at x = 1, not 2/u);
  // Rounded to the digits written is right; a whole number means a whole number.
  assert.ok((await generate(reply({ formula: "1/x", points: [{ x: 3, y: 0.33 }] }))).lesson);
  assert.ok((await generate(reply({ formula: "1/x", points: [{ x: 3, y: 0.3 }] }))).lesson);
  refused(await generate(reply({ formula: "0.4*x", points: [{ x: 4, y: 2 }] })), /gives y = 1.6/u);
  // Half a unit of the last digit (1.45 written 1.5 is right), and a whole number is exact (0 is not 0.04).
  assert.ok((await generate(reply({ formula: "x + 0.45", points: [{ x: 1, y: 1.5 }] }))).lesson);
  refused(await generate(reply({ formula: "0.01*x", points: [{ x: 4, y: 0 }] })), /gives y = 0.04/u);
});

test("a dragged point names its slider, and moves along the curve", async () => {
  const { lesson, rejected } = await generate(reply({ formula: "x^2", points: [{ slider: "n1" }], numbers: [[1, -3, 3, "x"]], animations: [[1, 2]] }));
  assert.ok(lesson, rejected.join(" | "));
  assert.ok(plot(lesson).bindings.some((binding) => binding.target.endsWith(".x") && binding.expression.includes("number_01")));
});

test("a dragged point keeps its label, and is refused on a curve the sliders change or on several curves (review of #113)", async () => {
  const labelled = await generate(reply({ formula: "x^2", points: [{ slider: "n1", label: "M" }], numbers: [[1, -3, 3, "x"]], animations: [[1, 2]] }));
  assert.ok(labelled.lesson, labelled.rejected.join(" | "));
  assert.ok(plot(labelled.lesson).points.some((point) => point.label === "M"));
  // A dragged point on the vertex slider of a moving parabola: handled as main handles it, never refused outright
  // (the paired probe lost PJ-04 to that refusal); the vertex mark shows the vertex.
  const vertex = await generate(reply({ formula: "(x - n1)^2 + 2", points: [{ slider: "n1", label: "顶点" }], numbers: [[-1, -3, 3, "顶点横坐标"]], marks: ["vertex"], animations: [[1, 1]] }));
  assert.ok(vertex.lesson, vertex.rejected.join(" | "));
  refused(await generate(reply({ formula: "x^2", points: [{ x: 1, y: 1 }, { x: 1, y: 1 }] })), /two different x/u);
  // A dragged point keeps its label beside a slope triangle, and two dragged points never share a letter.
  const triangle = await generate(reply({ formula: "x^2", points: [{ slider: "n1", label: "M" }], numbers: [[1, -3, 3, "x"]], marks: ["slope_triangle"], animations: [[1, 2]] }));
  assert.ok(triangle.lesson, triangle.rejected.join(" | "));
  assert.equal(plot(triangle.lesson).points[0].label, "M");
  const two = await generate(reply({ formula: "x^2", points: [{ slider: "n1" }, { slider: "n2", label: "A" }], numbers: [[1, -3, 3, "x1"], [2, -3, 3, "x2"]], animations: [[1, 2]] }));
  assert.ok(two.lesson, two.rejected.join(" | "));
  assert.deepEqual(plot(two.lesson).points.slice(0, 2).map((point) => point.label), ["B", "A"]);
});

test("points the program cannot draw are refused, never dropped", async () => {
  refused(await generate(reply({ formula: "x^2", points: [{ slider: "n1" }] })), /no lesson numbers/u);
  refused(await generate(reply({ formula: "x^2", points: [{ x: 1, y: 1 }, { slider: "n1" }], numbers: [[1, -3, 3, "x"]] })), /all fixed .* or all dragged/u);
  refused(await generate(reply({ formula: "x^2", points: [{ x: 1 }] })), /either \{x, y\}/u);
  refused(await generate(reply({ formula: "sqrt(x)", points: [{ x: -4, y: 0 }] })), /no value at x = -4/u);
  refused(await generate(reply({ formula: "3*x - 2", points: [{ x: 1, y: 1 }], marks: ["slope_triangle"] })), /slope triangle needs two points/u);
  refused(await generate(reply({ pieces: [{ formula: "x", x_to: 1, ends: "()" }, { formula: "1", x_from: 1, ends: "[)" }], points: [{ x: 0, y: 0 }] })), /piecewise function takes no points/u);
});
