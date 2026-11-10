// Recipe compilers of the math plugin: validated recipe parameters to OLL authoring actions.
import {
  buildCircleAndArc, buildCircleAreaRearrangement, buildCirclePolygons, buildCoordinateCircle, buildFunctionPlot,
  buildCubeWithSection, buildFunctionSurface, buildGeometricRearrangement, buildImplicitSurface,
  buildUnitCircle, buildUnitSquareArray, rearrangementRecipe,
  type BuiltRecipe, type RearrangementConstruction,
} from "octos-lesson-language/plugin-math";
import { compileText } from "../lesson-text.js";
import { type CompiledVisual } from "../compiled-visual-reuse.js";
import { functionViewport } from "../function-viewport.js";
import { type AuthoringAction } from "octos-lesson-language";
import { LESSON_PLAN_CAPABILITY_NUMBER_LIMITS, LessonPlanError, type LessonPlan, type LessonPlanMathExpression, type LessonPlanVisualContent } from "../lesson-plan.js";
import { buildImplicitSurfaceObject } from "../scene3d-surfaces.js";
import { LESSON_PLAN_SCENE_INITIAL_CAMERAS, fail, pad, variableAlias, parameters, allowParameterKeys, optionalText, optionalNumber, optionalInteger, optionalStringArray, assertRange, replaceIdentifier, safeFunctionExpression, evaluate, mathExpressionToOll, place, numberDefinition, namedNumbers, angleScaleForUnit, scaledAngleExpression, type VisualCompiler } from "../recipe-kit.js";

function compileFunctionPlot(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "expression", "expressions", "expression_tokens", "curve_label", "curve_labels", "x_label", "y_label", "x_min", "x_max", "y_min", "y_max"], path);
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
    if (dynamicNumbers.length === 0 && declaredNumbers.length > 2) {
      fail(
        "LESSON_PLAN_CAPABILITY_PARAMETER",
        `${path}.numbers`,
        "a static function supports at most two independent sample points",
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
    ? [] : optionalStringArray(input.curve_labels, [], `${path}.curve_labels`).map(label => namedNumbers(label, plan));
  if (curveLabels.length > 0 && curveLabels.length !== expressions.length) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.curve_labels`, "curve label count must equal expression count");
  }
  const sampleNumbers = dynamicNumbers.length === 0 ? [...new Set(content.numbers ?? [])] : [];
  if (sampleNumbers.length > 2) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.numbers`, "static curves support at most two sample points");
  const number = sampleNumbers[0];
  const definition = number ? numberDefinition(plan, number, `${path}.numbers[0]`) : undefined;
  let requestedX = input.x_min !== undefined || input.x_max !== undefined
    ? {
        min: optionalNumber(input.x_min, -4, `${path}.x_min`),
        max: optionalNumber(input.x_max, 4, `${path}.x_max`),
      }
    : undefined;
  if (requestedX) assertRange(requestedX.min, requestedX.max, `${path}.x_range`);
  for (const sampleNumber of sampleNumbers) {
    const definition = numberDefinition(plan, sampleNumber, `${path}.numbers`);
    // The Lesson Plan describes what should be taught; the compiler owns the
    // mechanical viewport needed to make that teaching state visible. A model
    // should not spend another request merely copying a slider's numeric range
    // into plot axes.
    requestedX = {
      min: Math.min(requestedX?.min ?? definition.min, definition.min),
      max: Math.max(requestedX?.max ?? definition.max, definition.max),
    };
  }
  let viewport: ReturnType<typeof functionViewport>;
  try {
    viewport = functionViewport(expressions, dynamicNumbers.map(index => {
      const item = numberDefinition(plan, index, `${path}.numbers`);
      return { name: variableAlias(index), initial: item.initial, min: item.min, max: item.max };
    }), requestedX);
  } catch (error) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.expression`, error instanceof Error ? error.message : "invalid viewport");
  }
  const requestedY = input.y_min !== undefined || input.y_max !== undefined
    ? {
        min: optionalNumber(input.y_min, viewport.y.min, `${path}.y_min`),
        max: optionalNumber(input.y_max, viewport.y.max, `${path}.y_max`),
      }
    : viewport.y;
  assertRange(requestedY.min, requestedY.max, `${path}.y_range`);
  // Title, axes and curve labels are checked before the samples are
  // evaluated, so a repair hears about them first (as before the builder).
  const title = namedNumbers(optionalText(input.title, compileText(plan, "函数图像"), `${path}.title`), plan);
  const axes = {
    ...(expressions.length > 1 && expressions.some(e => e.replace(/[()\s]/g, "") === "x") ? {equal_scale:true} : {}),
    x: { min: viewport.x.min, max: viewport.x.max, label: namedNumbers(optionalText(input.x_label, "x", `${path}.x_label`), plan) },
    y: { min: requestedY.min, max: requestedY.max, label: namedNumbers(optionalText(input.y_label, "y", `${path}.y_label`), plan) },
  };
  const curves = expressions.map((item, index) => ({
    expression: item,
    label: curveLabels[index]
      ?? (index === 0 ? namedNumbers(optionalText(input.curve_label, `y = ${item}`, `${path}.curve_label`), plan) : `y = ${item}`),
  }));
  const samples = sampleNumbers.map((sampleNumber, index) => {
    const d = numberDefinition(plan, sampleNumber, `${path}.numbers`);
    for (const x of [d.min, d.initial, d.max]) evaluate(expression, ["x"], {x}, `${path}.expression`);
    return { x: d.initial, y: evaluate(expression, ["x"], {x:d.initial}, `${path}.expression`),
      label: sampleNumbers.length === 2 ? (index === 0 ? "A" : "B") : "P(x, y)", x_expression: variableAlias(sampleNumber) };
  });
  // Slope lessons with curve parameters still need visible reference points.
  // Their x positions are fixed; the parameter sliders change the curve.
  let references: Array<{ x: number; y: number; label: string }> | undefined;
  if (expressions.length === 1 && !sampleNumbers.length && /斜率|割线|slope|secant/i.test([plan.title, ...plan.goals].join(" "))) {
    const initialVariables = Object.fromEntries(dynamicNumbers.map(index =>
      [variableAlias(index), numberDefinition(plan, index, path).initial]));
    const xs = [0, 1];
    const ys = xs.map(x => {
      try { return evaluate(expression, expressionVariables, {...initialVariables, x}, path); }
      catch { return NaN; }
    });
    if (ys.every(Number.isFinite)) references = xs.map((x, index) => ({ x, y: ys[index]!, label: index ? "B" : "A" }));
  }
  // Built by the math plugin's shared layer, which Studio also uses.
  const built = buildFunctionPlot({
    as: base, role, place: placement,
    title,
    axes,
    curves,
    ...(samples.length ? { samples } : references ? { references } : {}),
  });
  return {
    actions: built.actions,
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
  const title = optionalText(input.title, compileText(plan, "隐式曲面与截面"), `${path}.title`);
  let built: BuiltRecipe;
  try {
    built = buildImplicitSurface({
      as: base, role, place: placement, t: translator(plan),
      title, expression, level, axis,
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


export const MATH_COMPILERS = {
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
