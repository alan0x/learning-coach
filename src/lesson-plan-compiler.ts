import {
  compileMathExpression,
  normalizeAuthoringLesson,
  reduceCanonicalEvents,
  validateAuthoringLesson,
  validateAuthoringSchema,
  type AuthoringAction,
  type AuthoringLesson,
  type Placement,
  type ResourceContext,
} from "octos-lesson-language";

import {
  LESSON_PLAN_CAPABILITY_REGISTRY,
  LESSON_PLAN_CAPABILITY_NUMBER_LIMITS,
  LessonPlanError,
  resolveLessonPlan,
  type JsonValue,
  type LessonPlan,
  type LessonPlanBoardContent,
  type LessonPlanBoardKind,
  type LessonPlanHostReference,
  type LessonPlanMathExpression,
  type LessonPlanPlacement,
  type LessonPlanReference,
  type LessonPlanVisualContent,
  type ResolveLessonPlanOptions,
  type ResolvedLessonPlan,
  type ResolvedLessonPlanReference,
} from "./lesson-plan.js";

export interface CompileLessonPlanOptions extends ResolveLessonPlanOptions {
  language?: string;
  adaptation_context_refs?: string[];
  board_context?: { board_id: string; revision: number };
  validation_host?: { lesson_id?: string; board_id?: string; base_revision?: number };
}

export const LESSON_PLAN_SCENE_INITIAL_CAMERAS = {
  cube_with_section: { yaw: 0.72, pitch: 0.55, zoom: 1 },
  function_surface_with_section: { yaw: 0.72, pitch: 0.55, zoom: 1 },
} as const;

export interface CompiledLessonPlan {
  lesson: AuthoringLesson;
  resolved: ResolvedLessonPlan;
}

interface CompiledVisual {
  actions: AuthoringAction[];
  whole: string;
  primaryScene?: string;
  parts: Map<string, string>;
}

function normalizedVisualIdentity(content: LessonPlanVisualContent, includeNumbers = true): string {
  const sourceParameters = content.parameters ?? {};
  const parameters = Object.fromEntries(
    LESSON_PLAN_CAPABILITY_REGISTRY[content.capability].semantic_parameters
      .filter((name) => sourceParameters[name] !== undefined)
      .map((name) => [name, sourceParameters[name]]),
  );
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    );
  };
  return JSON.stringify(normalize({
    capability: content.capability,
    parameters,
    ...(includeNumbers ? { numbers: content.numbers ?? [] } : {}),
  }));
}

function mergeEquivalentVisualInputs(plan: LessonPlan): void {
  const groups = new Map<string, LessonPlanVisualContent[]>();
  for (const section of plan.sections) {
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (action.action !== "create" || action.kind !== "visual") continue;
        const content = action.content as LessonPlanVisualContent;
        const identity = normalizedVisualIdentity(content, false);
        const group = groups.get(identity) ?? [];
        group.push(content);
        groups.set(identity, group);
      }
    }
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const inputs = [...new Set(group.flatMap((content) => content.numbers ?? []))];
    const limit = LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[group[0].capability];
    if (inputs.length > limit) continue;
    for (const content of group) content.numbers = [...inputs];
  }
}

type Parameters = Record<string, JsonValue>;

function fail(code: string, path: string, message: string): never {
  throw new LessonPlanError(code, path, message);
}

function pad(index: number): string {
  return String(index).padStart(2, "0");
}

function variableAlias(index: number): string {
  return `number_${pad(index)}`;
}

function parameters(content: LessonPlanVisualContent): Parameters {
  return content.parameters ?? {};
}

