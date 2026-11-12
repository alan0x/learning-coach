// Recipe compilers of the math plugin: validated recipe parameters to OLL authoring actions.
import {
  buildCircleAndArc, buildCircleAreaRearrangement, buildCirclePolygons, buildCoordinateCircle, buildFunctionPlot,
  buildCubeWithSection, buildFunctionSurface, buildGeometricRearrangement, buildImplicitSurface,
  buildNumberLine, buildUnitCircle, buildUnitSquareArray, rearrangementRecipe, NUMBER_LINE_LIMITS,
  type BuiltRecipe, type RearrangementConstruction,
} from "octos-lesson-language/plugin-math";
import { compileText } from "../lesson-text.js";
import { type CompiledVisual } from "../compiled-visual-reuse.js";
import { plotCurveNumbers, plotSampleNumbers } from "./plot-bindings.js";
import { planPlotView, type PlotView } from "../plot-view-planner.js";
import { parseModelFormula } from "./math-formulas.js";
import { compileMathExpression, type AuthoringAction } from "octos-lesson-language";
import { LESSON_PLAN_CAPABILITY_NUMBER_LIMITS, LessonPlanError, type LessonPlan, type LessonPlanMathExpression, type LessonPlanVisualContent } from "../lesson-plan.js";
import { buildImplicitSurfaceObject } from "../scene3d-surfaces.js";
import { lessonValues } from "./number-line-fit.js";
import { LESSON_PLAN_SCENE_INITIAL_CAMERAS, fail, pad, variableAlias, parameters, allowParameterKeys, optionalText, optionalNumber, optionalInteger, optionalStringArray, assertRange, replaceIdentifier, safeFunctionExpression, evaluate, mathExpressionToOll, place, numberDefinition, namedNumbers, displayNumberSymbols, formatMathExpressionDisplay, angleScaleForUnit, scaledAngleExpression, type VisualCompiler } from "../recipe-kit.js";

