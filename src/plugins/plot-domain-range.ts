// Domain and range bars on a function plot (OLL decision 0018 §3): intervals on the axes, from exact
// formulas only. Sampling cannot tell "reaches 0" from "comes close to 0", and drawing an end it never
// reaches as filled is exactly what misleads, so the program writes intervals only for the families below
// and refuses the rest in the section (0018 question 2):
//
// | family                 | domain          | range                                   |
// | line mx + c            | all             | all; m = 0: only c                      |
// | quadratic              | all             | a > 0: [vertex y, ∞); a < 0: (−∞, vertex y] |
// | a√(px + q) + k         | px + q ≥ 0      | a > 0: [k, ∞); a < 0: (−∞, k]           |
// | a/(px + q) + k         | x ≠ −q/p        | y ≠ k                                   |
// | a·b^(px + q) + k, exp  | all             | a > 0: (k, ∞); a < 0: (−∞, k)           |
// | a·log(px + q) + k      | px + q > 0      | all                                     |
// | pieces                 | the pieces' intervals | lines and constants only          |
//
// Ends that read lesson numbers are bound to them. Where a sign decides the side (a in a·√…), two bars
// are written, each with an end defined only for one sign ("k + 0·log(a)"), so the player shows the
// right one and hides both at a = 0 (0018 §6: drawing less there, never drawing wrong). A sign that
// decides the domain's side (p in √(px + q)) must be a constant. A range that collapses to one value at
// a slider stop (m = 0 in mx + c, a = 0 in a·log…) is refused: an unbounded bar cannot be hidden.
import { LessonPlanError, type LessonPlanMathExpression } from "../lesson-plan.js";
import { polynomialOf } from "./plot-marks.js";

export interface AxisBar {
  axis: "x" | "y";
  /** An expression in the lesson numbers, or null for an unbounded side. */
  from: string | null;
  to: string | null;
  from_closed: boolean;
  to_closed: boolean;
}

interface Node { start: number; end: number; token: LessonPlanMathExpression[number]; args: Node[] }

/** The formula's tree, each node keeping its span of tokens (a subtree is contiguous in postfix). */
function treeOf(tokens: LessonPlanMathExpression): Node | undefined {
  const stack: Node[] = [];
  tokens.forEach((token, index) => {
    const arity = token.kind === "negate" || token.kind === "function" ? 1 : token.kind === "operator" ? 2 : 0;
    const args = stack.splice(stack.length - arity, arity);
    stack.push({ start: arity ? args[0]!.start : index, end: index + 1, token, args });
  });
  return stack.length === 1 ? stack[0] : undefined;
}

type Scalar = { text: string; value?: number };
/** A subtree as a polynomial in x (lowest power first), undefined when it is not one. */
const polyOf = (tokens: LessonPlanMathExpression, node: Node) => polynomialOf(tokens.slice(node.start, node.end)) as Scalar[] | undefined;
const degreeOf = (p: Scalar[]) => p.reduce((highest, scalar, power) => (scalar.value === 0 ? highest : power), 0);
const at = (p: Scalar[], power: number): Scalar => p[power] ?? { text: "0", value: 0 };
const wrap = (text: string) => (/^[A-Za-z_][A-Za-z0-9_]*$|^\d+(\.\d+)?$/u.test(text) ? text : `(${text})`);

interface Shape { family: "sqrt" | "reciprocal" | "exponential" | "log"; a: string; k: string; p: Scalar; q: Scalar; base?: Scalar }

