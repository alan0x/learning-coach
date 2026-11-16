// Formula references bind the curve. Only explicit sample inputs bind points.
import type { LessonPlanMathExpression, LessonPlanMathToken, LessonPlanSectionDraft, LessonPlanVisualContent } from "../lesson-plan.js";
import { compileMathExpression } from "octos-lesson-language";
import { fail, mathExpressionToOll } from "../recipe-kit.js";
import type { DraftSpecializationContext } from "./hooks.js";
import { parseModelFormula } from "./math-formulas.js";

export function plotCurveNumbers(parameters: Record<string, unknown> | undefined): number[] {
  const tokens = parameters?.expression_tokens;
  if (!Array.isArray(tokens)) return [];
  return [...new Set((tokens as LessonPlanMathExpression).flatMap(token =>
    token?.kind === "number" ? [token.number] : []))];
}

export function plotSampleNumbers(parameters: Record<string, unknown> | undefined): number[] {
  const samples = parameters?.sample_x_numbers;
  return Array.isArray(samples) ? samples : [];
}

export function validatePlotSampleNumbers(value: unknown, numberCount: number, path: string): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.length || value.length > 2 || new Set(value).size !== value.length
    || value.some(number => !Number.isInteger(number) || number < 1 || number > numberCount)) {
    fail("LESSON_PLAN_NUMBER_REFERENCE", path, "use one or two distinct lesson number indexes for the sample x-coordinates");
  }
  return value;
}

/** The curve's values, or undefined when its formula does not compile. */
function curveEvaluator(visual: LessonPlanVisualContent): ((x: number) => number) | undefined {
  const tokens = visual.parameters?.expression_tokens;
  if (!Array.isArray(tokens)) return undefined;
  try {
    const curve = compileMathExpression(mathExpressionToOll(tokens as LessonPlanMathExpression), ["x"]);
    return (x) => { try { return curve({ x }); } catch { return Number.NaN; } };
  } catch {
    return undefined;
  }
}

/** Board LaTeX and text as plain formula text: \frac{a}{b} as (a)/(b), \cdot as *, braces dropped. */
function plainFormulaText(text: string): string {
  let plain = text.replace(/\\(?:left|right|,|;|!|\s)/gu, "").replace(/\\cdot|\\times/gu, "*").replace(/[−–]/gu, "-");
  for (let pass = 0; pass < 4; pass += 1) plain = plain.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/gu, "($1)/($2)");
  return plain.replace(/\\sqrt\s*\{([^{}]*)\}/gu, "sqrt($1)").replace(/[{}]/gu, "");
}

/**
 * Whether the lesson's own words state the curve as an equation, "y = …" or "f(x) = …", with the same values
 * as the plot's formula. Only then are x positions written as sample_x_numbers points on the curve the
 * lesson teaches; a stand-in formula ("x" for the line through (1, 2) and (7, 10)) is never confirmed.
 */
function curveNamedInText(curve: (x: number) => number, text: readonly string[]): boolean {
  const probes = [-3.7, -1.3, 0.4, 1.9, 2.6, 5.1, 7.3];
  for (const line of text.map(plainFormulaText)) {
    for (const match of line.matchAll(/(?:^|[^A-Za-z])(?:y|f\s*\(\s*x\s*\))\s*=\s*([^=，。；;,\n]+)/gu)) {
      const words = match[1]!.trim().split(/\s+/u);
      // The longest leading run of words that reads as a formula: "3x - 2 and show the rise" reads "3x - 2".
      for (let count = words.length; count > 0; count -= 1) {
        let stated: (x: number) => number;
        try {
          const tokens = parseModelFormula(words.slice(0, count).join(" "), 0, "$text");
          const compiled = compileMathExpression(mathExpressionToOll(tokens), ["x"]);
          stated = (x) => { try { return compiled({ x }); } catch { return Number.NaN; } };
        } catch {
          continue;
        }
        const agree = probes.filter((x) => Number.isFinite(curve(x)) && Number.isFinite(stated(x)));
        if (agree.length >= 3 && agree.every((x) => Math.abs(curve(x) - stated(x)) <= 1e-9 * Math.max(1, Math.abs(stated(x))))) return true;
        break;
      }
    }
  }
  return false;
}

