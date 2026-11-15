// Marks on a function plot (OLL decision 0018 §1): the model names the marks; the program derives where
// they are, binds them to the lesson numbers, and hides one the moment it stops existing.
// - intercepts: the y-intercept, and the x-intercepts of a line or a quadratic;
// - vertex and symmetry_axis: a quadratic's vertex and the vertical line through it.
// The formula's coefficients in x are read from its tokens, as short expressions in the lesson numbers
// (OLL caps a binding at 256 characters, so f cannot be substituted into itself). A mark the formula
// cannot give (a vertex of a line, intercepts of a cubic) is refused in the section, so the section is
// written again without it (0018 question 2: narration about a mark that is not drawn misleads most).
import { compileMathExpression } from "octos-lesson-language";
import { LessonPlanError, type LessonPlanMathExpression } from "../lesson-plan.js";
import { mathExpressionToOll, variableAlias } from "../recipe-kit.js";

import { PLOT_MARKS, type PlotMark } from "./plot-mark-names.js";
export { PLOT_MARKS, type PlotMark };

/** A coefficient: an expression in the lesson numbers, and its value when it is a constant. */
interface Scalar { text: string; value?: number }
/** A polynomial in x of degree at most 2, lowest power first; undefined when the formula is not one. */
type Polynomial = Scalar[];

const constant = (value: number): Scalar => ({ text: formatNumber(value), value });
const formatNumber = (value: number) => (Object.is(value, -0) ? "0" : String(Number(value.toPrecision(12))));
const isZero = (scalar: Scalar) => scalar.value === 0;
const wrap = (scalar: Scalar) => (/^[A-Za-z_][A-Za-z0-9_]*$|^\d+(\.\d+)?$/u.test(scalar.text) ? scalar.text : `(${scalar.text})`);

function add(a: Scalar, b: Scalar): Scalar {
  if (a.value !== undefined && b.value !== undefined) return constant(a.value + b.value);
  if (isZero(a)) return b;
  if (isZero(b)) return a;
  return { text: `${a.text}+${wrap(b)}` };
}
function negate(a: Scalar): Scalar {
  return a.value !== undefined ? constant(-a.value) : { text: `-${wrap(a)}` };
}
function multiply(a: Scalar, b: Scalar): Scalar {
  if (a.value !== undefined && b.value !== undefined) return constant(a.value * b.value);
  if (isZero(a) || isZero(b)) return constant(0);
  if (a.value === 1) return b;
  if (b.value === 1) return a;
  if (a.value === -1) return negate(b);
  if (b.value === -1) return negate(a);
  return { text: `${wrap(a)}*${wrap(b)}` };
}
function divide(a: Scalar, b: Scalar): Scalar {
  if (a.value !== undefined && b.value !== undefined && b.value !== 0) return constant(a.value / b.value);
  if (isZero(a)) return constant(0);
  if (b.value === 1) return a;
  return { text: `${wrap(a)}/${wrap(b)}` };
}

const degree = (p: Polynomial) => p.reduce((highest, scalar, power) => (isZero(scalar) ? highest : power), 0);
const coefficient = (p: Polynomial, power: number) => p[power] ?? constant(0);

/** Reads a formula as a polynomial in x of degree at most 2; undefined when it is not one. */
export function polynomialOf(tokens: LessonPlanMathExpression): Polynomial | undefined {
  const stack: Polynomial[] = [];
  for (const token of tokens) {
    if (token.kind === "input") stack.push([constant(0), constant(1)]);
    else if (token.kind === "number") stack.push([{ text: variableAlias(token.number) }]);
    else if (token.kind === "literal") stack.push([constant(Number(token.value))]);
    else if (token.kind === "constant") stack.push([{ text: token.name, value: token.name === "pi" ? Math.PI : Math.E }]);
    else if (token.kind === "negate") {
      const p = stack.pop();
      if (!p) return undefined;
      stack.push(p.map(negate));
    } else if (token.kind === "function") {
      const p = stack.pop();
      // A function of the lesson numbers alone is a coefficient; a function of x is not a polynomial.
      if (!p || degree(p) > 0) return undefined;
      stack.push([{ text: `${token.name}(${coefficient(p, 0).text})` }]);
    } else {
      const right = stack.pop(), left = stack.pop();
      if (!left || !right) return undefined;
      let result: Polynomial | undefined;
      if (token.operator === "add" || token.operator === "subtract") {
        result = [0, 1, 2].map((power) => add(coefficient(left, power), token.operator === "add" ? coefficient(right, power) : negate(coefficient(right, power))));
      } else if (token.operator === "multiply") {
        result = times(left, right);
      } else if (token.operator === "divide") {
        if (degree(right) > 0) return undefined;
        result = left.map((scalar) => divide(scalar, coefficient(right, 0)));
      } else {
        // A power: of x only by a whole constant (x^2); of the numbers alone, any power.
        const exponent = coefficient(right, 0);
        if (degree(right) > 0) return undefined;
        if (degree(left) === 0) result = [{ text: `${wrap(coefficient(left, 0))}^${wrap(exponent)}` }];
        else if (exponent.value === 0) result = [constant(1)];
        else if (exponent.value === 1) result = left;
        else if (exponent.value === 2) result = times(left, left);
        else return undefined;
      }
      if (!result) return undefined;
      stack.push(result);
    }
  }
  return stack.length === 1 ? stack[0] : undefined;
}

