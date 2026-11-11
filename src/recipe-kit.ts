// Helpers shared by the Lesson Plan compiler and the plugins' recipe compilers.
import { type CompiledVisual } from "./compiled-visual-reuse.js";
import { compileMathExpression, type AuthoringAction, type Placement } from "octos-lesson-language";
import { LessonPlanError, type JsonValue, type LessonPlan, type LessonPlanMathExpression, type LessonPlanPlacement, type LessonPlanVisualContent } from "./lesson-plan.js";

export const LESSON_PLAN_SCENE_INITIAL_CAMERAS = {
  cube_with_section: { yaw: 0.72, pitch: 0.55, zoom: 1 },
  function_surface_with_section: { yaw: 0.72, pitch: 0.55, zoom: 1 },
  implicit_surface_with_section: { yaw: 0.72, pitch: 0.55, zoom: 1 },
} as const;

export type Parameters = Record<string, JsonValue>;

export function fail(code: string, path: string, message: string): never {
  throw new LessonPlanError(code, path, message);
}

export function pad(index: number): string {
  return String(index).padStart(2, "0");
}

export function variableAlias(index: number): string {
  return `number_${pad(index)}`;
}

export function parameters(content: LessonPlanVisualContent): Parameters {
  return content.parameters ?? {};
}

