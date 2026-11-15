// The function-plot judge (OLL decision 0018): each case's expectations are met by a hand-written lesson
// of the kind a correct recipe produces, and one mutation per check fails it for its own reason.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { judgePlot } from "../scripts/plot-judge.mjs";

const cases = Object.fromEntries(JSON.parse(readFileSync(new URL("../testsuite/plot-judge-cases.json", import.meta.url), "utf8")).cases.map((item) => [item.id, item]));

/** A one-section lesson that writes one plot, then plays the given animations. */
function lesson(content, { variables, animations = [] } = {}) {
  return {
    dsl: "octos.lesson", version: "0.1", profile: "authoring",
    lesson: { mode: "explain", language: "en-US", title: "Graph", goals: ["Read the graph"], ...(variables ? { variables } : {}) },
    steps: [{ key: "s", purpose: "Show the graph", beats: [
      { key: "draw", say: "Here is the graph.", actions: [{ do: "write", as: "graph", kind: "plot", role: "main_visual", content: { axes: { x: { min: -6, max: 6 }, y: { min: -6, max: 8 } }, ...content }, place: { relation: "new_region" } }] },
      ...animations.map(([variable, value], index) => ({ key: `a${index}`, say: "Watch it change.", actions: [{ do: "animate", variable, value }] })),
    ] }],
    close: { summary: "We read the graph.", focus: ["graph"] },
  };
}

const slider = (as, initial, min, max, step) => ({ as, initial, min, max, label: as, control: { kind: "slider", step } });
const passes = (id, built) => {
  const verdict = judgePlot(cases[id], built);
  assert.deepEqual(verdict.hard, [], `${id} should pass: ${verdict.hard.join(" | ")}`);
};
const fails = (id, built, pattern) => {
  const verdict = judgePlot(cases[id], built);
  assert.ok(verdict.hard.some((miss) => pattern.test(miss)), `${id} should miss ${pattern}: ${verdict.hard.join(" | ") || "passed"}`);
};

// PJ-01: y = 3x − 2, rise and run between x = 1 and x = 3.
const slope = (points) => lesson({ curves: [{ as: "f", expression: "3*x - 2" }], measurement: "secant", points });
const a = { as: "a", x: 1, y: 1, label: "A" }, b = { as: "b", x: 3, y: 7, label: "B" };

test("PJ-01: the slope triangle between x = 1 and x = 3", () => {
  passes("PJ-01", slope([a, b]));
  // Measured on a mark: a y-intercept listed first takes the triangle's first corner.
  fails("PJ-01", slope([{ as: "yi", x: 0, y: -2, label: "y-intercept" }, a, b]), /wrong slope triangle: expected Δx 2, Δy 6 \(drawn: Δx 1, Δy 3\)/u);
  // A reference point that is not on the line.
  fails("PJ-01", slope([a, { ...b, y: 8 }]), /a point off every curve: "B" at \(3, 8\)/u);
});

// PJ-02: y = −2x + 4 and its intercepts.
const intercepts = (points, extra = {}) => lesson({ curves: [{ as: "f", expression: "-2*x + 4" }], points, ...extra });
const yi = { as: "yi", x: 0, y: 4, label: "y-intercept" }, xi = { as: "xi", x: 2, y: 0, label: "x-intercept" };

test("PJ-02: both intercepts are marked; reference point A at x = 0 is not the y-intercept mark", () => {
  passes("PJ-02", intercepts([yi, xi]));
  fails("PJ-02", intercepts([xi]), /missing mark: no labelled point at \(0, 4\)/u);
  // The slope triangle's first point happens to sit on the y-intercept: still no mark there.
  fails("PJ-02", intercepts([{ as: "a", x: 0, y: 4, label: "A" }, { as: "b", x: 1, y: 2, label: "B" }, xi], { measurement: "secant" }), /missing mark: no labelled point at \(0, 4\)/u);
});