function compileFunctionPlot(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "expression", "expressions", "expression_tokens", "sample_x_numbers", "curve_label", "curve_labels", "x_label", "y_label", "x_min", "x_max", "y_min", "y_max"], path);
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
  const dynamicNumbers = plotCurveNumbers(input);
  if (dynamicNumbers.length > LESSON_PLAN_CAPABILITY_NUMBER_LIMITS.function_plot) {
    fail("LESSON_PLAN_COMPILER_CONTROL_LIMIT", `${path}.expression_tokens`, "too many curve parameters");
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
    ? [] : optionalStringArray(input.curve_labels, [], `${path}.curve_labels`).map(label => namedNumbers(label, plan));
  if (curveLabels.length > 0 && curveLabels.length !== expressions.length) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.curve_labels`, "curve label count must equal expression count");
  }
  const sampleNumbers = plotSampleNumbers(input);
  const number = sampleNumbers[0];
  // Model ranges are hints for the view planner, not commands.
  const hint = (value: unknown, key: string) => value === undefined ? undefined : optionalNumber(value, 0, `${path}.${key}`);
  const requested = {
    x: { min: hint(input.x_min, "x_min"), max: hint(input.x_max, "x_max") },
    y: { min: hint(input.y_min, "y_min"), max: hint(input.y_max, "y_max") },
  };

  // The states this plot's creation section shows: restarts and animation endpoints.
  const creationIndex = plan.sections.findIndex(section => section.moments.some(moment =>
    moment.actions.some(action => action.action === "create" && action.content === content)));
  const creationMoments = plan.sections[creationIndex]?.moments ?? [];
  const curveParameters = dynamicNumbers.map(index => {
    const item = numberDefinition(plan, index, `${path}.numbers`);
    return { name: variableAlias(index), initial: item.initial, min: item.min, max: item.max };
  });
  const initialState = Object.fromEntries(curveParameters.map(parameter => [parameter.name, parameter.initial]));
  const demonstrations: Record<string, number>[] = [];
  {
    const state = { ...initialState };
    for (const moment of creationMoments) {
      for (const restarted of moment.restart_numbers ?? []) {
        const name = variableAlias(restarted);
        if (name in initialState) state[name] = initialState[name]!;
      }
      for (const action of moment.actions) {
        if (action.action !== "animate" || !dynamicNumbers.includes(action.number)) continue;
        state[variableAlias(action.number)] = action.end_value;
        demonstrations.push({ ...state });
      }
    }
  }
  // Practice targets in the creation section are states the learner is asked to reach.
  const practiceTargets = (plan.sections[creationIndex]?.student_activities ?? []).flatMap(activity =>
    activity.kind === "number_target" && activity.expression === undefined && activity.number_controls.length === 1
      ? [{ number: activity.number_controls[0]!.number, value: activity.value }] : []);
  for (const target of practiceTargets) {
    if (dynamicNumbers.includes(target.number)) demonstrations.push({ ...initialState, [variableAlias(target.number)]: target.value });
  }

  // Title, axes and curve labels are checked before the samples are
  // evaluated, so a repair hears about them first (as before the builder).
  const title = namedNumbers(optionalText(input.title, compileText(plan, "函数图像"), `${path}.title`), plan);
  const xLabel = namedNumbers(optionalText(input.x_label, "x", `${path}.x_label`), plan);
  const yLabel = namedNumbers(optionalText(input.y_label, "y", `${path}.y_label`), plan);
  // Evaluation keeps the stable number_XX aliases; the display label is
  // derived from the parsed formula with the numbers' readable symbols,
  // so the legend and the hover readout can never disagree with the curve.
  const displaySymbols = dynamicTokens !== undefined ? displayNumberSymbols(plan, dynamicNumbers) : undefined;
  const defaultCurveLabel = (item: string) => {
    if (dynamicTokens !== undefined) {
      return `y = ${formatMathExpressionDisplay(dynamicTokens, index => displaySymbols!.get(index) ?? `n${index}`)}`;
    }
    // Named logarithms read better as written than as their ln expansion.
    if (/\b(?:log10|lg|log2)\s*\(/u.test(item)) {
      return `y = ${item.replace(/\blog10\s*\(/gu, "log₁₀(").replace(/\blog2\s*\(/gu, "log₂(").replace(/\*/gu, "·")}`;
    }
    try {
      return `y = ${formatMathExpressionDisplay(parseModelFormula(item, 0, `${path}.expression`), index => `n${index}`)}`;
    } catch {
      return `y = ${item}`;
    }
  };
  const curves = expressions.map((item, index) => ({
    expression: item,
    label: curveLabels[index]
      ?? (index === 0 && input.curve_label !== undefined
        ? namedNumbers(optionalText(input.curve_label, "", `${path}.curve_label`), plan)
        : defaultCurveLabel(rawExpressions[index] ?? item)),
  }));

  // Points on a fixed curve: the initial positions and the creation section's
  // animation endpoints must be visible; the slider ends may join the view.
  const sampleAt = (x: number, where: string) => ({ x, y: evaluate(expression, ["x"], { x }, where) });
  const samples = sampleNumbers.map((sampleNumber, index) => {
    const d = numberDefinition(plan, sampleNumber, `${path}.numbers`);
    for (const x of [d.min, d.max]) evaluate(expression, ["x"], { x }, `${path}.expression`);
    return { ...sampleAt(d.initial, `${path}.expression`),
      label: sampleNumbers.length === 2 ? (index === 0 ? "A" : "B") : "P(x, y)", x_expression: variableAlias(sampleNumber) };
  });
  const teachingPoints: Array<{ x: number; y: number }> = samples.map(({ x, y }) => ({ x, y }));
  const optionalPoints: Array<{ x: number; y: number }> = [];
  for (const sampleNumber of sampleNumbers) {
    const d = numberDefinition(plan, sampleNumber, `${path}.numbers`);
    for (const x of [d.min, d.max]) {
      const y = evaluate(expression, ["x"], { x }, `${path}.expression`);
      if (Number.isFinite(y)) optionalPoints.push({ x, y });
    }
  }
  for (const target of practiceTargets) {
    if (!sampleNumbers.includes(target.number)) continue;
    const y = compileMathExpression(expression, ["x"])({ x: target.value });
    if (Number.isFinite(y)) teachingPoints.push({ x: target.value, y });
  }
  for (const [momentIndex, moment] of creationMoments.entries()) {
    for (const [actionIndex, action] of moment.actions.entries()) {
      if (action.action !== "animate" || !sampleNumbers.includes(action.number)) continue;
      teachingPoints.push(sampleAt(action.end_value,
        `$lessonPlan.sections[${creationIndex}].moments[${momentIndex}].actions[${actionIndex}].end_value`));
    }
  }
  // Slope lessons with curve parameters still need visible reference points.
  // Their x positions are fixed; the parameter sliders change the curve.
  let references: Array<{ x: number; y: number; label: string }> | undefined;
  if (expressions.length === 1 && !sampleNumbers.length && /斜率|割线|slope|secant/i.test([plan.title, ...plan.goals].join(" "))) {
    const evaluateCurve = compileMathExpression(expression, expressionVariables);
    const referencePoints = (values: Record<string, number>) => [0, 1].flatMap((x, index) => {
      try {
        const y = evaluateCurve({ ...values, x });
        return Number.isFinite(y) ? [{ x, y, label: index ? "B" : "A" }] : [];
      } catch {
        return [];
      }
    });
    const initialReferences = referencePoints(initialState);
    if (initialReferences.length === 2) {
      references = initialReferences;
      teachingPoints.push(...references, ...demonstrations.flatMap(referencePoints));
    }
  }

  let view: PlotView;
  try {
    view = planPlotView({
      expressions, parameters: curveParameters, demonstrations, teachingPoints, optionalPoints, requested,
      quantityX: xLabel !== "x", plainAxes: xLabel === "x" && yLabel === "y",
    });
  } catch (error) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.expression`, error instanceof Error ? error.message : "invalid viewport");
  }
  const axes: Record<string, unknown> = {
    ...(view.equalScale ? { equal_scale: true, layout: "adaptive" } : {}),
    ...(samples.length ? { follow_samples: true } : {}),
    x: { min: view.x.min, max: view.x.max, label: xLabel, ...(view.piTicks ? { ticks: "pi" } : {}) },
    y: { min: view.y.min, max: view.y.max, label: yLabel },
  };
  const plottedCurves = curves.map((curve, index) => view.holes[index]?.length ? { ...curve, holes: view.holes[index] } : curve);
  // Built by the math plugin's shared layer, which Studio also uses.
  const built = buildFunctionPlot({
    as: base, role, place: placement,
    title,
    axes: axes as Parameters<typeof buildFunctionPlot>[0]["axes"],
    curves: plottedCurves,
    ...(samples.length ? { samples } : references ? { references } : {}),
  });
  return {
    actions: built.actions,
    ...(view.adjustments.length ? { adjustments: view.adjustments } : {}),
    whole: base,
    parts: new Map([
      ["whole", base],
      ["primary_curve", `${base}#primary-curve`],
      ...(number ? [["moving_point", `${base}#moving-point`], ["primary_control", `${base}#moving-point`]] as Array<[string, string]> : []),
      ...(dynamicNumbers.length ? [["primary_control", `${base}#primary-curve`]] as Array<[string, string]> : []),
    ]),
  };
}

