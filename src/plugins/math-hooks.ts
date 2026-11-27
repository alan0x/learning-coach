// Recipe hooks of the math plugin.
import { compileMathExpression } from "octos-lesson-language";
import { LESSON_PLAN_CAPABILITY_NUMBER_LIMITS, type LessonPlan, type LessonPlanMathToken, type LessonPlanOutline, type LessonPlanSectionDraft, type LessonPlanVisualContent } from "../lesson-plan.js";
import { lessonText, lessonTextLanguage } from "../lesson-text.js";
import { assertRange, fail, mathExpressionToOll, optionalNumber, parameters, safeFunctionExpression } from "../recipe-kit.js";
import { implicitSurfaceDomain } from "../scene3d-surfaces.js";
import type { PluginHooks, RecipeHooks } from "./hooks.js";
import { fitComparedNumbers, fitNumberLineNumbers, fitRoundingNumbers, fitSolutionNumbers, fitStepsNumbers } from "./number-line-fit.js";
import { normalizePlotInputInstructions, validateTeachingClaims } from "./math-teaching-contracts.js";
import { formulaError, formulaFunctions, parseModelFormula } from "./math-formulas.js";
import { BASE_TEN_DRAWN, baseTenColumns, baseTenMoves, baseTenState } from "./base-ten-moves.js";
import { placeValueMoves, placeValueState } from "./place-value-moves.js";
import { TRADE_NUMBER, placeValueTradeColumnsOf, placeValueTradeMoves, placeValueTradeStartFault, placeValueTradeState, placeValueTradeThousandths } from "./place-value-trade-moves.js";
import { MAKE_TEN_NUMBER, makeTenMoves, makeTenState } from "./make-ten-moves.js";
import { TIMES_TEN_NUMBER, placeValueTimesTenMoves, placeValueTimesTenState, timesTenDecimal, timesTenOutlineFault, timesTenStartProblem } from "./place-value-times-ten-moves.js";
import { placeValueTimesTenPath } from "octos-lesson-language/plugin-math";
import { SECOND_CARDS, exampleOf, exampleStart, isSecondCard, isSecondCardKind } from "./second-card.js";
import { COMPARE_MOST, COMPARE_NUMBER, compareMoves, compareOutlineFault, compareState } from "./place-value-compare-moves.js";
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

/** A fraction card's content that carries its values (a non-empty `fractions`). */
function hasFractionValues(content: Record<string, unknown> | undefined): boolean {
  const parameters = content?.parameters as { fractions?: unknown } | undefined;
  return Array.isArray(parameters?.fractions) && parameters!.fractions.length > 0;
}

/** The trading mat's counts, named by their values (lowest place first). */
const BASE_TEN_COUNT_NAMES = {
  "en-US": ["ones", "tens", "hundreds"],
  "zh-CN": ["一的个数", "十的个数", "百的个数"],
} as const;