function allowParameterKeys(value: Parameters, allowed: readonly string[], path: string): void {
  const accepted = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!accepted.has(key)) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.${key}`, "unsupported capability parameter");
  }
}

function optionalText(value: JsonValue | undefined, fallback: string, path: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, "expected a non-empty string");
  }
  return value;
}

function optionalNumber(value: JsonValue | undefined, fallback: number, path: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, "expected a finite number");
  }
  return value;
}

function optionalInteger(value: JsonValue | undefined, fallback: number, min: number, max: number, path: string): number {
  const result = optionalNumber(value, fallback, path);
  if (!Number.isInteger(result) || result < min || result > max) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, `expected an integer from ${min} to ${max}`);
  }
  return result;
}

function optionalStringArray(value: JsonValue | undefined, fallback: string[], path: string): string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, "expected a non-empty string array");
  }
  return [...value] as string[];
}

function assertRange(min: number, max: number, path: string): void {
  if (!(min < max)) fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, "range minimum must be smaller than maximum");
}

function replaceIdentifier(expression: string, source: string, target: string): string {
  return expression.replace(new RegExp(`\\b${source}\\b`, "gu"), target);
}

function safeFunctionExpression(value: JsonValue | undefined, fallback: string, variables: string[], path: string): string {
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

function evaluate(expression: string, variables: string[], values: Record<string, number>, path: string): number {
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

function numericCombinations(
  entries: Array<{ name: string; values: number[] }>,
): Array<Record<string, number>> {
  return entries.reduce<Array<Record<string, number>>>(
    (combinations, entry) => combinations.flatMap((combination) => (
      entry.values.map((value) => ({ ...combination, [entry.name]: value }))
    )),
    [{}],
  );
}

function paddedNumericRange(values: number[], fallback: { min: number; max: number }): { min: number; max: number } {
  const finite = values.filter((value) => Number.isFinite(value) && Math.abs(value) <= 1e12).sort((a, b) => a - b);
  if (finite.length === 0) return fallback;
  const low = finite[Math.floor((finite.length - 1) * 0.02)]!;
  const high = finite[Math.ceil((finite.length - 1) * 0.98)]!;
  const span = high - low;
  const padding = span > 1e-9 ? span * 0.12 : Math.max(0.5, Math.abs(low) * 0.2);
  return { min: low - padding, max: high + padding };
}

function deterministicFunctionViewport(
  expressions: string[],
  variables: string[],
  parameterValues: Array<Record<string, number>>,
  requestedX: { min: number; max: number } | undefined,
  path: string,
): { x: { min: number; max: number }; y: { min: number; max: number } } {
  const evaluators = expressions.map((expression) => compileMathExpression(expression, variables));
  const candidates = requestedX ? [requestedX] : [
    { min: -4, max: 4 },
    { min: 0.05, max: 8 },
    { min: -10, max: 10 },
  ];
  let best: { x: { min: number; max: number }; values: number[]; ratio: number } | undefined;
  for (const xRange of candidates) {
    const values: number[] = [];
    let attempts = 0;
    for (let index = 0; index <= 120; index += 1) {
      const x = xRange.min + (xRange.max - xRange.min) * index / 120;
      for (const parameters of parameterValues) {
        for (const evaluator of evaluators) {
          attempts += 1;
          try {
            const value = evaluator({ x, ...parameters });
            if (Number.isFinite(value) && Math.abs(value) <= 1e12) values.push(value);
          } catch {
            // Keep sampling. A candidate that crosses a singularity can still
            // be useful when most of its domain is finite.
          }
        }
      }
    }
    const ratio = attempts > 0 ? values.length / attempts : 0;
    if (!best || ratio > best.ratio) best = { x: xRange, values, ratio };
    if (ratio >= 0.75) {
      best = { x: xRange, values, ratio };
      break;
    }
  }
  if (!best || best.values.length < 8) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, "function has no stable finite viewport");
  }
  return { x: best.x, y: paddedNumericRange(best.values, { min: -1, max: 1 }) };
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

function place(
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

function actionWhen(timing: unknown): { when?: "before_speech" | "during_speech" | "after_speech" } {
  return timing ? { when: timing as "before_speech" | "during_speech" | "after_speech" } : {};
}

function numberDefinition(plan: LessonPlan, index: number, path: string) {
  const definition = plan.numbers?.[index - 1];
  if (!definition) fail("LESSON_PLAN_NUMBER_REFERENCE", path, "number reference is unavailable");
  return definition;
}

function angleScaleForUnit(unit: string | undefined): number {
  if (!unit) return 1;
  const normalized = unit.trim().toLowerCase();
  if (/弧度|radian|rad/u.test(normalized)) return 1;
  if (/角度|度|°|degree|deg/u.test(normalized)) return Math.PI / 180;
  return 1;
}

function scaledAngleExpression(variable: string, scale: number): string {
  return scale === 1 ? variable : `(${variable})*pi/180`;
}

function compileFunctionPlot(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "expression", "expressions", "expression_tokens", "curve_label", "curve_labels", "x_min", "x_max", "y_min", "y_max"], path);
  const dynamicTokens = input.expression_tokens as LessonPlanMathExpression | undefined;
  if (dynamicTokens !== undefined
    && !dynamicTokens.some((token) => token.kind === "input")) {
    fail(
      "LESSON_PLAN_PLOT_INPUT",
      `${path}.expression_tokens`,
      "a parameterized function curve must explicitly depend on the plot input; a lesson number cannot replace the horizontal-axis input",
    );
  }
  if (dynamicTokens !== undefined
    && (input.expression !== undefined || input.expressions !== undefined)) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, "use expression_tokens or static expression strings, not both");
  }
  if (input.expression !== undefined && input.expressions !== undefined) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, "use either expression or expressions, not both");
  }
  if (dynamicTokens === undefined
    && input.expression === undefined
    && input.expressions === undefined) {
    fail(
      "LESSON_PLAN_EXPRESSION",
      `${path}.parameters`,
      "a function plot requires an explicit mathematical expression",
    );
  }
  if ((content.numbers?.length ?? 0) > 1 && dynamicTokens === undefined) {
    fail(
      "LESSON_PLAN_CAPABILITY_PARAMETER",
      `${path}.expression_tokens`,
      "a function plot with multiple numeric inputs must define how those inputs change the whole curve",
    );
  }
  const dynamicNumbers = dynamicTokens === undefined
    ? []
    : [...new Set(dynamicTokens.flatMap((token) => token.kind === "number" ? [token.number] : []))];
  if (dynamicNumbers.length > LESSON_PLAN_CAPABILITY_NUMBER_LIMITS.function_plot) {
    fail(
      "LESSON_PLAN_COMPILER_CONTROL_LIMIT",
      `${path}.expression_tokens`,
      `function_plot supports at most ${LESSON_PLAN_CAPABILITY_NUMBER_LIMITS.function_plot} numeric inputs`,
    );
  }
  if (dynamicTokens !== undefined) {
    const declaredNumbers = [...new Set(content.numbers ?? [])];
    if (dynamicNumbers.length > 0
      && JSON.stringify(declaredNumbers) !== JSON.stringify(dynamicNumbers)) {
      fail(
        "LESSON_PLAN_CAPABILITY_PARAMETER",
        `${path}.numbers`,
        "function_plot numbers must exactly match the number references in expression_tokens",
      );
    }
    if (dynamicNumbers.length === 0 && declaredNumbers.length > 1) {
      fail(
        "LESSON_PLAN_CAPABILITY_PARAMETER",
        `${path}.numbers`,
        "a function curve without numeric parameters can use at most one number as its moving sample",
      );
    }
  }
  const rawExpressions = dynamicTokens !== undefined
    ? [mathExpressionToOll(dynamicTokens)]
    : input.expressions === undefined
      ? [optionalText(input.expression, "", `${path}.expression`)]
      : optionalStringArray(input.expressions, [], `${path}.expressions`);
  const expressionVariables = ["x", ...dynamicNumbers.map(variableAlias)];
  const expressions = rawExpressions.map((expression, index) =>
    safeFunctionExpression(expression, "", expressionVariables, `${path}.expressions[${index}]`));
  const expression = expressions[0];
  if (!expression) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.expressions`, "at least one function expression is required");
  const curveLabels = input.curve_labels === undefined
    ? [] : optionalStringArray(input.curve_labels, [], `${path}.curve_labels`);
  if (curveLabels.length > 0 && curveLabels.length !== expressions.length) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.curve_labels`, "curve label count must equal expression count");
  }
  const number = dynamicTokens === undefined || dynamicNumbers.length === 0
    ? content.numbers?.[0]
    : undefined;
  const definition = number
    ? numberDefinition(plan, number, `${path}.numbers[0]`)
    : undefined;
  let requestedX = input.x_min !== undefined || input.x_max !== undefined
    ? {
        min: optionalNumber(input.x_min, -4, `${path}.x_min`),
        max: optionalNumber(input.x_max, 4, `${path}.x_max`),
      }
    : undefined;
  if (requestedX) assertRange(requestedX.min, requestedX.max, `${path}.x_range`);
  if (definition) {
    // The Lesson Plan describes what should be taught; the compiler owns the
    // mechanical viewport needed to make that teaching state visible. A model
    // should not spend another request merely copying a slider's numeric range
    // into plot axes.
    requestedX = {
      min: Math.min(requestedX?.min ?? definition.min, definition.min),
      max: Math.max(requestedX?.max ?? definition.max, definition.max),
    };
  }
  const parameterValues = numericCombinations(dynamicNumbers.map((numberIndex) => {
    const item = numberDefinition(plan, numberIndex, `${path}.numbers`);
    return {
      name: variableAlias(numberIndex),
      values: [item.min, (item.min + item.max) / 2, item.max],
    };
  }));
  const viewport = deterministicFunctionViewport(
    expressions,
    expressionVariables,
    parameterValues,
    requestedX,
    `${path}.expression`,
  );
  const requestedY = input.y_min !== undefined || input.y_max !== undefined
    ? {
        min: optionalNumber(input.y_min, viewport.y.min, `${path}.y_min`),
        max: optionalNumber(input.y_max, viewport.y.max, `${path}.y_max`),
      }
    : viewport.y;
  assertRange(requestedY.min, requestedY.max, `${path}.y_range`);
  const plotContent: Record<string, unknown> = {
    title: optionalText(input.title, "函数图像", `${path}.title`),
    axes: {
      x: { min: viewport.x.min, max: viewport.x.max, label: "x" },
      y: { min: requestedY.min, max: requestedY.max, label: "y" },
    },
    curves: expressions.map((item, index) => ({
      as: index === 0 ? "primary-curve" : `curve-${pad(index + 1)}`,
      expression: item,
      label: curveLabels[index]
        ?? (index === 0 ? optionalText(input.curve_label, `y = ${item}`, `${path}.curve_label`) : `y = ${item}`),
    })),
  };
  if (number && definition) {
    for (const x of [definition.min, definition.initial, definition.max]) {
      evaluate(expression, ["x"], { x }, `${path}.expression`);
    }
    const y = evaluate(expression, ["x"], { x: definition.initial }, `${path}.expression`);
    const variable = variableAlias(number);
    plotContent.points = [{ as: "moving-point", x: definition.initial, y, label: "P(x, y)" }];
    plotContent.bindings = [
      { target: "moving-point.x", expression: variable },
      { target: "moving-point.y", expression: replaceIdentifier(expression, "x", variable) },
    ];
  }
  return {
    actions: [{ do: "write", as: base, kind: "plot", role, content: plotContent, place: placement }],
    whole: base,
    parts: new Map([
      ["whole", base],
      ["primary_curve", `${base}#primary-curve`],
      ...(number ? [["moving_point", `${base}#moving-point`], ["primary_control", `${base}#moving-point`]] as Array<[string, string]> : []),
      ...(dynamicNumbers.length ? [["primary_control", `${base}#primary-curve`]] as Array<[string, string]> : []),
    ]),
  };
}

