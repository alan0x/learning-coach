// Recipe compilers of the math plugin: validated recipe parameters to OLL authoring actions.
import {
  buildCircleAndArc, buildCircleAreaRearrangement, buildCirclePolygons, buildCoordinateCircle, buildFunctionPlot,
  buildCubeWithSection, buildFunctionSurface, buildGeometricRearrangement, buildImplicitSurface,
  buildNumberLine, buildUnitCircle, buildUnitSquareArray, rearrangementRecipe, NUMBER_LINE_LIMITS,
  buildSolid, describeSolid, solidHasMeasure, solidUnfolds,
  type BuiltRecipe, type RearrangementConstruction, type Solid, type SolidMeasureKind,
} from "octos-lesson-language/plugin-math";
import { compileText, lessonTextLanguage } from "../lesson-text.js";
import { type CompiledVisual } from "../compiled-visual-reuse.js";
import { plotCurveNumbers, plotSampleNumbers } from "./plot-bindings.js";
import { planPlotView, type PlotView } from "../plot-view-planner.js";
import { parseModelFormula } from "./math-formulas.js";
import { compileMathExpression, type AuthoringAction } from "octos-lesson-language";
import { LESSON_PLAN_CAPABILITY_NUMBER_LIMITS, LessonPlanError, type JsonValue, type LessonPlan, type LessonPlanMathExpression, type LessonPlanVisualContent } from "../lesson-plan.js";
import { buildImplicitSurfaceObject } from "../scene3d-surfaces.js";
import { COARSE_UNITS, lessonValues, moveLandings } from "./number-line-fit.js";
import { PLOT_MARKS, formulaBars, intervalOf, markParts, pieceBars, signOf, type AxisBar, type Interval, type MarkPart, type PlotMark } from "./plot-marks.js";
import { fail, pad, variableAlias, parameters, allowParameterKeys, optionalText, optionalNumber, optionalInteger, optionalStringArray, assertRange, replaceIdentifier, safeFunctionExpression, evaluate, mathExpressionToOll, place, numberDefinition, namedNumbers, displayNumberSymbols, formatMathExpressionDisplay, angleScaleForUnit, scaledAngleExpression, type VisualCompiler } from "../recipe-kit.js";