export const MATH_HOOKS: Record<string, RecipeHooks> = {
  // OLL 0021 amendment 2, rule 2: a card first written without its values takes them from the first later
  // create that has them. The model often writes the shape and view first and the values in a later moment;
  // the later create used to be dropped and the values with it (fraction diagnostic, 2026-11-19: FD-08; probe
  // 2: FM-11's right 160/100). Anything else keeps the first, as Coach does without the hook.
  fraction_model: {
    choose_first_create(contents) {
      if (hasFractionValues(contents[0])) return 0;
      const later = contents.findIndex((content, index) => index > 0 && hasFractionValues(content));
      return later > 0 ? later : 0;
    },
    // OLL 0021 amendment 2, rule 1: the teacher's two steps on one card, by a typed table. Exactly two
    // creates, the same shape, the first one fraction shown plainly, and the second either cuts each of its
    // parts (split, the same a/b) or shares its wholes (share a/b after a/1). Anything else keeps the first:
    // the diagnostic's FD-20 (3/1, then 12/4 split 4) would draw sixteenths, FD-05 (1/2, then an
    // "equivalent" of 2/4 alone) would be refused.
    then_create(contents, chosen) {
      if (contents.length !== 2 || chosen !== 0) return undefined;
      const [first, second] = contents.map((content) => (content?.parameters ?? {}) as { fractions?: Array<{ numerator?: unknown; denominator?: unknown }>; fraction_shape?: unknown; fraction_view?: unknown });
      if (!hasFractionValues(contents[0]) || !hasFractionValues(contents[1])) return undefined;
      if (first!.fraction_view !== "one" || first!.fractions!.length !== 1 || second!.fractions!.length !== 1) return undefined;
      // The shape the compiler draws: as written, else a grid for hundredths and a bar otherwise (review of #148).
      const shape = (parameters: typeof first) => parameters!.fraction_shape ?? (parameters!.fractions!.every((fraction) => fraction.denominator === 100) ? "grid" : "bar");
      if (shape(first) !== shape(second) || shape(first) === "grid") return undefined;
      const a = first!.fractions![0]!, b = second!.fractions![0]!;
      if (second!.fraction_view === "split" && a.numerator === b.numerator && a.denominator === b.denominator) return 1;
      if (second!.fraction_view === "share" && a.denominator === 1 && a.numerator === b.numerator) return 1;
      return undefined;
    },
  },
  base_ten_trade: {
    // The mat's counts run from 0 to the most it draws (OLL 0023's tap rule). They have no control: the
    // learner works the mat by its own taps (0023 amendment 5; owner, 2026-11-24: the model never names a
    // control, and the slider of amendment 4 is gone from the mat). The starting values stay as the model
    // wrote them; the compiler checks them.
    fit_numbers(content, plan) {
      const numbers = content.numbers ?? [];
      const definitions = numbers.map((number) => plan.numbers?.[number - 1]);
      if (!definitions.length || definitions.some((definition) => !definition)) return new Map();
      const columns = baseTenColumns(definitions.map((definition) => definition!.initial));
      // The counts are named by their values, the mat's own words (owner, 2026-11-25: 一, 十, 百, never
      // block names such as 十条 or 百板, which the model wrote in check 3).
      const names = BASE_TEN_COUNT_NAMES[/^en(?:-|$)/iu.test(lessonTextLanguage(plan)) ? "en-US" : "zh-CN"];
      definitions.forEach((definition, place) => {
        definition!.min = 0;
        definition!.max = columns === 2 && place === 1 ? 9 : BASE_TEN_DRAWN[place] ?? 0;
        delete definition!.student_control;
        definition!.label = names[place]!;
        delete definition!.unit;
      });
      return new Map(numbers.map((number) => [number, 0]));
    },
    number_moves: { state: baseTenState, moves: baseTenMoves },
  },
  place_value_chart: {
    // The chart's numbers have no control: the learner works the chart by its own taps (OLL 0025; owner,
    // 2026-11-24: the model never names a control). The question's number runs from 0 to itself,
    // the demonstration's targets; the practice number stays as written. The compiler checks both.
    fit_numbers(content, plan) {
      const numbers = content.numbers ?? [];
      const definitions = numbers.map((number) => plan.numbers?.[number - 1]);
      if (!definitions.length || definitions.some((definition) => !definition)) return new Map();
      definitions.forEach((definition) => {
        definition!.min = Math.min(0, definition!.initial);
        definition!.max = Math.max(0, definition!.initial);
        delete definition!.student_control;
        delete definition!.unit;
      });
      // Nothing is fitted to a range: the chart checks each step and reads the practice target itself, so no
      // value is moved to a range's edge (a practice number above the question's would be, and its words rewritten).
      return new Map();
    },
    // Building, the chart's number is the value on the chart, from 0; pulling apart, what is still on it.
    number_moves: { state: placeValueState, moves: placeValueMoves },
  },
  place_value_trade: {
    // The card's numbers have no control: the learner works it by its own taps (OLL 0026; owner, 2026-11-24:
    // the model never names a control). Each number's range is its own value, and columns finished runs from 0
    // to the card's columns; the compiler checks every number and each step itself, so nothing is fitted.
    fit_numbers(content, plan) {
      // A second card's one number is the program's own demonstration count, whose range it set (second-card.ts).
      if (isSecondCard("place_value_trade", content, plan.sections)) return new Map();
      const numbers = content.numbers ?? [];
      const definitions = numbers.map((number) => plan.numbers?.[number - 1]);
      if (!definitions.length || definitions.some((definition) => !definition)) return new Map();
      const operation = (content.parameters as Record<string, unknown> | undefined)?.operation;
      const values = definitions.map((definition) => definition!.initial);
      const columns = placeValueTradeStartFault(values, operation) ? undefined
        : placeValueTradeColumnsOf(operation as "add" | "subtract", placeValueTradeThousandths(values[0]!)!, placeValueTradeThousandths(values[1]!)!).length;
      definitions.forEach((definition, position) => {
        definition!.min = position === TRADE_NUMBER.finished ? 0 : Math.min(0, definition!.initial);
        definition!.max = position === TRADE_NUMBER.finished ? columns ?? Math.max(0, definition!.initial) : Math.max(0, definition!.initial);
        delete definition!.student_control;
        delete definition!.unit;
      });
      return new Map();
    },
    // Columns finished moves forward from 0; the two numbers and the practice pair never move.
    second_card: (content, sections, numbers) => secondCardState("place_value_trade", content, sections, numbers),
    number_moves: { state: placeValueTradeState, moves: placeValueTradeMoves },
    // The pair, columns finished and one status a column: the more columns of adding or subtracting the pair.
    planned_variables(values) {
      const [a, b] = values.slice(0, 2).map(placeValueTradeThousandths);
      if (a === undefined || b === undefined) return undefined;
      const columns = (["add", "subtract"] as const).filter((operation) => operation === "add" || a >= b)
        .map((operation) => placeValueTradeColumnsOf(operation, a, b).length);
      return 3 + Math.max(...columns);
    },
  },
  make_ten: {
    // The card's numbers have no control: the learner works it by its own taps (OLL 0027; owner, 2026-11-24: the
    // model never names a control). Each number's range is its own value; the count in the bigger frame runs to 10
    // and the count moved to 4 (the program's own numbers). The compiler checks every number and each step itself.
    fit_numbers(content, plan) {
      // A second card's one number is the program's own demonstration count, whose range it set (second-card.ts).
      if (isSecondCard("make_ten", content, plan.sections)) return new Map();
      const numbers = content.numbers ?? [];
      const definitions = numbers.map((number) => plan.numbers?.[number - 1]);
      if (!definitions.length || definitions.some((definition) => !definition)) return new Map();
      definitions.forEach((definition, position) => {
        definition!.min = position >= MAKE_TEN_NUMBER.filled ? 0 : Math.min(0, definition!.initial);
        definition!.max = position === MAKE_TEN_NUMBER.filled ? 10 : position === MAKE_TEN_NUMBER.moved ? 4 : Math.max(0, definition!.initial);
        delete definition!.student_control;
        delete definition!.unit;
      });
      return new Map();
    },
    // The count in the bigger frame moves forward from the bigger number to 10; nothing else moves.
    second_card: (content, sections, numbers) => secondCardState("make_ten", content, sections, numbers),
    number_moves: { state: makeTenState, moves: makeTenMoves },
    // The pair, the count in the bigger frame and the count moved.
    planned_variables: () => 4,
  },
  place_value_times_ten: {
    // The card's numbers have no control: the learner works it by its own taps (OLL 0028; the model never names a
    // control). Each number's range is its own value, and counted in runs over the problem's path (as written: 0.1
    // to 0.001), as make ten's and the trade card's do; the compiler checks every number and each step itself.
    fit_numbers(content, plan) {
      // A second card's one number is the program's own demonstration count, whose range it set (second-card.ts).
      if (isSecondCard("place_value_times_ten", content, plan.sections)) return new Map();
      const numbers = content.numbers ?? [];
      const definitions = numbers.map((number) => plan.numbers?.[number - 1]);
      if (!definitions.length || definitions.some((definition) => !definition)) return new Map();
      const found = timesTenStartProblem(definitions.map((definition) => definition!.initial));
      const path = "fault" in found ? [] : placeValueTimesTenPath(found.problem).map(timesTenDecimal);
      definitions.forEach((definition, position) => {
        const span = position === TIMES_TEN_NUMBER.countedIn ? [0, definition!.initial, ...path].slice(path.length ? 1 : 0) : [0, definition!.initial];
        definition!.min = Math.min(...span);
        definition!.max = Math.max(...span);
        delete definition!.student_control;
        delete definition!.unit;
      });
      return new Map();
    },
    // Counted in moves along the problem's path toward the target; nothing else moves (an animation of another
    // number is left out and recorded).
    second_card: (content, sections, numbers) => secondCardState("place_value_times_ten", content, sections, numbers),
    number_moves: { state: placeValueTimesTenState, moves: placeValueTimesTenMoves },
    // Numbers the card cannot start on go with the outline, before any section is written for them.
    outline_fault: timesTenOutlineFault,
    // The amount, the unit asked, the start unit and one or two row sets (two when the count crosses two places).
    planned_variables(values) {
      const found = timesTenStartProblem(values.slice(0, 5));
      return "fault" in found ? 5 : 4 + (found.problem.g === 2 ? 1 : 0);
    },
  },
  place_value_compare: {
    // The card's numbers have no control: the learner works it by its own taps (OLL 0029; the model never names a
    // control). Each number's range is its own value, and compared runs from 0 to the most any pair reaches (seven
    // columns, then the sign); the compiler checks every number and each step itself.
    fit_numbers(content, plan) {
      const numbers = content.numbers ?? [];
      const definitions = numbers.map((number) => plan.numbers?.[number - 1]);
      if (!definitions.length || definitions.some((definition) => !definition)) return new Map();
      definitions.forEach((definition, position) => {
        definition!.min = position === COMPARE_NUMBER.compared ? 0 : Math.min(0, definition!.initial);
        definition!.max = position === COMPARE_NUMBER.compared ? COMPARE_MOST : Math.max(0, definition!.initial);
        delete definition!.student_control;
        delete definition!.unit;
      });
      return new Map();
    },
    // Compared moves forward from 0 to the sign; nothing else moves (an animation of another number is left out and
    // recorded; a value past the end is the end).
    number_moves: { state: compareState, moves: compareMoves },
    // Numbers the card cannot start on go with the outline, before any section is written for them.
    outline_fault: compareOutlineFault,
  },
  number_line: { fit_numbers: fitNumberLineNumbers },
  number_line_compare: { fit_numbers: fitComparedNumbers },
  number_line_solution: { fit_numbers: fitSolutionNumbers },
  number_line_rounding: { fit_numbers: fitRoundingNumbers },
  number_line_steps: { fit_numbers: fitStepsNumbers },
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
    lower_model_parameters(parameters, { numberCount, numberLabels = [], visualNumbers = [] }) {
      // An empty list is none: the model writes `pieces: []` beside a plain formula (6 of 48 trial lessons
      // were refused for it, one call each), and `marks: []` the same way.
      if (Array.isArray(parameters.pieces) && parameters.pieces.length === 0) delete parameters.pieces;
      if (Array.isArray(parameters.marks) && parameters.marks.length === 0) delete parameters.marks;
      const dragged = lowerPoints(parameters, numberCount);
      if (parameters.pieces !== undefined) return lowerPieces(parameters, numberCount);
      const rawFormulas = parameters.formulas !== undefined
        ? parameters.formulas
        : typeof parameters.expression === "string"
          ? [parameters.expression]
          : Array.isArray(parameters.expressions)
            ? parameters.expressions
            : undefined;
      if (rawFormulas === undefined) {
        // A reply with expression_tokens instead of formulas gets the same dragged-point checks (review of #113).
        if (dragged && Array.isArray(parameters.expressions) && parameters.expressions.length !== 1) {
          formulaError("$lessonPlanSection.visual.parameters.points", "points sit on one formula; a comparison of several curves takes none");
        }
        return;
      }
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
        namesToNumbers(formula, numberLabels, visualNumbers),
        numberCount,
        `$lessonPlanSection.visual.parameters.formulas[${index}]`,
      ));
      if (dragged && parsed.length !== 1) formulaError("$lessonPlanSection.visual.parameters.points", "points sit on one formula; a comparison of several curves takes none");
      // A dragged point on a curve the sliders change is handled as main handles samples there (plot-bindings):
      // refused where the point needs its own number, otherwise left to the curve. Refusing it outright lost a
      // lesson in the paired probe that main published (PJ-04: a point on the vertex slider of (x − n1)² + 2,
      // which the vertex mark already shows; the model alternated between two refused replies).
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
      const pathToSamples = `${path}.parameters.points`;
      const samples = validatePlotSampleNumbers(visualParameters.sample_x_numbers, numberCount, pathToSamples);
      if (samples.length && plotCurveNumbers(visualParameters).length) {
        fail("LESSON_PLAN_INTERACTION_MISMATCH", pathToSamples, "a dragged point (points {slider}) needs a fixed curve; use formula references for curve controls");
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

/**
 * A formula that names a lesson number by its symbol reads that number: "a*(x-2)^2+1" where the visual's
 * one number is labelled "a", "k*x+1" for "斜率 k" (the trial: 3 of 48 lessons, and 5 of the 139 recorded
 * ones, were refused for it and asked again). Only names the parser would refuse are replaced: the right
 * side of an "=" only (the parser takes "y =" and "f(x) =" itself), read as its lexer reads them (letters
 * only; compared lowercased, so "E", "X" and "Sin" stay e, x and sin), and only when exactly one of the
 * visual's numbers shows that name as its symbol (the label's trailing letter, as plot text shows it).
 */
function namesToNumbers(formula: unknown, labels: readonly string[], visualNumbers: readonly number[]): unknown {
  if (typeof formula !== "string") return formula;
  const equals = formula.indexOf("=");
  const left = equals >= 0 ? formula.slice(0, equals + 1) : "";
  const right = equals >= 0 ? formula.slice(equals + 1) : formula;
  const symbol = (label: string) => /([A-Za-z\u03b1-\u03c9])$/u.exec(label.trim())?.[1];
  const known = (name: string) => {
    const lower = name.toLowerCase();
    return lower === "x" || lower === "pi" || lower === "e" || /^n\d+$/u.test(lower) || formulaFunctions.has(lower);
  };
  // Case-insensitive like the lexer, so "N1" stays one reference (review).
  return left + right.replace(/n\d+|[A-Za-z_]+/giu, (name, offset: number, whole: string) => {
    if (known(name)) return name;
    // A name followed by a digit ("a2", or "a 2": the lexer drops spaces) would become a different reference
    // ("n12"): left to the parser.
    if (/^\s*\d/u.test(whole.slice(offset + name.length))) return name;
    // Part of a number ("2e3") is not a name.
    if (/[0-9.]/u.test(whole[offset - 1] ?? "") && /^e/iu.test(name)) return name;
    const matches = visualNumbers.filter((number) => symbol(labels[number - 1] ?? "") === name);
    return matches.length === 1 ? `n${matches[0]}` : name;
  });
}

/**
 * Points on a plot (OLL decision 0018 as amended, decision 0020): the model writes what each point is, never
 * an index into another list. A fixed point is its x and y, both values the narration says; the compiler
 * checks y against the curve (a stand-in formula is caught without reading text) and draws it. A point the
 * learner drags names the slider that moves it, as the formula does (`n1`); it lowers to the internal
 * `sample_x_numbers`, so every check of moving points still applies. Before, the model wrote
 * `sample_x_numbers` itself and often put x positions there ([1, 3] for x = 1 and 3): 42 recorded slips, and
 * lessons lost when a retry repeated it. A point the program cannot draw is refused, never dropped: the
 * narration talks about it.
 */
function lowerPoints(parameters: Record<string, unknown>, numberCount: number): boolean {
  // sample_labels is the program's, written only here from the model's point labels.
  delete parameters.sample_labels;
  const raw = parameters.points;
  if (raw === undefined) return false;
  const path = "$lessonPlanSection.visual.parameters.points";
  if (Array.isArray(raw) && raw.length === 0) {
    delete parameters.points;
    return false;
  }
  if (!Array.isArray(raw) || raw.length > 2) fail("LESSON_PLAN_POINT", path, "points holds one or two points");
  if (parameters.pieces !== undefined) fail("LESSON_PLAN_POINT", path, "points sit on one formula; a piecewise function takes no points");
  const items = (raw as unknown[]).map((entry, index) => {
    const where = `${path}[${index}]`;
    const point = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : undefined;
    const fixed = point && typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y) && point.slider === undefined;
    const moving = point && typeof point.slider === "string" && point.x === undefined && point.y === undefined;
    if (!fixed && !moving) fail("LESSON_PLAN_POINT", where, "a point is either {x, y}, a fixed point on the curve, or {slider: \"n1\"}, a point the learner drags by that lesson number");
    // A label up to 16 characters is drawn whole; a longer one is left to the program's letter, never cut
    // mid-text ("P(x, sqr" in the paired probe).
    const label = typeof point!.label === "string" && point!.label.trim() && point!.label.trim().length <= 16 ? point!.label.trim() : undefined;
    if (fixed) return { kind: "fixed" as const, x: point!.x as number, y: point!.y as number, ...(label ? { label } : {}) };
    const match = /^\s*n(\d+)\s*$/iu.exec(point!.slider as string);
    const number = match ? Number(match[1]) : Number.NaN;
    if (!(number >= 1 && number <= numberCount)) {
      fail("LESSON_PLAN_POINT", `${where}.slider`, numberCount
        ? `the slider of a dragged point is one of the lesson numbers n1 to n${numberCount}`
        : "this lesson has no lesson numbers, so no point can be dragged: write the point as {x, y}");
    }
    return { kind: "moving" as const, number, ...(label ? { label } : {}) };
  });
  if (items.some((item) => item.kind === "fixed") && items.some((item) => item.kind === "moving")) {
    fail("LESSON_PLAN_POINT", path, "the points of one plot are all fixed ({x, y}) or all dragged ({slider}), not both");
  }
  if (items[0]!.kind === "moving") {
    const numbers = items.map((item) => (item as { number: number }).number);
    if (new Set(numbers).size !== numbers.length) fail("LESSON_PLAN_POINT", path, "two dragged points need two different lesson numbers");
    delete parameters.points;
    parameters.sample_x_numbers = numbers;
    // The model's names for its dragged points, drawn as written (review of #113).
    const labels = items.map((item) => (item as { label?: string }).label);
    const free = ["A", "B"].filter((name) => !labels.includes(name));
    if (labels.some((label) => label !== undefined)) parameters.sample_labels = labels.map((label) => label ?? (items.length === 2 ? free.shift()! : "P"));
    return true;
  }
  const xs = items.map((item) => (item as { x: number }).x);
  if (new Set(xs).size !== xs.length) fail("LESSON_PLAN_POINT", path, "two fixed points need two different x");
  parameters.points = items.map(({ kind: _kind, ...point }) => point);
  return false;
}