// Built by the math plugin's shared layer (octos-lesson-language/plugin-math),
// which Studio also uses; Coach only turns its Lesson Plan into builder input.
/** The builders' labels are Chinese source text, translated like Coach's own. */
const translator = (plan: LessonPlan) => (source: string, values?: Record<string, unknown>) => compileText(plan, source, values);

function builtVisual(built: BuiltRecipe): CompiledVisual {
  return { actions: built.actions, whole: built.whole, parts: new Map(Object.entries(built.parts)) };
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
  const variable = number ? variableAlias(number) : undefined;
  return builtVisual(buildUnitCircle({
    as: base,
    role,
    place: placement,
    ...(variable && angleDefinition ? {
      angle: {
        variable,
        expression: scaledAngleExpression(variable, angleScale),
        initial: angleDefinition.initial * angleScale,
        min: angleDefinition.min * angleScale,
        max: angleDefinition.max * angleScale,
      },
    } : { fixed_angle: (angleDefinition?.initial ?? Math.PI / 3) * angleScale }),
    text: { title: optionalText(input.title, compileText(plan, "单位圆与投影"), `${path}.title`) },
    graph: {
      projection,
      title: compileText(plan, "{{v0}}函数图像", { v0: compileText(plan, projection === "sin" ? "正弦" : "余弦") }),
      link_label: compileText(plan, "旋转角与周期波动"),
      group_label: compileText(plan, "单位圆与函数图像"),
    },
  }));
}