/** Recognizes a·core(px + q) + k; undefined when the formula is not one of the families. */
function shapeOf(tokens: LessonPlanMathExpression, root: Node): Shape | undefined {
  // Split the top-level sum into terms with signs; the terms free of x make k.
  const terms: Array<{ node: Node; sign: 1 | -1 }> = [];
  const split = (node: Node, sign: 1 | -1) => {
    if (node.token.kind === "operator" && (node.token.operator === "add" || node.token.operator === "subtract")) {
      split(node.args[0]!, sign);
      split(node.args[1]!, node.token.operator === "add" ? sign : (-sign as 1 | -1));
    } else if (node.token.kind === "negate") split(node.args[0]!, (-sign as 1 | -1));
    else terms.push({ node, sign });
  };
  split(root, 1);
  const constantTerm = (node: Node) => { const p = polyOf(tokens, node); return p && degreeOf(p) === 0 ? at(p, 0).text : undefined; };
  const kParts: string[] = [];
  const cores = terms.filter(({ node, sign }) => {
    const text = constantTerm(node);
    if (text === undefined) return true;
    kParts.push(sign === 1 ? wrap(text) : `-${wrap(text)}`);
    return false;
  });
  if (cores.length !== 1) return undefined;
  const k = kParts.length ? kParts.join("+").replace(/\+-/gu, "-") : "0";
  // Peel scalar factors off the one term: a·core, core·a, core/a, −core; a/(px + q) is the reciprocal.
  let node = cores[0]!.node;
  const factors: string[] = cores[0]!.sign === -1 ? ["-1"] : [];
  for (;;) {
    const token = node.token;
    if (token.kind === "negate") { factors.push("-1"); node = node.args[0]!; continue; }
    if (token.kind === "operator" && token.operator === "multiply") {
      const [left, right] = node.args as [Node, Node];
      const l = constantTerm(left), r = constantTerm(right);
      if (l !== undefined) { factors.push(wrap(l)); node = right; continue; }
      if (r !== undefined) { factors.push(wrap(r)); node = left; continue; }
      return undefined;
    }
    if (token.kind === "operator" && token.operator === "divide") {
      const [top, bottom] = node.args as [Node, Node];
      const b = constantTerm(bottom), t = constantTerm(top);
      if (b !== undefined) { factors.push(`1/${wrap(b)}`); node = top; continue; }
      const inner = polyOf(tokens, bottom);
      if (t !== undefined && inner && degreeOf(inner) === 1) {
        factors.push(wrap(t));
        return { family: "reciprocal", a: factors.join("*"), k, p: at(inner, 1), q: at(inner, 0) };
      }
      return undefined;
    }
    break;
  }
  const a = factors.length ? factors.join("*") : "1";
  const linearArg = (arg: Node) => { const p = polyOf(tokens, arg); return p && degreeOf(p) === 1 ? p : undefined; };
  const token = node.token;
  if (token.kind === "function") {
    const inner = linearArg(node.args[0]!);
    if (!inner) return undefined;
    const family = token.name === "sqrt" ? "sqrt" : token.name === "exp" ? "exponential" : /^(ln|log|log10|log2|lg)$/u.test(token.name) ? "log" : undefined;
    return family ? { family, a, k, p: at(inner, 1), q: at(inner, 0) } : undefined;
  }
  if (token.kind === "operator" && token.operator === "power") {
    const base = polyOf(tokens, node.args[0]!), exponent = linearArg(node.args[1]!);
    if (!base || degreeOf(base) !== 0 || !exponent) return undefined;
    return { family: "exponential", a, k, p: at(exponent, 1), q: at(exponent, 0), base: at(base, 0) };
  }
  return undefined;
}

export interface SignCheck {
  /** The values of an expression in the lesson numbers at every state the lesson and its sliders reach. */
  values: (text: string) => number[];
}

/**
 * The bars for `domain` and/or `range` of one formula, or a section-owned fault naming what it cannot give.
 */
