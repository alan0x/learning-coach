// Formula references bind the curve. Only explicit sample inputs bind points.
import type { LessonPlanMathExpression, LessonPlanMathToken, LessonPlanSectionDraft, LessonPlanVisualContent } from "../lesson-plan.js";
import { fail } from "../recipe-kit.js";
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
    if (fixed && wantsVertex && !hasSampleIntent && recoverVertex(visual, vertexCandidates, outline)) {
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