/**
 * A piecewise function (OLL decision 0018 §2): each piece is a formula on an interval with its ends open or
 * closed, as the model writes them. The pieces replace the formulas: each becomes one static curve (a
 * piece may be a constant), and their intervals may meet only at an end at most one of them includes.
 */
const PIECE_ENDS = { "[]": [true, true], "[)": [true, false], "(]": [false, true], "()": [false, false] } as const;
function lowerPieces(parameters: Record<string, unknown>, numberCount: number): { no_numbers: true } {
  const path = "$lessonPlanSection.visual.parameters.pieces";
  const raw = parameters.pieces;
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 4) formulaError(path, "a piecewise function has two to four pieces");
  const decimal = (value: unknown, where: string): number | null => {
    if (value === undefined || value === null) return null;
    const number = typeof value === "number" ? value
      : value && typeof value === "object" && "mantissa" in value ? Number((value as { mantissa: number }).mantissa) / 10 ** Number((value as { scale?: number }).scale ?? 0) : Number.NaN;
    if (!Number.isFinite(number)) formulaError(where, "a piece's end is a finite number, or left out when that side is unbounded");
    return number;
  };
  const pieces = (raw as unknown[]).map((entry, index) => {
    const where = `${path}[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) formulaError(where, "each piece is an object with formula, x_from, x_to and ends");
    const piece = entry as Record<string, unknown>;
    const tokens = parseModelFormula(piece.formula, numberCount, `${where}.formula`, { allowConstant: true });
    if (tokens.some((token) => token.kind === "number")) formulaError(`${where}.formula`, "pieces are fixed formulas; use one formula when lesson numbers change the curve");
    const ends = PIECE_ENDS[String(piece.ends) as keyof typeof PIECE_ENDS];
    if (!ends) formulaError(`${where}.ends`, "ends is one of [] [) (] ()");
    const from = decimal(piece.x_from, `${where}.x_from`), to = decimal(piece.x_to, `${where}.x_to`);
    if (from !== null && to !== null && !(from < to)) formulaError(where, "a piece's x_from is below its x_to");
    return { expression: mathExpressionToOll(tokens), from, to, from_closed: ends[0], to_closed: ends[1] };
  });
  // Each x at most once: in order, a piece starts at or after the one before ends, and where they meet at
  // most one includes the shared end.
  const ordered = [...pieces].sort((a, b) => (a.from ?? -Infinity) - (b.from ?? -Infinity));
  for (let index = 1; index < ordered.length; index += 1) {
    const before = ordered[index - 1]!, piece = ordered[index]!;
    const meets = before.to !== null && piece.from !== null && before.to === piece.from;
    if (before.to === null || piece.from === null || before.to > piece.from || (meets && before.to_closed && piece.from_closed)) {
      formulaError(path, "the pieces overlap: each x belongs to at most one piece, and where two meet only one includes the end");
    }
  }
  for (const key of ["formulas", "expression", "expressions", "expression_tokens", "curve_label", "curve_labels", "sample_x_numbers", "sample_labels"]) delete parameters[key];
  parameters.expressions = ordered.map((piece) => piece.expression);
  parameters.pieces = ordered;
  return { no_numbers: true };
}

// A request for two independently movable points on a curve: the outline
// gets A/B x-coordinate numbers and function plots use them as sample points.
function requestsTwoIndependentPoints(request: string): boolean {
  return /(?:两个|两)\s*(?:个)?(?:可以|可)?(?:分别|独立|各自).{0,8}(?:移动|调整).{0,4}点|(?:分别|独立|各自).{0,8}(?:移动|调整).{0,8}(?:两个点|两点)|two.{0,12}(?:independent|separate).{0,12}(?:point|sample)/i.test(request);
}

/**
 * A number line in steps that walks a making-ten sum again, in a section after the make-ten card (pilot 1, MT-13: the
 * line wrote one step and then took the card's count moved). The program writes the walk's three numbers from the card's
 * pair, as lesson numbers of the line's own that the card never names: the start (the bigger addend), the step that
 * makes ten and the step left (8 + 5: 8, +2, +3). Appended before that section is written, so no earlier part changes;
 * once per outline. Only when the card leads the outline's numbers (its pair is numbers 1 and 2) and the pair makes ten.
 */
/** A second card's positions and state when drawn (`second_card`): from the lesson's first card of the kind and the example. */
function secondCardState(capability: string, content: LessonPlanVisualContent, sections: ReadonlyArray<{ moments: ReadonlyArray<{ actions: ReadonlyArray<unknown> }> }>, numbers: ReadonlyArray<{ initial: number }>):
  { positions: number[]; started: number[] } | undefined {
  if (!isSecondCardKind(capability) || !isSecondCard(capability, content, sections)) return undefined;
  const first = sections.flatMap((section) => section.moments.flatMap((moment) => moment.actions)).map((raw) => raw as { action?: string; kind?: string; content?: LessonPlanVisualContent })
    .find((action) => action.action === "create" && action.kind === "visual" && action.content?.capability === capability)?.content;
  if (!first) return undefined;
  const found = exampleStart(capability, exampleOf(capability, content.parameters)!, (first.numbers ?? []).map((number) => numbers[number - 1]?.initial ?? Number.NaN), first.parameters as Record<string, unknown> | undefined);
  if ("fault" in found) return undefined;
  const merged = { ...content, parameters: { ...(first.parameters ?? {}), ...(content.parameters ?? {}) } } as LessonPlanVisualContent;
  const hook = MATH_HOOKS[capability]!.number_moves!;
  return { positions: [SECOND_CARDS[capability].demonstration], started: [...hook.state(found.start, merged)] };
}

/**
 * A second card of a kind in `section` (a later course visual of a kind whose first is drawn earlier): the program
 * appends the one lesson number its demonstration moves, labelled for it, before the section is written (second-card.ts).
 * New to the lesson then, so no earlier part changes; once per outline and kind. Its start is the card's own (read over).
 */
function prepareSecondCards(outline: LessonPlanOutline, section: number, language?: string): void {
  const visuals = outline.course_visuals ?? [];
  for (const capability of Object.keys(SECOND_CARDS) as Array<keyof typeof SECOND_CARDS>) {
    const ofKind = visuals.filter((visual) => visual.capability === capability);
    if (ofKind.length < 2 || ofKind[1]!.create_section !== section || ofKind[0]!.create_section >= section) continue;
    const label = lessonText(language, SECOND_CARDS[capability].label);
    const numbers = outline.numbers ?? [];
    if (numbers.some((number) => number.label === label) || numbers.length >= 16) continue;
    outline.numbers = [...numbers, { initial: 0, min: 0, max: SECOND_CARDS[capability].max, label }];
  }
}

function prepareMakeTenSteps(outline: LessonPlanOutline, section: number, language?: string): void {
  const visuals = outline.course_visuals ?? [];
  const numbers = outline.numbers ?? [];
  if (!visuals.some((visual) => visual.capability === "number_line_steps" && visual.create_section === section)) return;
  const firstNumbered = visuals.find((visual) => (LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[visual.capability as keyof typeof LESSON_PLAN_CAPABILITY_NUMBER_LIMITS] ?? 0) > 0);
  if (firstNumbered?.capability !== "make_ten" || firstNumbered.create_section >= section || numbers.length < 2) return;
  const [a, b] = [numbers[0]!.initial, numbers[1]!.initial];
  if (![a, b].every((value) => Number.isInteger(value) && value >= 1 && value <= 9) || a + b <= 10) return;
  const big = Math.max(a, b), toTen = 10 - big, rest = Math.min(a, b) - toTen;
  const labels = ["数轴的起点（大数）", "补成十的一步", "剩下的一步"].map((label) => lessonText(language, label));
  if (numbers.some((number) => number.label === labels[0]) || numbers.length + 3 > 16) return;
  outline.numbers = [...numbers,
    { initial: big, min: 0, max: 20, label: labels[0]! },
    { initial: toTen, min: 0, max: 10, label: labels[1]! },
    { initial: rest, min: 0, max: 10, label: labels[2]! }];
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
      || content.parameters?.points !== undefined || Array.isArray(content.parameters?.expressions)) continue;
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
  prepare_section: (outline, section, { language }) => { prepareMakeTenSteps(outline, section, language); prepareSecondCards(outline, section, language); },
  specialize_draft(draft, context) {
    specializeTwoPointDraft(draft, context.outline, context.request);
    normalizePlotDraftBindings(draft, context);
  },
  normalize_plan: normalizePlotInputInstructions,
  check_plan: validateTeachingClaims,
};
