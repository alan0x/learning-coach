// The function-plot judge (OLL decision 0018, plan §5: judge before recipe).
//
// It judges what a lesson's plot draws, read through OLL itself: the lesson is normalized, the plot's
// bindings are evaluated with OLL's own evaluator at each state (a mark whose value does not exist is
// hidden, as the player hides it), and curves are evaluated with the player's plot expressions. Parts are
// matched by coordinates and intervals, never by name, so a recipe's naming cannot satisfy the judge.
//
// Two kinds of check:
// - Expected values, written into each case before any run (0018 §4): the curve's points, marked points,
//   guides, the slope triangle's Δx and Δy, the pieces with their ends, the domain and range bars with
//   their ends. They are met when some state the lesson shows draws them. Which ends are included comes
//   only from the case: sampling cannot tell "reaches 0" from "comes close to 0" (0018 §3).
// - Checks needing no expectation, at every state the lesson shows and at every stop of every slider
//   (both review bugs of OLL #62 appeared only mid-slider or at a = 0, and practice invites dragging):
//   every visible point lies on a drawn curve; a label naming a number does not move; the function is
//   defined inside the domain bars and nowhere else; its values stay inside the range bars; and the
//   lesson does not fail at any stop.
//
// Narration is not judged here: what the lesson says is read by hand under the probe's pass rules.

import { evaluateContentBindings, normalizeAuthoringLesson, reduceCanonicalEvents } from "octos-lesson-language";

const { compilePlotExpression } = await import(new URL("../node_modules/octos-lesson-language/dist/packages/web-runtime/src/plot.js", import.meta.url).href);

const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
const round = (value) => (value === null ? null : Number(Number(value).toFixed(4)));
const describeValues = (values) => Object.entries(values).map(([name, value]) => `${name} = ${round(value)}`).join(", ");

/**
 * The plots a whole authoring lesson draws, each with what changes it: the lesson's variables and its
 * animations in order (a plot is judged at its starting values and after each animation). Later edits
 * of a plot's content are not followed: the plot is judged as written.
 */
export function plotLessonsIn(lesson) {
  const actions = (lesson?.steps ?? []).flatMap((step) => step.beats ?? []).flatMap((beat) => beat.actions ?? []);
  const writes = actions.filter((action) => action.do === "write" && action.kind === "plot");
  if (!writes.length) return [];
  let events;
  try {
    events = normalizeAuthoringLesson(lesson, { lessonId: "judge", boardId: "judge", baseRevision: 0, regionIntent: "new_topic" });
  } catch (error) {
    return [{ as: writes[0].as, error: `${error.code ?? "error"}: ${String(error.message).slice(0, 120)}` }];
  }
  const nodes = Object.values(reduceCanonicalEvents(events).nodes);
  const variables = lesson.lesson?.variables ?? [];
  const animations = actions.filter((action) => action.do === "animate").map((action) => [action.variable, action.value]);
  return writes.map((write) => {
    const node = nodes.find((candidate) => String(candidate.id).endsWith(`:node:${write.as}`));
    return node ? { as: write.as, content: node.content, variables, animations } : { as: write.as, error: "plot node not found" };
  });
}

/** The variable values the lesson shows: its starting values, then after each animation in order. */
function shownValues({ variables, animations }) {
  let current = Object.fromEntries(variables.map((variable) => [variable.as, variable.initial]));
  const states = [current];
  for (const [name, value] of animations) {
    current = { ...current, [name]: value };
    states.push(current);
  }
  return states;
}

/**
 * Every stop of every slider: a variable's steps from its minimum (up to 200 stops, else 200 even
 * steps), with the other variables at each shown state's values. Two variables are swept together on a
 * coarser grid, so a mark that depends on both is checked where they meet.
 * A number with no slider is swept only over the values its animations pass through (the lowest to the
 * highest it is shown at): the model writes wide ranges for fixed numbers, and a state no lesson reaches
 * is not a miss.
 */
