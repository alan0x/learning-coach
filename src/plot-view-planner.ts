import { compileMathExpression } from "octos-lesson-language";
import { parseModelFormula } from "./plugins/math-formulas.js";

/**
 * The teaching view planner chooses a function plot's published coordinate
 * window. It is deterministic and program-owned: model output contributes
 * only hints (explicit ranges), which are checked and repaired here.
 *
 * Order of concerns:
 * 1. Analyse each curve at every state the lesson shows (features: roots,
 *    extrema, intercept, poles, holes, domain edges, periods).
 * 2. Keep the teaching points and the most important cluster of features.
 * 3. Build the x window from them, with shape windows for quadratics and
 *    periods, and natural domains for quantity axes.
 * 4. Build the y window from each curve's own region of interest.
 * 5. Fold in slider extremes only when they cost little, check model hints,
 *    choose the scale mode, and snap to tick-friendly bounds.
 */

export interface NumericRange { min: number; max: number }
export interface ViewParameter { name: string; initial: number; min: number; max: number }
export interface ViewPoint { x: number; y: number }

export interface PlotViewInput {
  /** OLL expressions over `x` and the parameter names. */
  expressions: string[];
  parameters: ViewParameter[];
  /** Complete parameter states the lesson shows (animations, restarts). */
  demonstrations?: ReadonlyArray<Record<string, number>>;
  /** Marked points that must be visible (samples, references, endpoints). */
  teachingPoints?: ViewPoint[];
  /** Optional teaching points reachable only at slider extremes. */
  optionalPoints?: ViewPoint[];
  /** Model-written range hints; any bound may be missing. */
  requested?: { x?: Partial<NumericRange>; y?: Partial<NumericRange> };
  /** True when the x axis names a quantity (time, count, money, length). */
  quantityX?: boolean;
  /** True when both axes are the plain coordinates x and y. */
  plainAxes?: boolean;
}

export interface PlotViewAdjustment { reason: string; detail: string }

export interface PlotView {
  x: NumericRange;
  y: NumericRange;
  equalScale: boolean;
  /** Label the x axis in multiples of π. */
  piTicks: boolean;
  /** Removable discontinuities of each curve inside the window. */
  holes: ViewPoint[][];
  adjustments: PlotViewAdjustment[];
}

type Feature = {
  kind: "root" | "extremum" | "intercept" | "intersection" | "pole" | "hole" | "edge";
  x: number;
  /** Undefined for poles and for edges without a finite value. */
  y?: number;
};

const WEIGHT: Record<Feature["kind"], number> = { extremum: 3, root: 2, pole: 2, intersection: 2, hole: 1, intercept: 1, edge: 1 };
const SCAN_HALF_WIDTH = 60;
const SCAN_STEP = 0.05;
const FEATURE_RADIUS = 25;
const CLUSTER_GAP = 10;
const MIN_SPAN = 8;
const MAX_FEATURES = 9;
const FEATURE_Y_MARGIN = 0.5;
const EDGE_INSET = 0.08;
const EXTREME_ALLOWANCE = 1.5;
const EQUAL_ASPECT = { min: 0.5, max: 2 };

type Curve = (x: number) => number;

function finite(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) < 1e12;
}

function span(range: NumericRange): number {
  return range.max - range.min;
}

function hull(values: number[]): NumericRange | undefined {
  const list = values.filter(Number.isFinite);
  return list.length ? { min: Math.min(...list), max: Math.max(...list) } : undefined;
}

function union(a: NumericRange | undefined, b: NumericRange | undefined): NumericRange | undefined {
  if (!a) return b;
  if (!b) return a;
  return { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) };
}

function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  return ([1, 2, 2.5, 5, 10].find(value => normalized <= value + 1e-9) ?? 10) * power;
}

/** Expand to multiples of a fine readable step (about twenty intervals). */
function snap(range: NumericRange, unit = 1): NumericRange {
  const step = unit === 1 ? niceStep(span(range) / 20) : unit * Math.max(1, Math.round(span(range) / unit / 8));
  const round = (value: number) => Number(value.toPrecision(12));
  return { min: round(Math.floor(range.min / step + 1e-9) * step), max: round(Math.ceil(range.max / step - 1e-9) * step) };
}