function compileCirclePolygonBounds(
  base: string, content: LessonPlanVisualContent, role: string,
  placement: ReturnType<typeof place>, plan: LessonPlan, path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "radius"], path);
  const radius = optionalNumber(input.radius, 2, `${path}.radius`);
  if (radius <= 0) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.radius`, "radius must be positive");
  const number = content.numbers?.[0];
  const definition = number ? numberDefinition(plan, number, `${path}.numbers[0]`) : undefined;
  const initialSides = definition?.initial ?? 6;
  return builtVisual(buildCirclePolygons({
    as: base,
    role,
    place: placement,
    radius,
    sides: number
      ? { expression: `round(${variableAlias(number)})`, initial: initialSides, ...(definition ? { min: definition.min } : {}) }
      : initialSides,
    circumscribed: true,
    text: {
      title: optionalText(input.title, compileText(plan, "圆与正多边形的周长夹逼"), `${path}.title`),
      inscribed_label: compileText(plan, "内接正多边形"),
      circumscribed_label: compileText(plan, "外切正多边形"),
      caption: compileText(plan, "绿色内接周长 < 圆周长 < 橙色外切周长。除以直径 2r：n sin(π/n) < π < n tan(π/n)。显示值为近似值；边数增加时上下界共同逼近 π。"),
    },
  }));
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
  return builtVisual(buildCircleAndArc({
    as: base, role, place: placement, t: translator(plan),
    title: optionalText(input.title, compileText(plan, "圆、圆心角与圆弧"), `${path}.title`),
    radius, angle,
    ...(angleVariable ? { angle_number: { variable: angleVariable, expression: scaledAngleExpression(angleVariable, angleScale) } } : {}),
    ...(radiusNumber && radiusDefinition ? { radius_number: { variable: variableAlias(radiusNumber), min: radiusDefinition.min, max: radiusDefinition.max } } : {}),
  }));
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
  return { ...builtVisual(buildCubeWithSection({
    as: base, role, place: placement, t: translator(plan),
    title: optionalText(input.title, compileText(plan, "正方体、顶点、棱、面与截面"), `${path}.title`),
    section: { value: height, ...(number ? { variable: variableAlias(number) } : {}) },
  })), primaryScene: base };
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
  allowParameterKeys(input, ["title", "expression", "x_min", "x_max", "y_min", "y_max", "samples", "section_axis", "section_value"], path);
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
  const sectionValue = number ? numberDefinition(plan, number, `${path}.numbers[0]`).initial : optionalNumber(input.section_value, 1, `${path}.section_value`);
  return { ...builtVisual(buildFunctionSurface({
    as: base, role, place: placement, t: translator(plan),
    title: optionalText(input.title, compileText(plan, "函数曲面与截面"), `${path}.title`),
    expression, x_range: { min: xMin, max: xMax }, y_range: { min: yMin, max: yMax }, samples, axis,
    section: { value: sectionValue, ...(number ? { variable: variableAlias(number) } : {}) },
  })), primaryScene: base };
}

function compileImplicitSurface(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "expression", "level", "section_axis"], path);
  if (input.expression === undefined) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.expression`, "an implicit surface requires an expression");
  }
  if (input.level === undefined) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.level`, "an implicit surface requires a level");
  }
  const expression = safeFunctionExpression(input.expression, "", ["x", "y", "z"], `${path}.expression`);
  const level = optionalNumber(input.level, 0, `${path}.level`);
  const axis = input.section_axis ?? "z";
  if (axis !== "x" && axis !== "y" && axis !== "z") {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.section_axis`, "expected x, y, or z");
  }
  const number = content.numbers?.[0];
  const sectionValue = number ? numberDefinition(plan, number, `${path}.numbers[0]`).initial : 0;
  let built: BuiltRecipe;
  try {
    built = buildImplicitSurface({
      as: base, role, place: placement, t: translator(plan),
      // The builder resolves the surface before reading the title. Validate
      // here so a bad surface still takes precedence in a repair request.
      get title() { return optionalText(input.title, compileText(plan, "隐式曲面与截面"), `${path}.title`); },
      expression, level, axis,
      section: { value: sectionValue, ...(number ? { variable: variableAlias(number) } : {}) },
    });
  } catch (error) {
    // Only the builder's own failure (no stable viewport) is an expression problem.
    if (error instanceof LessonPlanError) throw error;
    fail(
      "LESSON_PLAN_CAPABILITY_PARAMETER",
      `${path}.expression`,
      error instanceof Error ? error.message : "implicit surface cannot be rendered",
    );
  }
  return { ...builtVisual(built), primaryScene: base };
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
  allowParameterKeys(input, ["title", "center_x", "center_y", "radius", "radius_expression"], path);
  const centerX = optionalNumber(input.center_x, 0, `${path}.center_x`);
  const centerY = optionalNumber(input.center_y, 0, `${path}.center_y`);
  const number = content.numbers?.[0];
  const radiusDefinition = number ? numberDefinition(plan, number, `${path}.numbers[0]`) : undefined;
  const formula = input.radius_expression === undefined ? undefined : safeFunctionExpression(input.radius_expression, "n1", ["n1"], `${path}.radius_expression`);
  if (formula && !radiusDefinition) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.radius_expression`, "radius_expression requires a shared number");
  const radiusAt = (value: number) => formula ? evaluate(formula, ["n1"], { n1: value }, `${path}.radius_expression`) : value;
  const radius = radiusDefinition ? radiusAt(radiusDefinition.initial) : optionalNumber(input.radius, 1, `${path}.radius`);
  if (radius < 0 || (!formula && radius === 0)) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.radius`, "radius must be positive");
  if (!formula && radiusDefinition && radiusDefinition.min <= 0) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.numbers[0]`, "a bound radius must stay positive");
  }
  const variable = number ? variableAlias(number) : undefined;
  const sampledRadii = radiusDefinition && formula ? Array.from({ length: 201 }, (_, i) =>
    radiusAt(radiusDefinition.min + (radiusDefinition.max - radiusDefinition.min) * i / 200)) : [];
  if (sampledRadii.some(value => !Number.isFinite(value) || value < 0)) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.radius_expression`, "radius expression has an invalid sampled value");
  // A bounded viewport sample is not a proof of the continuous mathematical domain.
  const maximumRadius = formula ? Math.max(radius, ...sampledRadii, 1)
    : radiusDefinition ? Math.max(Math.abs(radiusDefinition.min), Math.abs(radiusDefinition.max)) : radius;
  return builtVisual(buildCoordinateCircle({
    as: base, role, place: placement, t: translator(plan),
    title: optionalText(input.title, compileText(plan, "坐标系中的圆"), `${path}.title`),
    center: { x: centerX, y: centerY }, radius, maximum_radius: maximumRadius,
    ...(variable ? { radius_binding: { expression: formula ? replaceIdentifier(formula, "n1", variable) : variable, formula: Boolean(formula) } } : {}),
  }));
}


function compileRectangleUnitSquareArray(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title"], path);
  const columnNumber = content.numbers?.[0];
  const rowNumber = content.numbers?.[1];
  if (!columnNumber || !rowNumber) {
    fail(
      "LESSON_PLAN_CAPABILITY_PARAMETER",
      `${path}.numbers`,
      "a unit-square rectangle requires column and row numbers",
    );
  }
  const columnDefinition = numberDefinition(plan, columnNumber, `${path}.numbers[0]`);
  const rowDefinition = numberDefinition(plan, rowNumber, `${path}.numbers[1]`);
  return builtVisual(buildUnitSquareArray({
    as: base, role, place: placement, t: translator(plan),
    title: optionalText(input.title, compileText(plan, "单位正方形铺成长方形"), `${path}.title`),
    columns: { variable: variableAlias(columnNumber), initial: columnDefinition.initial, max: columnDefinition.max },
    rows: { variable: variableAlias(rowNumber), initial: rowDefinition.initial, max: rowDefinition.max },
  }));
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
  if (!rearrangementRecipe(construction, legA, legB)) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.construction`, "unsupported geometric construction");
  return builtVisual(buildGeometricRearrangement({
    as: base, role, place: placement,
    construction: construction as RearrangementConstruction,
    legs: { a: legA, b: legB },
    ...(progressDefinition && progressVariable ? { progress: {
      expression: `((${progressVariable})-(${progressDefinition.min}))/((${progressDefinition.max})-(${progressDefinition.min}))`,
      initial: (progressDefinition.initial - progressDefinition.min) / (progressDefinition.max - progressDefinition.min),
    } } : {}),
  }));
}

/** True circular sectors, not triangles or a finite "exact rectangle". */
function compileCircleArea(
  base: string, content: LessonPlanVisualContent, role: string,
  placement: ReturnType<typeof place>, plan: LessonPlan, path: string,
): CompiledVisual {
  const input=parameters(content);
  allowParameterKeys(input,["title","radius"],path);
  const r=optionalNumber(input.radius,2,`${path}.radius`);
  if (r<=0 || r>1e6) fail("LESSON_PLAN_CAPABILITY_PARAMETER",path,"radius must be positive and bounded");
  const number=content.numbers?.[0];
  const d=number?numberDefinition(plan,number,path):undefined;
  const variable=number?variableAlias(number):undefined;
  return builtVisual(buildCircleAreaRearrangement({
    as: base, role, place: placement, t: translator(plan), radius: r,
    ...(variable&&d ? { progress: { expression: `(${variable}-${d.min})/(${d.max-d.min})`, initial: (d.initial-d.min)/(d.max-d.min) } } : {}),
  }));
}


/** Every count of parts per unit OLL draws (1–24; decision 0016), fewest first. */
const NUMBER_LINE_SPLITS = Array.from({ length: NUMBER_LINE_LIMITS.subdivisions }, (_unused, index) => index + 1);
/** Whether 1/parts has a finite decimal: its only prime factors are 2 and 5. */
const exactDecimal = (parts: number) => { let rest = parts; for (const prime of [2, 5]) while (rest % prime === 0) rest /= prime; return rest === 1; };
const onGrid = (value: number, parts: number) => Math.abs(value * parts - Math.round(value * parts)) < 1e-9;

/** The label style the question's notation asks for: "decimal" labels 0.8, not 8/10 (only the model sees it). */
function numberLineLabelStyle(content: LessonPlanVisualContent, path: string): { title: unknown; labelStyle: unknown } {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "label_style"], path);
  if (input.label_style !== undefined && input.label_style !== "decimal" && input.label_style !== "fraction") {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.label_style`, "label_style is decimal or fraction");
  }
  return { title: input.title, labelStyle: input.label_style };
}