function times(left: Polynomial, right: Polynomial): Polynomial | undefined {
  const result: Scalar[] = [constant(0), constant(0), constant(0)];
  for (const [i, a] of left.entries()) for (const [j, b] of right.entries()) {
    if (isZero(a) || isZero(b)) continue;
    if (i + j > 2) return undefined;
    result[i + j] = add(result[i + j]!, multiply(a, b));
  }
  return result;
}

export interface MarkPart {
  /** A point, or a vertical guide line. */
  kind: "point" | "guide";
  as: string;
  label: string;
  /** Expressions in the lesson numbers: x and y for a point, value for a guide. */
  x?: string; y?: string; value?: string;
}

/**
 * The parts the named marks draw for a formula, or a section-owned fault naming the mark it cannot give.
 * `check` holds the variables the formula reads and values to cross-check the coefficients at.
 */
export function markParts(tokens: LessonPlanMathExpression, marks: readonly PlotMark[], labels: (source: string) => string, check: { variables: string[]; samples: Array<Record<string, number>> }, path: string): MarkPart[] {
  const polynomial = polynomialOf(tokens);
  const refuse = (mark: string, why: string): never => {
    throw new LessonPlanError("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.marks`, `the ${mark} mark ${why}; leave it out of marks and do not narrate it`);
  };
  if (!polynomial) return refuse(marks[0]!, "needs a line or a quadratic (marks are derived exactly)");
  const [c, b, a] = [0, 1, 2].map((power) => coefficient(polynomial, power)) as [Scalar, Scalar, Scalar];
  // Every mark is written from the coefficients, so coefficients too long for one binding refuse the marks
  // here, as a section fault naming them, before the cross-check compiles them (review: OLL's own length
  // error escaped with no path).
  if (polynomialText([c, b, a]).length > 240) refuse(marks[0]!, "is too long an expression for this formula");
  crossCheck(tokens, [c, b, a], check, path);
  const linear = isZero(a);
  const parts: MarkPart[] = [];
  const owners = new Map<MarkPart, PlotMark>();
  for (const mark of marks) {
    const before = parts.length;
    if (mark === "intercepts") {
      parts.push({ kind: "point", as: "mark-y-intercept", label: labels("y 截距"), x: "0", y: c.text });
      if (linear) {
        if (!isZero(b)) parts.push({ kind: "point", as: "mark-x-intercept", label: labels("x 截距"), x: negate(divide(c, b)).text, y: "0" });
      } else {
        const root = `sqrt(${wrap(b)}^2-4*${wrap(a)}*${wrap(c)})`;
        for (const [index, sign] of (["-", "+"] as const).entries()) {
          parts.push({ kind: "point", as: `mark-x-intercept-${index + 1}`, label: labels("x 截距"), x: `(${negate(b).text}${sign}${root})/(2*${wrap(a)})`, y: "0" });
        }
      }
    } else {
      if (linear) refuse(mark, "needs a quadratic");
      const axis = `${negate(b).text === "0" ? "0" : `(${negate(b).text})`}/(2*${wrap(a)})`;
      if (mark === "vertex") parts.push({ kind: "point", as: "mark-vertex", label: labels("顶点"), x: axis, y: `${wrap(c)}-${wrap(b)}^2/(4*${wrap(a)})` });
      else parts.push({ kind: "guide", as: "mark-axis", label: labels("对称轴"), value: axis });
    }
    for (const part of parts.slice(before)) owners.set(part, mark);
  }
  for (const part of parts) for (const text of [part.x, part.y, part.value]) {
    if (text !== undefined && text.length > 240) refuse(owners.get(part)!, "is too long an expression for this formula");
  }
  return parts;
}

/** The polynomial written from its coefficients, as the cross-check compiles it. */
const polynomialText = ([c, b, a]: Scalar[]) => `${wrap(a!)}*x^2+${wrap(b!)}*x+${wrap(c!)}`;

/** The coefficients must give back the formula at sampled values: a guard on the algebra above. */
function crossCheck(tokens: LessonPlanMathExpression, [c, b, a]: Scalar[], { variables, samples }: { variables: string[]; samples: Array<Record<string, number>> }, path: string): void {
  const names = ["x", ...variables];
  const formula = compileMathExpression(mathExpressionToOll(tokens), names);
  const polynomial = compileMathExpression(polynomialText([c!, b!, a!]), names);
  for (const values of samples) for (const x of [-2.5, -1, 0, 0.5, 3]) {
    const expected = formula({ ...values, x }), actual = polynomial({ ...values, x });
    if (!Number.isFinite(expected) && !Number.isFinite(actual)) continue;
    if (!(Math.abs(expected - actual) <= 1e-6 * Math.max(1, Math.abs(expected)))) {
      throw new LessonPlanError("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.marks`, "the marks could not be derived for this formula; leave marks out");
    }
  }
}