function compileUnitCircleProjection(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "projection"], path);
  const projection = input.projection === undefined ? "sin" : input.projection;
  if (projection !== "sin" && projection !== "cos") fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.projection`, "expected 'sin' or 'cos'");
  const number = content.numbers?.[0];
  const angleDefinition = number ? numberDefinition(plan, number, `${path}.numbers[0]`) : undefined;
  const angleScale = angleScaleForUnit(angleDefinition?.unit);
  const theta = (angleDefinition?.initial ?? Math.PI / 3) * angleScale;
  const variable = number ? variableAlias(number) : undefined;
  const angleExpression = variable ? scaledAngleExpression(variable, angleScale) : undefined;
  const circle = `${base}-circle`;
  const plot = `${base}-plot`;
  const link = `${base}-link`;
  const geometry: Record<string, unknown> = {
    title: optionalText(input.title, "单位圆与投影", `${path}.title`),
    axes: {
      x: { min: -1.25, max: 1.25, label: "x" },
      y: { min: -1.25, max: 1.25, label: "y" },
      equal_scale: true,
    },
    points: [
      { as: "origin", x: 0, y: 0, label: "O" },
      {
        as: "moving-point",
        x: Math.cos(theta),
        y: Math.sin(theta),
        label: "P(cos θ, sin θ)",
        ...(variable ? { interaction: { kind: "angle_control", variable, center: "origin" } } : {}),
      },
      { as: "projection-foot", x: Math.cos(theta), y: 0 },
    ],
    circles: [{ as: "unit-circle", center: "origin", radius: 1, label: "r = 1" }],
    segments: [
      { as: "radius", from: "origin", to: "moving-point", style: "solid" },
      { as: "projection", from: "moving-point", to: "projection-foot", style: "projection", label: "sin θ" },
    ],
    arcs: [{ as: "angle", center: "origin", radius: 0.28, start_angle: 0, end_angle: theta, label: "θ" }],
    ...(variable ? {
      bindings: [
        { target: "moving-point.x", expression: `cos(${angleExpression})` },
        { target: "moving-point.y", expression: `sin(${angleExpression})` },
        { target: "projection-foot.x", expression: `cos(${angleExpression})` },
        { target: "angle.end_angle", expression: angleExpression },
      ],
    } : {}),
  };
  const functionName = projection as "sin" | "cos";
  const plotAngleMin = angleDefinition ? angleDefinition.min * angleScale : 0;
  const plotAngleMax = angleDefinition ? angleDefinition.max * angleScale : Math.PI * 2;
  const plotContent: Record<string, unknown> = {
    title: `${functionName === "sin" ? "正弦" : "余弦"}函数图像`,
    axes: { x: { min: plotAngleMin, max: plotAngleMax, label: "θ" }, y: { min: -1.2, max: 1.2, label: "y" } },
    curves: [{ as: "primary-curve", expression: `${functionName}(x)`, label: `y = ${functionName}(x)` }],
    points: [{ as: "moving-point", x: theta, y: Math[functionName](theta), label: `P(θ, ${functionName}(θ))` }],
    ...(variable ? {
      bindings: [
        { target: "moving-point.x", expression: angleExpression },
        { target: "moving-point.y", expression: `${functionName}(${angleExpression})` },
      ],
    } : {}),
  };
  return {
    actions: [
      { do: "write", as: circle, kind: "geometry", role, content: geometry, place: placement },
      { do: "write", as: plot, kind: "plot", role, content: plotContent, place: { relation: "right_of", anchor: circle, gap: "normal" } },
      { do: "connect", as: link, from: circle, to: plot, relation: "maps_to", label: "旋转角与周期波动" },
      { do: "group", as: base, role, label: "单位圆与函数图像", members: [circle, plot] },
    ],
    whole: base,
    parts: new Map([
      ["whole", base],
      ["unit_circle", `${circle}#unit-circle`],
      ["moving_point", `${circle}#moving-point`],
      ["radius", `${circle}#radius`],
      ["projection_line", `${circle}#projection`],
      ["primary_curve", `${plot}#primary-curve`],
      ...(variable ? [["primary_control", `${circle}#moving-point`]] as Array<[string, string]> : []),
    ]),
  };
}

function compileCircleAndArc(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "radius", "angle"], path);
  const angleNumber = content.numbers?.[0];
  const radiusNumber = content.numbers?.[1];
  const angleDefinition = angleNumber ? numberDefinition(plan, angleNumber, `${path}.numbers[0]`) : undefined;
  const radiusDefinition = radiusNumber ? numberDefinition(plan, radiusNumber, `${path}.numbers[1]`) : undefined;
  const radius = radiusDefinition?.initial ?? optionalNumber(input.radius, 1, `${path}.radius`);
  if (radius <= 0) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.radius`, "radius must be positive");
  if (radiusDefinition && radiusDefinition.min <= 0) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.numbers[1]`, "a bound radius must stay positive");
  }
  const angleScale = angleScaleForUnit(angleDefinition?.unit);
  const angle = (angleDefinition?.initial ?? optionalNumber(input.angle, Math.PI / 3, `${path}.angle`)) * angleScale;
  const angleVariable = angleNumber ? variableAlias(angleNumber) : undefined;
  const radiusVariable = radiusNumber ? variableAlias(radiusNumber) : undefined;
  const angleExpression = angleVariable ? scaledAngleExpression(angleVariable, angleScale) : undefined;
  const radiusExpression = radiusVariable ?? String(radius);
  const maximumRadius = radiusDefinition
    ? Math.max(Math.abs(radiusDefinition.min), Math.abs(radiusDefinition.max))
    : radius;
  const geometry: Record<string, unknown> = {
    title: optionalText(input.title, "圆、圆心角与圆弧", `${path}.title`),
    axes: {
      x: { min: -maximumRadius * 1.25, max: maximumRadius * 1.25, label: "x" },
      y: { min: -maximumRadius * 1.25, max: maximumRadius * 1.25, label: "y" },
      equal_scale: true,
    },
    points: [
      { as: "center", x: 0, y: 0, label: "O" },
      {
        as: "moving-point",
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
        label: "P",
        ...(angleVariable ? { interaction: { kind: "angle_control", variable: angleVariable, center: "center" } } : {}),
      },
    ],
    circles: [{ as: "circle", center: "center", radius, label: radiusVariable ? "半径 r" : `r = ${radius}` }],
    segments: [{ as: "radius", from: "center", to: "moving-point", style: "solid" }],
    arcs: [{ as: "arc", center: "center", radius, start_angle: 0, end_angle: angle, label: "圆弧" }],
    ...((angleVariable || radiusVariable) ? {
      bindings: [
        ...(angleExpression ? [
          { target: "moving-point.x", expression: `${radiusExpression}*cos(${angleExpression})` },
          { target: "moving-point.y", expression: `${radiusExpression}*sin(${angleExpression})` },
          { target: "arc.end_angle", expression: angleExpression },
        ] : []),
        ...(radiusVariable ? [
          { target: "circle.radius", expression: radiusVariable },
          { target: "arc.radius", expression: radiusVariable },
        ] : []),
      ],
    } : {}),
  };
  return {
    actions: [{ do: "write", as: base, kind: "geometry", role, content: geometry, place: placement }],
    whole: base,
    parts: new Map([
      ["whole", base], ["circle", `${base}#circle`], ["arc", `${base}#arc`],
      ["radius", `${base}#radius`], ...(angleVariable ? [["primary_control", `${base}#moving-point`]] as Array<[string, string]> : []),
    ]),
  };
}

function compileSpringAndMass(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title"], path);
  const number = content.numbers?.[0];
  const phaseDefinition = number ? numberDefinition(plan, number, `${path}.numbers[0]`) : undefined;
  const phaseScale = angleScaleForUnit(phaseDefinition?.unit);
  const phase = (phaseDefinition?.initial ?? 0) * phaseScale;
  const variable = number ? variableAlias(number) : undefined;
  const phaseExpression = variable ? scaledAngleExpression(variable, phaseScale) : undefined;
  const motion = `${base}-motion`;
  const plot = `${base}-plot`;
  const plotPhaseMin = phaseDefinition ? phaseDefinition.min * phaseScale : 0;
  const plotPhaseMax = phaseDefinition ? phaseDefinition.max * phaseScale : Math.PI * 2;
  const geometry: Record<string, unknown> = {
    title: optionalText(input.title, "弹簧振子的往复运动", `${path}.title`),
    axes: { x: { min: -1.5, max: 1.5, label: "位移" }, y: { min: -0.6, max: 0.6 }, equal_scale: true },
    points: [
      { as: "anchor", x: -1.25, y: 0, label: "固定端" },
      { as: "equilibrium", x: 0, y: 0, label: "平衡位置" },
      { as: "mass", x: Math.cos(phase), y: 0, label: "物体" },
      { as: "force-tip", x: Math.cos(phase) * 0.5, y: 0, visible: false },
    ],
    segments: [
      { as: "spring", from: "anchor", to: "mass", style: "solid" },
      { as: "force-arrow", from: "mass", to: "force-tip", style: "solid", label: "回复力" },
    ],
    ...(variable ? {
      bindings: [
        { target: "mass.x", expression: `cos(${phaseExpression})` },
        { target: "force-tip.x", expression: `0.5*cos(${phaseExpression})` },
      ],
    } : {}),
  };
  const plotContent: Record<string, unknown> = {
    title: "位移随相位变化",
    axes: { x: { min: plotPhaseMin, max: plotPhaseMax, label: "相位" }, y: { min: -1.2, max: 1.2, label: "位移" } },
    curves: [{ as: "primary-curve", expression: "cos(x)", label: "x = cos(t)" }],
    points: [{ as: "moving-point", x: phase, y: Math.cos(phase), label: "当前状态" }],
    ...(variable ? {
      bindings: [
        { target: "moving-point.x", expression: phaseExpression },
        { target: "moving-point.y", expression: `cos(${phaseExpression})` },
      ],
    } : {}),
  };
  return {
    actions: [
      { do: "write", as: motion, kind: "geometry", role, content: geometry, place: placement },
      { do: "write", as: plot, kind: "plot", role, content: plotContent, place: { relation: "right_of", anchor: motion, gap: "normal" } },
      { do: "connect", as: `${base}-link`, from: motion, to: plot, relation: "same_state", label: "同一时刻的位移" },
      { do: "group", as: base, role, label: "弹簧运动与函数图像", members: [motion, plot] },
    ],
    whole: base,
    parts: new Map([
      ["whole", base], ["spring", `${motion}#spring`], ["mass", `${motion}#mass`],
      ["equilibrium", `${motion}#equilibrium`], ["force_arrow", `${motion}#force-arrow`],
      ["primary_curve", `${plot}#primary-curve`], ["moving_point", `${plot}#moving-point`],
      ...(variable ? [["primary_control", `${plot}#moving-point`]] as Array<[string, string]> : []),
    ]),
  };
}