/** Every string a section writes or says: narration, task prompts and board cards (formulas, text, notes). */
function sectionWords(draft: LessonPlanSectionDraft): string[] {
  const strings = (value: unknown): string[] => typeof value === "string" ? [value]
    : Array.isArray(value) ? value.flatMap(strings)
    : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
  return [
    ...draft.moments.map((moment) => moment.narration),
    ...(draft.student_activities ?? []).map((activity) => activity.prompt),
    ...draft.moments.flatMap((moment) => moment.actions.flatMap((action) =>
      action.action === "create" && action.kind !== "visual" ? strings((action as { content?: unknown }).content) : [])),
  ];
}

/**
 * Whether x positions written as sample_x_numbers can become fixed points: two of them, or one where a slope
 * triangle is asked (it pairs with x + 2); the curve exists at each point; and the lesson's own words state
 * the curve as an equation with the same values (curveNamedInText), so the points are on the curve the lesson
 * teaches. A lone point without a triangle is refused as before: the compiler would draw nothing for it.
 */
function repairableXValues(visual: LessonPlanVisualContent, values: number[], text: readonly string[]): boolean {
  const triangle = Array.isArray(visual.parameters?.marks) && visual.parameters.marks.includes("slope_triangle");
  const xs = values.length === 2 ? values : triangle ? [values[0]!, values[0]! + 2] : undefined;
  const curve = curveEvaluator(visual);
  return Boolean(xs && curve && xs.every((x) => Number.isFinite(curve(x))) && curveNamedInText(curve, text));
}

/** Two distinct finite numbers, or one, that are not all usable as lesson-number indexes: x positions. */
function xValuesNotNumbers(value: unknown, numberCount: number): value is number[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 2 && new Set(value).size === value.length
    && value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    && value.some((entry) => !Number.isInteger(entry) || entry < 1 || entry > numberCount);
}

// These references are evidence of possible intent. They never become bindings
// unless the strict sample contract is met.
function candidateSampleNumbers(value: unknown, count: number): number[] {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap(entry => {
    if (entry && typeof entry === "object" && "number" in entry) entry = entry.number;
    const number = typeof entry === "string" && /^\s*\d+\s*$/u.test(entry) ? Number(entry) : entry;
    return typeof number === "number" && Number.isInteger(number) && number >= 1 && number <= count ? [number] : [];
  });
}

type Coefficients = [constant: number, linear: number, quadratic: number];

function multiply(a: Coefficients, b: Coefficients): Coefficients | undefined {
  if (a[2] * b[2] !== 0 || a[1] * b[2] + a[2] * b[1] !== 0) return;
  return [a[0] * b[0], a[0] * b[1] + a[1] * b[0], a[0] * b[2] + a[1] * b[1] + a[2] * b[0]];
}

/** A bounded coefficient check for literal quadratics. Function samples are
 * useful for framing, but cannot prove that an expression is quadratic. */
function polynomial(tokens: readonly LessonPlanMathToken[]): Coefficients | undefined {
  const stack: Coefficients[] = [];
  for (const token of tokens) {
    if (token.kind === "input") stack.push([0, 1, 0]);
    else if (token.kind === "literal") stack.push([token.value, 0, 0]);
    else if (token.kind === "negate") {
      const a = stack.pop();
      if (!a) return;
      stack.push([-a[0], -a[1], -a[2]]);
    } else if (token.kind === "operator") {
      const b = stack.pop(), a = stack.pop();
      if (!a || !b) return;
      if (token.operator === "add" || token.operator === "subtract") {
        const sign = token.operator === "add" ? 1 : -1;
        stack.push([a[0] + sign * b[0], a[1] + sign * b[1], a[2] + sign * b[2]]);
      } else if (token.operator === "multiply" || (token.operator === "power" && b[0] === 2 && b[1] === 0 && b[2] === 0)) {
        const product = multiply(a, token.operator === "power" ? a : b);
        if (!product) return;
        stack.push(product);
      } else return;
    } else return;
  }
  if (stack.length === 1 && stack[0].every(Number.isFinite)) return stack[0];
}

function vertexRole(label: string): "h" | "k" | undefined {
  const normalized = label.normalize("NFKC").toLowerCase().trim().replace(/[-‐‑–\s]+/g, "");
  if (/^(?:顶点(?:的)?(?:横坐标|x坐标)h?|vertexxcoordinate|xcoordinateofthevertex|horizontalcoordinateofthevertex)$/u.test(normalized)) return "h";
  if (/^(?:顶点(?:的)?(?:纵坐标|y坐标)k?|vertexycoordinate|ycoordinateofthevertex|verticalcoordinateofthevertex)$/u.test(normalized)) return "k";
}