// PJ-03: the vertex, the axis of symmetry and the x-intercepts of y = (x − 1)² − 4.
const parabola = (points, guides) => lesson({ curves: [{ as: "f", expression: "(x - 1)^2 - 4" }], points, guides });
const vertex = { as: "v", x: 1, y: -4, label: "vertex" };
const roots = [{ as: "r1", x: -1, y: 0, label: "x-intercept" }, { as: "r2", x: 3, y: 0, label: "x-intercept" }];
const axis = { as: "axis", kind: "vertical_line", value: 1, label: "axis of symmetry" };

test("PJ-03: vertex, axis and x-intercepts", () => {
  passes("PJ-03", parabola([vertex, ...roots], [axis]));
  fails("PJ-03", parabola([vertex, roots[0], { ...roots[1], x: 2 }], [axis]), /a point off every curve: "x-intercept" at \(2, 0\)/u);
  fails("PJ-03", parabola([vertex, ...roots], [{ ...axis, value: 0 }]), /missing guide: no vertical_line at 1/u);
});

// PJ-05: y = a(x − 2)² + 1 with a on a slider through 0.
const family = (label) => lesson({
  curves: [{ as: "f", expression: "a*(x - 2)^2 + 1" }],
  points: [{ as: "v", x: 2, y: 1, label: "vertex" }, { as: "p", x: 3, y: 2, label }],
  guides: [{ as: "axis", kind: "vertical_line", value: 2, label: "axis of symmetry" }],
  bindings: [{ target: "p.y", expression: "a + 1" }],
}, { variables: [slider("a", 1, -2, 2, 0.5)], animations: [["a", -1]] });

test("PJ-05: marks follow a through 0; a moving label carries no number", () => {
  passes("PJ-05", family("a point on the curve"));
  fails("PJ-05", family("(3, 2)"), /a number in a moving label: "\(3, 2\)"/u);
});

// PJ-06: y = kx + 1 with k on a slider through 0: the x-intercept −1/k does not exist at k = 0.
const line = (binding) => lesson({
  curves: [{ as: "f", expression: "k*x + 1" }],
  points: [{ as: "yi", x: 0, y: 1, label: "y-intercept" }, { as: "xi", x: -1, y: 0, label: "x-intercept" }],
  bindings: [binding],
}, { variables: [slider("k", 1, -2, 2, 0.5)], animations: [["k", 2]] });

test("PJ-06: an intercept that stops existing is hidden, not failed", () => {
  passes("PJ-06", line({ target: "xi.x", expression: "-1/k", hide_when_undefined: true }));
  fails("PJ-06", line({ target: "xi.x", expression: "-1/k" }), /plot graph fails when k = 0/u);
});

// Review of #85: a number with no slider is checked only where the lesson takes it. The same unguarded
// intercept passes when k is fixed at 1 to 2 (its range −2 to 2 is never reached), and fails when an
// animation carries k from 1 to −1, through 0.
const fixedLine = (animations) => lesson({
  curves: [{ as: "f", expression: "k*x + 1" }],
  points: [{ as: "yi", x: 0, y: 1, label: "y-intercept" }, { as: "xi", x: -1, y: 0, label: "x-intercept" }],
  bindings: [{ target: "xi.x", expression: "-1/k" }],
}, { variables: [{ as: "k", initial: 1, min: -2, max: 2, label: "k" }], animations });
test("a number with no slider is swept only over the values its animations pass through", () => {
  passes("PJ-06", fixedLine([["k", 2]]));
  fails("PJ-06", fixedLine([["k", -1]]), /plot graph fails when k = 0/u);
});

// Review of #85: an asymptote's approach is inside an open bar however close it comes on screen.
test("a value approaching an open range end far out is still inside the bar", () => {
  const decay = lesson({ curves: [{ as: "f", expression: "2^(-x) - 3" }], intervals: [{ as: "r", axis: "y", from: -3, from_closed: false, to: null }] });
  decay.steps[0].beats[0].actions[0].content.axes = { x: { min: -2, max: 31 }, y: { min: -4, max: 2 } };
  assert.deepEqual(judgePlot({ id: "asymptote", expect: {} }, decay).hard, []);
});

// PJ-07: x + 2 for x < 1, 4 for x ≥ 1.
const pieces = (left, right) => lesson({ curves: [
  { as: "left", expression: "x + 2", to: 1, to_closed: false, series: "f", ...left },
  { as: "right", expression: "4", from: 1, from_closed: true, series: "f", ...right },
] });