function compileCubeWithSection(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title"], path);
  const number = content.numbers?.[0];
  const height = number ? numberDefinition(plan, number, `${path}.numbers[0]`).initial : 0;
  const variable = number ? variableAlias(number) : undefined;
  const sceneContent: Record<string, unknown> = {
    title: optionalText(input.title, "正方体、顶点、棱、面与截面", `${path}.title`),
    fallback: "一个中心在原点、边长为 2 的正方体，标出了顶点、棱、面和水平截面。",
    axes: true,
    camera: { ...LESSON_PLAN_SCENE_INITIAL_CAMERAS.cube_with_section },
    objects: [{
      as: "solid", kind: "box", label: "正方体", color: "teal",
      center: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 },
    }],
    sections: [{
      as: "section", axis: "z", value: height, targets: ["solid"],
      display: "plane_and_intersection", label: "水平截面", color: "orange",
    }],
    highlights: [
      { as: "vertex", kind: "point", points: [{ x: -1, y: -1, z: 1 }], label: "顶点", color: "red" },
      { as: "edge", kind: "edge", points: [{ x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }], label: "棱", color: "orange" },
      { as: "face", kind: "face", points: [{ x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }], label: "面", color: "purple" },
    ],
    ...(variable ? { bindings: [{ target: "section.value", expression: variable }] } : {}),
  };
  return {
    actions: [{ do: "write", as: base, kind: "scene3d", role, content: sceneContent, place: placement }],
    whole: base,
    primaryScene: base,
    parts: new Map([
      ["whole", base], ["solid", `${base}#solid`], ["vertex", `${base}#vertex`],
      ["edge", `${base}#edge`], ["face", `${base}#face`], ["section", `${base}#section`],
      ...(variable ? [["primary_control", `${base}#section`]] as Array<[string, string]> : []),
    ]),
  };
}

function compileFunctionSurface(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "expression", "x_min", "x_max", "y_min", "y_max", "samples", "section_axis"], path);
  const expression = safeFunctionExpression(input.expression, "x^2+y^2", ["x", "y"], `${path}.expression`);
  const xMin = optionalNumber(input.x_min, -2, `${path}.x_min`);
  const xMax = optionalNumber(input.x_max, 2, `${path}.x_max`);
  const yMin = optionalNumber(input.y_min, -2, `${path}.y_min`);
  const yMax = optionalNumber(input.y_max, 2, `${path}.y_max`);
  assertRange(xMin, xMax, `${path}.x_range`);
  assertRange(yMin, yMax, `${path}.y_range`);
  const samples = optionalInteger(input.samples, 12, 4, 24, `${path}.samples`);
  const axis = input.section_axis ?? "z";
  if (axis !== "x" && axis !== "y" && axis !== "z") fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.section_axis`, "expected x, y, or z");
  const number = content.numbers?.[0];
  const sectionValue = number ? numberDefinition(plan, number, `${path}.numbers[0]`).initial : 1;
  const variable = number ? variableAlias(number) : undefined;
  const sceneContent: Record<string, unknown> = {
    title: optionalText(input.title, "函数曲面与截面", `${path}.title`),
    fallback: `函数曲面 z=${expression} 与可变截面。`,
    axes: true,
    camera: { ...LESSON_PLAN_SCENE_INITIAL_CAMERAS.function_surface_with_section },
    objects: [{
      as: "surface", kind: "surface", label: `z=${expression}`, color: "teal", expression,
      x_range: { min: xMin, max: xMax }, y_range: { min: yMin, max: yMax }, samples,
    }],
    sections: [{
      as: "section", axis, value: sectionValue, targets: ["surface"],
      display: "plane_and_intersection", label: "截面", color: "orange",
    }],
    ...(variable ? { bindings: [{ target: "section.value", expression: variable }] } : {}),
  };
  return {
    actions: [{ do: "write", as: base, kind: "scene3d", role, content: sceneContent, place: placement }],
    whole: base,
    primaryScene: base,
    parts: new Map([
      ["whole", base], ["surface", `${base}#surface`], ["section", `${base}#section`],
      ["intersection", `${base}#section`], ...(variable ? [["primary_control", `${base}#section`]] as Array<[string, string]> : []),
    ]),
  };
}

function compileCoordinateCircle(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "center_x", "center_y", "radius"], path);
  const centerX = optionalNumber(input.center_x, 0, `${path}.center_x`);
  const centerY = optionalNumber(input.center_y, 0, `${path}.center_y`);
  const number = content.numbers?.[0];
  const radiusDefinition = number ? numberDefinition(plan, number, `${path}.numbers[0]`) : undefined;
  const radius = radiusDefinition?.initial ?? optionalNumber(input.radius, 1, `${path}.radius`);
  if (radius <= 0) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.radius`, "radius must be positive");
  if (radiusDefinition && radiusDefinition.min <= 0) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.numbers[0]`, "a bound radius must stay positive");
  }
  const variable = number ? variableAlias(number) : undefined;
  const maximumRadius = radiusDefinition
    ? Math.max(Math.abs(radiusDefinition.min), Math.abs(radiusDefinition.max))
    : radius;
  const extent = maximumRadius * 1.5;
  const geometry = {
    title: optionalText(input.title, "坐标系中的圆", `${path}.title`),
    axes: {
      x: { min: centerX - extent, max: centerX + extent, label: "x" },
      y: { min: centerY - extent, max: centerY + extent, label: "y" },
      equal_scale: true,
    },
    points: [{ as: "center", x: centerX, y: centerY, label: `(${centerX}, ${centerY})` }],
    circles: [{ as: "circle", center: "center", radius, label: variable ? "半径 r" : `r = ${radius}` }],
    ...(variable ? { bindings: [{ target: "circle.radius", expression: variable }] } : {}),
  };
  return {
    actions: [{ do: "write", as: base, kind: "geometry", role, content: geometry, place: placement }],
    whole: base,
    parts: new Map([
      ["whole", base], ["circle", `${base}#circle`], ["center", `${base}#center`],
      ["radius", `${base}#circle`], ...(variable ? [["primary_control", `${base}#circle`]] as Array<[string, string]> : []),
    ]),
  };
}

type RigidPose = { x: number; y: number; angle?: number };
type RigidPiece = {
  points: Array<[number, number]>;
  start: RigidPose;
  end: RigidPose;
  label: string;
  tone: "primary" | "secondary" | "accent" | "neutral";
};
type RearrangementRecipe = {
  title: string;
  relation: string;
  target: Array<[number, number]>;
  pieces: RigidPiece[];
};