const vertexInstruction = /(?:调整|移动|平移|拖动)(?:(?:这条|该)?抛物线的|该图的|该|这个)?顶点|(?:move|shift|translate|adjust|drag)\s+(?:the|this)\s+vertex\b/iu;
const sampleIntent = /割线|采样点|曲线上.{0,6}标记|标记.{0,6}沿曲线|点\s*[ABP]\b|\b[ABP]\s*点|两点|两个点|\b(?:secant|sample points?|point\s+[ABP]|two (?:independent )?points)\b/iu;
const interactionVerb = /调整|移动|平移|拖动|拖拽|滑块|\b(?:adjust|move|shift|translate|drag|slider|change)\b/iu;
const negativeInstruction = /不(?:要|能|必|用|会|可)|别(?:拖|动|调整)|没有|无法|\b(?:no|not|never|cannot|can['’]t|don['’]t)\b/iu;
const pastInstruction = /(?:刚才|之前|先前|上[一]?节|上次)|\b(?:previously|earlier|last time|we (?:moved|adjusted|shifted|translated|dragged))\b/iu;
const clauses = (text: string) => text.split(/[。！？!?；;，,]/u);

function sectionVisuals(draft: LessonPlanSectionDraft) {
  return draft.moments.flatMap((moment, index) => moment.actions.flatMap(action =>
    action.action === "create" && action.kind === "visual"
      ? [{ visual: action.content as LessonPlanVisualContent, moment: index + 1, slot: action.reusable_item, section: draft.section }]
      : []));
}

function sectionText(draft: LessonPlanSectionDraft): string[] {
  return [
    ...draft.moments.flatMap(moment => clauses(moment.narration)),
    ...(draft.student_activities ?? []).flatMap(activity => clauses(activity.prompt)),
  ];
}

/** A label naming an x position: "x" alone, or x followed by 坐标 / 的值 / coordinate / value. Not "x 的系数". */
function xPositionLabel(label: string): boolean {
  // A bound of x ("max x value", "x 的最大值") is no position (review).
  if (/\b(max|min)\b|最大|最小/iu.test(label)) return false;
  return /^\s*x\s*$/iu.test(label) || /(^|[^A-Za-z])x\s*[-_ ]?\s*的?\s*(坐标|座标|值|coordinate|value)/iu.test(label);
}

/** True when the plot's one formula has a finite value at each x given. */
function curveExistsAt(visual: LessonPlanVisualContent, xs: unknown[]): boolean {
  const tokens = visual.parameters?.expression_tokens;
  if (!Array.isArray(tokens)) return false;
  try {
    const curve = compileMathExpression(mathExpressionToOll(tokens as LessonPlanMathExpression), ["x"]);
    return xs.every(x => typeof x === "number" && Number.isFinite(curve({ x })));
  } catch {
    return false;
  }
}

function structuralUse(draft: LessonPlanSectionDraft, number: number): boolean {
  return draft.moments.some(moment => moment.actions.some(action => action.action === "animate" && action.number === number))
    || (draft.student_activities ?? []).some(activity => activity.kind === "number_target" && (
      activity.number_controls.some(control => control.number === number)
      || activity.expression?.some(token => token.kind === "number" && token.number === number)
    ));
}

function positiveInstruction(text: string, pattern: RegExp): boolean {
  return pattern.test(text) && !negativeInstruction.test(text) && !pastInstruction.test(text);
}

function recoverVertex(
  visual: LessonPlanVisualContent,
  candidates: number[],
  outline: DraftSpecializationContext["outline"],
): boolean {
  const tokens = visual.parameters?.expression_tokens;
  if (!Array.isArray(tokens) || candidates.length !== 2) return false;
  const definitions = candidates.map(index => outline.numbers?.[index - 1]);
  if (definitions.some(definition => !definition?.student_control)) return false;
  const roles = definitions.map(definition => vertexRole(definition?.label ?? ""));
  const hIndex = roles.indexOf("h"), kIndex = roles.indexOf("k");
  if (hIndex < 0 || kIndex < 0) return false;

  const original = polynomial(tokens as LessonPlanMathExpression);
  if (!original || original[2] === 0) return false;
  const [c, b, a] = original;
  const h = definitions[hIndex]!.initial, k = definitions[kIndex]!.initial;
  const close = (left: number, right: number) => Number.isFinite(right)
    && Math.abs(left - right) <= Number.EPSILON * 8 * Math.max(Math.abs(left), Math.abs(right));
  if (!close(b, -2 * a * h) || !close(c, a * h * h + k)) return false;

  const expression = `(${a})*(x-n${candidates[hIndex]})^2+n${candidates[kIndex]}`;
  visual.parameters!.expression_tokens = parseModelFormula(expression, outline.numbers!.length, "$lessonPlanSection.visual.parameters.formulas");
  // A numeric curve legend would become false as soon as the learner moves h or k.
  delete visual.parameters!.curve_label;
  delete visual.parameters!.curve_labels;
  return true;
}