function sweepValues(plot) {
  const shown = shownValues(plot);
  const stopsOf = (variable, limit) => {
    if (!variable.control) {
      const seen = shown.map((state) => state[variable.as]).filter(Number.isFinite);
      if (!seen.length) return [];
      const low = Math.min(...seen), high = Math.max(...seen);
      return high > low ? Array.from({ length: limit + 1 }, (_, index) => low + (high - low) * index / limit) : [low];
    }
    const step = variable.control?.step;
    const count = step > 0 ? Math.floor((variable.max - variable.min) / step + 1e-9) + 1 : Infinity;
    if (count <= limit) return Array.from({ length: count }, (_, index) => variable.min + index * step);
    return Array.from({ length: limit + 1 }, (_, index) => variable.min + (variable.max - variable.min) * index / limit);
  };
  const states = [];
  for (const base of shown) {
    for (const variable of plot.variables) for (const value of stopsOf(variable, 200)) states.push({ ...base, [variable.as]: value });
  }
  if (plot.variables.length >= 2) {
    const [first, second] = plot.variables;
    for (const a of stopsOf(first, 24)) for (const b of stopsOf(second, 24)) states.push({ ...shown[0], [first.as]: a, [second.as]: b });
  }
  return states;
}

/** What the plot draws at given values: curves as functions, and only the parts that are shown. */
export function drawnPlot(plot, values) {
  let content;
  try {
    content = evaluateContentBindings(plot.content, values);
  } catch (error) {
    return { error: String(error.message).slice(0, 100) };
  }
  const curves = (content.curves ?? []).filter((curve) => curve.kind !== "implicit").map((curve) => {
    let evaluate;
    try { evaluate = compilePlotExpression(String(curve.expression), values); } catch { evaluate = () => Number.NaN; }
    const f = (x) => { try { return evaluate(x); } catch { return Number.NaN; } };
    return { ...curve, f };
  });
  const shown = (part) => part.binding_undefined !== true && part.visible !== false;
  return {
    content,
    implicit: (content.curves ?? []).some((curve) => curve.kind === "implicit"),
    curves,
    points: (content.points ?? []).filter(shown).map((point) => ({ id: point.id, x: Number(point.x), y: Number(point.y), label: typeof point.label === "string" ? point.label : "" })),
    guides: (content.guides ?? []).filter(shown).map((guide) => ({ id: guide.id, kind: guide.kind, value: Number(guide.value), label: typeof guide.label === "string" ? guide.label : "" })),
    intervals: (content.intervals ?? []).filter(shown).map((interval) => ({
      id: interval.id, axis: interval.axis, label: typeof interval.label === "string" ? interval.label : "",
      from: interval.from === null || interval.from === undefined ? null : Number(interval.from),
      to: interval.to === null || interval.to === undefined ? null : Number(interval.to),
      fromClosed: interval.from_closed !== false, toClosed: interval.to_closed !== false,
    })),
    // The slope triangle measures the first two points as written, shown or not (as the player does).
    secant: content.measurement === "secant" && (content.points ?? []).length >= 2 ? (content.points ?? []).slice(0, 2).map((point) => ({ id: point.id, x: Number(point.x), y: Number(point.y) })) : undefined,
  };
}

/** Whether a piece covers x, its ends included or not as written. */
function covers(curve, x) {
  if (typeof curve.from === "number" && (x < curve.from || (x === curve.from && curve.from_closed === false))) return false;
  if (typeof curve.to === "number" && (x > curve.to || (x === curve.to && curve.to_closed === false))) return false;
  return true;
}

/** The value a group of pieces gives at x, or undefined where none covers x with a finite value. */
function valueAt(pieces, x) {
  for (const piece of pieces) {
    if (!covers(piece, x)) continue;
    const y = piece.f(x);
    if (Number.isFinite(y)) return y;
  }
  return undefined;
}

/** The plot's functions: curves sharing a series are one function; every other curve is its own. */
function functionsOf(drawn) {
  const groups = new Map();
  drawn.curves.forEach((curve, index) => {
    const key = typeof curve.series === "string" ? `series:${curve.series}` : `curve:${index}`;
    groups.set(key, [...(groups.get(key) ?? []), curve]);
  });
  return [...groups.values()];
}

const onSomeCurve = (drawn, x, y) => drawn.curves.some((curve) => covers(curve, x) && close(curve.f(x), y));