function rearrangementRecipe(
  construction: unknown,
  first: number,
  second: number,
  path: string,
): RearrangementRecipe {
  if (!LESSON_PLAN_CAPABILITY_REGISTRY.geometric_rearrangement.parameter_options.construction
    .includes(construction as never)) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.construction`, "unsupported geometric construction");
  }
  const gap = Math.max(first, second) * 0.35;
  if (construction === "right_triangle_square") {
    const side = first + second;
    return {
      title: "直角三角形重排与面积关系",
      relation: "c² = a² + b²",
      target: [[0, 0], [side, 0], [side, side], [0, side]],
      pieces: [
        { points: [[0, 0], [first, 0], [0, second]], start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, label: "三角形 1", tone: "primary" },
        { points: [[0, 0], [0, first], [-second, 0]], start: { x: side, y: 0 }, end: { x: side, y: second }, label: "三角形 2", tone: "secondary" },
        { points: [[0, 0], [-first, 0], [0, -second]], start: { x: side, y: side }, end: { x: first, y: second }, label: "三角形 3", tone: "accent" },
        { points: [[0, 0], [0, -first], [second, 0]], start: { x: 0, y: side }, end: { x: first, y: side }, label: "三角形 4", tone: "neutral" },
      ],
    };
  }
  if (construction === "square_area_identity") {
    const side = first + second;
    return {
      title: "正方形分块与面积恒等式",
      relation: "(a+b)² = a² + 2ab + b²",
      target: [[0, 0], [side, 0], [side, side], [0, side]],
      pieces: [
        { points: [[0, 0], [first, 0], [first, first], [0, first]], start: { x: -first - gap, y: 0 }, end: { x: 0, y: 0 }, label: "a²", tone: "primary" },
        { points: [[0, 0], [second, 0], [second, first], [0, first]], start: { x: first + gap, y: 0 }, end: { x: first, y: 0 }, label: "ab", tone: "secondary" },
        { points: [[0, 0], [first, 0], [first, second], [0, second]], start: { x: 0, y: side + gap }, end: { x: 0, y: first }, label: "ab", tone: "accent" },
        { points: [[0, 0], [second, 0], [second, second], [0, second]], start: { x: side + gap, y: side + gap }, end: { x: first, y: first }, label: "b²", tone: "neutral" },
      ],
    };
  }
  if (construction === "triangle_to_rectangle") {
    return {
      title: "两个全等三角形拼成长方形",
      relation: "S△ = ab / 2",
      target: [[0, 0], [first, 0], [first, second], [0, second]],
      pieces: [
        { points: [[0, 0], [first, 0], [0, second]], start: { x: -first - gap, y: 0 }, end: { x: 0, y: 0 }, label: "三角形 1", tone: "primary" },
        { points: [[0, 0], [first, 0], [0, second]], start: { x: first + gap, y: 0 }, end: { x: first, y: second, angle: Math.PI }, label: "三角形 2", tone: "accent" },
      ],
    };
  }
  fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.construction`, "unsupported geometric construction");
}

function transformedPoint(point: [number, number], pose: RigidPose): [number, number] {
  const angle = pose.angle ?? 0;
  return [
    pose.x + point[0] * Math.cos(angle) - point[1] * Math.sin(angle),
    pose.y + point[0] * Math.sin(angle) + point[1] * Math.cos(angle),
  ];
}

function linearExpression(start: number, end: number, progress: string): string {
  return `${start}+(${end - start})*(${progress})`;
}

function compileGeometricRearrangement(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "construction", "leg_a", "leg_b"], path);
  const construction = input.construction ?? "right_triangle_square";
  const legA = optionalNumber(input.leg_a, 3, `${path}.leg_a`);
  const legB = optionalNumber(input.leg_b, 2, `${path}.leg_b`);
  if (legA <= 0 || legB <= 0) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, "triangle legs must be positive");
  }
  const number = content.numbers?.[0];
  const progressDefinition = number ? numberDefinition(plan, number, `${path}.numbers[0]`) : undefined;
  const progressVariable = number ? variableAlias(number) : undefined;
  const progressExpression = progressDefinition && progressVariable
    ? `((${progressVariable})-(${progressDefinition.min}))/((${progressDefinition.max})-(${progressDefinition.min}))`
    : "0";
  const recipe = rearrangementRecipe(construction, legA, legB, path);
  const progressInitial = progressDefinition
    ? (progressDefinition.initial - progressDefinition.min) / (progressDefinition.max - progressDefinition.min)
    : 0;
  const pieces = recipe.pieces.map((piece, index) => ({ ...piece, role: `piece-${index + 1}` }));
  const targetPoints = recipe.target.map(([x, y], index) => ({
    as: `target-point-${index + 1}`, x, y, visible: false,
  }));
  const points = [
    ...targetPoints,
    ...pieces.flatMap((piece) => {
      const pose = {
        x: piece.start.x + (piece.end.x - piece.start.x) * progressInitial,
        y: piece.start.y + (piece.end.y - piece.start.y) * progressInitial,
        angle: (piece.start.angle ?? 0) + ((piece.end.angle ?? 0) - (piece.start.angle ?? 0)) * progressInitial,
      };
      return piece.points.map((point, pointIndex) => {
        const [x, y] = transformedPoint(point, pose);
        return { as: `${piece.role}-point-${pointIndex + 1}`, x, y, visible: false };
      });
    }),
  ];
  const polygons = [
    {
      as: "target-shape",
      points: targetPoints.map((point) => point.as),
      tone: "neutral",
    },
    ...pieces.map((piece) => ({
      as: piece.role,
      points: piece.points.map((_point, index) => `${piece.role}-point-${index + 1}`),
      label: piece.label,
      tone: piece.tone,
    })),
  ];
  const segments = [
    ...recipe.target.map((_point, pointIndex) => ({
      as: `target-edge-${pointIndex + 1}`,
      from: `target-point-${pointIndex + 1}`,
      to: `target-point-${(pointIndex + 1) % recipe.target.length + 1}`,
      style: "dashed",
      ...(pointIndex === 0 ? { label: recipe.relation } : {}),
    })),
  ];
  const bindings = progressVariable
    ? pieces.flatMap((piece) => piece.points.flatMap(([localX, localY], pointIndex) => {
        const translateX = linearExpression(piece.start.x, piece.end.x, progressExpression);
        const translateY = linearExpression(piece.start.y, piece.end.y, progressExpression);
        const angle = linearExpression(piece.start.angle ?? 0, piece.end.angle ?? 0, progressExpression);
        const target = `${piece.role}-point-${pointIndex + 1}`;
        return [
          { target: `${target}.x`, expression: `(${translateX})+(${localX})*cos(${angle})-(${localY})*sin(${angle})` },
          { target: `${target}.y`, expression: `(${translateY})+(${localX})*sin(${angle})+(${localY})*cos(${angle})` },
        ];
      }))
    : [];
  const endpointPoints = [
    ...recipe.target,
    ...pieces.flatMap((piece) => [piece.start, piece.end].flatMap((pose) => (
      piece.points.map((point) => transformedPoint(point, pose))
    ))),
  ];
  const xs = endpointPoints.map((point) => point[0]);
  const ys = endpointPoints.map((point) => point[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const margin = span * 0.1;
  const geometry = {
    title: optionalText(input.title, recipe.title, `${path}.title`),
    axes: {
      x: { min: Math.min(...xs) - margin, max: Math.max(...xs) + margin },
      y: { min: Math.min(...ys) - margin, max: Math.max(...ys) + margin },
      equal_scale: true,
    },
    points,
    polygons,
    segments,
    ...(bindings.length ? { bindings } : {}),
  };
  return {
    actions: [{ do: "write", as: base, kind: "geometry", role, content: geometry, place: placement }],
    whole: base,
    parts: new Map([
      ["whole", base], ["target_shape", `${base}#target-shape`], ["outer_square", `${base}#target-shape`],
      ...pieces.map((piece, index) => [`piece_${index + 1}`, `${base}#${piece.role}`] as [string, string]),
      ["central_area", `${base}#target-shape`],
      ...(progressVariable ? [["primary_control", base]] as Array<[string, string]> : []),
    ]),
  };
}

function compileProcessDiagram(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  _plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "steps"], path);
  const steps = optionalStringArray(input.steps, ["开始", "观察变化", "得到结论"], `${path}.steps`);
  const elements = steps.map((label, index) => ({ as: `step-${pad(index + 1)}`, label }));
  const edges = steps.slice(1).map((_label, index) => ({
    as: `edge-${pad(index + 1)}`,
    from: `step-${pad(index + 1)}`,
    to: `step-${pad(index + 2)}`,
    label: "下一步",
  }));
  const first = `${base}#step-01`;
  const last = `${base}#step-${pad(steps.length)}`;
  const current = `${base}#step-${pad(Math.min(2, steps.length))}`;
  return {
    actions: [{
      do: "write", as: base, kind: "diagram", role,
      content: { title: optionalText(input.title, "过程图", `${path}.title`), elements, edges },
      place: placement,
    }],
    whole: base,
    parts: new Map([["whole", base], ["first_step", first], ["current_step", current], ["last_step", last]]),
  };
}

type VisualCompiler = (
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
) => CompiledVisual;