export function allowParameterKeys(value: Parameters, allowed: readonly string[], path: string): void {
  const accepted = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!accepted.has(key)) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.${key}`, "unsupported capability parameter");
  }
}

export function optionalText(value: JsonValue | undefined, fallback: string, path: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, "expected a non-empty string");
  }
  return value;
}

export function optionalNumber(value: JsonValue | undefined, fallback: number, path: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, "expected a finite number");
  }
  return value;
}

export function optionalInteger(value: JsonValue | undefined, fallback: number, min: number, max: number, path: string): number {
  const result = optionalNumber(value, fallback, path);
  if (!Number.isInteger(result) || result < min || result > max) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, `expected an integer from ${min} to ${max}`);
  }
  return result;
}

export function optionalStringArray(value: JsonValue | undefined, fallback: string[], path: string): string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, "expected a non-empty string array");
  }
  return [...value] as string[];
}

export function assertRange(min: number, max: number, path: string): void {
  if (!(min < max)) fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, "range minimum must be smaller than maximum");
}

export function replaceIdentifier(expression: string, source: string, target: string): string {
  return expression.replace(new RegExp(`\\b${source}\\b`, "gu"), target);
}

export function safeFunctionExpression(value: JsonValue | undefined, fallback: string, variables: string[], path: string): string {
  const expression = optionalText(value, fallback, path);
  try {
    compileMathExpression(expression, variables);
  } catch (error) {
    fail(
      "LESSON_PLAN_CAPABILITY_PARAMETER",
      path,
      error instanceof Error ? error.message : "invalid mathematical expression",
    );
  }
  return expression;
}

export function evaluate(expression: string, variables: string[], values: Record<string, number>, path: string): number {
  try {
    const result = compileMathExpression(expression, variables)(values);
    if (!Number.isFinite(result)) throw new Error("result is not finite");
    return result;
  } catch (error) {
    fail(
      "LESSON_PLAN_CAPABILITY_PARAMETER",
      path,
      error instanceof Error ? error.message : "expression cannot be evaluated",
    );
  }
}

export function mathExpressionToOll(expression: LessonPlanMathExpression): string {
  const operators = {
    add: "+",
    subtract: "-",
    multiply: "*",
    divide: "/",
    power: "^",
  } as const;
  const stack: string[] = [];
  expression.forEach((token) => {
    if (token.kind === "input") stack.push("x");
    else if (token.kind === "number") stack.push(variableAlias(token.number));
    else if (token.kind === "literal") stack.push(String(token.value));
    else if (token.kind === "constant") stack.push(token.name);
    else if (token.kind === "negate") {
      const value = stack.pop();
      if (!value) fail("LESSON_PLAN_EXPRESSION", "$expression", "negate is missing an operand");
      stack.push(`-(${value})`);
    } else if (token.kind === "function") {
      const value = stack.pop();
      if (!value) fail("LESSON_PLAN_EXPRESSION", "$expression", "function is missing an operand");
      stack.push(`${token.name}(${value})`);
    } else {
      const right = stack.pop();
      const left = stack.pop();
      if (!left || !right) fail("LESSON_PLAN_EXPRESSION", "$expression", "operator is missing operands");
      stack.push(`(${left})${operators[token.operator]}(${right})`);
    }
  });
  const result = stack[0];
  if (!result || stack.length !== 1) fail("LESSON_PLAN_EXPRESSION", "$expression", "expression does not produce one result");
  return result;
}

export function place(
  input: LessonPlanPlacement,
  path: string,
  reference: (path: string) => string,
): Placement {
  const gap = input.gap === "tight" ? "compact" : input.gap === "wide" ? "spacious" : input.gap;
  const sectionMatch = path.match(/sections\[(\d+)\]/u);
  const regionRole = sectionMatch ? `section-${pad(Number(sectionMatch[1]) + 1)}` : "lesson-content";
  return {
    relation: input.relation,
    ...(input.relation === "new_region" ? { region_role: regionRole } : {}),
    ...(input.reference ? { anchor: reference(`${path}.reference`) } : {}),
    ...(input.align ? { align: input.align } : {}),
    ...(gap ? { gap } : {}),
  };
}

export const SPEECH_PHASE_ORDER = { before_speech: 0, during_speech: 1, after_speech: 2 } as const;

/**
 * A focus declared after the moment has written a formula or note must frame
 * that card too: the narration is about what was just written, and a focus
 * naming only the diagram left the new card outside the camera on small
 * displays. Deterministic and local to one moment; no model round trip.
 */
export function includeWrittenCardsInFocus(actions: AuthoringAction[]): void {
  const phase = (action: AuthoringAction) =>
    SPEECH_PHASE_ORDER[((action as { when?: keyof typeof SPEECH_PHASE_ORDER }).when) ?? "during_speech"] ?? 1;
  actions.forEach((action, index) => {
    if (action.do !== "focus") return;
    const focus = action as AuthoringAction & { targets: string[] };
    for (const earlier of actions.slice(0, index)) {
      const write = earlier as AuthoringAction & { as?: string; kind?: string };
      if (write.do !== "write" || !write.as || !["math", "note", "text"].includes(String(write.kind))) continue;
      if (phase(write) > phase(action) || focus.targets.includes(write.as)) continue;
      focus.targets.push(write.as);
    }
  });
}

export function actionWhen(timing: unknown): { when?: "before_speech" | "during_speech" | "after_speech" } {
  return timing ? { when: timing as "before_speech" | "during_speech" | "after_speech" } : {};
}

export function numberDefinition(plan: LessonPlan, index: number, path: string) {
  const definition = plan.numbers?.[index - 1];
  if (!definition) fail("LESSON_PLAN_NUMBER_REFERENCE", path, "number reference is unavailable");
  return definition;
}

/** Model-written plot text may name a lesson number by its formula
 * placeholder (n1, n2). Show the number's own symbol instead: the trailing
 * Latin or Greek letter of its label ("常数项b" -> "b"), else the label. */
export function namedNumbers(text: string, plan: LessonPlan): string {
  return text.replace(/\bn([1-9])\b/gu, (placeholder, digit: string) => {
    const label = plan.numbers?.[Number(digit) - 1]?.label?.trim();
    if (!label) return placeholder;
    return /([A-Za-z\u03b1-\u03c9])$/u.exec(label)?.[1] ?? label;
  });
}

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

/**
 * Display symbols for the lesson numbers used in one plot formula: the
 * trailing Latin or Greek letter of the number's label ("顶点的横坐标h" ->
 * "h"), else the whole label, else "n<index>". Numbers that resolve to the
 * same symbol get a deterministic outline-index subscript so every legend
 * entry still names exactly one control.
 */
export function displayNumberSymbols(plan: LessonPlan, indexes: readonly number[]): Map<number, string> {
  const requested = new Map<number, string>();
  for (const index of [...new Set(indexes)].sort((a, b) => a - b)) {
    const label = plan.numbers?.[index - 1]?.label?.trim();
    const suffix = label && /(?:^|[^A-Za-z\u0370-\u03ff])([A-Za-z\u0370-\u03ff])$/u.exec(label)?.[1];
    requested.set(index, suffix || label || `n${index}`);
  }
  const counts = new Map<string, number>();
  for (const name of requested.values()) counts.set(name, (counts.get(name) ?? 0) + 1);
  const symbols = new Map<number, string>();
  const reserved = new Set(["x", "y", "π", "pi", "e"]);
  const assigned = new Set([...reserved, ...requested.values()]);
  for (const [index, name] of requested) {
    if (!reserved.has(name) && counts.get(name) === 1) {
      symbols.set(index, name);
      continue;
    }
    const subscript = [...String(index)].map(digit => SUBSCRIPT_DIGITS[Number(digit)]).join("");
    let candidate = name + subscript;
    while (assigned.has(candidate)) candidate += subscript;
    assigned.add(candidate);
    symbols.set(index, candidate);
  }
  return symbols;
}

// Display precedence levels: higher binds tighter, so a child with a lower
// level than its parent context needs parentheses.
const DISPLAY_LEVEL_ADD = 0;
const DISPLAY_LEVEL_MUL = 1;
const DISPLAY_LEVEL_UNARY = 2;
const DISPLAY_LEVEL_POWER = 3;
const DISPLAY_LEVEL_ATOM = 4;

interface DisplayPart {
  text: string;
  level: number;
  /** Text without the leading "−", when this part is a negated form. */
  minus?: string;
  /** The numeric value, when this part is a non-negative literal atom. */
  literal?: number;
}

const SIMPLE_IDENTIFIER = /^[A-Za-z\u0370-\u03ff][₀-₉]*$/u;

/**
 * Render a parsed lesson-plan formula for students: readable number symbols,
 * minimal parentheses and real minus/superscript signs. Evaluation keeps the
 * stable number_XX aliases; this is display only, derived from the same
 * tokens so the legend can never disagree with the curve.
 */
export function formatMathExpressionDisplay(
  expression: LessonPlanMathExpression,
  symbol: (index: number) => string,
): string {
  const stack: DisplayPart[] = [];
  const pop = (what: string): DisplayPart => {
    const part = stack.pop();
    if (!part) fail("LESSON_PLAN_EXPRESSION", "$expression", `${what} is missing an operand`);
    return part;
  };
  const parenthesize = (part: DisplayPart) => `(${part.text})`;
  for (const token of expression) {
    if (token.kind === "input") stack.push({ text: "x", level: DISPLAY_LEVEL_ATOM });
    else if (token.kind === "number") {
      const name = symbol(token.number);
      stack.push({ text: /[+−*/^=()·]|\s/u.test(name) ? `[${name}]` : name, level: DISPLAY_LEVEL_ATOM });
    }
    else if (token.kind === "constant") stack.push({ text: token.name === "pi" ? "π" : token.name, level: DISPLAY_LEVEL_ATOM });
    else if (token.kind === "literal") {
      const magnitude = String(Math.abs(token.value));
      stack.push(token.value < 0 || Object.is(token.value, -0)
        ? { text: `−${magnitude}`, level: DISPLAY_LEVEL_UNARY, minus: magnitude }
        : { text: magnitude, level: DISPLAY_LEVEL_ATOM, literal: token.value });
    } else if (token.kind === "negate") {
      const operand = pop("negate");
      const needsParens = operand.minus !== undefined || operand.level === DISPLAY_LEVEL_ADD;
      const inner = needsParens ? parenthesize(operand) : operand.text;
      stack.push({ text: `−${inner}`, level: DISPLAY_LEVEL_UNARY, minus: inner });
    } else if (token.kind === "function") {
      const operand = pop("function");
      stack.push({ text: `${token.name}(${operand.text})`, level: DISPLAY_LEVEL_ATOM });
    } else if (token.operator === "power") {
      const exponent = pop("power");
      const base = pop("power");
      const baseText = base.level < DISPLAY_LEVEL_ATOM ? parenthesize(base) : base.text;
      if (exponent.literal === 2 || exponent.literal === 3) {
        stack.push({ text: `${baseText}${exponent.literal === 2 ? "²" : "³"}`, level: DISPLAY_LEVEL_POWER });
      } else {
        const exponentText = exponent.level === DISPLAY_LEVEL_ATOM
          ? exponent.text : parenthesize(exponent);
        stack.push({ text: `${baseText}^${exponentText}`, level: DISPLAY_LEVEL_POWER });
      }
    } else if (token.operator === "multiply" || token.operator === "divide") {
      const right = pop(token.operator);
      const left = pop(token.operator);
      if (token.operator === "multiply" && (left.literal === 1 || left.minus === "1")) {
        if (left.minus === undefined) {
          stack.push(right);
        } else {
          const needsParens = right.level === DISPLAY_LEVEL_ADD || right.minus !== undefined;
          const inner = needsParens ? parenthesize(right) : right.text;
          stack.push({ text: `−${inner}`, level: DISPLAY_LEVEL_UNARY, minus: inner });
        }
        continue;
      }
      const leftText = left.level < DISPLAY_LEVEL_MUL || left.minus !== undefined ? parenthesize(left) : left.text;
      const rightNeedsParens = right.minus !== undefined
        || right.level < DISPLAY_LEVEL_MUL
        || (token.operator === "divide" && right.level === DISPLAY_LEVEL_MUL);
      const rightText = rightNeedsParens ? parenthesize(right) : right.text;
      // A numeric coefficient followed by a single symbol can use juxtaposition.
      // Other operands keep a multiplication dot so adjacent tokens cannot merge.
      const juxtapose = token.operator === "multiply" && left.literal !== undefined
        && SIMPLE_IDENTIFIER.test(right.text);
      stack.push({ text: juxtapose ? `${leftText}${rightText}` : `${leftText}${token.operator === "divide" ? "/" : "·"}${rightText}`, level: DISPLAY_LEVEL_MUL });
    } else {
      const right = pop(token.operator);
      const left = pop(token.operator);
      const leftText = left.level < DISPLAY_LEVEL_ADD ? parenthesize(left) : left.text;
      let text: string;
      if (token.operator === "add") {
        text = right.minus !== undefined ? `${leftText} − ${right.minus}` : `${leftText} + ${right.text}`;
      } else {
        text = right.minus !== undefined
          ? `${leftText} + ${right.minus}`
          : `${leftText} − ${right.level <= DISPLAY_LEVEL_ADD ? parenthesize(right) : right.text}`;
      }
      stack.push({ text, level: DISPLAY_LEVEL_ADD });
    }
  }
  const result = stack[0];
  if (!result || stack.length !== 1) fail("LESSON_PLAN_EXPRESSION", "$expression", "expression does not produce one result");
  return result.text;
}

export function angleScaleForUnit(unit: string | undefined): number {
  if (!unit) return 1;
  const normalized = unit.trim().toLowerCase();
  if (/弧度|radian|rad/u.test(normalized)) return 1;
  if (/角度|度|°|degree|deg/u.test(normalized)) return Math.PI / 180;
  return 1;
}

export function scaledAngleExpression(variable: string, scale: number): string {
  return scale === 1 ? variable : `(${variable})*pi/180`;
}


export type VisualCompiler = (
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
) => CompiledVisual;

