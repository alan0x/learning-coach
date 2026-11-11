// The teaching view planner over a corpus of function-plot situations:
// every case compiles, what the lesson shows is visible, the initial curve
// is readable, and model-written ranges are repaired instead of failing.
import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { compileMathExpression } from "octos-lesson-language";
import { cases } from "./plot-view-cases.mjs";
import { samplePlan } from "./sample-plans.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = await build({
  stdin: {
    contents: `
      export { compileAndValidateLessonPlan } from "./src/lesson-plan-api.ts";
      export { parseModelFormula } from "./src/plugins/math-formulas.ts";`,
    resolveDir: root, loader: "ts",
  },
  bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
});
const { compileAndValidateLessonPlan, parseModelFormula } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

function compileCase(item) {
  const plan = samplePlan("function_plot");
  const visual = plan.sections[0].moments[0].actions[0];
  const numbers = item.numbers ?? [];
  const parameters = {};
  if (item.exprs) parameters.expressions = item.exprs;
  else if (numbers.length && !item.samples) parameters.expression_tokens = parseModelFormula(item.expr, numbers.length, "$case");
  else parameters.expression = item.expr;
  if (item.samples) parameters.sample_x_numbers = item.samples;
  for (const key of ["x_label", "y_label", "x_min", "x_max", "y_min", "y_max"]) if (item[key] !== undefined) parameters[key] = item[key];
  visual.content.parameters = parameters;
  const actions = plan.sections[0].moments[0].actions;
  if (numbers.length) {
    plan.numbers = numbers.map(n => ({ ...n, student_control: { kind: "slider", step: Number(((n.max - n.min) / 100).toPrecision(2)) } }));
    visual.content.numbers = numbers.map((_, index) => index + 1);
    const template = actions.find(a => a.action === "animate");
    plan.sections[0].moments[0].actions = [...actions.filter(a => a.action !== "animate"),
      ...(item.animate ?? []).map(([number, end]) => ({ ...template, number, end_value: end }))];
    plan.sections[0].student_activities[0].value = (numbers[0].min + numbers[0].max) / 2;
  } else {
    delete plan.numbers;
    delete visual.content.numbers;
    plan.sections[0].moments[0].actions = actions.filter(a => a.action !== "animate");
    delete plan.sections[0].student_activities;
  }
  const compiled = compileAndValidateLessonPlan(plan);
  const plot = compiled.lesson.steps.flatMap(step => step.beats.flatMap(beat => beat.actions))
    .find(action => action.do === "write" && action.kind === "plot").content;
  const variables = Object.fromEntries((compiled.lesson.lesson?.variables ?? []).map(v => [v.as, v.initial]));
  return { plot, variables, adjustments: compiled.view_adjustments };
}

const results = new Map(cases.map(item => [item.id, (() => {
  try { return compileCase(item); } catch (error) { return { error }; }
})()]));
const get = (id) => {
  const result = results.get(id);
  assert.ok(result && !result.error, `${id}: ${result?.error?.message}`);
  return result;
};
const inside = (axes, x, y, inset = 0) => {
  const fx = (x - axes.x.min) / (axes.x.max - axes.x.min), fy = (y - axes.y.min) / (axes.y.max - axes.y.min);
  return fx >= inset - 1e-9 && fx <= 1 - inset + 1e-9 && fy >= inset - 1e-9 && fy <= 1 - inset + 1e-9;
};

test("every corpus situation compiles; viewport problems never fail a section", () => {
  for (const item of cases) {
    const result = results.get(item.id);
    assert.ok(!result.error, `${item.id}: ${result.error?.message}`);
  }
});

// Share of the frame height a curve state covers (clipped to the frame).
function heightShare(plot, variables) {
  const { x, y } = plot.axes;
  let low = Infinity, high = -Infinity;
  for (const curve of plot.curves) {
    const f = compileMathExpression(curve.expression, ["x", ...Object.keys(variables)]);
    for (let i = 0; i <= 400; i += 1) {
      const t = x.min + (x.max - x.min) * i / 400;
      let value;
      try { value = f({ ...variables, x: t }); } catch { continue; }
      if (!Number.isFinite(value)) continue;
      const clipped = Math.min(y.max, Math.max(y.min, value));
      low = Math.min(low, clipped); high = Math.max(high, clipped);
    }
  }
  return (high - low) / (y.max - y.min);
}