const VISUAL_COMPILERS = {
  function_plot: compileFunctionPlot,
  unit_circle_projection: compileUnitCircleProjection,
  circle_and_arc: compileCircleAndArc,
  spring_and_mass: compileSpringAndMass,
  cube_with_section: compileCubeWithSection,
  function_surface_with_section: compileFunctionSurface,
  coordinate_circle: compileCoordinateCircle,
  geometric_rearrangement: compileGeometricRearrangement,
  process_diagram: compileProcessDiagram,
} satisfies Record<LessonPlanVisualContent["capability"], VisualCompiler>;

function intersectProgramRange(
  definition: NonNullable<LessonPlan["numbers"]>[number],
  allowedMin: number,
  allowedMax: number,
): void {
  let min = Math.max(definition.min, allowedMin);
  let max = Math.min(definition.max, allowedMax);
  if (!(min < max)) {
    min = allowedMin;
    max = allowedMax;
  }
  definition.min = min;
  definition.max = max;
  definition.initial = Math.min(max, Math.max(min, definition.initial));
  if (definition.student_control) definition.student_control.step = (max - min) / 200;
}

function positiveProgramRange(definition: NonNullable<LessonPlan["numbers"]>[number]): void {
  if (definition.max <= 0) {
    definition.min = 0.1;
    definition.max = 5;
    definition.initial = 1;
  } else {
    const positiveMinimum = Math.max(1e-6, definition.max / 1_000);
    definition.min = Math.max(definition.min, positiveMinimum);
    if (!(definition.min < definition.max)) definition.min = Math.max(1e-6, definition.max / 200);
    definition.initial = Math.min(definition.max, Math.max(definition.min, definition.initial));
  }
  if (definition.student_control) {
    definition.student_control.step = (definition.max - definition.min) / 200;
  }
}