function compileFunctionPlot(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "expression", "expressions", "expression_tokens", "sample_x_numbers", "curve_label", "curve_labels", "x_label", "y_label", "x_min", "x_max", "y_min", "y_max", "marks", "pieces", "points", "sample_labels"], path);
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
  // Labels that do not match the curves one to one are left out: the compiler derives a legend from each
  // formula anyway (owner's principles, 2026-11-16: accept what has one safe reading, refuse only meaning).
  if (curveLabels.length > 0 && curveLabels.length !== expressions.length) curveLabels.length = 0;
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
  const pieces = plotPieces(input.pieces, expressions.length, path);
  const teachingPointsFromPieces: Array<{ x: number; y: number }> = [];
  const curves = expressions.map((item, index) => ({
    expression: item,
    label: curveLabels[index]
      ?? (index === 0 && input.curve_label !== undefined
        ? namedNumbers(optionalText(input.curve_label, "", `${path}.curve_label`), plan)
        : defaultCurveLabel(rawExpressions[index] ?? item)),
    // A piece of one function (decision 0018 §2): drawn only on its interval, its ends open or closed;
    // the pieces share a series, so the legend, colour and line style treat them as one function.
    ...(pieces ? {
      ...(pieces[index]!.from !== null ? { from: pieces[index]!.from, from_closed: pieces[index]!.from_closed } : {}),
      ...(pieces[index]!.to !== null ? { to: pieces[index]!.to, to_closed: pieces[index]!.to_closed } : {}),
      series: "f",
    } : {}),
  }));
  // A piece's finite ends, with its value there, must be in view.
  for (const [index, piece] of (pieces ?? []).entries()) {
    for (const x of [piece.from, piece.to]) {
      if (x === null) continue;
      const y = compileMathExpression(expressions[index]!, ["x"])({ x });
      if (Number.isFinite(y)) teachingPointsFromPieces.push({ x, y });
    }
  }

  // Points on a fixed curve: the initial positions and the creation section's
  // animation endpoints must be visible; the slider ends may join the view.
  const sampleAt = (x: number, where: string) => ({ x, y: evaluate(expression, ["x"], { x }, where) });
  const samples = sampleNumbers.map((sampleNumber, index) => {
    const d = numberDefinition(plan, sampleNumber, `${path}.numbers`);
    for (const x of [d.min, d.max]) evaluate(expression, ["x"], { x }, `${path}.expression`);
    return { ...sampleAt(d.initial, `${path}.expression`),
      label: (Array.isArray(input.sample_labels) && typeof input.sample_labels[index] === "string" ? input.sample_labels[index] as string : undefined)
        ?? (sampleNumbers.length === 2 ? (index === 0 ? "A" : "B") : "P(x, y)"), x_expression: variableAlias(sampleNumber) };
  });
  const teachingPoints: Array<{ x: number; y: number }> = [...samples.map(({ x, y }) => ({ x, y })), ...teachingPointsFromPieces];
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
  // Marks (decision 0018 §1) are named by the model; the slope triangle is drawn by the points below.
  // A mark the program cannot draw for this plot is left out and the rest is drawn (0018, as amended after
  // the trial): refusing it asked for the whole section again, about 9 s, and the model asked for the same
  // or another mark it cannot have. An empty list is no marks.
  const requestedMarks = input.marks === undefined || (Array.isArray(input.marks) && input.marks.length === 0) ? [] : [...new Set(optionalStringArray(input.marks, [], `${path}.marks`))];
  let markList = requestedMarks.filter((mark) => (PLOT_MARKS as readonly string[]).includes(mark));
  // A piecewise function takes only domain and range; other marks need one formula, and a comparison of
  // several curves takes none.
  if (expressions.length !== 1) markList = markList.filter((mark) => mark === "domain" || mark === "range");
  if (expressions.length !== 1 && input.pieces === undefined) markList = [];
  // The triangle measures two points: the model's two, or the program's. With one point of the model's, the
  // triangle runs from it (A) to B two units to its right, which moves with it (run B: the model gave the
  // point at x = 1 and narrated the rise and run to x = 3; leaving the triangle out left that undrawn). B must
  // stay on the curve wherever A can be: every slider stop and value the lesson gives it; otherwise the
  // triangle is left out.
  if (sampleNumbers.length === 1 && markList.includes("slope_triangle")) {
    const second = secondSampleTwoRight(plan, sampleNumbers[0]!, expression, creationMoments, path);
    if (second) {
      if (!(Array.isArray(input.sample_labels) && typeof input.sample_labels[0] === "string")) samples[0]!.label = "A";
      samples.push(second.sample);
      teachingPoints.push({ x: second.sample.x, y: second.sample.y }, ...second.shown);
      optionalPoints.push(...second.ends);
    } else markList = markList.filter((mark) => mark !== "slope_triangle");
  }
  const barMarks = markList.filter((mark) => mark === "domain" || mark === "range");
  const slopeTriangle = markList.includes("slope_triangle");

  // Slope lessons with curve parameters still need visible reference points.
  // Their x positions are fixed; the parameter sliders change the curve.
  // With marks (decision 0018) the points stand two units apart, off x = 0, where the y-intercept mark
  // sits: the first pair where the curve exists at the start and at every demonstrated state.
  // Fixed points the model wrote as {x, y} (decision 0020; the hook lowered dragged points to samples). Each
  // is checked against the curve and drawn at the curve's value; one the program cannot draw is refused,
  // never dropped, since the narration talks about it.
  const fixedPoints = input.points === undefined ? undefined : validFixedPoints(input.points, `${path}.points`);
  // Labels as the model wrote them, in its order; a missing one takes A or B, whichever the other did not.
  const freeLabels = ["A", "B"].filter((name) => !fixedPoints?.some((point) => point.label === name));
  const pointLabels = fixedPoints?.map((point, index) => point.label
    ?? (fixedPoints.length === 1 ? "P" : freeLabels.shift() ?? (index ? "B" : "A")));
  const extraPoints: Array<MarkPart & { at: (values: Record<string, number>) => { x?: number; y?: number } }> = [];
  if (fixedPoints?.length) {
    const where = `${path}.points`;
    if (expressions.length !== 1) fail("LESSON_PLAN_POINT", where, "points sit on one formula; a comparison of several curves takes none");
    if (sampleNumbers.length) fail("LESSON_PLAN_POINT", where, "the points of one plot are all fixed ({x, y}) or all dragged ({slider}), not both");
    if (fixedPoints.length === 1 && slopeTriangle) fail("LESSON_PLAN_POINT", where, "a slope triangle needs two points: write the second point as {x, y}");
    const evaluateCurve = compileMathExpression(expression, expressionVariables);
    const valueAt = (values: Record<string, number>, x: number) => { try { return evaluateCurve({ ...values, x }); } catch { return Number.NaN; } };
    const reachedAll = [initialState, ...demonstrations, ...curveParameters.flatMap((parameter) => [parameter.min, parameter.max].map((value) => ({ ...initialState, [parameter.name]: value })))];
    for (const [index, point] of fixedPoints.entries()) {
      if (!reachedAll.every((values) => Number.isFinite(valueAt(values, point.x)))) {
        fail("LESSON_PLAN_POINT", `${where}[${index}].x`, `the curve has no value at x = ${point.x}${curveParameters.length ? " for some slider value" : ""}; choose another x`);
      }
      const y = valueAt(initialState, point.x);
      if (!pointYMatches(y, point.y)) {
        fail("LESSON_PLAN_POINT", `${where}[${index}].y`, `the curve gives y = ${Number(y.toPrecision(6))} at x = ${point.x}, not ${point.y}: write the curve's value, or check the formula`);
      }
    }
    if (fixedPoints.length === 1) {
      const point = fixedPoints[0]!;
      const yText = replaceIdentifier(expression, "x", `(${point.x})`);
      extraPoints.push({ kind: "point", as: "fixed-point", label: pointLabels![0]!, x: String(point.x), y: yText, at: (values) => ({ x: point.x, y: valueAt(values, point.x) }) });
      // In view at the start and at every demonstrated state, as reference points are (review of #113).
      teachingPoints.push(...[initialState, ...demonstrations].map((values) => ({ x: point.x, y: valueAt(values, point.x) })).filter((spot) => Number.isFinite(spot.y)));
    }
  }
  let references: Array<{ x: number; y: number; label: string }> | undefined;
  if (fixedPoints?.length === 2) {
    // Two fixed points are the plot's reference points, in the model's order and with its labels.
    const evaluateCurve = compileMathExpression(expression, expressionVariables);
    const at = (values: Record<string, number>, x: number) => { try { return evaluateCurve({ ...values, x }); } catch { return Number.NaN; } };
    // Each keeps its own label; left to right, so the triangle's run and rise are positive (review of #113).
    references = fixedPoints.map((point, index) => ({ x: point.x, y: at(initialState, point.x), label: pointLabels![index]! })).sort((a, b) => a.x - b.x);
    teachingPoints.push(...references, ...demonstrations.flatMap((values) => fixedPoints.map((point) => ({ x: point.x, y: at(values, point.x) }))).filter((spot) => Number.isFinite(spot.y)));
  } else if (expressions.length === 1 && !sampleNumbers.length && !fixedPoints?.length && (slopeTriangle || /斜率|割线|slope|secant/i.test([plan.title, ...plan.goals].join(" ")))) {
    const evaluateCurve = compileMathExpression(expression, expressionVariables);
    const referencePoints = (values: Record<string, number>, xs: readonly number[]) => xs.flatMap((x, index) => {
      try {
        const y = evaluateCurve({ ...values, x });
        return Number.isFinite(y) ? [{ x, y, label: index ? "B" : "A" }] : [];
      } catch {
        return [];
      }
    });
    const pairs: ReadonlyArray<readonly [number, number]> = markList.length ? [[1, 3], [2, 4], [-1, 1], [3, 5], [-3, -1], [4, 6], [-5, -3], [6, 8], [8, 10], [0.5, 1.5]] : [[0, 1]];
    // With marks: at the start, at every demonstrated state and at each curve slider's ends, where a learner
    // can drag the curve away from a point whose y is not hidden (review). Without marks the points are found
    // as before the option, at the start only, so a lesson without marks compiles exactly as it did (review).
    const reached = markList.length
      ? [initialState, ...demonstrations, ...curveParameters.flatMap((parameter) => [parameter.min, parameter.max].map((value) => ({ ...initialState, [parameter.name]: value })))]
      : [initialState];
    const xs = pairs.find((pair) => reached.every((values) => referencePoints(values, pair).length === 2));
    if (xs) {
      references = referencePoints(initialState, xs);
      teachingPoints.push(...references, ...demonstrations.flatMap((values) => referencePoints(values, xs)));
    }
    // No pair fits (√(x − 50) in this window): the triangle is left out.
  }

  // Marks (decision 0018 §1): derived from the one formula, bound to its lesson numbers, hidden while they
  // do not exist. Where they are at the start and at each demonstrated state must be in view.
  const derivedMarks = markList.filter((mark) => mark !== "slope_triangle" && mark !== "domain" && mark !== "range");
  let marks: Array<MarkPart & { at: (values: Record<string, number>) => { x?: number; y?: number; value?: number } }> = [];
  if (derivedMarks.length) {
    const tokens = dynamicTokens ?? parseModelFormula(rawExpressions[0]!, 0, `${path}.expression`);
    const variables = curveParameters.map((parameter) => parameter.name);
    const samples = [initialState, ...demonstrations, ...curveParameters.flatMap((parameter) => [parameter.min, parameter.max].map((value) => ({ ...initialState, [parameter.name]: value })))];
    // Each mark alone: one the formula cannot give (a vertex of a line, intercepts of a cubic, coefficients
    // too long for a binding) is left out, the others are drawn.
    const drawable = derivedMarks.filter((mark) => leftOutWhenRefused(() => markParts(tokens, [mark as PlotMark], (source) => source, { variables, samples }, path)));
    marks = (drawable.length ? markParts(tokens, drawable as PlotMark[], (source) => compileText(plan, source), { variables, samples }, path) : []).map((part) => {
      const compiled = (["x", "y", "value"] as const).flatMap((key) => (part[key] === undefined ? [] : [[key, compileMathExpression(part[key]!, variables)] as const]));
      return { ...part, at: (values: Record<string, number>) => Object.fromEntries(compiled.map(([key, f]) => {
        let result = Number.NaN;
        try { result = f(values); } catch { /* not defined here */ }
        return [key, result];
      })) };
    });
    for (const values of [initialState, ...demonstrations]) {
      for (const mark of marks) {
        const where = mark.at(values);
        if (mark.kind === "point" && Number.isFinite(where.x) && Number.isFinite(where.y)) teachingPoints.push({ x: where.x!, y: where.y! });
      }
    }
  }

  // Domain and range bars (decision 0018 §3), from exact formulas only.
  let bars: AxisBar[] = [];
  if (barMarks.length) {
    const want = { domain: barMarks.includes("domain"), range: barMarks.includes("range") };
    const variables = curveParameters.map((parameter) => parameter.name);
    // Every value a lesson number can take: its min to max (a slider, or an animation in any section),
    // widened to the values this section shows it at.
    const bounds: Record<string, Interval> = Object.fromEntries(curveParameters.map((parameter) => {
      const reached = [parameter.min, parameter.max, parameter.initial, ...demonstrations.map((state) => state[parameter.name]!)];
      return [parameter.name, [Math.min(...reached), Math.max(...reached)] as const];
    }));
    const sign = (text: string) => {
      const interval = intervalOf(text, bounds);
      const proved = signOf(interval);
      if (proved === "unknown") return proved;
      // A guard on the interval reading: OLL's own evaluation at the corners and inside the bounds must
      // fall in the interval, or the sign is not trusted.
      const f = compileMathExpression(text, variables);
      const corners = variables.reduce<Array<Record<string, number>>>((states, name) => states.flatMap((state) => bounds[name]!.map((value) => ({ ...state, [name]: value }))), [{}]);
      const inside = Array.from({ length: 32 }, (_, index) => Object.fromEntries(variables.map((name, position) => {
        const [lo, hi] = bounds[name]!;
        return [name, lo + (hi - lo) * (((index + 1) * (position + 2) * 0.6180339887) % 1)];
      })));
      for (const state of [...corners.slice(0, 64), ...inside]) {
        let value = Number.NaN;
        try { value = f(state); } catch { /* not defined here */ }
        if (!(value >= interval[0] - 1e-9 * Math.max(1, Math.abs(interval[0])) && value <= interval[1] + 1e-9 * Math.max(1, Math.abs(interval[1])))) return "unknown";
      }
      return proved;
    };
    const barsFor = (one: { domain: boolean; range: boolean }) => (pieces
      ? pieceBars(pieces.map((piece, index) => ({ ...piece, tokens: parseModelFormula(expressions[index]!, 0, `${path}.pieces[${index}]`, { allowConstant: true }) })), one, path)
      : formulaBars(dynamicTokens ?? parseModelFormula(rawExpressions[0]!, 0, `${path}.expression`), one, { sign }, path));
    // Domain and range each alone: one the program cannot derive exactly is left out (never estimated).
    for (const axis of ["domain", "range"] as const) {
      if (want[axis]) leftOutWhenRefused(() => bars.push(...barsFor({ domain: axis === "domain", range: axis === "range" })));
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
  if (extraPoints.length) appendMarks(built.actions[0] as unknown as { content: Record<string, unknown> }, extraPoints, initialState);
  if (marks.length) appendMarks(built.actions[0] as unknown as { content: Record<string, unknown> }, marks, initialState);
  if (bars.length) appendBars(built.actions[0] as unknown as { content: Record<string, unknown> }, bars, initialState, (source) => compileText(plan, source));
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

/**
 * B for a slope triangle on one model point A: x = A + 2, bound to A's number, on the curve wherever A can
 * be (each slider stop between its min and max, and each value the creation section animates it to).
 * Undefined when the curve does not exist at some A + 2.
 */
function secondSampleTwoRight(plan: LessonPlan, sampleNumber: number, expression: string, creationMoments: LessonPlan["sections"][number]["moments"], path: string): { sample: { x: number; y: number; label: string; x_expression: string }; shown: Array<{ x: number; y: number }>; ends: Array<{ x: number; y: number }> } | undefined {
  const d = numberDefinition(plan, sampleNumber, `${path}.numbers`);
  const curve = compileMathExpression(expression, ["x"]);
  const at = (x: number) => { try { const y = curve({ x }); return Number.isFinite(y) ? y : undefined; } catch { return undefined; } };
  const step = d.student_control?.step && d.student_control.step > 0 ? d.student_control.step : (d.max - d.min) / 200;
  // Stops are clamped to the max: d.min + index·step can overshoot it by a rounding error (review: −5 + 7·1
  // gave 2.000000000000001, where √(4 − x) at B does not exist).
  const stops = d.max > d.min ? Array.from({ length: Math.min(2001, Math.floor((d.max - d.min) / step + 1e-9) + 1) }, (_, index) => Math.min(d.max, Number((d.min + index * step).toPrecision(12)))) : [];
  const animated = creationMoments.flatMap((moment) => moment.actions).flatMap((action) => (action.action === "animate" && action.number === sampleNumber ? [action.end_value] : []));
  for (const x of [d.min, d.max, d.initial, ...stops, ...animated]) if (at(x + 2) === undefined) return undefined;
  // B's y binding is the curve at A + 2; OLL caps a binding at 256 characters (review), so a longer one leaves
  // the triangle out, as a mark's does.
  const xB = `(${variableAlias(sampleNumber)})+2`;
  if (expression.replace(/\bx\b/gu, `(${xB})`).length > 240) return undefined;
  const point = (x: number) => ({ x: x + 2, y: at(x + 2)! });
  return {
    sample: { ...point(d.initial), label: "B", x_expression: xB },
    shown: animated.map(point),
    ends: [d.min, d.max].map(point),
  };
}

/**
 * Runs one mark's derivation: true when it can be drawn, false when the program refuses it for this plot
 * (a section-owned capability fault from plot-marks or plot-domain-range). Any other fault is not a mark's
 * and still fails the section.
 */
function leftOutWhenRefused(derive: () => unknown): boolean {
  try {
    derive();
    return true;
  } catch (error) {
    if (error instanceof LessonPlanError && error.code === "LESSON_PLAN_CAPABILITY_PARAMETER") return false;
    throw error;
  }
}

/**
 * Adds domain and range bars to a built plot. An end that reads lesson numbers is bound to them and hidden
 * while it has no value (the bar of the other sign); the first bar on each axis carries the label, and so
 * does a bar shown instead of the one before it (the other sign), which is then the only one shown.
 */
function appendBars(action: { content: Record<string, unknown> }, bars: AxisBar[], initial: Record<string, number>, labels: (source: string) => string): void {
  const content = action.content;
  const intervals: unknown[] = [];
  const bindings = [...((content.bindings as unknown[] | undefined) ?? [])];
  const variables = Object.keys(initial);
  const reads = (text: string) => /\bnumber_\d+\b/u.test(text);
  const labelled = new Set<string>();
  bars.forEach((bar, index) => {
    const as = `${bar.axis === "x" ? "domain" : "range"}-${index + 1}`;
    const end = (text: string | null) => {
      if (text === null) return null;
      let value = Number.NaN;
      try { value = compileMathExpression(text, variables)(initial); } catch { /* bound and hidden */ }
      return Number.isFinite(value) ? Number(value.toPrecision(12)) : 0;
    };
    const from = end(bar.from), to = end(bar.to);
    intervals.push({
      as, axis: bar.axis, from, to,
      ...(bar.from !== null ? { from_closed: bar.from_closed } : {}),
      ...(bar.to !== null ? { to_closed: bar.to_closed } : {}),
      ...(!labelled.has(bar.axis) || bar.alternative ? { label: labels(bar.axis === "x" ? "定义域" : "值域") } : {}),
    });
    labelled.add(bar.axis);
    for (const [key, text] of [["from", bar.from], ["to", bar.to]] as const) {
      if (text !== null && reads(text)) bindings.push({ target: `${as}.${key}`, expression: text, hide_when_undefined: true });
    }
  });
  content.intervals = intervals;
  if (bindings.length) content.bindings = bindings;
}

/** The lowered pieces of a piecewise function, one per expression, or undefined when the plot has none. */
function plotPieces(value: unknown, expressionCount: number, path: string): Array<{ from: number | null; to: number | null; from_closed: boolean; to_closed: boolean }> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== expressionCount) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.pieces`, "each piece needs its own formula");
  return value.map((entry, index) => {
    const piece = (entry ?? {}) as Record<string, unknown>;
    const end = (key: string) => (piece[key] === null || piece[key] === undefined ? null : optionalNumber(piece[key] as never, 0, `${path}.pieces[${index}].${key}`));
    return { from: end("from"), to: end("to"), from_closed: piece.from_closed !== false, to_closed: piece.to_closed !== false };
  });
}

/**
 * Whether a y the model wrote is the curve's value: the curve's value rounded to the digits written equals
 * it (1/3 written 0.33 or 0.3), and a whole number means a whole number (2 is not the curve's 1.6).
 */
function pointYMatches(curve: number, written: number): boolean {
  if (!Number.isFinite(curve)) return false;
  const text = String(written);
  // Digits after the point as written; a small number prints in exponent form (1e-7 has 7, 2.5e-7 has 8).
  const exponent = /e-(\d+)$/iu.exec(text);
  const mantissaDigits = text.replace(/e.*$/iu, "").split(".")[1]?.length ?? 0;
  const digits = exponent ? mantissaDigits + Number(exponent[1]) : mantissaDigits;
  // Half a unit of the last digit written (1.5 for 1.45, 0.66 or 0.67 for 2/3 is not: 0.66 is 0.0067 off);
  // a whole number must be the curve's value, so 0 is not 0.04 and 2 is not 1.6 (review of #113).
  const tolerance = digits > 0 ? 0.5 * 10 ** -digits : 0;
  return Math.abs(curve - written) <= tolerance + 1e-9 * Math.max(1, Math.abs(written));
}

/** The fixed points of a plot, as lower_model_parameters leaves them: one or two {x, y}, each x different. */
function validFixedPoints(value: unknown, path: string): Array<{ x: number; y: number; label?: string }> {
  const ok = Array.isArray(value) && value.length >= 1 && value.length <= 2 && value.every((point) => point && typeof point === "object"
    && Number.isFinite((point as { x?: unknown }).x) && Number.isFinite((point as { y?: unknown }).y) && (point as { slider?: unknown }).slider === undefined);
  if (!ok) fail("LESSON_PLAN_POINT", path, "points holds one or two fixed points {x, y}");
  const points = value as Array<{ x: number; y: number; label?: string }>;
  if (points.length === 2 && points[0]!.x === points[1]!.x) fail("LESSON_PLAN_POINT", path, "two fixed points need two different x");
  return points;
}

/**
 * Adds marks to a built plot, after its samples or references (the secant measures the first two points).
 * A mark that reads lesson numbers is bound to them and hidden while its value does not exist; a fixed
 * mark that does not exist (a parabola that never meets the x-axis) is left out.
 */
function appendMarks(action: { content: Record<string, unknown> }, marks: Array<MarkPart & { at: (values: Record<string, number>) => { x?: number; y?: number; value?: number } }>, initial: Record<string, number>): void {
  const content = action.content;
  const points = [...((content.points as unknown[] | undefined) ?? [])];
  const guides = [...((content.guides as unknown[] | undefined) ?? [])];
  const bindings = [...((content.bindings as unknown[] | undefined) ?? [])];
  const reads = (text: string | undefined) => text !== undefined && /\bnumber_\d+\b/u.test(text);
  for (const mark of marks) {
    const where = mark.at(initial);
    const keys = mark.kind === "point" ? (["x", "y"] as const) : (["value"] as const);
    const bound = keys.filter((key) => reads(mark[key]));
    if (!bound.length && keys.some((key) => !Number.isFinite(where[key]))) continue;
    const start = (key: "x" | "y" | "value") => (Number.isFinite(where[key]) ? Number(where[key]!.toPrecision(12)) : 0);
    if (mark.kind === "point") points.push({ as: mark.as, x: start("x"), y: start("y"), label: mark.label });
    else guides.push({ as: mark.as, kind: "vertical_line", value: start("value"), label: mark.label });
    for (const key of bound) bindings.push({ target: `${mark.as}.${key}`, expression: mark[key], hide_when_undefined: true });
  }
  if (points.length) content.points = points;
  if (guides.length) content.guides = guides;
  if (bindings.length) content.bindings = bindings;
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
 *   values the lesson itself shows (`shown`): the finest whole step of 1 or a coarse unit (2 … 1000) with at most 60
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
    const whole = [1, ...COARSE_UNITS].find((count) => span / count <= 60 && holdAll(count, of));
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
  // Every value the lesson moves a to stays below every value it moves b to; the fit keeps the two
  // sliders' ranges apart between them, and never changes a value to make them fit (review of #68).
  if (bounds.length === 2) {
    const [first, second] = bounds.map(({ number, definition }) => [definition.initial, ...lessonValues(plan, number)]);
    if (!(Math.max(...first!) < Math.min(...second!))) {
      fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.numbers`, "every value the lesson gives the first boundary (a) must stay smaller than every value it gives the second (b)");
    }
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