function pad(range: NumericRange, fraction: number, keep?: { min?: boolean; max?: boolean }): NumericRange {
  const size = span(range) > 1e-9 ? span(range) : Math.max(1, Math.abs(range.min) * 0.2);
  // An inset of `fraction` of the final span needs fraction/(1-2·fraction) of the content span.
  const amount = size * fraction / (1 - 2 * fraction);
  return { min: keep?.min ? range.min : range.min - amount, max: keep?.max ? range.max : range.max + amount };
}

/** Read an affine trigonometric argument without guessing from samples. */
function affineArgument(argument: string, variables: Record<string, number>): { slope: number; offset: number } | undefined {
  const names = Object.keys(variables);
  const source = argument.replace(/\b[A-Za-z_]\w*\b/gu, name => {
    const index = names.indexOf(name);
    return index < 0 ? name : `n${index + 1}`;
  });
  const stack: Array<{ slope: number; offset: number }> = [];
  try {
    for (const token of parseModelFormula(source, names.length, "$viewport")) {
      if (token.kind === "input") stack.push({ slope: 1, offset: 0 });
      else if (token.kind === "literal") stack.push({ slope: 0, offset: token.value });
      else if (token.kind === "number") stack.push({ slope: 0, offset: variables[names[token.number - 1]!]! });
      else if (token.kind === "constant") stack.push({ slope: 0, offset: token.name === "pi" ? Math.PI : Math.E });
      else if (token.kind === "negate") {
        const operand = stack.pop()!;
        stack.push({ slope: -operand.slope, offset: -operand.offset });
      } else if (token.kind === "operator") {
        const right = stack.pop()!, left = stack.pop()!;
        if (token.operator === "add" || token.operator === "subtract") {
          const sign = token.operator === "add" ? 1 : -1;
          stack.push({ slope: left.slope + sign * right.slope, offset: left.offset + sign * right.offset });
        } else if (token.operator === "multiply" && !(left.slope && right.slope)) {
          stack.push({ slope: left.slope * right.offset + right.slope * left.offset, offset: left.offset * right.offset });
        } else if (token.operator === "divide" && right.slope === 0 && right.offset !== 0) {
          stack.push({ slope: left.slope / right.offset, offset: left.offset / right.offset });
        } else return;
      } else return;
    }
  } catch {
    return;
  }
  const result = stack[0];
  if (stack.length === 1 && result && Number.isFinite(result.offset) && Number.isFinite(result.slope) && Math.abs(result.slope) >= 1e-9) return result;
}

