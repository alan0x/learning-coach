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

// Decision 0018 as amended after the trial: a mark the program cannot draw for this plot is left out and
// the rest is drawn, in the same call (refusing it cost a whole section again, about 9 s, and the model
// asked for the same or another undrawable mark). The lesson must still pass the plot judge's checks.
const leftOut = async (reply) => {
  const { lesson, rejected, requests } = await generate(reply);
  assert.ok(lesson, rejected.join(" | "));
  assert.deepEqual(rejected, []);
  assert.equal(requests.length, 1);
  assert.deepEqual(judgePlot({ id: "left-out", expect: {} }, lesson).hard, []);
  const content = plotContent(lesson);
  return { lesson, content, markNames: [...(content.points ?? []), ...(content.guides ?? [])].map((part) => part.as).filter((as) => as.startsWith("mark-")), bars: (content.intervals ?? []).map((bar) => bar.axis) };
};

test("a mark the formula cannot give is left out, the others are drawn, with no second call", async () => {
  // Marks are derived for lines and quadratics only, so a cubic's are all left out.
  const cubic = await leftOut(plotReply({ formula: "x^3-x", marks: ["vertex", "intercepts"], moments: [{ say: "看图像。" }] }));
  assert.deepEqual(cubic.markNames, []);
  const line = await leftOut(plotReply({ formula: "2x+1", marks: ["symmetry_axis", "intercepts"], moments: [{ say: "看图像。" }] }));
  assert.deepEqual(line.markNames, ["mark-y-intercept", "mark-x-intercept"]);
  // Empty lists are none (the model writes them beside a plain formula).
  const empty = await leftOut(plotReply({ formula: "2x+1", marks: [], moments: [{ say: "看图像。" }] }).replace('"marks":[]', '"marks":[],"pieces":[]'));
  assert.deepEqual([empty.markNames, empty.bars], [[], []]);
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

test("the slope triangle finds two points where the curve exists, and is left out where it cannot", async () => {
  const root = await generate(plotReply({ formula: "sqrt(x-5)", marks: ["slope_triangle"], moments: [{ say: "看两点。" }] }));
  assert.ok(root.lesson, root.rejected.join(" | "));
  assert.deepEqual(plotContent(root.lesson).points.map((point) => point.x), [6, 8]);
  const nowhere = await leftOut(plotReply({ formula: "sqrt(x-50)", marks: ["slope_triangle"], moments: [{ say: "看两点。" }] }));
  assert.equal(nowhere.content.measurement, undefined);
  assert.deepEqual(nowhere.content.points ?? [], []);
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

// Domain and range (0018 §3, fourth step): bars on the axes from exact formulas only.
const barsOf = (lesson) => (plotContent(lesson).intervals ?? []).map((bar) => `${bar.axis}:${bar.from === null ? "(-∞" : `${bar.from_closed ? "[" : "("}${bar.from}`},${bar.to === null ? "∞)" : `${bar.to}${bar.to_closed ? "]" : ")"}`}`);
test("PJ-10, PJ-11, PJ-13, PJ-14: a root, a reciprocal, an exponential and a logarithm", async () => {
  assert.deepEqual(barsOf(await passes("PJ-10", plotReply({ formula: "sqrt(x-3)+1", marks: ["domain", "range"], moments: [{ say: "看定义域和值域。" }] }))), ["x:[3,∞)", "y:[1,∞)"]);
  assert.deepEqual(barsOf(await passes("PJ-11", plotReply({ formula: "2/(x+1)", marks: ["domain", "range"], moments: [{ say: "看定义域和值域。" }] }))), ["x:(-∞,-1)", "x:(-1,∞)", "y:(-∞,0)", "y:(0,∞)"]);
  assert.deepEqual(barsOf(await passes("PJ-13", plotReply({ formula: "2^x-3", marks: ["range"], moments: [{ say: "看值域。" }] }))), ["y:(-3,∞)"]);
  assert.deepEqual(barsOf(await passes("PJ-14", plotReply({ formula: "ln(x-1)", marks: ["domain"], moments: [{ say: "看定义域。" }] }))), ["x:(1,∞)"]);
});

test("PJ-12: a quadratic's range, and the right side shown as a slider turns a from negative to positive", async () => {
  assert.deepEqual(barsOf(await passes("PJ-12", plotReply({ formula: "-(x+2)^2+5", marks: ["range"], moments: [{ say: "看值域。" }] }))), ["y:(-∞,5]"]);
  const flipping = await passes("PJ-12", plotReply({
    formula: "n1(x+2)^2+5", marks: ["range"], numbers: [[-1, -2, 2, "a"]],
    moments: [{ say: "开口向下时的值域。" }, { say: "把 a 变成正数。", animations: [[1, 1]] }],
  }));
  // Two bars, each with an end defined only for one sign of a; both hide at a = 0.
  assert.deepEqual(plotContent(flipping).bindings.filter((binding) => /^range-/u.test(binding.target)).map((binding) => binding.hide_when_undefined), [true, true]);
});

test("a range the program has no exact formula for, or one that collapses at a slider stop, is left out; the domain is still drawn", async () => {
  for (const [formula, numbers] of [["x^4-2x^2", []], ["tan(x)", []], ["n1x+1", [[1, -2, 2, "k"]]]]) {
    const { bars } = await leftOut(plotReply({ formula, marks: ["domain", "range"], numbers, moments: [{ say: "看定义域和值域。" }] }));
    assert.deepEqual(bars, formula === "tan(x)" ? [] : ["x"], formula);
  }
});

test("a piecewise function's domain joins its intervals, and its range joins the pieces' values", async () => {
  const lesson = await passes("PJ-07", plotReply({ pieces: [["x+2", null, 1, "()"], ["4", 1, null, "[)"]], moments: [{ say: "看定义域和值域。" }] }).replace('"pieces":', '"marks":["domain","range"],"pieces":'));
  assert.deepEqual(barsOf(lesson), ["x:(-∞,∞)", "y:(-∞,3)", "y:[4,4]"]);
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

// Review of the domain and range step.
test("a range is left out where x's coefficient can reach 0 and the curve turns constant", async () => {
  for (const formula of ["2^(n1x)-3", "sqrt(n1x+4)", "1/(n1x+1)"]) {
    const { bars } = await leftOut(plotReply({ formula, marks: ["range"], numbers: [[1, -1, 2, "p"]], moments: [{ say: "看值域。" }] }));
    assert.deepEqual(bars, [], formula);
  }
});

test("a piecewise domain is drawn only when every piece is defined on its whole interval, and left out otherwise", async () => {
  const reply = plotReply({ pieces: [["1/x", -1, 1, "[]"], ["2", 1, null, "()"]], moments: [{ say: "看定义域。" }] }).replace('"pieces":', '"marks":["domain"],"pieces":');
  const { bars } = await leftOut(reply);
  assert.deepEqual(bars, []);
});

test("the card's own form -(x-n1)^2+n2 with intercepts, vertex and range", async () => {
  const { lesson, rejected } = await generate(plotReply({
    formula: "-(x-n1)^2+n2", marks: ["intercepts", "vertex", "range"], numbers: [[1, -3, 3, "h"], [2, -2, 4, "k"]],
    moments: [{ say: "看顶点和值域。" }, { say: "把顶点向上移。", animations: [[2, 3]] }],
  }));
  assert.ok(lesson, rejected.join(" | "));
  const verdict = judgePlot({ id: "card-form", expect: { points: [[1, 2]], range: [{ from: null, to: 2, toClosed: true }] } }, lesson);
  assert.deepEqual(verdict.hard, []);
  const content = plotContent(lesson);
  assert.ok([...content.bindings].every((binding) => binding.expression.length <= 240));
});

test("coefficients too long for one binding leave the marks out, never OLL's own length error (review)", async () => {
  const numbers = [[1, 0, 5, "p"], [2, 0, 5, "q"], [3, 0, 5, "r"], [1, 0, 5, "s"]];
  const formula = "(x+n1*n2+n3*n4+n1*n3)*(x-(n1*n2+n3*n4+n1*n3))+n1";
  for (const mark of ["vertex", "intercepts", "symmetry_axis"]) {
    const { markNames } = await leftOut(plotReply({ formula, marks: [mark], numbers, moments: [{ say: "看图像。" }] }));
    assert.deepEqual(markNames, [], mark);
  }
});

// Review: without marks, a slope lesson's automatic A and B are found as on main, at the start only, so a
// lesson without marks compiles (or is refused) exactly as before the option.
test("without marks, the automatic A and B are placed as before the option", async () => {
  const reply = JSON.parse(plotReply({ formula: "sqrt(x+n1)", marks: undefined, numbers: [[1, -1, 1, "h"]], moments: [{ say: "看斜率。" }, { say: "移动曲线。", animations: [[1, -1]] }] }));
  reply.course.outline.title = "曲线上两点的斜率";
  const { lesson, rejected } = await generate(JSON.stringify(reply));
  assert.equal(lesson, undefined);
  assert.ok(rejected.some((miss) => /LESSON_PLAN_OLL_SEMANTIC .*not finite/u.test(miss)), rejected.join(" | "));
});

// Review: every piece refusal has a test, each refused in the section with its own reason.
test("one piece or five, an end not above its start, and an unknown ends code are refused in the section", async () => {
  const refused = async (pieces, reason) => {
    const { lesson, rejected, requests } = await generate(plotReply({ pieces, moments: [{ say: "分段函数。" }] }));
    assert.equal(lesson, undefined);
    assert.ok(rejected.some((miss) => reason.test(miss)), rejected.join(" | "));
    assert.match(requests[1]?.label ?? "", /section/u);
  };
  await refused([["x", null, null, "()"]], /two to four pieces/u);
  await refused([["x", null, 1, "()"], ["1", 1, 2, "[)"], ["2", 2, 3, "[)"], ["3", 3, 4, "[)"], ["4", 4, null, "[)"]], /two to four pieces/u);
  await refused([["x", 3, 1, "[]"], ["1", 3, null, "()"]], /x_from is below its x_to/u);
  await refused([["x", 1, 1, "[]"], ["1", 1, null, "()"]], /x_from is below its x_to/u);
  await refused([["x", null, 1, "(>"], ["1", 1, null, "[)"]], /ends is one of/u);
  const four = await generate(plotReply({ pieces: [["x", null, 1, "()"], ["1", 1, 2, "[)"], ["2", 2, 3, "[)"], ["3", 3, null, "[)"]], moments: [{ say: "四段。" }] }));
  assert.ok(four.lesson, four.rejected.join(" | "));
});

// Review of #92: a sign read from sampled states (the start, demonstrated states, each slider's ends one at
// a time) misses a change between them. Signs are now proved over the numbers' whole ranges.
const withSliders = (reply, marks) => {
  const parsed = JSON.parse(reply);
  for (const number of parsed.course.outline.numbers) number.student_control = { kind: "slider" };
  if (marks) parsed.course.first_section.moments[0].visual_creates[0].content.parameters.marks = marks;
  return JSON.stringify(parsed);
};
const rangeContent = async (formula, numbers, marks = ["range"]) => {
  const { lesson, rejected } = await generate(withSliders(plotReply({ formula, marks, numbers, moments: [{ say: "看值域。" }] })));
  return { lesson, rejected, content: lesson && plotContent(lesson) };
};

test("a range bar opens to the side its sign proves, and to either side, guarded, where the sign can change (review)", async () => {
  const one = [[2, -3, 3, "a"]], two = [[4, 2, 5, "p"], [1, 0, 3, "q"]];
  for (const [formula, numbers] of [["(n1^2-1)x^2", one], ["(n1^2-1)sqrt(x)", one], ["(n1-n2)x^2", two]]) {
    const { lesson, rejected, content } = await rangeContent(formula, numbers);
    assert.ok(lesson, `${formula}: ${rejected.join(" | ")}`);
    const bars = content.intervals.filter((interval) => interval.axis === "y");
    assert.equal(bars.length, 2, formula);
    // Both ends bound and hidden while undefined; only one bar is ever shown, so each is labelled.
    assert.deepEqual(bars.map((bar) => content.bindings.some((binding) => binding.target === `${bar.as}.${bar.from === null ? "to" : "from"}` && binding.hide_when_undefined)), [true, true], formula);
    assert.ok(bars.every((bar) => bar.label), formula);
    assert.deepEqual(judgePlot({ id: formula, expect: {} }, lesson).hard, [], formula);
  }
  // A sign proved over the whole slider: one bar.
  const proved = await rangeContent("n1x^2", [[2, 1, 3, "a"]]);
  assert.equal(proved.content.intervals.filter((interval) => interval.axis === "y").length, 1);
});

test("a line's range, or a log's, is left out where its coefficient can reach 0 anywhere on the sliders (review)", async () => {
  for (const [formula, numbers] of [["(n1-n2)x+1", [[4, 2, 5, "p"], [1, 0, 3, "q"]]], ["(n1^2-1)x", [[2, -3, 3, "a"]]]]) {
    const { lesson, rejected, content } = await rangeContent(formula, numbers);
    assert.ok(lesson, rejected.join(" | "));
    assert.deepEqual(content.intervals ?? [], [], formula);
  }
  const steep = await rangeContent("(n1^2+1)x", [[2, -3, 3, "a"]]);
  assert.equal(steep.content.intervals.length, 1);
});

test("an exponential's domain needs a base above 0 wherever the numbers go, also in a piece; otherwise it is left out (review)", async () => {
  for (const [formula, numbers] of [["n1^x", [[2, -1, 3, "b"]]], ["(-2)^x", []]]) {
    const { lesson, rejected, content } = await rangeContent(formula, numbers, ["domain"]);
    assert.ok(lesson, rejected.join(" | "));
    assert.deepEqual(content.intervals ?? [], [], formula);
  }
  const positive = await rangeContent("n1^x", [[2, 0.5, 3, "b"]], ["domain"]);
  assert.equal(positive.content.intervals.length, 1);
  const piece = await generate(withSliders(plotReply({ pieces: [["(-2)^x", null, 0, "()"], ["1", 0, null, "[)"]], moments: [{ say: "两段。" }] }), ["domain"]));
  assert.deepEqual(plotContent(piece.lesson).intervals ?? [], []);
  const fine = await generate(withSliders(plotReply({ pieces: [["2^x", null, 0, "()"], ["1", 0, null, "[)"]], moments: [{ say: "两段。" }] }), ["domain"]));
  assert.equal(plotContent(fine.lesson).intervals.length, 1);
});

// Decision 0018 as extended (owner, 2026-11-15): odd-degree polynomials and sines and cosines get exact
// ranges; every polynomial gets its domain.
test("an odd-degree polynomial takes every value; an even higher degree's range is not read", async () => {
  const cubic = await rangeContent("x^3-3x", [], ["domain", "range"]);
  assert.ok(cubic.lesson, cubic.rejected.join(" | "));
  assert.deepEqual(cubic.content.intervals.map((bar) => [bar.axis, bar.from, bar.to]), [["x", null, null], ["y", null, null]]);
  assert.deepEqual(judgePlot({ id: "cubic", expect: { range: [{ from: null, to: null }] } }, cubic.lesson).hard, []);
  // Repair in place: a range the program cannot derive is left out, and the plot is drawn without it.
  const quartic = await rangeContent("x^4-2x^2", [], ["range"]);
  assert.ok(quartic.lesson, quartic.rejected.join(" | "));
  assert.equal((quartic.content.intervals ?? []).length, 0);
  const quarticDomain = await rangeContent("x^4-2x^2", [], ["domain"]);
  assert.ok(quarticDomain.lesson, quarticDomain.rejected.join(" | "));
  const vanishing = await rangeContent("n1x^3+x^2", [[1, -1, 2, "a"]], ["range"]);
  assert.equal((vanishing.content.intervals ?? []).length, 0);
});

test("a sine or cosine's range runs from k − |a| to k + |a|, ends included, also while a slides through 0", async () => {
  for (const [formula, numbers, expected] of [["sin(x)", [], [-1, 1]], ["2cos(3x)+1", [], [-1, 3]], ["n1 sin(x)", [[2, -2, 2, "a"]], [-2, 2]]]) {
    const { lesson, rejected, content } = await rangeContent(formula, numbers, ["domain", "range"]);
    assert.ok(lesson, `${formula}: ${rejected.join(" | ")}`);
    const range = content.intervals.find((bar) => bar.axis === "y");
    assert.deepEqual([range.from, range.to, range.from_closed, range.to_closed], [...expected, true, true], formula);
    assert.deepEqual(judgePlot({ id: formula, expect: { range: [{ from: expected[0], fromClosed: true, to: expected[1], toClosed: true }] } }, lesson).hard, [], formula);
  }
  const flat = await rangeContent("sin(n1 x)", [[1, -1, 2, "p"]], ["range"]);
  assert.equal((flat.content.intervals ?? []).length, 0);
});