/**
 * A number line in steps (decision 0017): a start and two or three moves, each its own jump from where
 * the one before landed, and the end. The landings are jump ends, so the player keeps their tick labels.
 * - One move is the number line's (`number_line`), and more than three is out of scope: both are refused
 *   as a fault the outline owns, naming this recipe, so the outline is asked again without it and may
 *   still choose the one-move line. One jump under narration of two steps is the defect the probe found
 *   (Coach #79).
 * - Hops only when every move goes the same way. A move with a slider is judged on its whole range (the
 *   learner can turn it back); a fixed one on the values the lesson gives it, since the model writes wide
 *   ranges it never uses (5 in 0 to 10). A move that turns back over an earlier one is drawn raised, as
 *   one arc even with hops (OLL #61), so its narration must not count hops; drawing none keeps the line
 *   and the card in step.
 */
function compileNumberLineSteps(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const { title, labelStyle } = numberLineLabelStyle(content, path);
  const [startNumber, ...moveNumbers] = content.numbers ?? [];
  if (!startNumber || moveNumbers.length < 2 || moveNumbers.length > 3) {
    throw new LessonPlanError("LESSON_PLAN_OUTLINE_VISUAL", `${path}.numbers`,
      "a number line in steps needs a start and two or three moves; one move is drawn by number_line", "number_line_steps");
  }
  const start = numberDefinition(plan, startNumber, `${path}.numbers[0]`);
  const moves = moveNumbers.map((number, position) => numberDefinition(plan, number, `${path}.numbers[${position + 1}]`));
  // Every value a slider can reach: the start's, and each landing's lowest, highest and starting value.
  const values = [start.min, start.max, start.initial];
  let lowest = start.min, highest = start.max, initial = start.initial;
  for (const move of moves) {
    lowest += move.min;
    highest += move.max;
    initial += move.initial;
    values.push(lowest, highest, initial);
  }
  const grid = [
    ...values,
    ...moves.flatMap((move) => [move.min, move.max, move.initial]),
    ...[start, ...moves].map((definition) => definition.student_control?.step).filter((step): step is number => typeof step === "number" && step > 0),
  ];
  const shown = [
    start.initial, ...lessonValues(plan, startNumber),
    ...moves.flatMap((move, position) => [move.initial, ...lessonValues(plan, moveNumbers[position]!)]),
    ...moveLandings(plan, [startNumber, ...moveNumbers]),
  ];
  const frame = numberLineFrame(values, grid, shown, labelStyle, path);
  const unit = frame.step / frame.subdivisions;
  const whole = (value: number) => onGrid(value / unit, 1);
  // The values each move can take: its whole range with a slider, else the values the lesson gives it.
  const takes = moves.map((move, position) => (move.student_control
    ? [move.min, move.max, move.initial]
    : [move.initial, ...lessonValues(plan, moveNumbers[position]!)]));
  const oneWay = takes.every((values) => values.every((value) => value >= 0)) || takes.every((values) => values.every((value) => value <= 0));
  const hops = oneWay && moves.every((move, position) => takes[position]!.every(whole)
    && (move.student_control?.step === undefined || whole(move.student_control.step))
    && Math.ceil(Math.max(...takes[position]!.map(Math.abs)) / unit - 1e-9) <= NUMBER_LINE_LIMITS.hops);
  const startVariable = variableAlias(startNumber);
  const moveVariables = moveNumbers.map((number) => variableAlias(number));
  const sum = (count: number) => [startVariable, ...moveVariables.slice(0, count)].map((name) => `(${name})`).join("+");
  const sumInitial = (count: number) => Number([start, ...moves.slice(0, count)].reduce((total, definition) => total + definition.initial, 0).toPrecision(12));
  const jumpNames = ["move", "move2", "move3"];
  const built = buildNumberLine({
    as: base, role, place: placement,
    title: optionalText(title, compileText(plan, "数轴"), `${path}.title`),
    range: frame.range,
    ticks: frame.ticks,
    points: [
      { as: "start", value: { expression: startVariable, initial: start.initial }, label: compileText(plan, "起点") },
      { as: "end", value: { expression: sum(moves.length), initial: sumInitial(moves.length) }, label: compileText(plan, "终点") },
    ],
    jumps: moves.map((move, position) => ({
      as: jumpNames[position]!,
      from: position === 0 ? "start" : { expression: sum(position), initial: sumInitial(position) },
      by: { expression: moveVariables[position]!, initial: move.initial },
      hops,
    })),
  });
  return { ...builtVisual(built), parts: new Map(Object.entries({ ...built.parts, ...(built.parts.move ? { primary_control: built.parts.move } : {}) })) };
}

