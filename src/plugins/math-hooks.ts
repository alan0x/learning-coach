// Recipe hooks of the math plugin.
import { compileMathExpression } from "octos-lesson-language";
import type { LessonPlan, LessonPlanMathToken, LessonPlanOutline, LessonPlanSectionDraft, LessonPlanVisualContent } from "../lesson-plan.js";
import { lessonText } from "../lesson-text.js";
import { assertRange, fail, mathExpressionToOll, optionalNumber, parameters, safeFunctionExpression } from "../recipe-kit.js";
import { implicitSurfaceDomain } from "../scene3d-surfaces.js";
import type { PluginHooks, RecipeHooks } from "./hooks.js";
import { normalizePlotInputInstructions, validateTeachingClaims } from "./math-teaching-contracts.js";
import { formulaError, parseModelFormula } from "./math-formulas.js";
import { plotCurveNumbers, plotSampleNumbers, validatePlotSampleNumbers, normalizePlotDraftBindings } from "./plot-bindings.js";

/**
 * Two independent sample points on a static curve should not start on top of
 * each other unless the narration says they do: move B by a fifth of its range.
 */
function separateInitialSamples(visual: LessonPlanVisualContent, plan: LessonPlan, sectionIndex: number): void {
  const words = plan.sections[sectionIndex].moments.map(moment => moment.narration).join(" ");
  if (/初始.{0,8}重合|先.{0,6}重合|开始.{0,8}重合|(?:initially|at first|start).{0,35}(?:coincid|same position)/i.test(words)) return;
  const samples = plotSampleNumbers(visual.parameters);
  if (samples.length !== 2) return;
  // A later plot must not change a control that was already published.
  if (plan.sections.slice(0, sectionIndex).some(section => section.moments.some(moment =>
    moment.actions.some(action => action.action === "create" && action.kind === "visual"
      && action.content.numbers?.includes(samples[1]))))) return;
  const a = plan.numbers?.[samples[0]-1], b = plan.numbers?.[samples[1]-1];
  if (!a || !b || a === b || Math.abs(a.initial-b.initial)>1e-8) return;
  const step = b.student_control?.step ?? (b.max-b.min)/200;
  const delta = Math.max(step, Math.round((b.max-b.min)/5/step)*step);
  b.initial = b.initial+delta <= b.max ? b.initial+delta : Math.max(b.min,b.initial-delta);
}