function surfaceSectionProgramRange(content: LessonPlanVisualContent, path: string): { min: number; max: number } {
  const input = parameters(content);
  const xMin = optionalNumber(input.x_min, -2, `${path}.x_min`);
  const xMax = optionalNumber(input.x_max, 2, `${path}.x_max`);
  const yMin = optionalNumber(input.y_min, -2, `${path}.y_min`);
  const yMax = optionalNumber(input.y_max, 2, `${path}.y_max`);
  assertRange(xMin, xMax, `${path}.x_range`);
  assertRange(yMin, yMax, `${path}.y_range`);
  const axis = input.section_axis ?? "z";
  if (axis === "x") return { min: xMin, max: xMax };
  if (axis === "y") return { min: yMin, max: yMax };
  const expression = safeFunctionExpression(input.expression, "x^2+y^2", ["x", "y"], `${path}.expression`);
  const evaluateSurface = compileMathExpression(expression, ["x", "y"]);
  const values: number[] = [];
  for (let xIndex = 0; xIndex <= 20; xIndex += 1) {
    const x = xMin + (xMax - xMin) * xIndex / 20;
    for (let yIndex = 0; yIndex <= 20; yIndex += 1) {
      const y = yMin + (yMax - yMin) * yIndex / 20;
      try {
        const z = evaluateSurface({ x, y });
        if (Number.isFinite(z) && Math.abs(z) <= 1e12) values.push(z);
      } catch {
        // The visual compiler will report an unusable expression if no stable
        // finite section range can be found.
      }
    }
  }
  if (values.length < 8) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.expression`, "surface has no stable finite section range");
  }
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Apply physical and rendering constraints after the model-authored teaching
 * plan has been resolved, but before OLL variables, animations, and tasks are
 * emitted. The model may request a useful teaching range; installed
 * capabilities own the executable range that can actually affect a visual.
 */
function normalizeProgramOwnedNumberRanges(plan: LessonPlan): void {
  const constrained = new Set<number>();
  for (const [sectionIndex, section] of plan.sections.entries()) {
    for (const [momentIndex, moment] of section.moments.entries()) {
      for (const [actionIndex, action] of moment.actions.entries()) {
        if ((action.action !== "create" && action.action !== "revise")
          || action.kind !== "visual") continue;
        const content = action.content as LessonPlanVisualContent;
        const policies = LESSON_PLAN_CAPABILITY_REGISTRY[content.capability].number_input_policies;
        for (const [inputIndex, numberIndex] of (content.numbers ?? []).entries()) {
          const definition = plan.numbers?.[numberIndex - 1];
          const policy = policies[inputIndex];
          if (!definition || !policy) continue;
          const path = `$lessonPlan.sections[${sectionIndex}].moments[${momentIndex}].actions[${actionIndex}].content.parameters`;
          if (policy.kind === "bounded") {
            intersectProgramRange(definition, policy.min, policy.max);
            constrained.add(numberIndex);
          } else if (policy.kind === "positive") {
            positiveProgramRange(definition);
            constrained.add(numberIndex);
          } else if (policy.kind === "surface_section") {
            const allowed = surfaceSectionProgramRange(content, path);
            if (allowed.min < allowed.max) {
              intersectProgramRange(definition, allowed.min, allowed.max);
              constrained.add(numberIndex);
            }
          }
        }
      }
    }
  }
  if (constrained.size === 0) return;
  for (const section of plan.sections) {
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (action.action !== "animate" || !constrained.has(action.number)) continue;
        const definition = plan.numbers![action.number - 1]!;
        action.end_value = Math.min(definition.max, Math.max(definition.min, action.end_value));
      }
    }
    for (const activity of section.student_activities ?? []) {
      if (activity.kind !== "number_target") continue;
      const number = activity.number_controls[0]?.number;
      if (!number || !constrained.has(number)) continue;
      const definition = plan.numbers![number - 1]!;
      const original = activity.value;
      activity.value = Math.min(definition.max, Math.max(definition.min, activity.value));
      activity.tolerance = Math.max(
        (definition.student_control?.step ?? (definition.max - definition.min) / 200) / 2,
        (definition.max - definition.min) / 1_000,
        1e-6,
      );
      if (activity.value !== original) {
        const value = Number(activity.value.toPrecision(12));
        const label = definition.label?.trim() || "数值";
        const unit = definition.unit?.trim();
        activity.prompt = `请把${label}调到 ${value}${unit ? ` ${unit}` : ""}。`;
        activity.success_message = `完成，${label}已经调到 ${value}${unit ? ` ${unit}` : ""}。`;
      }
    }
  }
}

function compileVisual(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  if ((content.numbers?.length ?? 0) > LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[content.capability]) {
    fail(
      "LESSON_PLAN_COMPILER_CONTROL_LIMIT",
      `${path}.numbers`,
      `'${content.capability}' supports at most ${LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[content.capability]} numeric inputs`,
    );
  }
  const compiler = VISUAL_COMPILERS[content.capability];
  if (!compiler) fail("LESSON_PLAN_COMPILER_CAPABILITY", path, `no compiler is registered for '${String(content.capability)}'`);
  return compiler(base, content, role, placement, plan, path);
}

function compilePlainContent(
  kind: Exclude<LessonPlanBoardKind, "visual">,
  content: LessonPlanBoardContent,
  options: CompileLessonPlanOptions,
  path: string,
): Record<string, unknown> {
  if (kind === "text" || kind === "shape") return { text: (content as { text: string }).text };
  if (kind === "math") return { latex: (content as { latex: string }).latex };
  if (kind === "note") {
    const note = content as { title: string; items: string[] };
    return { title: note.title, items: [...note.items] };
  }
  if (kind === "table") {
    const table = content as { columns: string[]; rows: Array<Array<string | number>> };
    return { columns: [...table.columns], rows: table.rows.map((row) => [...row]) };
  }
  if (kind === "image") {
    const image = content as { resource: number; alt?: string };
    const resource = options.image_resources?.[image.resource - 1];
    if (!resource) fail("LESSON_PLAN_IMAGE_RESOURCE", `${path}.resource`, "image resource is unavailable");
    return { asset_id: resource.asset_id, ...(image.alt ? { alt: image.alt } : {}) };
  }
  fail("LESSON_PLAN_COMPILER", path, `unsupported plain board kind '${kind}'`);
}

export function compileLessonPlan(value: unknown, options: CompileLessonPlanOptions = {}): CompiledLessonPlan {
  const resolved = resolveLessonPlan(value, options);
  const plan = resolved.plan;
  normalizeProgramOwnedNumberRanges(plan);
  mergeEquivalentVisualInputs(plan);
  const resolvedReferences = new Map(resolved.references.map((item) => [item.path, item]));
  const wholeTargets = new Map<string, string>();
  const partTargets = new Map<string, Map<string, string>>();
  const primaryScenes = new Map<string, string>();
  const reusableVisuals = new Map<string, CompiledVisual>();

  const resolvedReference = (path: string): ResolvedLessonPlanReference => {
    const item = resolvedReferences.get(path);
    if (!item) fail("LESSON_PLAN_COMPILER_REFERENCE", path, "validated reference was not recorded");
    return item;
  };
  const reference = (path: string): string => {
    const item = resolvedReference(path);
    if (!item.part) return wholeTargets.get(item.authoring_alias) ?? item.authoring_alias;
    if (item.part.kind === "capability") {
      const result = partTargets.get(item.authoring_alias)?.get(item.part.role);
      if (!result) fail("LESSON_PLAN_COMPILER_REFERENCE", path, `capability part '${item.part.role}' was not produced`);
      return result;
    }
    if (item.part.kind === "index") return `${item.authoring_alias}#part-${pad(item.part.index)}`;
    fail("LESSON_PLAN_COMPILER_REFERENCE", path, "unsupported reference part");
  };

  const steps: AuthoringLesson["steps"] = [];
  plan.sections.forEach((section, sectionOffset) => {
    const sectionIndex = sectionOffset + 1;
    const sectionPath = `$lessonPlan.sections[${sectionOffset}]`;
    const beats: AuthoringLesson["steps"][number]["beats"] = [];
    section.moments.forEach((moment, momentOffset) => {
      const momentIndex = momentOffset + 1;
      const momentPath = `${sectionPath}.moments[${momentOffset}]`;
      const actions: AuthoringAction[] = [];
      let boardItemIndex = 0;
      let connectionIndex = 0;
      let groupIndex = 0;
      moment.actions.forEach((item, actionOffset) => {
        const actionPath = `${momentPath}.actions[${actionOffset}]`;
        if (item.action === "create") {
          boardItemIndex += 1;
          const alias = `section-${pad(sectionIndex)}-moment-${pad(momentIndex)}-item-${pad(boardItemIndex)}`;
          const placement = place(item.placement, `${actionPath}.placement`, reference);
          if (item.kind === "visual") {
            const visualContent = item.content as LessonPlanVisualContent;
            const identity = normalizedVisualIdentity(visualContent);
            const existing = reusableVisuals.get(identity);
            if (item.distinct_visual && existing) {
              fail(
                "LESSON_PLAN_COURSE_VISUAL",
                `${actionPath}.content.parameters`,
                "an explicit comparison must differ in teaching content, not only in title, viewport, camera, color, sampling, or layout",
              );
            }
            const visual = existing
              ?? compileVisual(alias, visualContent, item.role, placement, plan, `${actionPath}.content.parameters`);
            if (existing) {
              actions.push({
                do: "focus",
                targets: [existing.whole],
                intent: "继续观察已有的同一画面",
                ...actionWhen(item.timing),
              });
            } else {
              reusableVisuals.set(identity, visual);
              actions.push(...visual.actions.map((action) => ({ ...action, ...actionWhen(item.timing) })));
            }
            wholeTargets.set(alias, visual.whole);
            partTargets.set(alias, visual.parts);
            if (visual.primaryScene) primaryScenes.set(alias, visual.primaryScene);
          } else {
            actions.push({
              do: "write",
              as: alias,
              kind: item.kind,
              role: item.role,
              content: compilePlainContent(item.kind, item.content, options, `${actionPath}.content`),
              place: placement,
              ...actionWhen(item.timing),
            });
            wholeTargets.set(alias, alias);
          }
        } else if (item.action === "revise") {
          const target = reference(`${actionPath}.reference`);
          if (item.kind === "visual" || (item.content as LessonPlanVisualContent).capability) {
            fail("LESSON_PLAN_COMPILER_UNSUPPORTED_REVISION", `${actionPath}.content`, "visual capability revision is not in the first compiler batch");
          }
          const content = item.content as LessonPlanBoardContent;
          actions.push({
            do: "revise", target,
            content: compilePlainContent(item.kind, content, options, `${actionPath}.content`),
            reason: item.reason, ...actionWhen(item.timing),
          });
        } else if (item.action === "emphasize") {
          actions.push({ do: "emphasize", target: reference(`${actionPath}.reference`), emphasis: item.emphasis, ...actionWhen(item.timing) });
        } else if (item.action === "connect") {
          connectionIndex += 1;
          const alias = `section-${pad(sectionIndex)}-moment-${pad(momentIndex)}-connection-${pad(connectionIndex)}`;
          actions.push({
            do: "connect", as: alias,
            from: reference(`${actionPath}.from_ref`),
            to: reference(`${actionPath}.to_ref`),
            relation: item.relation,
            ...(item.label ? { label: item.label } : {}),
            ...actionWhen(item.timing),
          });
          wholeTargets.set(alias, alias);
        } else if (item.action === "group") {
          groupIndex += 1;
          const alias = `section-${pad(sectionIndex)}-moment-${pad(momentIndex)}-group-${pad(groupIndex)}`;
          actions.push({
            do: "group", as: alias, role: item.role, label: item.label,
            members: item.members.map((_member, index) => reference(`${actionPath}.members[${index}]`)),
            ...actionWhen(item.timing),
          });
          wholeTargets.set(alias, alias);
        } else if (item.action === "focus") {
          actions.push({
            do: "focus",
            targets: item.references.map((_item, index) => reference(`${actionPath}.references[${index}]`)),
            intent: item.intent,
            ...actionWhen(item.timing),
          });
        } else if (item.action === "point_at") {
          actions.push({ do: "point", target: reference(`${actionPath}.reference`), ...actionWhen(item.timing) });
        } else if (item.action === "teacher_expression") {
          actions.push({ do: "expression", expression: item.expression, ...actionWhen(item.timing) });
        } else {
          actions.push({
            do: "animate", variable: variableAlias(item.number), value: item.end_value,
            ...(item.easing ? { easing: item.easing } : {}),
            ...(item.duration_intent ? { duration_intent: item.duration_intent } : {}),
            ...actionWhen(item.timing),
          });
        }
      });
      if (actions.length === 0) {
        fail("LESSON_PLAN_COMPILER_EMPTY_BEAT", `${momentPath}.actions`, "OLL requires at least one action per moment");
      }
      beats.push({
        key: `moment-${pad(momentIndex)}`,
        ...(moment.narration ? { say: moment.narration } : {}),
        ...(moment.delivery ? { delivery: moment.delivery } : {}),
        actions,
      });
    });
    steps.push({ key: `section-${pad(sectionIndex)}`, purpose: section.purpose, beats });
  });

  const tasks: NonNullable<AuthoringLesson["lesson"]["tasks"]> = [];
  const seenTaskSemantics = new Set<string>();
  const addTask = (task: NonNullable<AuthoringLesson["lesson"]["tasks"]>[number]): void => {
    const semanticKey = JSON.stringify({
      allowed_operations: task.allowed_operations,
      completion: task.completion,
    });
    if (seenTaskSemantics.has(semanticKey)) return;
    seenTaskSemantics.add(semanticKey);
    tasks.push(task);
  };
  plan.sections.forEach((section, sectionOffset) => {
    const sectionPath = `$lessonPlan.sections[${sectionOffset}]`;
    section.student_activities?.forEach((activity, activityOffset) => {
      const activityPath = `${sectionPath}.student_activities[${activityOffset}]`;
      const common = {
        as: `section-${pad(sectionOffset + 1)}-task-${pad(activityOffset + 1)}`,
        prompt: activity.prompt,
        availability: { kind: "after_lesson" as const },
        hints: [...activity.hints],
        ...(activity.hint_after_attempts ? { hint_after_attempts: activity.hint_after_attempts } : {}),
        ...(activity.success_message ? { success_message: activity.success_message } : {}),
      };
      if (activity.kind === "number_target") {
        const firstNumber = activity.number_controls[0]?.number;
        if (!firstNumber) fail("LESSON_PLAN_ACTIVITY", `${activityPath}.number_controls`, "number task requires controls");
        addTask({
          ...common,
          allowed_operations: activity.number_controls.map((control) => ({
            kind: "variable_change" as const,
            variable: variableAlias(control.number),
            controls: [...control.controls],
          })),
          completion: {
            kind: "expression_target",
            expression: activity.expression ? mathExpressionToOll(activity.expression) : variableAlias(firstNumber),
            value: activity.value,
            tolerance: activity.tolerance,
          },
        });
      } else {
        const resolvedTarget = resolvedReference(`${activityPath}.reference`);
        const node = primaryScenes.get(resolvedTarget.authoring_alias)
          ?? wholeTargets.get(resolvedTarget.authoring_alias)
          ?? resolvedTarget.authoring_alias;
        addTask({
          ...common,
          allowed_operations: [{ kind: "scene3d_view", node, controls: [...activity.controls] }],
          completion: {
            kind: "scene3d_view_target", node, match: activity.match,
            yaw: activity.yaw, pitch: activity.pitch, zoom: activity.zoom,
            angular_tolerance: activity.angular_tolerance, zoom_tolerance: activity.zoom_tolerance,
          },
        });
      }
    });
  });

  const hostReferences = options.host_references ?? [];
  if (hostReferences.length > 0 && !options.board_context) {
    fail("LESSON_PLAN_BOARD_CONTEXT", "$options.board_context", "host references require board context");
  }
  const closeFocus = plan.close.focus.map((_item, index) => reference(`$lessonPlan.close.focus[${index}]`));
  const lesson: AuthoringLesson = {
    dsl: "octos.lesson",
    version: "0.1",
    profile: "authoring",
    ...(options.board_context ? {
      board_context: {
        board_id: options.board_context.board_id,
        revision: options.board_context.revision,
        references: hostReferences.map((host: LessonPlanHostReference, index) => ({
          as: `host-${pad(index + 1)}`,
          type: host.type,
          target_id: host.target_id,
          ...(host.label ? { label: host.label } : {}),
          fragments: (host.parts ?? []).map((targetId, partOffset) => ({
            as: `part-${pad(partOffset + 1)}`,
            target_id: targetId,
          })),
        })),
      },
    } : {}),
    lesson: {
      mode: "explain",
      language: options.language ?? "zh-CN",
      title: plan.title,
      goals: [...plan.goals],
      ...((plan.teaching_strategies?.length ?? 0) > 0 || (options.adaptation_context_refs?.length ?? 0) > 0 ? {
        adaptation: {
          ...(plan.teaching_strategies?.length ? { strategies: [...plan.teaching_strategies] } : {}),
          ...(options.adaptation_context_refs?.length ? { context_refs: [...options.adaptation_context_refs] } : {}),
        },
      } : {}),
      ...(plan.numbers?.length ? {
        variables: plan.numbers.map((number, index) => ({
          as: variableAlias(index + 1), initial: number.initial, min: number.min, max: number.max,
          ...(number.label ? { label: number.label } : {}),
          ...(number.unit ? { unit: number.unit } : {}),
          ...(number.student_control ? {
            control: {
              kind: "slider" as const,
              ...(number.student_control.step ? { step: number.student_control.step } : {}),
            },
          } : {}),
        })),
      } : {}),
      ...(tasks.length ? { tasks } : {}),
    },
    steps,
    close: { summary: plan.close.summary, focus: closeFocus },
  };
  return { lesson, resolved };
}