// ---- 3D solids (decision 0019, amended by 0020) --------------------------------------------------------
// The model writes each solid's shape and the sizes the question states, how two solids are joined, which
// measures to show and whether a cut or a net is wanted. The program converts a regular base's edge to the
// builder's circumradius, computes the measures, places a second solid beside the first, and creates the
// slider with the range the geometry decides.

const SOLID_SHAPES = ["box", "cylinder", "cone", "sphere", "hemisphere", "prism", "pyramid", "frustum"] as const;
const SOLID_SIZES = ["length", "width", "height", "radius", "top_radius", "sides", "side"] as const;
/** Regular bases the card offers (decision 0019 §1: triangle to octagon). */
const REGULAR_SIDES = { min: 3, max: 8 } as const;
const SOLID_MEASURES: readonly SolidMeasureKind[] = ["volume", "surface_area", "counts"];

type ModelSolid = Partial<Record<typeof SOLID_SIZES[number], number>> & { shape: typeof SOLID_SHAPES[number] };
type Adjustment = { reason: string; detail: string };

function modelSolid(value: JsonValue | undefined, path: string, adjustments: Adjustment[]): ModelSolid {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, "expected a solid: its shape and sizes");
  const record = value as Record<string, JsonValue>;
  if (!SOLID_SHAPES.includes(record.shape as typeof SOLID_SHAPES[number])) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.shape`, `expected one of ${SOLID_SHAPES.join(", ")}`);
  }
  const solid: ModelSolid = { shape: record.shape as ModelSolid["shape"] };
  const used = SHAPE_SIZES[solid.shape];
  for (const key of SOLID_SIZES) {
    const size = record[key];
    if (size === undefined || size === null) continue;
    // Sizes the shape is not drawn from that say nothing: a zero (the provider fills fields the model
    // leaves), the sides of a round solid, a cylinder's top radius equal to its radius. One reading: unused.
    const round = solid.shape === "cylinder" || solid.shape === "cone" || solid.shape === "sphere" || solid.shape === "hemisphere";
    if (!used.includes(key) && (size === 0 || (key === "sides" && round) || (key === "top_radius" && solid.shape === "cylinder" && size === record.radius))) {
      adjustments.push({ reason: "solid_unused_size", detail: `${path}.${key}: ${String(size)} on a ${solid.shape}, not used` });
      continue;
    }
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.${key}`, `${key} must be a positive number`);
    solid[key] = size;
  }
  return solid;
}