test("the curve fills a readable share of the frame", () => {
  for (const item of cases) {
    const { plot, variables } = get(item.id);
    const initial = heightShare(plot, variables);
    // A lesson that animates a curve to a larger state frames that state;
    // the initial curve must still stay clearly visible.
    const shown = (item.animate ?? []).filter(([number]) => !item.samples?.includes(number)).map(([number, end]) =>
      heightShare(plot, { ...variables, [`number_${String(number).padStart(2, "0")}`]: end }));
    const best = Math.max(initial, ...shown);
    assert.ok(best >= 0.3 && initial >= 0.15, `${item.id}: initial ${initial.toFixed(2)}, best ${best.toFixed(2)} in ${JSON.stringify(plot.axes)}`);
  }
});

test("marked points and animation endpoints are visible with clearance", () => {
  for (const item of cases.filter(entry => entry.samples)) {
    const { plot } = get(item.id);
    for (const point of plot.points) assert.ok(inside(plot.axes, point.x, point.y, 0.05), `${item.id}: ${JSON.stringify(point)} in ${JSON.stringify(plot.axes)}`);
    const f = compileMathExpression(plot.curves[0].expression, ["x"]);
    for (const [number, end] of item.animate ?? []) {
      if (!item.samples.includes(number)) continue;
      assert.ok(inside(plot.axes, end, f({ x: end }), 0.05), `${item.id}: animation end ${end}`);
    }
  }
});

test("key features are visible: roots, turning points, vertices and poles", () => {
  const visible = (id, points) => {
    const { plot } = get(id);
    for (const [x, y] of points) assert.ok(y === undefined ? x > plot.axes.x.min && x < plot.axes.x.max : inside(plot.axes, x, y),
      `${id}: (${x}, ${y}) in ${JSON.stringify(plot.axes)}`);
  };
  visible("p-roots", [[-2, 0], [1, 0], [3, 0], [-0.7869, 8.2088], [2.1196, -4.0607]]);
  visible("p-wide-roots", [[-6, 0], [0, 0], [8, 0]]);
  visible("p-cubic-turns", [[-1, 2], [1, -2]]);
  visible("q-standard", [[1, 0], [5, 0], [3, -4]]);
  visible("q-far-vertex", [[12, 30]]);
  visible("q-projectile", [[0, 0], [20 / 4.9, 0], [10 / 4.9, 400 / 19.6]]);
  visible("r-shifted", [[2], [1, 0]]);
  visible("r-two-poles", [[-1], [1], [0, -1]]);
  visible("l-two-lines", [[1, 3]]);
  visible("t-sinc", [[Math.PI, 0], [-Math.PI, 0]]);
});

test("quantity axes start at zero and grow until the quantity has changed clearly", () => {
  for (const id of ["q-projectile", "l-cost", "e-compound", "e-population", "x-speed", "t-degrees"]) {
    assert.equal(get(id).plot.axes.x.min, 0, id);
  }
  const compound = get("e-compound").plot.axes;
  assert.ok(compound.x.max >= 20 && compound.x.max <= 40 && compound.y.min === 0 && compound.y.max >= 3000, JSON.stringify(compound));
  assert.equal(get("t-degrees").plot.axes.x.max, 360);
});

test("slider extremes the lesson never shows do not flatten the initial curve", () => {
  const kb = get("l-kb").plot.axes;
  assert.ok(kb.y.max - kb.y.min <= 40, JSON.stringify(kb));
  // The practice target a = 2.6 (slider midpoint in this corpus) is shown; the extreme a = 5 is not.
  const base = get("e-base-slider").plot.axes;
  assert.ok(base.y.max >= 2.6 ** 4 && base.y.max < 5 ** 4, JSON.stringify(base));
  const wave = get("t-sliders").plot.axes;
  assert.ok(wave.y.max >= 3 && wave.y.max <= 6, "the demonstrated amplitude 3 is shown; the extreme period is not");
  assert.ok(wave.x.max - wave.x.min <= 4 * Math.PI + 1e-9);
  const a = get("q-a-slider").plot.axes;
  assert.ok(a.y.max - a.y.min <= 15 && a.x.max - a.x.min <= 12, JSON.stringify(a));
});