/**
 * The range and ticks of a number line in the family (decisions 0013 and 0016):
 * - the range covers every value a slider can reach (`values`), with 0 and a unit of margin;
 * - the ticks hold every value in `grid` (ranges, starting values, slider steps), or failing that the
 *   values the lesson itself shows (`shown`): the finest whole step of 1, 2, 5 or 10 with at most 60
 *   ticks, else one-unit ticks split into the fewest parts (up to 24) within OLL's tick limit;
 * - values no ticks can hold are refused as a fault the outline owns (they and the visual were chosen
 *   there), so the outline is asked again without the number line.
 */
function numberLineFrame(values: readonly number[], grid: readonly number[], shown: readonly number[], labelStyle: unknown, path: string, fit: "margin" | "tight" = "margin") {
  // "margin": a unit around 0 and the values, room for a move to land. "tight" (a comparison): only the
  // whole units the values span, so close values stand apart (5/6 and 7/8 on 0–1, not −1–2), widened to
  // include 0 when it is within 2 units, which orients negatives.
  let min = fit === "tight" ? Math.floor(Math.min(...values) + 1e-9) : Math.floor(Math.min(...values, 0)) - (Math.min(...values) <= 0 ? 1 : 0);
  let max = fit === "tight" ? Math.ceil(Math.max(...values) - 1e-9) : Math.ceil(Math.max(...values, 0)) + 1;
  if (fit === "tight") {
    if (min > 0 && min <= 2) min = 0;
    if (max < 0 && max >= -2) max = 0;
    if (max <= min) max = min + 1;
  }
  const span = max - min;
  const holdAll = (count: number, of: readonly number[]) => of.every((value) => onGrid(value / count, 1));
  const ticksFor = (of: readonly number[]) => {
    const whole = [1, 2, 5, 10].find((count) => span / count <= 60 && holdAll(count, of));
    if (whole) return { step: whole, subdivisions: 1 };
    const parts = NUMBER_LINE_SPLITS.find((count) => of.every((value) => onGrid(value, count)) && span * count <= NUMBER_LINE_LIMITS.ticks);
    return parts ? { step: 1, subdivisions: parts } : undefined;
  };
  const ticks = ticksFor(grid) ?? ticksFor(shown);
  if (!ticks) {
    fail("LESSON_PLAN_OUTLINE_VISUAL", `${path}.numbers`,
      `a number line can split each unit into at most ${NUMBER_LINE_LIMITS.subdivisions} equal parts; these values need finer ticks, so choose another visual`);
  }
  return {
    range: { min, max },
    step: ticks.step, subdivisions: ticks.subdivisions,
    ticks: {
      step: ticks.step, subdivisions: ticks.subdivisions, labels: ticks.subdivisions > 1 ? "all" as const : "major" as const,
      // Decimals only where they are exact (halves, fifths, tenths …): thirds stay fractions, never 0.333.
      ...(labelStyle === "decimal" && ticks.subdivisions > 1 && exactDecimal(ticks.subdivisions) ? { format: "decimal" as const } : {}),
    },
  };
}

/**
 * Two numbers compared on one number line (decision 0016): each is a point, on ticks that hold both
 * (their common denominator, up to 24 parts per unit), labelled with the lesson number's name.
 */
