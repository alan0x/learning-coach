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