test("equal units only where geometry is the content", () => {
  for (const id of ["q-basic", "q-hk-slider", "e-inverse", "g-semicircle"]) assert.equal(get(id).plot.axes.equal_scale, true, id);
  for (const id of ["q-steep5", "q-projectile", "t-sin", "e-2x", "l-cost", "x-tiny"]) assert.notEqual(get(id).plot.axes.equal_scale, true, id);
  for (const item of cases) {
    const { axes } = get(item.id).plot;
    if (axes.equal_scale) {
      assert.equal(axes.layout, "adaptive", item.id);
      // The card height band absorbs mild aspects; extreme ones must not reach the player.
      const aspect = (axes.y.max - axes.y.min) / (axes.x.max - axes.x.min);
      assert.ok(aspect >= 0.4 && aspect <= 2.5, `${item.id}: aspect ${aspect}`);
    }
  }
  const inverse = get("e-inverse").plot.axes;
  assert.deepEqual([inverse.x.min, inverse.x.max], [inverse.y.min, inverse.y.max]);
});

test("radian trigonometric plots get π ticks; degrees, narrow windows and other functions do not", () => {
  for (const id of ["t-sin", "t-tan", "t-sin-cos", "t-shifted"]) assert.equal(get(id).plot.axes.x.ticks, "pi", id);
  for (const id of ["t-degrees", "t-fast", "m-narrow-x", "t-sinc", "q-basic"]) assert.equal(get(id).plot.axes.x.ticks, undefined, id);
  const sine = get("t-sin").plot.axes.x;
  assert.ok(Math.abs(sine.max - 2 * Math.PI) < 1e-9 && Math.abs(sine.min + 2 * Math.PI) < 1e-9, JSON.stringify(sine));
});

test("model-written ranges are hints: kept when sound, replaced and logged when not", () => {
  assert.deepEqual([get("m-narrow-x").plot.axes.x.min, get("m-narrow-x").plot.axes.x.max], [0, 0.5], "a deliberate zoom stays");
  for (const [id, reason] of [["m-wide-x", "model_x_range_replaced"], ["m-y-misses", "model_y_range_replaced"], ["m-domain-miss", "model_x_range_replaced"]]) {
    const { plot, adjustments } = get(id);
    assert.ok(adjustments.some(entry => entry.reason === reason), `${id}: ${JSON.stringify(adjustments)}`);
    assert.ok(plot.axes.x.max - plot.axes.x.min <= 20, id);
  }
  const misses = get("m-y-misses").plot.axes;
  assert.ok(misses.y.min <= 10 && misses.y.max > 10, JSON.stringify(misses));
});

test("removable holes are reported and legends use textbook notation", () => {
  assert.deepEqual(get("r-removable").plot.curves[0].holes, [{ x: 1, y: 2 }]);
  const labels = Object.fromEntries(cases.map(item => [item.id, get(item.id).plot.curves.map(curve => curve.label)]));
  assert.deepEqual(labels["q-projectile"], ["y = −4.9x² + 20x"]);
  assert.deepEqual(labels["p-roots"], ["y = (x − 1)(x + 2)(x − 3)"]);
  assert.deepEqual(labels["p-quartic"], ["y = x⁴ − 5x² + 4"]);
  assert.deepEqual(labels["q-ahk"], ["y = a(x − h)² + k"]);
  assert.deepEqual(labels["g-semicircle"], ["y = √(4 − x²)"]);
  assert.deepEqual(labels["g-abs"], ["y = |x − 1| − 2"]);
  assert.deepEqual(labels["e-log10"], ["y = log₁₀(x)"]);
  assert.deepEqual(labels["l-kb"], ["y = kx + b"]);
});

test("the planner is deterministic", () => {
  for (const id of ["p-roots", "t-sliders", "q-secant", "e-compound"]) {
    const item = cases.find(entry => entry.id === id);
    assert.deepEqual(compileCase(item).plot, get(id).plot, id);
  }
});