function compileNumberLineCompare(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const { title, labelStyle } = numberLineLabelStyle(content, path);
  const [firstNumber, secondNumber] = content.numbers ?? [];
  if (!firstNumber || !secondNumber) fail("LESSON_PLAN_OUTLINE_VISUAL", `${path}.numbers`, "comparing on a number line needs the two lesson numbers it compares");
  const first = numberDefinition(plan, firstNumber, `${path}.numbers[0]`);
  const second = numberDefinition(plan, secondNumber, `${path}.numbers[1]`);
  const values = [first.min, first.max, first.initial, second.min, second.max, second.initial];
  const steps = [first.student_control?.step, second.student_control?.step].filter((step): step is number => typeof step === "number" && step > 0);
  const shown = [first.initial, ...lessonValues(plan, firstNumber), second.initial, ...lessonValues(plan, secondNumber)];
  const frame = numberLineFrame(values, [...values, ...steps], shown, labelStyle, path, "tight");
  const point = (as: string, number: number, definition: typeof first) => ({
    as, value: { expression: variableAlias(number), initial: definition.initial },
    label: definition.label?.trim() || compileText(plan, "数值"),
  });
  const built = buildNumberLine({
    as: base, role, place: placement,
    title: optionalText(title, compileText(plan, "数轴"), `${path}.title`),
    range: frame.range, ticks: frame.ticks,
    points: [point("first", firstNumber, first), point("second", secondNumber, second)],
  });
  return { ...builtVisual(built), parts: new Map(Object.entries({ ...built.parts, primary_control: built.parts.second! })) };
}

/** The solution sets a line draws (decision 0016): a relation names the form; a and b are the boundaries. */
const SOLUTION_RELATIONS = {
  "x>a": { bounds: 1, pieces: [{ from: "a", to: null, fromClosed: false }] },
  "x>=a": { bounds: 1, pieces: [{ from: "a", to: null, fromClosed: true }] },
  "x<a": { bounds: 1, pieces: [{ from: null, to: "a", toClosed: false }] },
  "x<=a": { bounds: 1, pieces: [{ from: null, to: "a", toClosed: true }] },
  "a<x<b": { bounds: 2, pieces: [{ from: "a", to: "b", fromClosed: false, toClosed: false }] },
  "a<=x<=b": { bounds: 2, pieces: [{ from: "a", to: "b", fromClosed: true, toClosed: true }] },
  "a<x<=b": { bounds: 2, pieces: [{ from: "a", to: "b", fromClosed: false, toClosed: true }] },
  "a<=x<b": { bounds: 2, pieces: [{ from: "a", to: "b", fromClosed: true, toClosed: false }] },
  "x<a|x>b": { bounds: 2, pieces: [{ from: null, to: "a", toClosed: false }, { from: "b", to: null, fromClosed: false }] },
  "x<=a|x>=b": { bounds: 2, pieces: [{ from: null, to: "a", toClosed: true }, { from: "b", to: null, fromClosed: true }] },
  "x<a|x>=b": { bounds: 2, pieces: [{ from: null, to: "a", toClosed: false }, { from: "b", to: null, fromClosed: true }] },
  "x<=a|x>b": { bounds: 2, pieces: [{ from: null, to: "a", toClosed: true }, { from: "b", to: null, fromClosed: false }] },
} as const;
export const SOLUTION_RELATION_NAMES = Object.keys(SOLUTION_RELATIONS) as Array<keyof typeof SOLUTION_RELATIONS>;

/**
 * A solution set on a number line (decision 0016): the model names the relation and gives the boundaries;
 * the program draws every end open or filled and every ray or interval from the relation, so no circle
 * is the model's to draw. Boundaries follow their lesson numbers; the line leaves room for the rays.
 */
function compileNumberLineSolution(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "label_style", "relation"], path);
  const { title, labelStyle } = numberLineLabelStyle({ ...content, parameters: { title: input.title, label_style: input.label_style } } as LessonPlanVisualContent, path);
  const relation = SOLUTION_RELATIONS[input.relation as keyof typeof SOLUTION_RELATIONS];
  if (!relation) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.relation`, `relation is one of ${SOLUTION_RELATION_NAMES.join(", ")}`);
  const numbers = content.numbers ?? [];
  if (numbers.length < relation.bounds) fail("LESSON_PLAN_OUTLINE_VISUAL", `${path}.numbers`, `the relation ${String(input.relation)} needs ${relation.bounds} lesson number(s) for its boundaries`);
  const bounds = numbers.slice(0, relation.bounds).map((number, index) => ({ number, definition: numberDefinition(plan, number, `${path}.numbers[${index}]`) }));
  if (bounds.length === 2 && !(bounds[0]!.definition.initial < bounds[1]!.definition.initial)) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.numbers`, "the first boundary (a) must be smaller than the second (b)");
  }
  const values = bounds.flatMap(({ definition }) => [definition.min, definition.max, definition.initial]);
  const steps = bounds.map(({ definition }) => definition.student_control?.step).filter((step): step is number => typeof step === "number" && step > 0);
  const shown = bounds.flatMap(({ number, definition }) => [definition.initial, ...lessonValues(plan, number)]);
  // Two units past the boundaries, so a ray visibly runs on.
  const frame = numberLineFrame([...values, Math.min(...values) - 2, Math.max(...values) + 2], [...values, ...steps], shown, labelStyle, path, "tight");
  const at = (name: "a" | "b" | null) => {
    if (name === null) return null;
    const bound = bounds[name === "a" ? 0 : 1]!;
    return { expression: variableAlias(bound.number), initial: bound.definition.initial };
  };
  const built = buildNumberLine({
    as: base, role, place: placement,
    title: optionalText(title, compileText(plan, "数轴"), `${path}.title`),
    range: frame.range, ticks: frame.ticks,
    intervals: relation.pieces.map((piece, index) => ({
      as: index === 0 ? "set" : "set2",
      from: at(piece.from), to: at(piece.to),
      ...(piece.from !== null ? { from_closed: Boolean((piece as { fromClosed?: boolean }).fromClosed) } : {}),
      ...(piece.to !== null ? { to_closed: Boolean((piece as { toClosed?: boolean }).toClosed) } : {}),
    })),
  });
  return { ...builtVisual(built), parts: new Map(Object.entries({ ...built.parts, primary_control: built.parts.set! })) };
}