/** The x values to sample: an even grid over the window, whole numbers, and every finite end in sight. */
function sampleXs(drawn, extra = []) {
  const axes = drawn.content.axes ?? {};
  const min = Number(axes.x?.min ?? -5), max = Number(axes.x?.max ?? 5);
  const xs = new Set(Array.from({ length: 401 }, (_, index) => min + (max - min) * index / 400));
  for (let x = Math.ceil(min); x <= Math.floor(max); x += 1) xs.add(x);
  for (const curve of drawn.curves) for (const end of [curve.from, curve.to]) if (typeof end === "number") xs.add(end);
  for (const interval of drawn.intervals) if (interval.axis === "x") for (const end of [interval.from, interval.to]) if (end !== null) xs.add(end);
  for (const x of extra) xs.add(x);
  return [...xs].filter((x) => x >= min - 1e-9 && x <= max + 1e-9).sort((a, b) => a - b);
}

// Bar ends are compared tightly: a value near an open end (an asymptote) is inside, one on it is not.
// 1e-12 absorbs rounding (an end computed by a binding) but not an asymptote's approach: e^−21 − 3 is
// 7.6e−10 above −3, inside the open bar.
const atEnd = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
const inBars = (bars, value) => bars.some((bar) =>
  (bar.from === null || (atEnd(value, bar.from) ? bar.fromClosed : value > bar.from))
  && (bar.to === null || (atEnd(value, bar.to) ? bar.toClosed : value < bar.to)));

/** Hard misses at one state, needing no expectation. */
function stateMisses(drawn, values, moving) {
  const misses = [];
  const at = describeValues(values);
  if (!drawn.implicit) {
    for (const point of drawn.points) {
      if (!onSomeCurve(drawn, point.x, point.y)) misses.push(`a point off every curve: ${point.label ? `"${point.label}" ` : ""}at (${round(point.x)}, ${round(point.y)}) when ${at}`);
    }
  }
  for (const part of [...drawn.points, ...drawn.guides, ...drawn.intervals]) {
    if (/\d/u.test(part.label) && !part.label.includes("{") && moving.has(part.id)) misses.push(`a number in a moving label: "${part.label}"`);
  }
  const functions = functionsOf(drawn);
  const xBars = drawn.intervals.filter((interval) => interval.axis === "x");
  const yBars = drawn.intervals.filter((interval) => interval.axis === "y");
  if ((xBars.length || yBars.length) && functions.length !== 1) {
    misses.push(`domain or range bars beside ${functions.length} functions: which function they describe is ambiguous`);
    return misses;
  }
  const [pieces] = functions;
  if (xBars.length) {
    for (const x of sampleXs(drawn)) {
      const defined = valueAt(pieces, x) !== undefined;  // x values are sampled at the bars' exact ends
      if (defined !== inBars(xBars, x)) {
        misses.push(defined ? `the function is defined at x = ${round(x)}, outside the domain bars, when ${at}` : `the function is undefined at x = ${round(x)}, inside the domain bars, when ${at}`);
        break;
      }
    }
  }
  if (yBars.length) {
    for (const x of sampleXs(drawn)) {
      const y = valueAt(pieces, x);
      if (y !== undefined && !inBars(yBars, y)) {
        misses.push(`the value ${round(y)} at x = ${round(x)} lies outside the range bars when ${at}`);
        break;
      }
    }
  }
  return misses;
}

/** The ids of parts whose position changes between states (a moving mark's label must carry no number). */
function movingParts(drawnStates) {
  const positions = new Map();
  for (const drawn of drawnStates) {
    for (const part of [...drawn.points, ...drawn.guides, ...drawn.intervals]) {
      const position = JSON.stringify([part.x, part.y, part.value, part.from, part.to].map((value) => (typeof value === "number" ? round(value) : value)));
      positions.set(part.id, (positions.get(part.id) ?? new Set()).add(position));
    }
  }
  return new Set([...positions].filter(([, seen]) => seen.size > 1).map(([id]) => id));
}