export function formulaBars(tokens: LessonPlanMathExpression, want: { domain: boolean; range: boolean }, check: SignCheck, path: string): AxisBar[] {
  const refuse = (what: string, why: string): never => {
    throw new LessonPlanError("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.marks`, `the ${what} mark ${why}; leave it out of marks and do not narrate it`);
  };
  const first = want.domain ? "domain" : "range";
  const root = treeOf(tokens);
  if (!root) return refuse(first, "could not be derived");
  const all = (axis: "x" | "y"): AxisBar => ({ axis, from: null, to: null, from_closed: false, to_closed: false });
  const signs = (text: string) => {
    const values = check.values(text);
    return { positive: values.every((value) => value > 0), negative: values.every((value) => value < 0), zero: values.some((value) => value === 0 || !Number.isFinite(value)) };
  };
  // Both sides of a sign: one bar for each, its end defined only for that sign; one bar when it never changes.
  const bySign = (sign: string, end: string, up: { from_closed: boolean }, axis: "x" | "y"): AxisBar[] => {
    const s = signs(sign);
    const upBar = (guarded: string): AxisBar => ({ axis, from: guarded, to: null, from_closed: up.from_closed, to_closed: false });
    const downBar = (guarded: string): AxisBar => ({ axis, from: null, to: guarded, from_closed: false, to_closed: up.from_closed });
    if (s.positive) return [upBar(end)];
    if (s.negative) return [downBar(end)];
    return [upBar(`${wrap(end)}+0*log(${wrap(sign)})`), downBar(`${wrap(end)}+0*log(-${wrap(sign)})`)];
  };
  const bars: AxisBar[] = [];
  const polynomial = polynomialOf(tokens) as Scalar[] | undefined;
  if (polynomial) {
    const [c, b, a] = [0, 1, 2].map((power) => at(polynomial, power));
    if (want.domain) bars.push(all("x"));
    if (want.range) {
      if (a!.value === 0) {
        if (b!.value === 0) bars.push({ axis: "y", from: c!.text, to: c!.text, from_closed: true, to_closed: true });
        else if (signs(b!.text).zero || (!signs(b!.text).positive && !signs(b!.text).negative)) refuse("range", "collapses to one value where the slope is 0");
        else bars.push(all("y"));
      } else {
        const vertexY = `${wrap(c!.text)}-${wrap(b!.text)}^2/(4*${wrap(a!.text)})`;
        bars.push(...bySign(a!.text, vertexY, { from_closed: true }, "y"));
      }
    }
    return bars;
  }
  const shape = shapeOf(tokens, root);
  if (!shape) return refuse(first, "is derived only for lines, quadratics, roots, reciprocals, exponentials and logarithms");
  const pSign = shape.p.value;
  const edge = `-${wrap(shape.q.text)}/${wrap(shape.p.text)}`;
  if (want.domain) {
    if (shape.family === "exponential") bars.push(all("x"));
    else if (shape.family === "reciprocal") {
      bars.push({ axis: "x", from: null, to: edge, from_closed: false, to_closed: false }, { axis: "x", from: edge, to: null, from_closed: false, to_closed: false });
    } else {
      if (pSign === undefined) refuse("domain", "needs x with a fixed coefficient inside the root or logarithm");
      const closed = shape.family === "sqrt";
      bars.push(pSign! > 0 ? { axis: "x", from: edge, to: null, from_closed: closed, to_closed: false } : { axis: "x", from: null, to: edge, from_closed: false, to_closed: closed });
    }
  }
  if (want.range) {
    if (shape.family === "log") {
      const s = signs(shape.a);
      if (!s.positive && !s.negative) refuse("range", "collapses to one value where the coefficient is 0");
      bars.push(all("y"));
    } else if (shape.family === "reciprocal") {
      const s = signs(shape.a);
      // At a = 0 the curve is the line y = k: both bars hide.
      const guard = s.positive || s.negative ? shape.k : `${wrap(shape.k)}+0*log((${shape.a})^2)`;
      bars.push({ axis: "y", from: null, to: guard, from_closed: false, to_closed: false }, { axis: "y", from: guard, to: null, from_closed: false, to_closed: false });
    } else if (shape.family === "exponential") {
      if (shape.base && !(shape.base.value !== undefined && shape.base.value > 0 && shape.base.value !== 1)) refuse("range", "needs a fixed base above 0 and not 1");
      bars.push(...bySign(shape.a, shape.k, { from_closed: false }, "y"));
    } else {
      bars.push(...bySign(shape.a, shape.k, { from_closed: true }, "y"));
    }
  }
  return bars;
}

/**
 * The bars for a piecewise function's domain (its intervals, joined where they meet) and range (lines and
 * constants only: each piece's values on its interval, joined), all fixed numbers.
 */
export function pieceBars(pieces: ReadonlyArray<{ tokens: LessonPlanMathExpression; from: number | null; to: number | null; from_closed: boolean; to_closed: boolean }>, want: { domain: boolean; range: boolean }, path: string): AxisBar[] {
  type Span = { from: number | null; to: number | null; from_closed: boolean; to_closed: boolean };
  const bars: AxisBar[] = [];
  if (want.domain) bars.push(...join(pieces).map((span) => toBar("x", span)));
  if (want.range) {
    const images: Span[] = pieces.map((piece) => {
      const p = polynomialOf(piece.tokens) as Scalar[] | undefined;
      if (!p || degreeOf(p) > 1 || p.some((scalar) => scalar.value === undefined)) {
        throw new LessonPlanError("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.marks`, "the range mark of a piecewise function is derived only when every piece is a line or a constant; leave it out of marks and do not narrate it");
      }
      const [c, m] = [at(p, 0).value!, at(p, 1).value!];
      if (m === 0) return { from: c, to: c, from_closed: true, to_closed: true };
      const ends = [{ x: piece.from, closed: piece.from_closed }, { x: piece.to, closed: piece.to_closed }].map(({ x, closed }) => ({ y: x === null ? null : m * x + c, closed: x !== null && closed }));
      // An unbounded side goes up for a rising line on the right, down on the left, and the reverse.
      const [left, right] = ends as [{ y: number | null; closed: boolean }, { y: number | null; closed: boolean }];
      return m > 0 ? { from: left.y, to: right.y, from_closed: left.closed, to_closed: right.closed } : { from: right.y, to: left.y, from_closed: right.closed, to_closed: left.closed };
    });
    bars.push(...join(images).map((span) => toBar("y", span)));
  }
  return bars;

  function toBar(axis: "x" | "y", span: Span): AxisBar {
    const text = (value: number | null) => (value === null ? null : String(Number(value.toPrecision(12))));
    return { axis, from: text(span.from), to: text(span.to), from_closed: span.from !== null && span.from_closed, to_closed: span.to !== null && span.to_closed };
  }
  function join(spans: readonly Span[]): Span[] {
    const low = (span: Span) => span.from ?? -Infinity, high = (span: Span) => span.to ?? Infinity;
    const sorted = [...spans].sort((a, b) => low(a) - low(b) || Number(b.from_closed) - Number(a.from_closed));
    const joined: Span[] = [];
    for (const span of sorted) {
      const last = joined.at(-1);
      // Overlapping, or meeting at a point one of them includes: one bar.
      if (last && (high(last) > low(span) || (high(last) === low(span) && (last.to_closed || span.from_closed)))) {
        if (high(span) > high(last)) { last.to = span.to; last.to_closed = span.to_closed; }
        else if (high(span) === high(last)) last.to_closed = last.to_closed || span.to_closed;
        continue;
      }
      joined.push({ ...span });
    }
    return joined;
  }
}