/** The section-number range over which a surface has a finite, stable section. */
function surfaceSectionRange(content: LessonPlanVisualContent, path: string): { min: number; max: number } {
  const input = parameters(content);
  if (content.capability === "implicit_surface_with_section") {
    if (input.expression === undefined) {
      fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.expression`, "an implicit surface requires an expression");
    }
    if (input.level === undefined) {
      fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.level`, "an implicit surface requires a level");
    }
    const expression = safeFunctionExpression(input.expression, "", ["x", "y", "z"], `${path}.expression`);
    const level = optionalNumber(input.level, 0, `${path}.level`);
    let domain: ReturnType<typeof implicitSurfaceDomain>;
    try {
      domain = implicitSurfaceDomain(expression, ["x", "y", "z"], level);
    } catch (error) {
      fail(
        "LESSON_PLAN_CAPABILITY_PARAMETER",
        `${path}.expression`,
        error instanceof Error ? error.message : "implicit surface has no stable finite viewport",
      );
    }
    const axis = input.section_axis ?? "z";
    if (axis !== "x" && axis !== "y" && axis !== "z") {
      fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.section_axis`, "expected x, y, or z");
    }
    return axis === "x" ? domain.x : axis === "y" ? domain.y : domain.z!;
  }
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

export const MATH_HOOKS: Record<string, RecipeHooks> = {
  implicit_surface_with_section: {
    section_range: surfaceSectionRange,
    lower_model_parameters(parameters) {
      if (typeof parameters.expression !== "string") return;
      const equation = parameters.expression.split("=").map((part) => part.trim());
      if (equation.length === 2 && equation.every(Boolean)) {
        const rightLevel = Number(equation[1]);
        const leftLevel = Number(equation[0]);
        if (Number.isFinite(rightLevel)) {
          parameters.expression = equation[0];
          parameters.level = rightLevel;
        } else if (Number.isFinite(leftLevel)) {
          parameters.expression = equation[1];
          parameters.level = leftLevel;
        } else {
          parameters.expression = `(${equation[0]})-(${equation[1]})`;
          parameters.level = 0;
        }
      } else if (parameters.level === undefined) {
        // Implicit equations are canonically F(x,y,z)=0. When the model writes
        // only the residual expression, the missing right-hand side is execution
        // state the program can supply without regenerating the section.
        parameters.level = 0;
      }
    },
  },
  function_plot: {
    lower_model_parameters(parameters, { numberCount }) {
      const rawFormulas = parameters.formulas !== undefined
        ? parameters.formulas
        : typeof parameters.expression === "string"
          ? [parameters.expression]
          : Array.isArray(parameters.expressions)
            ? parameters.expressions
            : undefined;
      if (rawFormulas === undefined) return;
      if (!Array.isArray(rawFormulas)
        || rawFormulas.length < 1
        || rawFormulas.length > 8) {
        formulaError(
          "$lessonPlanSection.visual.parameters.formulas",
          "expected one to eight formulas",
        );
      }
      // The provider can occasionally return an older synonymous field in
      // addition to `formulas`, even under a response schema. Select one
      // semantic source and erase all execution representations before the
      // program builds exactly one canonical representation below.
      delete parameters.formulas;
      delete parameters.expression;
      delete parameters.expressions;
      delete parameters.expression_tokens;
      const parsed = rawFormulas.map((formula, index) => parseModelFormula(
        formula,
        numberCount,
        `$lessonPlanSection.visual.parameters.formulas[${index}]`,
      ));
      if (parsed.length === 1) {
        parameters.expression_tokens = parsed[0];
        return;
      }
      if (parsed.some((expression) => expression.some((token) => token.kind === "number"))) {
        formulaError(
          "$lessonPlanSection.visual.parameters.formulas",
          "a multi-curve comparison currently supports static formulas only; use one formula when lesson numbers change the whole curve",
        );
      }
      // Formula text is a teaching choice. Curve identity and duplicate
      // handling are execution details: canonicalize and deduplicate them in
      // the program so a probabilistic repeated formula cannot render the
      // same curve twice.
      const canonical = parsed.map(mathExpressionToOll);
      const retainedIndexes: number[] = [];
      const seen = new Set<string>();
      canonical.forEach((expression, index) => {
        if (seen.has(expression)) return;
        seen.add(expression);
        retainedIndexes.push(index);
      });
      parameters.expressions = retainedIndexes.map((index) => canonical[index]);
      if (Array.isArray(parameters.curve_labels)
        && parameters.curve_labels.length === canonical.length) {
        parameters.curve_labels = retainedIndexes.map((index) => (parameters.curve_labels as unknown[])[index]);
      } else {
        // Labels are optional presentation text. If they do not align with
        // the actual curves, derive safe labels from the expressions instead
        // of rejecting and regenerating the lesson.
        delete parameters.curve_labels;
      }
      // A single-curve label from a speculative draft cannot safely name the
      // first member of a later multi-curve comparison.
      delete parameters.curve_label;
      // A multi-curve request is an explicit static comparison. A stray
      // model-authored number must never turn it into a moving-point lesson.
      return { no_numbers: true };
    },
    validate_parameters(parameters, { path, numberCount, fail, record, array, validateMathExpression }) {
      if (parameters === undefined) {
        fail(
          "LESSON_PLAN_EXPRESSION",
          `${path}.parameters`,
          "a function plot requires an explicit mathematical expression",
        );
      }
      const visualParameters = record(parameters, `${path}.parameters`);
      const expressionFields = ["expression", "expressions", "expression_tokens"]
        .filter((field) => visualParameters[field] !== undefined);
      if (expressionFields.length !== 1) {
        fail(
          "LESSON_PLAN_EXPRESSION",
          `${path}.parameters`,
          "a function plot requires exactly one explicit mathematical expression",
        );
      }
      const pathToSamples = `${path}.parameters.sample_x_numbers`;
      const samples = validatePlotSampleNumbers(visualParameters.sample_x_numbers, numberCount, pathToSamples);
      if (samples.length && plotCurveNumbers(visualParameters).length) {
        fail("LESSON_PLAN_INTERACTION_MISMATCH", pathToSamples, "sample_x_numbers requires a fixed curve; use formula references for curve controls");
      }
      if (visualParameters.expression_tokens !== undefined) {
        const expressionTokens = array(
          visualParameters.expression_tokens,
          `${path}.parameters.expression_tokens`,
        );
        if (!expressionTokens.some((token) => (
          token !== null
          && typeof token === "object"
          && !Array.isArray(token)
          && (token as Record<string, unknown>).kind === "input"
        ))) {
          fail(
            "LESSON_PLAN_PLOT_INPUT",
            `${path}.parameters.expression_tokens`,
            "a parameterized function curve must explicitly depend on the plot input; a lesson number cannot replace the horizontal-axis input",
          );
        }
        validateMathExpression(
          visualParameters.expression_tokens,
          `${path}.parameters.expression_tokens`,
          numberCount,
          true,
        );
      }
    },
    before_compile: separateInitialSamples,
    bound_numbers(content) {
      return [...plotCurveNumbers(content.parameters), ...plotSampleNumbers(content.parameters)];
    },
  },
  function_surface_with_section: { section_range: surfaceSectionRange },
  coordinate_circle: {
    // A declared radius formula maps an input quantity to radius; its input
    // is not itself a radius. Keep shared height/time/etc. controls intact,
    // and give the input no radius range.
    free_number: (content) => content.parameters?.radius_expression !== undefined,
  },
};

// A request for two independently movable points on a curve: the outline
// gets A/B x-coordinate numbers and function plots use them as sample points.
function requestsTwoIndependentPoints(request: string): boolean {
  return /(?:两个|两)\s*(?:个)?(?:可以|可)?(?:分别|独立|各自).{0,8}(?:移动|调整).{0,4}点|(?:分别|独立|各自).{0,8}(?:移动|调整).{0,8}(?:两个点|两点)|two.{0,12}(?:independent|separate).{0,12}(?:point|sample)/i.test(request);
}

function prepareTwoPointOutline(outline: LessonPlanOutline, request: string, language?: string): void {
  if (!requestsTwoIndependentPoints(request)) return;
  outline.numbers ??= [];
  while (outline.numbers.length < 2) {
    const index = outline.numbers.length;
    outline.numbers.push({
      initial: index === 0 ? -1 : 2,
      min: -5,
      max: 5,
      label: index === 0 ? lessonText(language, "A点的x坐标") : lessonText(language, "B点的x坐标"),
      student_control: { kind: "slider", step: 0.25 },
    });
  }
  outline.numbers.slice(0, 2).forEach((number, index) => {
    number.label = index === 0 ? lessonText(language, "A点的x坐标") : lessonText(language, "B点的x坐标");
    number.student_control = { kind: "slider", step: number.student_control?.step ?? 0.25 };
  });
}

function specializeTwoPointDraft(
  draft: LessonPlanSectionDraft,
  outline: LessonPlanOutline,
  request: string,
): void {
  if (!requestsTwoIndependentPoints(request) || (outline.numbers?.length ?? 0) < 2) return;
  for (const moment of draft.moments) for (const action of moment.actions) {
    if (action.action !== "create" || action.kind !== "visual") continue;
    const content = action.content as LessonPlanVisualContent;
    if (content.capability !== "function_plot" || content.parameters?.sample_x_numbers !== undefined
      || Array.isArray(content.parameters?.expressions)) continue;
    const tokens = content.parameters?.expression_tokens;
    if (Array.isArray(tokens)) {
      content.parameters!.expression_tokens = (tokens as LessonPlanMathToken[]).map((token) => (
        token.kind === "number"
          ? { kind: "literal", value: outline.numbers?.[token.number - 1]?.initial ?? 0 }
          : token
      ));
    }
    content.parameters = { ...content.parameters, sample_x_numbers: [1, 2] };
    content.numbers = [1, 2];
  }
}

export const MATH_PLUGIN_HOOKS: PluginHooks = {
  prepare_outline: (outline, { request, language }) => prepareTwoPointOutline(outline, request, language),
  specialize_draft(draft, context) {
    specializeTwoPointDraft(draft, context.outline, context.request);
    normalizePlotDraftBindings(draft, context);
  },
  normalize_plan: normalizePlotInputInstructions,
  check_plan: validateTeachingClaims,
};