const sameEnd = (a, b) => (a === null || b === null ? a === b : close(a, b));
const describeBars = (bars) => bars.map((bar) => `${bar.from === null ? "(−∞" : `${bar.fromClosed ? "[" : "("}${round(bar.from)}`}, ${bar.to === null ? "+∞)" : `${round(bar.to)}${bar.toClosed ? "]" : ")"}`}`).join(" ∪ ") || "none";
const wantBars = (list) => list.map((want) => ({ from: want.from ?? null, to: want.to ?? null, fromClosed: Boolean(want.fromClosed), toClosed: Boolean(want.toClosed) }));
const barsMatch = (drawnBars, wanted) => drawnBars.length === wanted.length && wanted.every((want) => drawnBars.some((bar) =>
  sameEnd(bar.from, want.from) && sameEnd(bar.to, want.to)
  && (want.from === null || bar.fromClosed === want.fromClosed) && (want.to === null || bar.toClosed === want.toClosed)));

/** Expected-value misses: each expectation must be met by some state the lesson shows. */
function expectationMisses(expect, shown) {
  const misses = [];
  const some = (test) => shown.some((drawn) => !drawn.error && test(drawn));
  if (expect.curve && !some((drawn) => drawn.curves.some((curve) => expect.curve.every(([x, y]) => covers(curve, x) && close(curve.f(x), y))))) {
    misses.push(`wrong curve: no curve passes through ${expect.curve.map(([x, y]) => `(${x}, ${y})`).join(", ")}`);
  }
  // A marked point is a labelled point other than the slope triangle's two: reference point A at x = 0
  // is not the y-intercept mark (0018).
  for (const [x, y] of expect.points ?? []) {
    const marks = (drawn) => (drawn.points ?? []).filter((point) => !(drawn.secant ?? []).some((reference) => reference.id === point.id));
    if (!some((drawn) => marks(drawn).some((point) => point.label && close(point.x, x) && close(point.y, y)))) {
      const seen = [...new Set(shown.flatMap((drawn) => marks(drawn).map((point) => `(${round(point.x)}, ${round(point.y)})`)))].join(", ") || "none";
      misses.push(`missing mark: no labelled point at (${x}, ${y}) (marks: ${seen})`);
    }
  }
  for (const want of expect.guides ?? []) {
    if (!some((drawn) => drawn.guides.some((guide) => guide.kind === want.kind && close(guide.value, want.value)))) misses.push(`missing guide: no ${want.kind} at ${want.value}`);
  }
  if (expect.slope) {
    const { dx, dy } = expect.slope;
    if (!some((drawn) => drawn.secant && (() => {
      const [a, b] = drawn.secant;
      const run = b.x - a.x, rise = b.y - a.y;
      return close(Math.abs(run), Math.abs(dx)) && close(rise / run, dy / dx);
    })())) {
      const seen = shown.filter((drawn) => drawn.secant).map((drawn) => `Δx ${round(drawn.secant[1].x - drawn.secant[0].x)}, Δy ${round(drawn.secant[1].y - drawn.secant[0].y)}`);
      misses.push(`wrong slope triangle: expected Δx ${dx}, Δy ${dy} (drawn: ${[...new Set(seen)].join("; ") || "no triangle"})`);
    }
  }
  if (expect.pieces) {
    const matches = (drawn) => functionsOf(drawn).some((pieces) => pieces.length === expect.pieces.length && expect.pieces.every((want) => pieces.some((piece) =>
      sameEnd(typeof piece.from === "number" ? piece.from : null, want.from ?? null) && sameEnd(typeof piece.to === "number" ? piece.to : null, want.to ?? null)
      && (want.from === undefined || want.from === null || (piece.from_closed !== false) === Boolean(want.fromClosed))
      && (want.to === undefined || want.to === null || (piece.to_closed !== false) === Boolean(want.toClosed))
      && (want.through ?? []).every(([x, y]) => covers(piece, x) && close(piece.f(x), y)))));
    if (!some(matches)) {
      const drawnPieces = (shown.find((drawn) => !drawn.error)?.curves ?? []).map((piece) => `${typeof piece.from === "number" ? `${piece.from_closed === false ? "(" : "["}${piece.from}` : "(−∞"}, ${typeof piece.to === "number" ? `${piece.to}${piece.to_closed === false ? ")" : "]"}` : "+∞)"}: ${piece.expression}`);
      misses.push(`wrong pieces: expected ${describeBars(wantBars(expect.pieces))}, drawn ${drawnPieces.join("; ") || "none"}`);
    }
  }
  for (const [axis, key, name] of [["x", "domain", "domain"], ["y", "range", "range"]]) {
    if (!expect[key]) continue;
    const wanted = wantBars(expect[key]);
    if (!some((drawn) => barsMatch(drawn.intervals.filter((interval) => interval.axis === axis), wanted))) {
      const drawnBars = (shown.find((drawn) => !drawn.error)?.intervals ?? []).filter((interval) => interval.axis === axis);
      misses.push(`wrong ${name}: expected ${describeBars(wanted)}, drawn ${describeBars(drawnBars)}`);
    }
  }
  return misses;
}