/** A point's name: the lesson number's label, unless it only repeats the value its tick already shows. */
const nameOf = (definition: { label?: string }, value: number): string | undefined => {
  const label = definition.label?.trim();
  return label && Number(label) !== value ? label : undefined;
};

/** The place a number is rounded to (decision 0016), as the size of one step at that place. */
export const ROUNDING_PLACES = { hundreds: 100, tens: 10, ones: 1, tenths: 0.1, hundredths: 0.01 } as const;

/**
 * The ticks of a rounding line: majors a tenth of the place (ones for tens), split again only as far
 * as the number needs to sit on its own tick (362 between hundreds needs ones). Undefined when no
 * split up to a hundredth of the place holds it.
 */
export function roundingTicks(value: number, unit: number): { major: number; minor: number } | undefined {
  const major = Number((unit / 10).toPrecision(12));
  for (const minor of [major, Number((unit / 100).toPrecision(12))]) {
    const steps = value / minor;
    if (Math.abs(steps - Math.round(steps)) <= 1e-9 * Math.max(1, Math.abs(steps))) return { major, minor };
  }
  return undefined;
}

/**
 * Rounding on a number line (decision 0016): the model gives the number and the place; the program draws
 * the two neighbours it falls between, the halfway point (open), and a jump from the number to the result
 * (halves round up, as taught). All follow the number's lesson variable through OLL expressions, so a
 * slider moving the number moves them too. The number itself is never moved: the question is about it.
 */