function expressionReferencesVariable(expression: unknown, variable: string): boolean {
  if (typeof expression !== "string") return false;
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`, "u").test(expression);
}

/**
 * Verify the compiler's output rather than trusting a capability declaration.
 * Every exposed, animated, or task-controlled number must occur in a real
 * visual expression: a geometry/3D binding or a plot curve expression.
 */
function validateCompiledVisualEffects(lesson: AuthoringLesson): void {
  const required = new Map<string, string>();
  (lesson.lesson.variables ?? []).forEach((variable, index) => {
    if (variable.control) required.set(variable.as, `$lesson.lesson.variables[${index}]`);
  });
  lesson.steps.forEach((step, stepIndex) => step.beats.forEach((beat, beatIndex) => {
    beat.actions.forEach((action, actionIndex) => {
      if (action.do === "animate") {
        required.set(action.variable, `$lesson.steps[${stepIndex}].beats[${beatIndex}].actions[${actionIndex}].variable`);
      }
    });
  }));
  (lesson.lesson.tasks ?? []).forEach((task, taskIndex) => {
    task.allowed_operations.forEach((operation, operationIndex) => {
      if (operation.kind === "variable_change") {
        required.set(operation.variable, `$lesson.lesson.tasks[${taskIndex}].allowed_operations[${operationIndex}].variable`);
      }
    });
  });
  if (required.size === 0) return;

  const visualExpressions: unknown[] = [];
  lesson.steps.forEach((step) => step.beats.forEach((beat) => beat.actions.forEach((action) => {
    if (action.do !== "write" || !["geometry", "plot", "scene3d"].includes(action.kind)) return;
    const content = action.content as Record<string, unknown>;
    const bindings = Array.isArray(content.bindings) ? content.bindings : [];
    bindings.forEach((binding) => {
      if (binding && typeof binding === "object" && !Array.isArray(binding)) {
        visualExpressions.push((binding as Record<string, unknown>).expression);
      }
    });
    if (action.kind === "plot") {
      const curves = Array.isArray(content.curves) ? content.curves : [];
      curves.forEach((curve) => {
        if (curve && typeof curve === "object" && !Array.isArray(curve)) {
          visualExpressions.push((curve as Record<string, unknown>).expression);
        }
      });
    }
  })));

  for (const [variable, path] of required) {
    const matchingExpressions = visualExpressions.filter((expression) => (
      expressionReferencesVariable(expression, variable)
    ));
    if (matchingExpressions.length === 0) {
      fail(
        "LESSON_PLAN_COMPILED_NO_EFFECT",
        path,
        `numeric control '${variable}' does not affect any compiled visual`,
      );
    }

    const definitions = lesson.lesson.variables ?? [];
    const definition = definitions.find((candidate) => candidate.as === variable);
    if (!definition) continue;
    const aliases = [...new Set([...definitions.map((candidate) => candidate.as), "x", "y", "z"])];
    const baseValues = Object.fromEntries(definitions.map((candidate) => [candidate.as, candidate.initial]));
    const samples = [definition.min, (definition.min + definition.max) / 2, definition.max];
    const coordinates = [
      { x: -1, y: -1, z: -1 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
      { x: 2, y: -0.5, z: 0.5 },
    ];
    const changes = matchingExpressions.some((expression) => {
      if (typeof expression !== "string") return false;
      let evaluateExpression: ReturnType<typeof compileMathExpression>;
      try {
        evaluateExpression = compileMathExpression(expression, aliases);
      } catch {
        return false;
      }
      return coordinates.some((coordinate) => {
        const results = samples.map((sample) => {
          try {
            return evaluateExpression({ ...baseValues, ...coordinate, [variable]: sample });
          } catch {
            return Number.NaN;
          }
        }).filter(Number.isFinite);
        if (results.length < 2) return false;
        const spread = Math.max(...results) - Math.min(...results);
        const scale = Math.max(1, ...results.map((result) => Math.abs(result)));
        return spread > scale * 1e-9;
      });
    });
    if (!changes) {
      fail(
        "LESSON_PLAN_COMPILED_NO_EFFECT",
        path,
        `numeric control '${variable}' is mentioned but does not change any compiled visual across its range`,
      );
    }
  }
}

export function compileAndValidateLessonPlan(value: unknown, options: CompileLessonPlanOptions = {}): CompiledLessonPlan {
  const compiled = compileLessonPlan(value, options);
  validateCompiledVisualEffects(compiled.lesson);
  const schemaResult = validateAuthoringSchema(compiled.lesson);
  if (!schemaResult.valid) {
    const first = schemaResult.errors[0];
    fail("LESSON_PLAN_OLL_SCHEMA", first?.instancePath ?? "$lesson", first?.message ?? "compiled OLL failed schema validation");
  }
  const resourceContext: ResourceContext = {
    assets: (options.image_resources ?? []).map((resource) => ({ asset_id: resource.asset_id })),
  };
  try {
    validateAuthoringLesson(compiled.lesson, resourceContext);
    const events = normalizeAuthoringLesson(compiled.lesson, {
      lessonId: options.validation_host?.lesson_id ?? "lesson-plan-validation",
      boardId: options.validation_host?.board_id ?? options.board_context?.board_id ?? "lesson-plan-board",
      baseRevision: options.validation_host?.base_revision ?? options.board_context?.revision ?? 0,
      resourceContext,
    });
    if (!compiled.lesson.board_context?.references.length) reduceCanonicalEvents(events);
  } catch (error) {
    fail("LESSON_PLAN_OLL_SEMANTIC", "$lesson", error instanceof Error ? error.message : "compiled OLL failed semantic validation");
  }
  return compiled;
}