/**
 * Judges a lesson's plots against one case (expectations set before any run). The case's expectations
 * are met by any one of the lesson's plots; the checks needing no expectation hold for every plot.
 * A near miss (a family 0018 leaves out) passes with no plot, and otherwise only needs those checks:
 * no worse than today, and nothing wrong drawn. Returns { hard, soft }, empty when it passes.
 */
export function judgePlot(item, lesson) {
  const hard = [], soft = [];
  const plots = plotLessonsIn(lesson);
  if (!plots.length) return item.nearMiss ? { hard, soft } : { hard: ["no plot"], soft };
  const judged = [];
  for (const plot of plots) {
    if (plot.error) { hard.push(`plot ${plot.as}: ${plot.error}`); continue; }
    const shown = shownValues(plot).map((values) => ({ values, drawn: drawnPlot(plot, values) }));
    const swept = sweepValues(plot).map((values) => ({ values, drawn: drawnPlot(plot, values) }));
    const all = [...shown, ...swept];
    const failed = all.find((state) => state.drawn.error);
    if (failed) hard.push(`plot ${plot.as} fails when ${describeValues(failed.values)}: ${failed.drawn.error}`);
    const moving = movingParts(all.filter((state) => !state.drawn.error).map((state) => state.drawn));
    const seen = new Set();
    for (const state of all) {
      if (state.drawn.error) continue;
      for (const miss of stateMisses(state.drawn, state.values, moving)) {
        const kind = miss.replace(/ when .*$/u, "").replace(/-?\d+(\.\d+)?/gu, "#");
        if (!seen.has(kind)) { seen.add(kind); hard.push(`plot ${plot.as}: ${miss}`); }
      }
    }
    judged.push({ plot, shown: shown.map((state) => state.drawn) });
  }
  const expect = item.expect ?? {};
  if (Object.keys(expect).length) {
    const perPlot = judged.map(({ shown }) => expectationMisses(expect, shown));
    if (!perPlot.some((misses) => !misses.length)) hard.push(...(perPlot.sort((a, b) => a.length - b.length)[0] ?? ["no plot to judge"]));
  }
  return { hard, soft };
}

// node scripts/plot-judge.mjs <cases.json> <run dir>: judges each case's saved lesson.json (written by
// eval-math-expressiveness.mjs --cases-file) and prints one JSON line per case. A case with no saved
// lesson is a hard miss unless it is a near miss.
if (process.argv[1] && new URL(import.meta.url).pathname === (await import("node:path")).resolve(process.argv[1])) {
  const { readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const [casesFile, runDirectory] = process.argv.slice(2);
  if (!casesFile || !runDirectory) throw new Error("Usage: node scripts/plot-judge.mjs <cases.json> <run dir>");
  for (const item of JSON.parse(readFileSync(casesFile, "utf8")).cases) {
    const file = join(runDirectory, item.id, "lesson.json");
    const verdict = existsSync(file) ? judgePlot(item, JSON.parse(readFileSync(file, "utf8")))
      : item.nearMiss ? { hard: [], soft: [] } : { hard: ["no lesson"], soft: [] };
    console.log(JSON.stringify({ id: item.id, pass: !verdict.hard.length, ...verdict }));
  }
}