function compileNumberLineRounding(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "place"], path);
  const unit = ROUNDING_PLACES[input.place as keyof typeof ROUNDING_PLACES];
  if (!unit) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.place`, `place is one of ${Object.keys(ROUNDING_PLACES).join(", ")}`);
  const [numberIndex] = content.numbers ?? [];
  if (!numberIndex) fail("LESSON_PLAN_OUTLINE_VISUAL", `${path}.numbers`, "rounding on a number line needs the lesson number it rounds");
  const definition = numberDefinition(plan, numberIndex, `${path}.numbers[0]`);
  const reached = [definition.min, definition.max, definition.initial, ...lessonValues(plan, numberIndex)];
  const ticks = reached.map((value) => roundingTicks(value, unit));
  if (ticks.some((tick) => !tick)) {
    fail("LESSON_PLAN_OUTLINE_VISUAL", `${path}.numbers`, "a rounding line marks every hundredth of the place at most; this number needs finer ticks, so choose another visual");
  }
  const minor = Math.min(...ticks.map((tick) => tick!.minor));
  const major = ticks[0]!.major;
  // Whole steps of the place are counted by k = 1/unit when the place is below one, so floating-point
  // division never puts 0.3 under 0.2 (0.3 / 0.1 is 2.9999…).
  const scale = unit < 1 ? Math.round(1 / unit) : 1;
  const steps = (variable: string) => (unit < 1 ? `floor(${variable} * ${scale} + 0.000000001)` : `floor(${variable} / ${unit} + 0.000000001)`);
  const at = (expression: string) => (unit < 1 ? `(${expression}) / ${scale}` : `(${expression}) * ${unit}`);
  const stepsOf = (value: number) => Math.floor(unit < 1 ? value * scale + 1e-9 : value / unit + 1e-9);
  const valueAt = (count: number) => Number((unit < 1 ? count / scale : count * unit).toPrecision(12));
  const variable = variableAlias(numberIndex);
  const lowerSteps = stepsOf(definition.initial);
  const lower = valueAt(lowerSteps), upper = valueAt(lowerSteps + 1), middle = valueAt(lowerSteps + 0.5);
  const result = definition.initial - lower >= unit / 2 - 1e-9 ? upper : lower;
  const lowest = valueAt(stepsOf(Math.min(...reached))), highest = valueAt(stepsOf(Math.max(...reached)) + 1);
  const margin = major * 2;
  const range = { min: Number((lowest - margin).toPrecision(12)), max: Number((highest + margin).toPrecision(12)) };
  if ((range.max - range.min) / minor > NUMBER_LINE_LIMITS.ticks) {
    fail("LESSON_PLAN_OUTLINE_VISUAL", `${path}.numbers`, "the rounding line would hold too many ticks for this number's range; choose another visual");
  }
  const built = buildNumberLine({
    as: base, role, place: placement,
    title: optionalText(input.title, compileText(plan, "数轴"), `${path}.title`),
    range,
    ticks: {
      step: major, subdivisions: Math.round(major / minor), labels: major === minor ? "major" : "all",
      ...(Number.isInteger(major) ? {} : { format: "decimal" as const }),
    },
    points: [
      { as: "lower", value: { expression: at(steps(variable)), initial: lower } },
      { as: "middle", value: { expression: at(`${steps(variable)} + 0.5`), initial: middle }, style: "open" },
      { as: "upper", value: { expression: at(`${steps(variable)} + 1`), initial: upper } },
      // Its tick already shows the number; a name that only repeats it ("362") is left off.
      { as: "number", value: { expression: variable, initial: definition.initial }, ...(nameOf(definition, definition.initial) ? { label: nameOf(definition, definition.initial)! } : {}) },
    ],
    jumps: [{ as: "move", from: "number", by: { expression: `${at(unit < 1 ? `floor(${variable} * ${scale} + 0.5 + 0.000000001)` : `floor(${variable} / ${unit} + 0.5 + 0.000000001)`)} - ${variable}`, initial: Number((result - definition.initial).toPrecision(12)) }, hops: false }],
  });
  return { ...builtVisual(built), parts: new Map(Object.entries({ ...built.parts, primary_control: built.parts.move! })) };
}

/**
 * A number line (OLL decision 0013) from the visual's numbers: the first is
 * the start, the second the change; the program computes where the jump ends.
 * The line covers every value either number can take, so a slider never
 * carries a part off it.
 */
function compileNumberLine(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const { title, labelStyle } = numberLineLabelStyle(content, path);
  const [startNumber, changeNumber] = content.numbers ?? [];
  // A number line with no lesson number has nothing to show (run 7: an outline with no numbers).
  if (!startNumber) fail("LESSON_PLAN_OUTLINE_VISUAL", `${path}.numbers`, "a number line needs at least one lesson number for its start");
  const start = startNumber ? numberDefinition(plan, startNumber, `${path}.numbers[0]`) : undefined;
  const change = changeNumber ? numberDefinition(plan, changeNumber, `${path}.numbers[1]`) : undefined;
  const values = [
    ...(start ? [start.min, start.max, start.initial] : [0]),
    ...(start && change ? [start.min + change.min, start.max + change.max, start.initial + change.initial] : []),
  ];
  // Every value a slider can reach is its minimum plus whole steps, so ideally the ticks hold the
  // ends, the starting values, the change on its own and each slider's step.
  const grid = [
    ...values,
    ...(change ? [change.min, change.max, change.initial] : []),
    ...[start?.student_control?.step, change?.student_control?.step].filter((step): step is number => typeof step === "number" && step > 0),
  ];
  const shown = [
    ...(start && startNumber ? [start.initial, ...lessonValues(plan, startNumber)] : []),
    ...(change && changeNumber ? [change.initial, ...lessonValues(plan, changeNumber)] : []),
    ...(start && change && changeNumber ? [change.initial, ...lessonValues(plan, changeNumber)].map((value) => start.initial + value) : []),
  ];
  // Values no ticks can hold would sit between ticks with no number under them (run 6, NM-01): refused.
  const frame = numberLineFrame(values, grid, shown, labelStyle, path);
  const { step, subdivisions } = frame;
  // Hops are counted on the ticks actually drawn: every reachable change, and the slider's step,
  // must be a whole number of the smallest ticks, and the longest change at most 24 of them.
  const unit = step / subdivisions;
  const whole = (value: number) => onGrid(value / unit, 1);
  const reach = change ? Math.max(Math.abs(change.min), Math.abs(change.max)) : 0;
  const sliderStep = change?.student_control?.step;
  const hopsFit = change !== undefined && [change.min, change.max, change.initial].every(whole)
    && (sliderStep === undefined || whole(sliderStep)) && Math.ceil(reach / unit - 1e-9) <= NUMBER_LINE_LIMITS.hops;
  // The model is not asked: it cannot see these limits, and a choice the line cannot draw would only be retried.
  const hops = hopsFit;
  const startVariable = startNumber ? variableAlias(startNumber) : undefined;
  const changeVariable = changeNumber ? variableAlias(changeNumber) : undefined;
  const built = buildNumberLine({
    as: base, role, place: placement,
    title: optionalText(title, compileText(plan, "数轴"), `${path}.title`),
    range: frame.range,
    ticks: frame.ticks,
    ...(start && startVariable ? { points: [
      { as: "start", value: { expression: startVariable, initial: start.initial }, label: compileText(plan, "起点") },
      ...(change && changeVariable ? [{ as: "end", value: { expression: `(${startVariable})+(${changeVariable})`, initial: start.initial + change.initial }, label: compileText(plan, "终点") }] : []),
    ] } : {}),
    ...(change && changeVariable && start ? { jumps: [{ as: "move", from: "start", by: { expression: changeVariable, initial: change.initial }, hops }] } : {}),
  });
  return { ...builtVisual(built), parts: new Map(Object.entries({ ...built.parts, ...(built.parts.move ? { primary_control: built.parts.move } : {}) })) };
}

export const MATH_COMPILERS = {
  number_line: compileNumberLine,
  number_line_compare: compileNumberLineCompare,
  number_line_solution: compileNumberLineSolution,
  number_line_rounding: compileNumberLineRounding,
  function_plot: compileFunctionPlot,
  unit_circle_projection: compileUnitCircleProjection,
  circle_polygon_bounds: compileCirclePolygonBounds,
  circle_and_arc: compileCircleAndArc,
  cube_with_section: compileCubeWithSection,
  function_surface_with_section: compileFunctionSurface,
  implicit_surface_with_section: compileImplicitSurface,
  coordinate_circle: compileCoordinateCircle,
  rectangle_unit_square_array: compileRectangleUnitSquareArray,
  geometric_rearrangement: compileGeometricRearrangement,
  circle_area_rearrangement: compileCircleArea,
} satisfies Record<string, VisualCompiler>;