const omittedControls = new WeakMap<LessonPlanSectionDraft, Set<number>>();
const omittedSamplePlots = new WeakMap<LessonPlanSectionDraft, Set<number>>();

export function normalizePlotDraftBindings(draft: LessonPlanSectionDraft, context: DraftSpecializationContext): void {
  const { outline, request, accepted, adjust } = context;
  const visuals = sectionVisuals(draft);
  const previousVisuals = accepted.flatMap(sectionVisuals);
  const plots = visuals.filter(({ visual }) => visual.capability === "function_plot");
  const text = sectionText(draft);
  const plotText = [...text, ...clauses(outline.sections[draft.section - 1]?.purpose ?? ""), ...clauses(request)];
  const wantsVertex = plots.length === 1 && text.some(line => positiveInstruction(line, vertexInstruction)
    && (visuals.length === 1 || /抛物线|\bparabola\b/iu.test(line)));
  const asksForSamples = (line: string) => positiveInstruction(line, sampleIntent) && interactionVerb.test(line);
  const wantsSamples = plotText.some(asksForSamples);
  const hasSampleIntent = plotText.some(line => positiveInstruction(line, sampleIntent));
  const count = outline.numbers?.length ?? 0;
  const validSamples = (visual: LessonPlanVisualContent): number[] => {
    const raw = visual.parameters?.sample_x_numbers;
    return !plotCurveNumbers(visual.parameters).length && Array.isArray(raw) && raw.length <= 2
      && new Set(raw).size === raw.length && raw.every(number => Number.isInteger(number) && number >= 1 && number <= count)
      ? raw : [];
  };
  const bound = (visual: LessonPlanVisualContent) => visual.capability === "function_plot"
    ? [...plotCurveNumbers(visual.parameters), ...validSamples(visual)]
    : visual.numbers ?? [];
  const controlsNamed = (number: number) => {
    const label = outline.numbers?.[number - 1]?.label?.trim().toLowerCase();
    if (!label) return false;
    const roleLabel = vertexRole(label) ? label.replace(/[hk]$/u, "").trim() : label;
    const singleSymbol = /^[a-z]$/u.test(roleLabel) ? new RegExp(`\\b${roleLabel}\\b`, "iu") : undefined;
    return text.some(line => positiveInstruction(line, interactionVerb)
      && (singleSymbol ? singleSymbol.test(line) : line.toLowerCase().includes(roleLabel)));
  };
  const dropped = new Set<number>();
  const droppedSampleSlots = new Set<number>();
  const allVisuals = [...previousVisuals, ...visuals];
  const inUse = (section: number, slot: number | undefined) =>
    section === draft.section || outline.course_visuals?.some(visual =>
      visual.create_section === section && visual.reusable_item === slot
      && visual.use_sections.includes(draft.section));
  const activeSamplePlots = allVisuals.filter(item => inUse(item.section, item.slot)
    && item.visual.capability === "function_plot" && validSamples(item.visual).length);

  for (const { visual, moment, slot } of plots) {
    const others = new Set(allVisuals.filter(item => item.visual !== visual).flatMap(item => bound(item.visual)));
    const otherSamplePlots = activeSamplePlots.filter(item => item.visual !== visual);
    const sampleIntentUnmet = wantsSamples && !otherSamplePlots.length;
    const path = `$lessonPlanSection[${draft.section}].moments[${moment}].content.parameters.sample_x_numbers`;
    const declared = visual.numbers ?? [];
    let curve = plotCurveNumbers(visual.parameters);
    const rawSamples = visual.parameters?.sample_x_numbers;
    let samples: number[] = [];
    if (curve.length && rawSamples !== undefined) {
      const candidates = candidateSampleNumbers(rawSamples, count);
      const onlySampleControl = (number: number) => !curve.includes(number) && !others.has(number);
      const needed = candidates.some(number => onlySampleControl(number)
        && (structuralUse(draft, number) || controlsNamed(number)));
      // A malformed field may not identify any index. An otherwise unbound
      // animation or task in this plot's section still needs an explanation.
      const unresolvedUse = (outline.numbers ?? []).some((_, index) =>
        onlySampleControl(index + 1) && structuralUse(draft, index + 1));
      // The current moment can identify this plot even when the section also
      // contains a separate, correctly bound sample plot.
      const explicitlyHere = otherSamplePlots.length > 0
        && !visuals.some(item => item.visual !== visual && item.moment === moment
          && item.visual.capability === "function_plot" && validSamples(item.visual).length)
        && clauses(draft.moments[moment - 1].narration).some(asksForSamples)
        && !/另一[张幅]|另一.*图|other (?:plot|graph)/iu.test(draft.moments[moment - 1].narration);
      if (sampleIntentUnmet || explicitlyHere || needed || unresolvedUse) {
        fail("LESSON_PLAN_INTERACTION_MISMATCH", path, "sample_x_numbers moves points on a fixed curve; keep formula references for changing the curve, or use a separate fixed curve for moving points");
      }
      delete visual.parameters!.sample_x_numbers;
      candidates.filter(onlySampleControl).forEach(number => dropped.add(number));
      if (slot !== undefined) droppedSampleSlots.add(slot);
      adjust({ kind: "plot_control_removed", section: draft.section, moment,
        reason: "unused_samples_on_parameterized_curve",
        detail: `sample_x_numbers=${JSON.stringify(rawSamples)?.slice(0, 120)}` });
    } else if (Array.isArray(rawSamples) && !rawSamples.length) {
      delete visual.parameters!.sample_x_numbers;
    } else if (!curve.length && xValuesNotNumbers(rawSamples, count) && repairableXValues(visual, rawSamples, [
      ...sectionWords(draft), outline.sections[draft.section - 1]?.purpose ?? "", request, String(visual.parameters?.title ?? ""),
    ])) {
      // x positions written where lesson-number indexes belong ([1, 3] for the points at x = 1 and 3, with
      // fewer lesson numbers than that): fixed points at those x, left to right (the compiler's reference
      // points A and B), not a refusal. The gate of 2026-11-15 lost two lessons to this refusal, each asked
      // again until the section ran out of attempts. Only where validation would refuse, so a lesson that
      // compiles is never changed, and only where the points are certain (repairableXValues).
      visual.parameters!.reference_x = rawSamples.length === 2 ? [...rawSamples].sort((a, b) => a - b) : [rawSamples[0]!, rawSamples[0]! + 2];
      delete visual.parameters!.sample_x_numbers;
      adjust({ kind: "plot_binding_rebuilt", section: draft.section, moment, reason: "sample_x_values_as_fixed_points",
        detail: `sample_x_numbers=${JSON.stringify(rawSamples)}` });
    } else {
      samples = validatePlotSampleNumbers(rawSamples, count, path);
    }

    const unused = (number: number) => !curve.includes(number) && !samples.includes(number) && !others.has(number);
    const candidates = declared.filter(unused);
    const fixed = !curve.length && !samples.length;
    const singleFormula = Array.isArray(visual.parameters?.expression_tokens);
    const formulasPath = path.replace(/sample_x_numbers$/, "formulas");
    // The exact provider schema no longer asks plots to duplicate their bindings.
    // If it omitted the old list, only full role labels can identify candidates.
    const vertexCandidates = declared.length ? candidates : (outline.numbers ?? []).flatMap((number, index) =>
      number.student_control && unused(index + 1) && vertexRole(number.label ?? "") ? [index + 1] : []);
    // An x position declared as a plain number: on one fixed curve, one or two numbers the formula does not
    // read, which the section moves or names, each labelled as an x position ("x", "探针 x 坐标",
    // "x-coordinate"), are the points moving along the curve (the trial: refused below and asked again).
    // Only where the checks below would refuse the section, so a lesson that compiles is never changed, and
    // only where the curve exists at each number's min, max and initial value.
    const movingPoints = fixed && singleFormula && !wantsVertex && candidates.length >= 1 && candidates.length <= 2
      && candidates.some(number => structuralUse(draft, number) || controlsNamed(number))
      && candidates.every(number => xPositionLabel(outline.numbers?.[number - 1]?.label ?? "")
        && curveExistsAt(visual, [outline.numbers?.[number - 1]?.min, outline.numbers?.[number - 1]?.max, outline.numbers?.[number - 1]?.initial]));
    if (movingPoints) {
      visual.parameters!.sample_x_numbers = [...candidates];
      samples = [...candidates];
      adjust({ kind: "plot_binding_rebuilt", section: draft.section, moment, reason: "x_position_numbers_as_moving_points" });
    } else if (fixed && wantsVertex && !hasSampleIntent && recoverVertex(visual, vertexCandidates, outline)) {
      curve = plotCurveNumbers(visual.parameters);
      adjust({ kind: "plot_binding_rebuilt", section: draft.section, moment, reason: "quadratic_vertex_from_confirmed_roles" });
    } else {
      if (fixed && singleFormula && sampleIntentUnmet && (plots.length === 1 || candidates.length)) {
        const indexes = candidates.slice(0, 2);
        fail("LESSON_PLAN_INTERACTION_MISMATCH", path, indexes.length
          ? `Use parameters.sample_x_numbers: [${indexes.join(",")}] for the sample x-coordinate controls; use one index for one point`
          : "Use parameters.sample_x_numbers with the lesson number index of each sample's x-coordinate");
      }
      if ((wantsVertex && !curve.length && !hasSampleIntent)
        || candidates.some(number => structuralUse(draft, number) || controlsNamed(number))) {
        fail("LESSON_PLAN_INTERACTION_MISMATCH", formulasPath, "Use the lesson number references in the curve formula when sliders change the curve");
      }
      if (fixed && singleFormula && plots.length === 1 && (outline.numbers ?? []).some((_, index) =>
        unused(index + 1) && structuralUse(draft, index + 1))) {
        fail("LESSON_PLAN_INTERACTION_MISMATCH", formulasPath,
          "The demonstration uses an unbound number; reference it in the formula for a curve control, or use parameters.sample_x_numbers for a point");
      }
      if (candidates.length) {
        candidates.forEach(number => dropped.add(number));
        adjust({ kind: curve.length ? "plot_binding_rebuilt" : "plot_control_removed", section: draft.section, moment,
          reason: curve.length ? "formula_defines_curve_bindings" : "unused_plot_numbers" });
      }
    }
    const actual = [...curve, ...samples];
    if (actual.length) visual.numbers = actual;
    else delete visual.numbers;
  }

  const previousDroppedPlotInUse = accepted.some(earlier => [...omittedSamplePlots.get(earlier) ?? []]
    .some(slot => inUse(earlier.section, slot)));
  if (previousDroppedPlotInUse && text.some(asksForSamples) && !activeSamplePlots.length) {
    fail("LESSON_PLAN_INTERACTION_MISMATCH", `$lessonPlanSection[${draft.section}].moments`,
      "The published graph has no moving sample point; add a fixed curve with sample_x_numbers in this section or revise the instruction");
  }

  const knownBindings = new Set(allVisuals.flatMap(item => bound(item.visual)));
  if (previousDroppedPlotInUse && (outline.numbers ?? []).some((_, index) =>
    !knownBindings.has(index + 1) && structuralUse(draft, index + 1))) {
    fail("LESSON_PLAN_INTERACTION_MISMATCH", `$lessonPlanSection[${draft.section}].moments`,
      "The demonstration or practice uses a control with no visual binding; bind it in this section");
  }
  const omitted = new Set([...accepted.flatMap(earlier => [...omittedControls.get(earlier) ?? []]), ...dropped]);
  for (const number of omitted) {
    if (knownBindings.has(number)) continue;
    if (structuralUse(draft, number) || controlsNamed(number)) {
      fail("LESSON_PLAN_INTERACTION_MISMATCH", `$lessonPlanSection[${draft.section}].moments`, `Number ${number} has no control in the published graph; explain the fixed curve or bind a control in a new graph in this section`);
    }
    for (const [index, moment] of draft.moments.entries()) {
      if (!moment.restart_numbers?.includes(number)) continue;
      moment.restart_numbers = moment.restart_numbers.filter(index => index !== number);
      if (!moment.restart_numbers.length) delete moment.restart_numbers;
      adjust({ kind: "plot_control_removed", section: draft.section, moment: index + 1, reason: "unused_restart_for_omitted_plot_control" });
    }
  }
  if (dropped.size) omittedControls.set(draft, dropped);
  if (droppedSampleSlots.size) omittedSamplePlots.set(draft, droppedSampleSlots);
}