test("PJ-07: two pieces with their ends open and closed as written", () => {
  passes("PJ-07", pieces({}, {}));
  fails("PJ-07", pieces({ to_closed: true }, { from_closed: false }), /wrong pieces: expected \(−∞, 1\) ∪ \[1, \+∞\)/u);
  fails("PJ-07", pieces({}, { expression: "3" }), /wrong pieces/u);
});

// PJ-09: three constant steps.
test("PJ-09: three constant pieces", () => {
  passes("PJ-09", lesson({ curves: [
    { as: "p1", expression: "1", to: 2, to_closed: false, series: "f" },
    { as: "p2", expression: "3", from: 2, from_closed: true, to: 4, to_closed: false, series: "f" },
    { as: "p3", expression: "5", from: 4, from_closed: true, series: "f" },
  ] }));
});

// PJ-11: y = 2/(x + 1): x ≠ −1 and y ≠ 0.
const reciprocal = (intervals) => lesson({ curves: [{ as: "f", expression: "2/(x + 1)" }], intervals });
const domain = [{ as: "d1", axis: "x", from: null, to: -1, to_closed: false }, { as: "d2", axis: "x", from: -1, from_closed: false, to: null }];
const range = [{ as: "r1", axis: "y", from: null, to: 0, to_closed: false }, { as: "r2", axis: "y", from: 0, from_closed: false, to: null }];

test("PJ-11: domain and range with a point left out of each", () => {
  passes("PJ-11", reciprocal([...domain, ...range]));
  // A domain bar drawn across x = −1.
  fails("PJ-11", reciprocal([{ as: "d", axis: "x", from: null, to: null }, ...range]), /the function is undefined at x = -1, inside the domain bars/u);
  // A filled end on an open range end: sampling cannot see it, the case's expectation does.
  fails("PJ-11", reciprocal([...domain, range[0], { ...range[1], from_closed: true }]), /wrong range: expected \(−∞, 0\) ∪ \(0, \+∞\), drawn \(−∞, 0\) ∪ \[0, \+∞\)/u);
});

// PJ-12: the range of −(x + 2)² + 5; with a on a slider, the range flips at a = 0.
test("PJ-12: a range bar on the wrong side after the flip fails", () => {
  passes("PJ-12", lesson({ curves: [{ as: "f", expression: "-(x + 2)^2 + 5" }], intervals: [{ as: "r", axis: "y", from: null, to: 5, to_closed: true }] }));
  const flipping = (intervals, bindings) => lesson({ curves: [{ as: "f", expression: "a*(x + 2)^2 + 5" }], intervals, ...(bindings.length ? { bindings } : {}) },
    { variables: [slider("a", -1, -2, 2, 0.5)], animations: [["a", 1]] });
  // Guarded ends: each bar exists for one sign of a, and both hide at a = 0.
  passes("PJ-12", flipping(
    [{ as: "down", axis: "y", from: null, to: 5, to_closed: true }, { as: "up", axis: "y", from: 5, from_closed: true, to: null }],
    [{ target: "down.to", expression: "5 + 0*log(-a)", hide_when_undefined: true }, { target: "up.from", expression: "5 + 0*log(a)", hide_when_undefined: true }]));
  // One unguarded bar stays on the a < 0 side after a turns positive.
  fails("PJ-12", flipping([{ as: "down", axis: "y", from: null, to: 5, to_closed: true }], []), /lies outside the range bars when a = (?!-)\d/u);
});

// PJ-13: y = 2^x − 3 never reaches −3.
test("PJ-13: an open range end", () => {
  passes("PJ-13", lesson({ curves: [{ as: "f", expression: "2^x - 3" }], intervals: [{ as: "r", axis: "y", from: -3, from_closed: false, to: null }] }));
  fails("PJ-13", lesson({ curves: [{ as: "f", expression: "2^x - 3" }], intervals: [{ as: "r", axis: "y", from: -3, from_closed: true, to: null }] }), /wrong range/u);
  // A bar that stops short leaves drawn values outside it.
  fails("PJ-13", lesson({ curves: [{ as: "f", expression: "2^x - 3" }], intervals: [{ as: "r", axis: "y", from: -2, from_closed: false, to: null }] }), /lies outside the range bars/u);
});