/** Periods of the affine sin/cos/tan calls in an expression; undefined if not periodic. */
function periodOf(expression: string, state: Record<string, number>): number | undefined {
  const calls = [...expression.matchAll(/\b(sin|cos|tan)\s*\(/gu)];
  if (!calls.length) return;
  const periods: number[] = [];
  let rest = "";
  let cursor = 0;
  for (const match of calls) {
    if (match.index < cursor) return;
    const start = match.index + match[0].length;
    let end = start, depth = 1;
    for (; end < expression.length; end += 1) {
      if (expression[end] === "(") depth += 1;
      if (expression[end] === ")" && --depth === 0) break;
    }
    const affine = affineArgument(expression.slice(start, end), state);
    if (!affine) return;
    periods.push((match[1] === "tan" ? Math.PI : 2 * Math.PI) / Math.abs(affine.slope));
    // Replace the call; what remains must not depend on x.
    rest += `${expression.slice(cursor, match.index)}1`;
    cursor = end + 1;
  }
  rest += expression.slice(cursor);
  if (/\bx\b/u.test(rest)) return;
  return Math.max(...periods);
}

/** Exact quadratic recognition, verified at extra points. */
function quadraticOf(curve: Curve): { vertex: number; value: number; a: number } | undefined {
  const y0 = curve(0), y1 = curve(1), ym = curve(-1);
  const a = (y1 + ym - 2 * y0) / 2, b = (y1 - ym) / 2;
  if (![a, b, y0].every(Number.isFinite) || Math.abs(a) < 1e-12) return;
  for (const x of [-2, 0.37, 2, 3, -5.5, 7]) {
    const expected = a * x * x + b * x + y0, actual = curve(x);
    if (!Number.isFinite(actual) || Math.abs(expected - actual) > 1e-8 * Math.max(1, Math.abs(expected))) return;
  }
  const vertex = -b / (2 * a);
  return { vertex, value: curve(vertex), a };
}

function linearSlopeOf(curve: Curve): number | undefined {
  const y0 = curve(0), y1 = curve(1);
  const slope = y1 - y0;
  if (![y0, y1].every(Number.isFinite)) return;
  for (const x of [-3, 2.5, 7]) {
    if (Math.abs(curve(x) - (y0 + slope * x)) > 1e-9 * Math.max(1, Math.abs(y0 + slope * x))) return;
  }
  return slope;
}

/** A curve whose points lie on one circle (for example sqrt(r²-(x-a)²)). */
function isCircularArc(curve: Curve, scan: NumericRange): boolean {
  const xs = Array.from({ length: 41 }, (_, index) => scan.min + span(scan) * index / 40)
    .filter(x => finite(curve(x)));
  if (xs.length < 6) return false;
  const points = xs.map(x => ({ x, y: curve(x) }));
  const [p, q, r] = [points[0]!, points[Math.floor(points.length / 2)]!, points.at(-1)!];
  const d = 2 * (p.x * (q.y - r.y) + q.x * (r.y - p.y) + r.x * (p.y - q.y));
  if (Math.abs(d) < 1e-9) return false;
  const s = (pt: ViewPoint) => pt.x * pt.x + pt.y * pt.y;
  const cx = (s(p) * (q.y - r.y) + s(q) * (r.y - p.y) + s(r) * (p.y - q.y)) / d;
  const cy = (s(p) * (r.x - q.x) + s(q) * (p.x - r.x) + s(r) * (q.x - p.x)) / d;
  const radius = Math.hypot(p.x - cx, p.y - cy);
  return radius <= 10 * span(scan) && points.every(pt => Math.abs(Math.hypot(pt.x - cx, pt.y - cy) - radius) < 1e-9 * Math.max(1, radius));
}

function bisect(f: (x: number) => boolean, inside: number, outside: number): number {
  let a = inside, b = outside;
  for (let index = 0; index < 50; index += 1) {
    const mid = (a + b) / 2;
    if (f(mid)) a = mid; else b = mid;
  }
  return (a + b) / 2;
}

/** Locate the features of one curve state on the scan window. */
function analyse(curve: Curve, scan: NumericRange): Feature[] {
  const count = Math.round(span(scan) / SCAN_STEP);
  const xs = Array.from({ length: count + 1 }, (_, index) => scan.min + span(scan) * index / count);
  const ys = xs.map(curve);
  const features: Feature[] = [];
  const magnitudes = ys.filter(finite).map(Math.abs).sort((a, b) => a - b);
  const typical = Math.max(1, magnitudes[Math.floor(magnitudes.length / 2)] ?? 1);
  const known = (x: number) => features.some(feature => Math.abs(feature.x - x) < SCAN_STEP);

  const poleAt = (x0: number): boolean => {
    let previous = 0;
    let growing = 0;
    for (const step of [1e-2, 1e-3, 1e-4, 1e-5]) {
      const value = Math.max(Math.abs(curve(x0 - step)) || 0, Math.abs(curve(x0 + step)) || 0);
      if (!Number.isFinite(value)) return true;
      if (value > previous * 1.5) growing += 1;
      previous = value;
    }
    return growing >= 3 && previous > 1e3 * typical;
  };
  const holeAt = (x0: number): ViewPoint | undefined => {
    if (finite(curve(x0))) return;
    const left = curve(x0 - 1e-7), right = curve(x0 + 1e-7);
    if (finite(left) && finite(right) && Math.abs(left - right) < 1e-4 * Math.max(1, Math.abs(left))) return { x: x0, y: (left + right) / 2 };
  };

  // Poles and holes at simple values, where a uniform grid can step over them.
  for (let x = Math.ceil(scan.min * 2) / 2; x <= scan.max; x += 0.5) {
    const at = Number(x.toFixed(6));
    const hole = holeAt(at);
    if (hole) features.push({ kind: "hole", ...hole });
    else if (!finite(curve(at)) && finite(curve(at - 0.01)) && finite(curve(at + 0.01)) && poleAt(at)) features.push({ kind: "pole", x: at });
  }

  for (let index = 1; index < xs.length; index += 1) {
    const [x0, x1, y0, y1] = [xs[index - 1]!, xs[index]!, ys[index - 1]!, ys[index]!];
    // Domain edges: a long defined stretch meets a long undefined stretch.
    if (finite(y0) !== finite(y1)) {
      const before = ys.slice(Math.max(0, index - 4), index), after = ys.slice(index, index + 4);
      if (before.every(v => finite(v) === finite(y0)) && after.every(v => finite(v) === finite(y1))) {
        const inside = finite(y0) ? x0 : x1, outside = finite(y0) ? x1 : x0;
        const edge = bisect(x => finite(curve(x)), inside, outside);
        if (!known(edge)) {
          const direction = inside > outside ? 1 : -1;
          const near = curve(edge + direction * 1e-9), farther = curve(edge + direction * 1e-6);
          // An edge value counts only when the curve approaches it boundedly (sqrt at 0, not ln at 0).
          const bounded = finite(near) && finite(farther) && Math.abs(near - farther) <= 0.05 * Math.max(1, Math.abs(farther));
          features.push({ kind: "edge", x: edge, ...(bounded ? { y: near } : {}) });
        }
      }
      continue;
    }
    if (!finite(y0) || !finite(y1)) continue;
    // Roots: a sign change that converges to zero (otherwise a pole crossing).
    if (y0 === 0) {
      if (!known(x0)) features.push({ kind: "root", x: x0, y: 0 });
    } else if (Math.sign(y0) * Math.sign(y1) < 0) {
      let a = x0, b = x1, fa = y0;
      for (let step = 0; step < 60; step += 1) {
        const mid = (a + b) / 2, fm = curve(mid);
        if (!Number.isFinite(fm)) break;
        if (Math.sign(fm) === Math.sign(fa)) { a = mid; fa = fm; } else b = mid;
      }
      const root = (a + b) / 2;
      if (!known(root)) {
        if (Math.abs(curve(root)) < 1e-6 * typical) features.push({ kind: "root", x: root, y: 0 });
        else if (poleAt(root)) features.push({ kind: "pole", x: root });
      }
    }
    // Extrema: the slope changes sign; refine with a golden-section search.
    if (index >= 2) {
      const yPrev = ys[index - 2]!;
      if (finite(yPrev) && (y0 - yPrev) * (y1 - y0) < 0) {
        const maximum = y0 > yPrev;
        let a = xs[index - 2]!, b = x1;
        const ratio = (Math.sqrt(5) - 1) / 2;
        for (let step = 0; step < 60; step += 1) {
          const c = b - ratio * (b - a), d = a + ratio * (b - a);
          if (maximum ? curve(c) > curve(d) : curve(c) < curve(d)) b = d; else a = c;
        }
        const x = (a + b) / 2, y = curve(x);
        if (!known(x)) {
          if (finite(y) && !poleAt(x)) features.push({ kind: "extremum", x, y });
          else features.push({ kind: "pole", x });
        }
      }
    }
  }
  const intercept = curve(0);
  if (finite(intercept) && scan.min <= 0 && scan.max >= 0 && !features.some(f => f.kind === "hole" && f.x === 0)) {
    features.push({ kind: "intercept", x: 0, y: intercept });
  }
  return features;
}

/** Points where two curves cross. */
function intersections(curves: Curve[], scan: NumericRange): Feature[] {
  const found: Feature[] = [];
  for (let i = 0; i < curves.length; i += 1) {
    for (let j = i + 1; j < curves.length; j += 1) {
      const difference = (x: number) => curves[i]!(x) - curves[j]!(x);
      const count = Math.round(span(scan) / SCAN_STEP);
      let previous = difference(scan.min);
      for (let index = 1; index <= count; index += 1) {
        const x = scan.min + span(scan) * index / count;
        const current = difference(x);
        if (finite(previous) && finite(current) && Math.sign(previous) * Math.sign(current) < 0) {
          let a = x - span(scan) / count, b = x, fa = previous;
          for (let step = 0; step < 60; step += 1) {
            const mid = (a + b) / 2, fm = difference(mid);
            if (Math.sign(fm) === Math.sign(fa)) { a = mid; fa = fm; } else b = mid;
          }
          const at = (a + b) / 2, y = curves[i]!(at);
          if (finite(y) && Math.abs(difference(at)) < 1e-6 * Math.max(1, Math.abs(y))) found.push({ kind: "intersection", x: at, y });
        }
        previous = current;
      }
    }
  }
  return found;
}

/** Keep the most important cluster of features (or the one holding the teaching points). */
function selectCluster(features: Feature[], anchors: number[]): { kept: Feature[]; dropped: Feature[] } {
  if (!features.length) return { kept: [], dropped: [] };
  const sorted = [...features].sort((a, b) => a.x - b.x);
  const clusters: Feature[][] = [[sorted[0]!]];
  for (const feature of sorted.slice(1)) {
    const current = clusters.at(-1)!;
    if (feature.x - current.at(-1)!.x > CLUSTER_GAP) clusters.push([feature]);
    else current.push(feature);
  }
  const score = (cluster: Feature[]) => {
    const anchored = anchors.some(x => x >= cluster[0]!.x - CLUSTER_GAP && x <= cluster.at(-1)!.x + CLUSTER_GAP);
    return (anchored ? 1000 : 0) + cluster.reduce((sum, feature) => sum + WEIGHT[feature.kind], 0)
      - Math.min(...cluster.map(feature => Math.abs(feature.x))) * 1e-3;
  };
  const best = clusters.reduce((a, b) => (score(b) > score(a) ? b : a));
  return { kept: best, dropped: clusters.filter(cluster => cluster !== best).flat() };
}

interface CurveState {
  index: number;
  state: Record<string, number>;
  curve: Curve;
  features: Feature[];
  quadratic?: { vertex: number; value: number; a: number };
  period?: number;
}

export function planPlotView(input: PlotViewInput): PlotView {
  const names = input.parameters.map(parameter => parameter.name);
  const compiled = input.expressions.map(expression => compileMathExpression(expression, ["x", ...names]));
  const initial = Object.fromEntries(input.parameters.map(parameter => [parameter.name, parameter.initial]));
  const adjustments: PlotViewAdjustment[] = [];
  const teaching = input.teachingPoints ?? [];
  const quantityX = input.quantityX === true;
  const plain = input.plainAxes !== false;
  const curveAt = (index: number, state: Record<string, number>): Curve => x => {
    try { return compiled[index]!({ ...state, x }); } catch { return Number.NaN; }
  };
  // Quantity axes start at zero when the curves are defined just right of it,
  // no marked point lies left of it and the model did not ask for negative values.
  const naturalStart = quantityX
    && compiled.every((_, index) => finite(curveAt(index, initial)(1e-9)))
    && teaching.every(point => point.x >= 0)
    && !(input.requested?.x?.min !== undefined && input.requested.x.min < 0);
  const scan: NumericRange = naturalStart ? { min: 0, max: 2 * SCAN_HALF_WIDTH } : { min: -SCAN_HALF_WIDTH, max: SCAN_HALF_WIDTH };
  const focus = teaching.length ? teaching.reduce((sum, point) => sum + point.x, 0) / teaching.length : naturalStart ? 0 : 0;

  const describe = (state: Record<string, number>): CurveState[] => {
    const items = compiled.map((_, index) => {
      const curve = curveAt(index, state);
      const period = periodOf(input.expressions[index]!, state);
      let features = analyse(curve, scan);
      const radius = period !== undefined ? Math.min(FEATURE_RADIUS, period) : FEATURE_RADIUS;
      features = features.filter(feature => Math.abs(feature.x - focus) <= radius + 1e-9
        || teaching.some(point => Math.abs(point.x - feature.x) <= CLUSTER_GAP));
      // Oscillating curves (sin(x)/x) keep the features nearest the focus.
      if (features.length > MAX_FEATURES) {
        features = [...features].sort((a, b) => Math.abs(a.x - focus) - Math.abs(b.x - focus)).slice(0, MAX_FEATURES);
      }
      return { index, state, curve, features, quadratic: quadraticOf(curve), period };
    });
    if (items.length > 1) {
      const statePeriods = items.map(item => item.period);
      const radius = statePeriods.every(period => period !== undefined)
        ? Math.min(FEATURE_RADIUS, Math.max(...statePeriods as number[])) : FEATURE_RADIUS;
      const crossings = intersections(items.map(item => item.curve), scan)
        .filter(feature => Math.abs(feature.x - focus) <= radius + 1e-9);
      items[0]!.features.push(...crossings);
    }
    return items;
  };

  const shownStates = [initial, ...(input.demonstrations ?? [])];
  const base = shownStates.flatMap(describe);
  const { kept, dropped } = selectCluster(base.flatMap(item => item.features), teaching.map(point => point.x));
  if (dropped.length) {
    adjustments.push({ reason: "distant_features_left_out", detail: [...new Set(dropped.map(feature => `${feature.kind}@${Number(feature.x.toFixed(3))}`))].slice(0, 6).join(",") });
  }
  const keptRange = hull(kept.map(feature => feature.x));
  const inCluster = (feature: Feature) => !keptRange || (feature.x >= keptRange.min - CLUSTER_GAP && feature.x <= keptRange.max + CLUSTER_GAP);
  const keptSet = new Set(kept);

  const periods = base.map(item => item.period).filter((value): value is number => value !== undefined);
  const allPeriodic = periods.length === base.length && periods.length > 0;
  const allQuadratic = base.every(item => item.quadratic);

  const quadraticHalfWidth = (a: number) => Math.min(6, Math.max(1, Math.sqrt(9 / Math.abs(a))));
  const regionOf = (item: CurveState, features: Feature[]): NumericRange | undefined => {
    // An intercept matters on its own (a start value), not beside other features.
    const structural = features.filter(feature => feature.kind !== "intercept");
    let region = hull((structural.length ? structural : features).map(feature => feature.x));
    if (item.quadratic) {
      const halfWidth = quadraticHalfWidth(item.quadratic.a);
      region = union(region, { min: item.quadratic.vertex - halfWidth, max: item.quadratic.vertex + halfWidth });
    }
    return region;
  };

  // Quantity curves with a single feature (usually the start value) extend
  // until the value has changed by twice its starting size.
  const growthEnd = (items: CurveState[]): number => {
    const candidates = [1, 2, 2.5, 3, 4, 5, 6, 8].flatMap(m => [1, 10, 100, 1000].map(p => m * p)).sort((a, b) => a - b);
    for (const end of candidates) {
      if (items.every(item => {
        const start = item.curve(0), value = item.curve(end);
        if (!finite(start) || !finite(value)) return false;
        return Math.abs(start) > 1e-9 ? Math.abs(value - start) >= 2 * Math.abs(start) : end >= MIN_SPAN;
      })) return end;
    }
    return MIN_SPAN;
  };

  // A domain edge with every curve undefined beyond it bounds the window.
  const undefinedBeyond = (items: CurveState[], edge: number, direction: -1 | 1) =>
    items.every(item => [0.01, 0.1, 1].every(step => !finite(item.curve(edge + direction * step))));

  const xWindow = (items: CurveState[], features: (feature: Feature) => boolean): NumericRange => {
    const selected = items.map(item => item.features.filter(features));
    let range = hull([
      ...items.flatMap((item, index) => {
        const region = regionOf(item, selected[index]!);
        return region ? [region.min, region.max] : [];
      }),
      ...teaching.map(point => point.x),
    ]);
    const featureCount = new Set(selected.flat().map(feature => feature.x.toFixed(3))).size;
    if (allPeriodic) {
      const period = Math.min(1e6, Math.max(...periods));
      if (naturalStart) return { min: 0, max: Math.max(range?.max ?? 0, period) };
      return union(range, { min: focus - period, max: focus + period })!;
    }
    if (naturalStart && featureCount <= 1) return union(range, { min: 0, max: growthEnd(items) })!;
    if (allQuadratic) return range!;
    if (range && featureCount >= 2) range = { min: range.min - span(range) * 0.25, max: range.max + span(range) * 0.25 };
    const edges = selected.flat().filter(feature => feature.kind === "edge");
    const leftEdge = edges.filter(edge => undefinedBeyond(items, edge.x, -1)).map(edge => edge.x);
    const rightEdge = edges.filter(edge => undefinedBeyond(items, edge.x, 1)).map(edge => edge.x);
    const lower = leftEdge.length ? Math.max(...leftEdge) : -Infinity;
    const upper = rightEdge.length ? Math.min(...rightEdge) : Infinity;
    // Curves with two or more turning points are framed by them; others get a minimum span.
    const turning = new Set(selected.flat().filter(feature => feature.kind === "extremum").map(feature => feature.x.toFixed(3))).size >= 2;
    const short = !range || (!turning && span(range) < MIN_SPAN);
    const wanted = short ? MIN_SPAN : span(range!);
    if (short) {
      const middle = range ? (range.min + range.max) / 2 : focus;
      const center = Math.abs(middle) < MIN_SPAN / 4 ? 0 : middle;
      range = union(range, { min: center - MIN_SPAN / 2, max: center + MIN_SPAN / 2 })!;
    }
    // Do not widen into undefined territory; give the room to the defined side.
    if (range.min < lower) range = { min: lower, max: Math.min(upper, Math.max(range.max, lower + wanted)) };
    if (range.max > upper) range = { min: Math.max(lower, Math.min(range.min, upper - wanted)), max: upper };
    return range;
  };

  const yExtent = (items: CurveState[], window: NumericRange): NumericRange | undefined => {
    const values: number[] = [];
    const guard = span(window) * 0.04;
    const avoid = items.flatMap(item => item.features.filter(feature => feature.kind === "pole" || (feature.kind === "edge" && feature.y === undefined)).map(feature => feature.x));
    const sampled = (item: CurveState, range: NumericRange) => {
      for (let i = 0; i <= 400; i += 1) {
        const t = range.min + span(range) * i / 400;
        if (avoid.some(x => Math.abs(t - x) < guard)) continue;
        const value = item.curve(t);
        if (finite(value)) values.push(value);
      }
    };
    for (const item of items) {
      const features = item.features.filter(feature => keptSet.has(feature) || inCluster(feature))
        .filter(feature => feature.x >= window.min && feature.x <= window.max);
      if (item.quadratic) {
        const halfWidth = quadraticHalfWidth(item.quadratic.a);
        const own = { min: Math.max(window.min, item.quadratic.vertex - halfWidth), max: Math.min(window.max, item.quadratic.vertex + halfWidth) };
        sampled(item, span(own) > 0 ? own : window);
      } else if (item.period === undefined && features.some(feature => feature.kind === "extremum")
        && !(undefinedBeyond([item], window.min, -1) && undefinedBeyond([item], window.max, 1))) {
        // Turning curves: frame the features and let the steep arms leave the frame.
        const levels = hull(features.filter(feature => feature.y !== undefined && feature.kind !== "intercept").map(feature => feature.y!));
        if (levels && span(levels) > 1e-9) {
          values.push(levels.min - FEATURE_Y_MARGIN * span(levels), levels.max + FEATURE_Y_MARGIN * span(levels));
        } else sampled(item, window);
      } else sampled(item, window);
      for (const feature of features) if (feature.y !== undefined) values.push(feature.y);
    }
    values.push(...teaching.filter(point => point.x >= window.min && point.x <= window.max).map(point => point.y));
    return hull(values);
  };

  let x = xWindow(base, feature => keptSet.has(feature));
  let yContent = yExtent(base, x);

  // Both ends of a slider join together, or neither does, so the frame stays balanced.
  const baseX = x, baseY = yContent;
  for (const parameter of input.parameters) {
    let candidateX: NumericRange | undefined = x;
    let candidateY = yContent;
    for (const value of [parameter.min, parameter.max]) {
      if (value === parameter.initial) continue;
      const items = describe({ ...initial, [parameter.name]: value });
      candidateX = union(candidateX, xWindow(items, inCluster));
      candidateY = union(candidateY, yExtent(items, candidateX!));
    }
    if (!candidateX || !candidateY || !baseY) continue;
    if (span(candidateX) <= EXTREME_ALLOWANCE * span(baseX) && span(candidateY) <= EXTREME_ALLOWANCE * Math.max(span(baseY), 1e-9)) {
      x = candidateX;
      yContent = candidateY;
    }
  }
  for (const point of input.optionalPoints ?? []) {
    const candidateX = union(x, { min: point.x, max: point.x })!;
    const candidateY = union(yContent, { min: point.y, max: point.y });
    if (candidateY && baseY && span(candidateX) <= EXTREME_ALLOWANCE * span(baseX) && span(candidateY) <= EXTREME_ALLOWANCE * Math.max(span(baseY), 1e-9)) {
      x = candidateX;
      yContent = candidateY;
    }
  }

  // Model hints: accepted when they keep what must be visible and the curve fills the frame.
  const requestedX = input.requested?.x;
  let acceptedX = false;
  if (requestedX && (requestedX.min !== undefined || requestedX.max !== undefined)) {
    const proposal = { min: requestedX.min ?? x.min, max: requestedX.max ?? x.max };
    const curveFinite = proposal.max > proposal.min && base.some(item =>
      Array.from({ length: 41 }, (_, i) => item.curve(proposal.min + span(proposal) * i / 40)).filter(finite).length >= 10);
    const keepsTeaching = teaching.every(point => point.x >= proposal.min && point.x <= proposal.max);
    const tooWide = span(proposal) > 4 * Math.max(span(x), MIN_SPAN);
    if (curveFinite && keepsTeaching && !tooWide) {
      x = proposal;
      acceptedX = true;
      yContent = yExtent(base, x) ?? yContent;
    } else {
      adjustments.push({ reason: "model_x_range_replaced", detail: `requested=[${requestedX.min ?? ""},${requestedX.max ?? ""}] used=[${Number(x.min.toPrecision(4))},${Number(x.max.toPrecision(4))}]` });
    }
  }
  let y = yContent ?? { min: -1, max: 1 };
  const requestedY = input.requested?.y;
  let acceptedY = false;
  if (requestedY && (requestedY.min !== undefined || requestedY.max !== undefined)) {
    const proposal = { min: requestedY.min ?? y.min, max: requestedY.max ?? y.max };
    const mustY = hull([
      ...kept.filter(feature => feature.y !== undefined && feature.x >= x.min && feature.x <= x.max && feature.kind !== "intercept").map(feature => feature.y!),
      ...teaching.map(point => point.y),
    ]);
    const samples = base.flatMap(item => Array.from({ length: 81 }, (_, i) => item.curve(x.min + span(x) * i / 80))).filter(finite);
    const inside = samples.filter(value => value >= proposal.min && value <= proposal.max).length;
    const keeps = !mustY || (mustY.min >= proposal.min && mustY.max <= proposal.max);
    if (proposal.max > proposal.min && keeps && inside >= samples.length * 0.3) {
      y = proposal;
      acceptedY = true;
    } else {
      adjustments.push({ reason: "model_y_range_replaced", detail: `requested=[${requestedY.min ?? ""},${requestedY.max ?? ""}] used=[${Number(y.min.toPrecision(4))},${Number(y.max.toPrecision(4))}]` });
    }
  }

  // Inverse-function comparisons share one square window around y = x.
  const identity = input.expressions.length > 1 && input.expressions.some(expression => expression.replace(/[()\s]/gu, "") === "x");
  if (identity && !acceptedY) y = { ...x };

  // Show the axes when they are close to the content.
  const nearZero = (range: NumericRange): NumericRange => {
    if (range.min > 0 && range.min <= span(range) * 0.5) return { ...range, min: 0 };
    if (range.max < 0 && -range.max <= span(range) * 0.5) return { ...range, max: 0 };
    return range;
  };
  if (!acceptedX) x = nearZero(x);
  if (!acceptedY && !identity) y = nearZero(y);

  const periodicWindow = allPeriodic && !acceptedX;
  const piTicks = !quantityX && plain && allPeriodic && span(x) >= Math.PI
    && periods.every(period => period / Math.PI >= 0.5 && period / Math.PI <= 8
      && Math.abs(period / Math.PI * 4 - Math.round(period / Math.PI * 4)) < 1e-9);
  const keepXMin = (naturalStart && x.min === 0) || periodicWindow;
  const keepXMax = periodicWindow;
  let finalX = x;
  if (!acceptedX) {
    finalX = snap(pad(x, EDGE_INSET, { min: keepXMin, max: keepXMax }), piTicks ? Math.PI / 2 : 1);
    if (keepXMin) finalX.min = x.min;
    if (keepXMax) finalX.max = x.max;
  }
  const keepYMin = quantityX && y.min === 0;
  let finalY = y;
  if (!acceptedY) {
    finalY = identity ? { ...finalX } : snap(pad(y, EDGE_INSET, { min: keepYMin }));
    if (keepYMin) finalY.min = 0;
  }

  // Scale mode: equal units where the geometry is the content.
  const initialItems = base.filter(item => item.state === initial);
  const circular = initialItems.some(item => isCircularArc(item.curve, finalX));
  const slopes = initialItems.map(item => linearSlopeOf(item.curve));
  const perpendicular = slopes.some((m, i) => m !== undefined && slopes.some((n, j) => j > i && n !== undefined && Math.abs(m * n + 1) < 1e-9));
  const aspect = span(finalY) / span(finalX);
  const equalScale = plain && (identity || circular || perpendicular
    || (allQuadratic && aspect >= EQUAL_ASPECT.min && aspect <= EQUAL_ASPECT.max));

  const holes = compiled.map((_, index) => initialItems
    .filter(item => item.index === index)
    .flatMap(item => item.features.filter(feature => feature.kind === "hole" && feature.x > finalX.min && feature.x < finalX.max
      && feature.y !== undefined && feature.y > finalY.min && feature.y < finalY.max))
    .map(feature => ({ x: feature.x, y: feature.y! })));

  return { x: finalX, y: finalY, equalScale, piTicks, holes, adjustments };
}