/** One solid for the builder, from the sizes the question states; a size its shape needs and lacks is refused. */
/** The sizes each shape is drawn from; any other size written means another solid was meant. */
const SHAPE_SIZES: Record<ModelSolid["shape"], ReadonlyArray<typeof SOLID_SIZES[number]>> = {
  box: ["length", "width", "height", "side"], cylinder: ["radius", "height"], cone: ["radius", "height"],
  sphere: ["radius"], hemisphere: ["radius"], frustum: ["radius", "top_radius", "height"],
  prism: ["sides", "side", "length", "width", "height"], pyramid: ["sides", "side", "length", "width", "height"],
};

function builderSolid(model: ModelSolid, path: string, adjustments: Adjustment[]): Solid {
  const stray = SOLID_SIZES.filter((key) => model[key] !== undefined && !SHAPE_SIZES[model.shape].includes(key));
  if (stray.length) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.${stray[0]}`, `a ${model.shape} has no ${stray.join(" or ")}; it is drawn from ${SHAPE_SIZES[model.shape].join(", ")}`);
  // A regular base and a rectangle are two readings: both written is not one solid.
  if ((model.shape === "prism" || model.shape === "pyramid") && (model.sides !== undefined || model.side !== undefined) && (model.length !== undefined || model.width !== undefined)) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, `a ${model.shape} has a regular base (sides, side) or a rectangle (length, width), not both`);
  }
  if (model.shape === "box" && model.side !== undefined && (model.length !== undefined || model.width !== undefined || model.height !== undefined)) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", path, "a box is a cube by its side, or length, width and height, not both");
  }
  const need = (...keys: Array<typeof SOLID_SIZES[number]>) => keys.map((key) => {
    const size = model[key];
    if (size === undefined) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.${key}`, `a ${model.shape} needs ${keys.join(", ")}`);
    return size;
  });
  const regular = () => {
    const [sides, side] = need("sides", "side");
    if (!Number.isInteger(sides) || sides < REGULAR_SIDES.min || sides > REGULAR_SIDES.max) {
      fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.sides`, `a regular base has ${REGULAR_SIDES.min} to ${REGULAR_SIDES.max} sides`);
    }
    // The builder takes the circumradius; the question states the edge.
    // Full precision: rounding the radius made a whole-number surface area inexact ("≈ 96.00" for 96).
    return { sides, radius: side / (2 * Math.sin(Math.PI / sides)) };
  };
  switch (model.shape) {
    case "box": {
      // A cube may come as its edge alone: one reading.
      if (model.length === undefined && model.width === undefined && model.height === undefined && model.side !== undefined) {
        adjustments.push({ reason: "solid_cube_by_edge", detail: `${path}: a box given by side ${model.side} is a cube` });
        return { shape: "box", size: { x: model.side, y: model.side, z: model.side } };
      }
      const [x, y, z] = need("length", "width", "height");
      return { shape: "box", size: { x, y, z } };
    }
    case "cylinder": case "cone": { const [radius, height] = need("radius", "height"); return { shape: model.shape, radius, height }; }
    case "sphere": case "hemisphere": { const [radius] = need("radius"); return { shape: model.shape, radius }; }
    case "frustum": { const [radius, topRadius, height] = need("radius", "top_radius", "height"); return { shape: "frustum", radius, topRadius, height }; }
    case "prism": case "pyramid": {
      const [height] = need("height");
      if (model.sides !== undefined || model.side !== undefined) return { shape: model.shape, ...regular(), height };
      const [length, width] = need("length", "width");
      // A prism on a rectangle is a box: one reading.
      if (model.shape === "prism") {
        adjustments.push({ reason: "solid_rectangular_prism", detail: `${path}: a prism on a ${length} by ${width} rectangle is a box` });
        return { shape: "box", size: { x: length, y: width, z: height } };
      }
      return { shape: "pyramid", base: { kind: "rectangle", length, width }, height };
    }
  }
}

const sameSize = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, a, b);

/** Two solids joined: stacked (the first at the bottom) or two boxes side by side. A pair no composite draws is refused. */
function joinedSolid(join: "stack" | "l_shape", pair: [Solid, Solid], path: string, adjustments: Adjustment[]): Solid {
  const [first, second] = pair;
  if (join === "l_shape") {
    if (first.shape !== "box" || second.shape !== "box") fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.join`, "only two boxes join into an L shape; two separate solids side by side need no join");
    return { shape: "composite", parts: "two_boxes", size: first.size, sideSize: second.size };
  }
  const stacked = (bottom: Solid, top: Solid): Solid | undefined => {
    // The wider cylinder stands below; written the other way, the same solid is turned over.
    if (bottom.shape === "cylinder" && top.shape === "cylinder" && bottom.radius >= top.radius) return { shape: "composite", parts: "two_cylinders", radius: bottom.radius, height: bottom.height, topRadius: top.radius, topHeight: top.height };
    if (bottom.shape === "cylinder" && (top.shape === "cone" || top.shape === "hemisphere")) {
      if (!sameSize(bottom.radius, top.radius)) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.solids`, `a ${top.shape} stacked on a cylinder shares its radius (${top.radius} and ${bottom.radius})`);
      return top.shape === "cone" ? { shape: "composite", parts: "cylinder_cone", radius: bottom.radius, height: bottom.height, topHeight: top.height }
        : { shape: "composite", parts: "cylinder_hemisphere", radius: bottom.radius, height: bottom.height };
    }
    if (bottom.shape === "box" && top.shape === "pyramid") {
      const edge = "sides" in top && top.sides === 4 ? top.radius * Math.SQRT2 : "base" in top && top.base.kind === "rectangle" && sameSize(top.base.length, top.base.width) ? top.base.length : undefined;
      if (edge === undefined || !sameSize(bottom.size.x, bottom.size.y) || !sameSize(edge, bottom.size.x)) {
        fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.solids`, "a pyramid roof sits on a box with a square base of the same edge");
      }
      return { shape: "composite", parts: "box_pyramid", width: bottom.size.x, height: bottom.size.z, topHeight: top.height };
    }
    return undefined;
  };
  const upright = stacked(first, second);
  if (upright) return upright;
  // The same solid written top first: turned over, it is one of the stacks above.
  const turned = stacked(second, first);
  if (turned) {
    adjustments.push({ reason: "solid_stack_order", detail: `${path}: ${second.shape} under ${first.shape}, as the composite stands` });
    return turned;
  }
  return fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.join`, "stacks are a cone, a hemisphere or a narrower cylinder on a cylinder, or a pyramid roof on a box");
}

function compileSolid3d(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "solids", "join", "show", "interaction"], path);
  if ((content.numbers?.length ?? 0) > 0) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.numbers`, "a solid's sizes are written in solids; its slider is the program's");
  const adjustments: Adjustment[] = [];
  const written = input.solids;
  if (!Array.isArray(written) || written.length < 1 || written.length > 2) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.solids`, "expected one solid, or two side by side");
  const solids = written.map((item, index) => builderSolid(modelSolid(item, `${path}.solids[${index}]`, adjustments), `${path}.solids[${index}]`, adjustments));
  const join = input.join;
  if (join !== undefined && join !== "stack" && join !== "l_shape") fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.join`, "expected stack or l_shape; two separate solids side by side need no join");
  if (join !== undefined && solids.length !== 2) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.join`, "join needs two solids");
  const [solid, beside] = join ? [joinedSolid(join, solids as [Solid, Solid], path, adjustments), undefined] : [solids[0]!, solids[1]];
  const shown = input.show ?? [];
  if (!Array.isArray(shown) || shown.some((item) => !SOLID_MEASURES.includes(item as SolidMeasureKind))) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.show`, `expected some of ${SOLID_MEASURES.join(", ")}`);
  const measures = [...new Set(shown as SolidMeasureKind[])];
  for (const each of [solid, ...(beside ? [beside] : [])]) {
    for (const measure of measures) {
      if (!solidHasMeasure(each, measure)) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.show`, `a ${each.shape === "composite" ? "joined solid" : each.shape} has no ${measure.replace("_", " ")} here`);
    }
  }
  const interaction = input.interaction;
  if (interaction !== undefined && interaction !== "cut" && interaction !== "unfold") fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.interaction`, "expected cut or unfold");
  if (interaction === "unfold" && [solid, beside].some((each) => each && !solidUnfolds(each))) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.interaction`, "only a box, prism, pyramid, cylinder or cone unfolds");
  }
  // The same rule as the program's other lesson text (English when the lesson is English, else Chinese),
  // so a scene's title, slider, description and measures are in one language.
  const language = /^en(?:-|$)/iu.test(lessonTextLanguage(plan)) ? "en-US" : "zh-CN";
  const variable = `${base.replace(/[^A-Za-z0-9]+/gu, "_")}_${interaction ?? "view"}`;
  const built = buildSolid({
    as: base, role, place: placement,
    title: optionalText(input.title, compileText(plan, "立体图形"), `${path}.title`),
    solid, ...(beside ? { beside } : {}),
    fallback: [solid, ...(beside ? [beside] : [])].map((each) => describeSolid(each, language)).join(" "),
    ...(measures.length ? { show: { measures, language } } : {}),
    ...(interaction === "cut" ? { cut: { expression: variable } } : {}),
    ...(interaction === "unfold" ? { unfold: { expression: variable } } : {}),
  });
  const variables: NonNullable<CompiledVisual["variables"]> = [];
  if (interaction === "cut") {
    const [min, max] = built.cutRange!;
    variables.push({ as: variable, initial: Number(((min + max) / 2).toFixed(6)), min, max, label: compileText(plan, "截面高度"), control: { kind: "slider", step: Number(((max - min) / 100).toPrecision(6)) } });
  }
  if (interaction === "unfold") variables.push({ as: variable, initial: 0, min: 0, max: 1, label: compileText(plan, "展开"), control: { kind: "slider", step: 0.01 } });
  return { ...builtVisual(built), primaryScene: base, ...(variables.length ? { variables } : {}), ...(adjustments.length ? { adjustments } : {}) };
}

export const MATH_COMPILERS = {
  number_line: compileNumberLine,
  number_line_compare: compileNumberLineCompare,
  number_line_solution: compileNumberLineSolution,
  number_line_rounding: compileNumberLineRounding,
  number_line_steps: compileNumberLineSteps,
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
  solid_3d: compileSolid3d,
} satisfies Record<string, VisualCompiler>;
