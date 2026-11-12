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


/** Every count of parts per unit OLL draws (1–12), fewest first. */
const NUMBER_LINE_SPLITS = Array.from({ length: 12 }, (_unused, index) => index + 1);
/** Whether 1/parts has a finite decimal: its only prime factors are 2 and 5. */
const exactDecimal = (parts: number) => { let rest = parts; for (const prime of [2, 5]) while (rest % prime === 0) rest /= prime; return rest === 1; };
const onGrid = (value: number, parts: number) => Math.abs(value * parts - Math.round(value * parts)) < 1e-9;

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
  const input = parameters(content);
  allowParameterKeys(input, ["title", "label_style"], path);
  // How the question writes its numbers, which only the model sees: "decimal" labels 0.8, not 8/10.
  if (input.label_style !== undefined && input.label_style !== "decimal" && input.label_style !== "fraction") {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.label_style`, "label_style is decimal or fraction");
  }
  const [startNumber, changeNumber] = content.numbers ?? [];
  const start = startNumber ? numberDefinition(plan, startNumber, `${path}.numbers[0]`) : undefined;
  const change = changeNumber ? numberDefinition(plan, changeNumber, `${path}.numbers[1]`) : undefined;
  const values = [
    ...(start ? [start.min, start.max, start.initial] : [0]),
    ...(start && change ? [start.min + change.min, start.max + change.max, start.initial + change.initial] : []),
  ];
  // Every value a slider can reach is its minimum plus whole steps, so the ticks must hold the
  // ends, the starting values, the change on its own and each slider's step. When no count of
  // parts up to 12 holds them all, the line keeps whole-number ticks and draws one arc.
  const grid = [
    ...values,
    ...(change ? [change.min, change.max, change.initial] : []),
    ...[start?.student_control?.step, change?.student_control?.step].filter((step): step is number => typeof step === "number" && step > 0),
  ];
  const min = Math.floor(Math.min(...values, 0)) - (Math.min(...values) <= 0 ? 1 : 0);
  const max = Math.ceil(Math.max(...values, 0)) + 1;
  const span = max - min;
  // The finest of 1, 2, 5 or 10 that keeps at most 60 ticks and holds every value, so each value the
  // lesson reaches sits on a tick the line can label (35 and 75 on fives, not tens); then the finest
  // that holds them within OLL's tick limit; only when none does, whole numbers up to 60 units and
  // coarser beyond (crowded labels thin out on the board).
  const holds = (count: number) => grid.every((value) => onGrid(value / count, 1));
  const step = [1, 2, 5, 10].find((count) => span / count <= 60 && holds(count))
    // A long line whose values share no coarser step still puts them on ticks, up to the most ticks OLL draws.
    ?? [1, 2, 5, 10].find((count) => span / count <= NUMBER_LINE_LIMITS.ticks && holds(count))
    ?? (span <= 60 ? 1 : span <= 150 ? 5 : 10);
  // The fewest parts per unit that hold every value (the numbers were fitted to their ticks before compiling).
  const fits = (parts: number) => grid.every((value) => onGrid(value, parts)) && span * parts <= NUMBER_LINE_LIMITS.ticks;
  const subdivisions = step > 1 ? 1 : NUMBER_LINE_SPLITS.find(fits) ?? 1;
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
    title: optionalText(input.title, compileText(plan, "数轴"), `${path}.title`),
    range: { min, max },
    ticks: {
      step, subdivisions, labels: subdivisions > 1 ? "all" : "major",
      // Decimals only where they are exact (halves, fifths, tenths …): thirds stay fractions, never 0.333.
      ...(input.label_style === "decimal" && subdivisions > 1 && exactDecimal(subdivisions) ? { format: "decimal" as const } : {}),
    },
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