// PJ-10: a domain bar that starts too late.
test("PJ-10: the function is defined outside a domain bar that starts too late", () => {
  const root = (from) => lesson({ curves: [{ as: "f", expression: "sqrt(x - 3) + 1" }], intervals: [
    { as: "d", axis: "x", from, from_closed: true, to: null }, { as: "r", axis: "y", from: 1, from_closed: true, to: null }] });
  passes("PJ-10", root(3));
  fails("PJ-10", root(4), /the function is defined at x = 3, outside the domain bars/u);
});

// PJ-15: a family 0018 leaves out passes with no plot, or with a plain plot; a false bar fails.
test("PJ-15: an out-of-scope range is no worse than today", () => {
  const cubic = (intervals) => lesson({ curves: [{ as: "f", expression: "x^3 - 3*x" }], ...(intervals ? { intervals } : {}) });
  assert.deepEqual(judgePlot(cases["PJ-15"], { ...lesson({ curves: [{ as: "f", expression: "x" }] }), steps: [] }).hard, []);
  passes("PJ-15", cubic());
  fails("PJ-15", cubic([{ as: "r", axis: "y", from: -2, from_closed: true, to: 2, to_closed: true }]), /lies outside the range bars/u);
});

test("PJ-14: an open domain end drawn closed; bars beside two functions are ambiguous", () => {
  const logarithm = (intervals, extra = []) => lesson({ curves: [{ as: "f", expression: "log(x - 1)" }, ...extra], intervals });
  passes("PJ-14", logarithm([{ as: "d", axis: "x", from: 1, from_closed: false, to: null }]));
  fails("PJ-14", logarithm([{ as: "d", axis: "x", from: 1, from_closed: true, to: null }]), /wrong domain: expected \(1, \+∞\), drawn \[1, \+∞\)/u);
  fails("PJ-14", logarithm([{ as: "d", axis: "x", from: 1, from_closed: false, to: null }], [{ as: "g", expression: "x" }]), /domain or range bars beside 2 functions/u);
});

test("PJ-04, PJ-08, PJ-16: a vertex with no x-intercept, a curved piece, an out-of-scope sine", () => {
  passes("PJ-04", lesson({ curves: [{ as: "f", expression: "x^2 + 2*x + 3" }], points: [{ as: "v", x: -1, y: 2, label: "vertex" }] }));
  // No x-intercept exists: a mark drawn on the x-axis is off the curve.
  fails("PJ-04", lesson({ curves: [{ as: "f", expression: "x^2 + 2*x + 3" }], points: [{ as: "v", x: -1, y: 2, label: "vertex" }, { as: "xi", x: -1, y: 0, label: "x-intercept" }] }), /a point off every curve: "x-intercept"/u);
  passes("PJ-08", lesson({ curves: [
    { as: "left", expression: "-x", to: 0, to_closed: true, series: "f" },
    { as: "right", expression: "x^2", from: 0, from_closed: false, series: "f" },
  ] }));
  passes("PJ-16", lesson({ curves: [{ as: "f", expression: "sin(x)" }] }));
});

test("PJ-17: a plain plot is judged on its curve; a lesson without a plot fails a plot case", () => {
  passes("PJ-17", lesson({ curves: [{ as: "f", expression: "x^2 - 1" }] }));
  fails("PJ-17", lesson({ curves: [{ as: "f", expression: "x^2 + 1" }] }), /wrong curve: no curve passes through \(0, -1\), \(1, 0\)/u);
  fails("PJ-17", { ...lesson({ curves: [{ as: "f", expression: "x" }] }), steps: [] }, /^no plot$/u);
});

test("every case has expectations and a lesson above that meets them", () => {
  const source = readFileSync(new URL(import.meta.url), "utf8");
  for (const item of Object.values(cases)) {
    assert.ok(item.expect && Object.keys(item.expect).length, `${item.id} has expectations`);
    assert.ok(source.includes(`passes("${item.id}"`), `${item.id} is met by a lesson in this file`);
  }
});
