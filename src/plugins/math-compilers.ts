// Recipe compilers of the math plugin: validated recipe parameters to OLL authoring actions.
import { buildCirclePolygons, buildUnitCircle, type BuiltRecipe } from "octos-lesson-language/plugin-math";
import { compileText } from "../lesson-text.js";
import { rearrangementRecipe, REARRANGEMENT_CONSTRUCTIONS, type RearrangementConstruction, type RigidPose } from "../rearrangement.js";
import { type CompiledVisual } from "../compiled-visual-reuse.js";
import { functionViewport } from "../function-viewport.js";
import { type AuthoringAction } from "octos-lesson-language";
import { LESSON_PLAN_CAPABILITY_NUMBER_LIMITS, type LessonPlan, type LessonPlanMathExpression, type LessonPlanVisualContent } from "../lesson-plan.js";
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
  const plotContent: Record<string, unknown> = {
    title: namedNumbers(optionalText(input.title, compileText(plan, "函数图像"), `${path}.title`), plan),
    axes: {
      ...(expressions.length > 1 && expressions.some(e => e.replace(/[()\s]/g, "") === "x") ? {equal_scale:true} : {}),
      x: { min: viewport.x.min, max: viewport.x.max, label: namedNumbers(optionalText(input.x_label, "x", `${path}.x_label`), plan) },
      y: { min: requestedY.min, max: requestedY.max, label: namedNumbers(optionalText(input.y_label, "y", `${path}.y_label`), plan) },
    },
    curves: expressions.map((item, index) => ({
      as: index === 0 ? "primary-curve" : `curve-${pad(index + 1)}`,
      expression: item,
      label: curveLabels[index]
        ?? (index === 0 ? namedNumbers(optionalText(input.curve_label, `y = ${item}`, `${path}.curve_label`), plan) : `y = ${item}`),
    })),
  };
  if (sampleNumbers.length) {
    plotContent.points = sampleNumbers.map((sampleNumber, index) => {
      const d = numberDefinition(plan, sampleNumber, `${path}.numbers`);
      for (const x of [d.min, d.initial, d.max]) evaluate(expression, ["x"], {x}, `${path}.expression`);
      return { as: index === 0 ? "moving-point" : "second-point", x: d.initial,
        y: evaluate(expression, ["x"], {x:d.initial}, `${path}.expression`),
        label: sampleNumbers.length === 2 ? (index === 0 ? "A" : "B") : "P(x, y)" };
    });
    plotContent.bindings = sampleNumbers.flatMap((sampleNumber, index) => {
      const point = index === 0 ? "moving-point" : "second-point";
      const variable = variableAlias(sampleNumber);
      return [{target:`${point}.x`,expression:variable},
        {target:`${point}.y`,expression:replaceIdentifier(expression,"x",variable)}];
    });
    if (sampleNumbers.length === 2) plotContent.measurement = "secant";
  }
  // Slope lessons with curve parameters still need visible reference points.
  // Their x positions are fixed; the parameter sliders change the curve.
  if (expressions.length === 1 && !sampleNumbers.length && /斜率|割线|slope|secant/i.test([plan.title, ...plan.goals].join(" "))) {
    const initialVariables = Object.fromEntries(dynamicNumbers.map(index =>
      [variableAlias(index), numberDefinition(plan, index, path).initial]));
    const xs = [0, 1];
    const ys = xs.map(x => {
      try { return evaluate(expression, expressionVariables, {...initialVariables, x}, path); }
      catch { return NaN; }
    });
    if (ys.every(Number.isFinite)) {
      plotContent.points = xs.map((x, index) => ({as:index ? "reference-b" : "reference-a", x, y:ys[index], label:index ? "B" : "A"}));
      plotContent.bindings = xs.map((x, index) => ({target:`${index ? "reference-b" : "reference-a"}.y`, expression:replaceIdentifier(expression,"x",String(x))}));
      plotContent.measurement = "secant";
      plotContent.sample_input = "fixed_x";
    }
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

// Built by the math plugin's shared layer (octos-lesson-language/plugin-math),
// which Studio also uses; Coach only turns its Lesson Plan into builder input.
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
  const radiusVariable = radiusNumber ? variableAlias(radiusNumber) : undefined;
  const angleExpression = angleVariable ? scaledAngleExpression(angleVariable, angleScale) : undefined;
  const radiusExpression = radiusVariable ?? String(radius);
  const maximumRadius = radiusDefinition
    ? Math.max(Math.abs(radiusDefinition.min), Math.abs(radiusDefinition.max))
    : radius;
  const geometry: Record<string, unknown> = {
    title: optionalText(input.title, compileText(plan, "圆、圆心角与圆弧"), `${path}.title`),
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
    circles: [{ as: "circle", center: "center", radius, label: radiusVariable ? compileText(plan, "半径 r") : `r = ${radius}` }],
    segments: [{ as: "radius", from: "center", to: "moving-point", style: "solid" }],
    arcs: [{ as: "arc", center: "center", radius, start_angle: 0, end_angle: angle, label: compileText(plan, "圆弧") }],
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
    title: optionalText(input.title, compileText(plan, "正方体、顶点、棱、面与截面"), `${path}.title`),
    fallback: compileText(plan, "一个中心在原点、边长为 2 的正方体，标出了顶点、棱、面和水平截面。"),
    axes: true,
    camera: { ...LESSON_PLAN_SCENE_INITIAL_CAMERAS.cube_with_section },
    objects: [{
      as: "solid", kind: "box", label: compileText(plan, "正方体"), color: "teal",
      center: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 2, z: 2 },
    }],
    sections: [{
      as: "section", axis: "z", value: height, targets: ["solid"],
      display: "plane_and_intersection", label: compileText(plan, "水平截面"), color: "orange",
    }],
    highlights: [
      { as: "vertex", kind: "point", points: [{ x: -1, y: -1, z: 1 }], label: compileText(plan, "顶点"), color: "red" },
      { as: "edge", kind: "edge", points: [{ x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }], label: compileText(plan, "棱"), color: "orange" },
      { as: "face", kind: "face", points: [{ x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }], label: compileText(plan, "面"), color: "purple" },
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
  const variable = number ? variableAlias(number) : undefined;
  const sceneContent: Record<string, unknown> = {
    title: optionalText(input.title, compileText(plan, "函数曲面与截面"), `${path}.title`),
    fallback: compileText(plan, "函数曲面 z={{v0}} 与可变截面。", { v0: expression }),
    axes: true,
    camera: { ...LESSON_PLAN_SCENE_INITIAL_CAMERAS.function_surface_with_section },
    objects: [{
      as: "surface", kind: "surface", label: `z=${expression}`, color: "teal", expression,
      x_range: { min: xMin, max: xMax }, y_range: { min: yMin, max: yMax }, samples,
    }],
    sections: [{
      as: "section", axis, value: sectionValue, targets: ["surface"],
      display: "plane_and_intersection", label: compileText(plan, "截面"), color: "orange",
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
  let surface: ReturnType<typeof buildImplicitSurfaceObject>;
  try {
    surface = buildImplicitSurfaceObject({
      as: "surface",
      expression,
      level,
      samples: 12,
      color: "teal",
      label: `${expression}=${level}`,
    });
  } catch (error) {
    fail(
      "LESSON_PLAN_CAPABILITY_PARAMETER",
      `${path}.expression`,
      error instanceof Error ? error.message : "implicit surface cannot be rendered",
    );
  }
  const number = content.numbers?.[0];
  const sectionValue = number ? numberDefinition(plan, number, `${path}.numbers[0]`).initial : 0;
  const variable = number ? variableAlias(number) : undefined;
  const sceneContent: Record<string, unknown> = {
    title: optionalText(input.title, compileText(plan, "隐式曲面与截面"), `${path}.title`),
    fallback: compileText(plan, "隐式曲面 {{v0}}={{v1}} 与可变轴向截面。", { v0: expression, v1: level }),
    axes: true,
    camera: { ...LESSON_PLAN_SCENE_INITIAL_CAMERAS.implicit_surface_with_section },
    objects: [surface],
    sections: [{
      as: "section", axis, value: sectionValue, targets: ["surface"],
      display: "plane_and_intersection", label: compileText(plan, "截面"), color: "orange",
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
  const extent = maximumRadius * 1.5;
  const geometry = {
    title: optionalText(input.title, compileText(plan, "坐标系中的圆"), `${path}.title`),
    axes: {
      x: { min: centerX - extent, max: centerX + extent, label: "x" },
      y: { min: centerY - extent, max: centerY + extent, label: "y" },
      equal_scale: true,
    },
    points: [{ as: "center", x: centerX, y: centerY, label: `(${centerX}, ${centerY})` }],
    circles: [{ as: "circle", center: "center", radius, label: variable ? compileText(plan, "半径 r") : `r = ${radius}` }],
    ...(variable ? { bindings: [{ target: "circle.radius", expression: formula ? replaceIdentifier(formula, "n1", variable) : variable,
      ...(formula ? { allow_zero: true, label: { prefix: "r = ", precision: 2 } } : {}) }] } : {}),
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

function minimumExpression(value: number, variable: string): string {
  return `((${value})+(${variable})-abs((${value})-(${variable})))/2`;
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
  const columnVariable = variableAlias(columnNumber);
  const rowVariable = variableAlias(rowNumber);
  const columns = Math.round(columnDefinition.initial);
  const rows = Math.round(rowDefinition.initial);
  const maximumColumns = Math.round(columnDefinition.max);
  const maximumRows = Math.round(rowDefinition.max);

  const points: Array<Record<string, unknown>> = [
    { as: "boundary-bottom-left", x: 0, y: 0, visible: false },
    { as: "boundary-bottom-right", x: columns, y: 0, visible: false },
    { as: "boundary-top-right", x: columns, y: rows, visible: false },
    { as: "boundary-top-left", x: 0, y: rows, visible: false },
    { as: "unit-bottom-left", x: 0, y: 0, visible: false },
    { as: "unit-bottom-right", x: 1, y: 0, visible: false },
    { as: "unit-top-right", x: 1, y: 1, visible: false },
    { as: "unit-top-left", x: 0, y: 1, visible: false },
  ];
  const segments: Array<Record<string, unknown>> = [];
  const bindings: Array<{ target: string; expression: string }> = [
    { target: "boundary-bottom-right.x", expression: columnVariable },
    { target: "boundary-top-right.x", expression: columnVariable },
    { target: "boundary-top-right.y", expression: rowVariable },
    { target: "boundary-top-left.y", expression: rowVariable },
  ];

  for (let column = 0; column <= maximumColumns; column += 1) {
    const x = Math.min(column, columns);
    points.push(
      { as: `column-${column}-bottom`, x, y: 0, visible: false },
      { as: `column-${column}-top`, x, y: rows, visible: false },
    );
    segments.push({
      as: `column-${column}`,
      from: `column-${column}-bottom`,
      to: `column-${column}-top`,
      style: column === 0 || column === maximumColumns ? "solid" : "dashed",
    });
    bindings.push(
      { target: `column-${column}-bottom.x`, expression: minimumExpression(column, columnVariable) },
      { target: `column-${column}-top.x`, expression: minimumExpression(column, columnVariable) },
      { target: `column-${column}-top.y`, expression: rowVariable },
    );
  }
  for (let row = 0; row <= maximumRows; row += 1) {
    const y = Math.min(row, rows);
    points.push(
      { as: `row-${row}-left`, x: 0, y, visible: false },
      { as: `row-${row}-right`, x: columns, y, visible: false },
    );
    segments.push({
      as: `row-${row}`,
      from: `row-${row}-left`,
      to: `row-${row}-right`,
      style: row === 0 || row === maximumRows ? "solid" : "dashed",
    });
    bindings.push(
      { target: `row-${row}-left.y`, expression: minimumExpression(row, rowVariable) },
      { target: `row-${row}-right.x`, expression: columnVariable },
      { target: `row-${row}-right.y`, expression: minimumExpression(row, rowVariable) },
    );
  }

  const geometry = {
    title: optionalText(input.title, compileText(plan, "单位正方形铺成长方形"), `${path}.title`),
    caption: compileText(plan, "每个小方格面积为 1 平方单位；每行方格数 × 行数 = 方格总数 = 长方形面积。"),
    axes: {
      x: { min: -0.75, max: maximumColumns + 0.75, label: compileText(plan, "每行方格数（长）") },
      y: { min: -0.75, max: maximumRows + 0.75, label: compileText(plan, "行数（宽）") },
      equal_scale: true,
    },
    points,
    polygons: [
      {
        as: "interior",
        points: ["boundary-bottom-left", "boundary-bottom-right", "boundary-top-right", "boundary-top-left"],
        tone: "primary",
      },
      {
        as: "unit-square",
        points: ["unit-bottom-left", "unit-bottom-right", "unit-top-right", "unit-top-left"],
        label: compileText(plan, "1 平方单位"),
        tone: "accent",
      },
    ],
    segments,
    bindings,
  };
  return {
    actions: [{ do: "write", as: base, kind: "geometry", role, content: geometry, place: placement }],
    whole: base,
    parts: new Map([
      ["whole", base],
      ["unit_square", `${base}#unit-square`],
      ["row", `${base}#row-1`],
      ["column", `${base}#column-1`],
      ["interior", `${base}#interior`],
      ["boundary", `${base}#interior`],
      ["primary_control", `${base}#interior`],
      ["secondary_control", `${base}#interior`],
    ]),
  };
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
  const recipe = rearrangementRecipe(construction, legA, legB);
  if (!recipe) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.construction`, "unsupported geometric construction");
  const facts = REARRANGEMENT_CONSTRUCTIONS[construction as RearrangementConstruction];
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
      ...(pointIndex === 2 ? { label: construction === "triangle_to_rectangle" ? "a" : "a+b" } : {}),
    })),
  ];
  // The representative triangle stays fixed in the Pythagorean recipe; labels
  // also follow its existing point bindings in the other triangle recipe.
  if (construction !== "square_area_identity") {
    segments.push(
      { as: "leg-a", from: "piece-1-point-1", to: "piece-1-point-2", style: "solid", label: "a" },
      { as: "leg-b", from: "piece-1-point-1", to: "piece-1-point-3", style: "solid", label: "b" },
      { as: "hypotenuse", from: "piece-1-point-2", to: "piece-1-point-3", style: "solid", label: "c" },
    );
    if (construction === "right_triangle_square") {
      const marker = Math.min(legA, legB) * 0.12;
      const pose = pieces[0].start;
      for (const [index, point] of [[marker, 0], [marker, marker], [0, marker]].entries()) {
        const [x, y] = transformedPoint(point as [number, number], pose);
        points.push({ as: `right-angle-point-${index + 1}`, x, y, visible: false });
      }
      segments.push(
        { as: "right-angle-1", from: "right-angle-point-1", to: "right-angle-point-2", style: "solid" },
        { as: "right-angle-2", from: "right-angle-point-2", to: "right-angle-point-3", style: "solid" },
      );
    }
  }
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
  if (construction === "right_triangle_square") {
    // A focus anchor in the initial c² gap and the final b² gap. The whole
    // outer square is not the central area; intermediate poses make no area claim.
    const start = (legA + legB) / 2;
    const endX = legA + legB / 2, endY = legB / 2;
    points.push({ as: "central-area", x: start + (endX - start) * progressInitial,
      y: start + (endY - start) * progressInitial, visible: false });
    if (progressVariable) bindings.push(
      { target: "central-area.x", expression: linearExpression(start, endX, progressExpression) },
      { target: "central-area.y", expression: linearExpression(start, endY, progressExpression) },
    );
  }
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
    // A fixed recipe owns its name just as it owns its shapes and proof;
    // a model-authored title must not identify it as a different construction.
    title: recipe.title,
    caption: facts.caption,
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
      ["central_area", `${base}#${construction === "right_triangle_square" ? "central-area" : "target-shape"}`],
      ...(construction !== "square_area_identity" ? [
        ["leg_a", `${base}#leg-a`], ["leg_b", `${base}#leg-b`], ["hypotenuse", `${base}#hypotenuse`],
      ] as Array<[string, string]> : []),
      ...(progressVariable ? [["primary_control", base]] as Array<[string, string]> : []),
    ]),
  };
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
  const progress=variable&&d?`(${variable}-${d.min})/(${d.max-d.min})`:"0";
  const initial=d?(d.initial-d.min)/(d.max-d.min):0;
  const actions: AuthoringAction[]=[];
  for (const [panel,n] of [8,16].entries()) {
    const id=panel===0?base:`${base}-refined`;
    const angle=2*Math.PI/n, chord=2*r*Math.sin(angle/2), height=r*Math.cos(angle/2);
    const points: Array<Record<string,unknown>>=[];
    const arcs: Array<Record<string,unknown>>=[];
    const bindings: Array<{target:string;expression:string}>=[];
    for(let i=0;i<n;i++) {
      const center=`center-${i}`, sector=`sector-${i}`;
      const up=i%2===0;
      const endX=(i/2)*chord, endY=up?0:height;
      const start=i*angle, end=(up?Math.PI/2:-Math.PI/2)-angle/2;
      points.push({as:center,x:endX*initial,y:endY*initial,visible:false});
      arcs.push({as:sector,center,radius:r,start_angle:start+(end-start)*initial,end_angle:start+angle+(end-start)*initial,filled:true});
      if(variable) bindings.push(
        {target:`${center}.x`,expression:`${endX}*(${progress})`},
        {target:`${center}.y`,expression:`${endY}*(${progress})`},
        {target:`${sector}.start_angle`,expression:linearExpression(start,end,progress)},
        {target:`${sector}.end_angle`,expression:linearExpression(start+angle,end+angle,progress)},
      );
    }
    actions.push({do:"write",as:id,kind:"geometry",role,place:panel===0?placement:{relation:"below",anchor:base,gap:"normal"},content:{
      title:compileText(plan, "{{v0}} 等分圆的面积重排", { v0: n }),
      caption:compileText(plan, "半径 r={{v0}}；每块均为真实扇形，重排面积不变。有限等分的边缘仍弯曲；等分越细，底趋近 πr，高趋近 r，面积为 πr²。", { v0: r }),
      axes:{x:{min:-r*1.3,max:Math.PI*r+r},y:{min:-r*1.3,max:r*1.6},equal_scale:true},
      points,arcs,...(bindings.length?{bindings}:{}),
    }});
  }
  return {actions,whole:base,parts:new Map([["whole",base],...(variable?[["primary_control",base] as [string,string]]:[])])};
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
