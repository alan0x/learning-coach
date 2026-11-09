// Recipe hooks of the math plugin.
import type { LessonPlanVisualContent } from "../lesson-plan.js";
import { mathExpressionToOll } from "../recipe-kit.js";
import type { RecipeHooks } from "./hooks.js";
import { formulaError, parseModelFormula } from "./math-formulas.js";

function formulaNumbers(parameters: Record<string, unknown>, numberCount: number, limit: number): number[] {
  if (!Array.isArray(parameters.expression_tokens)) return [];
  return [...new Set(parameters.expression_tokens.flatMap((token) => (
    token && typeof token === "object" && !Array.isArray(token)
      && (token as Record<string, unknown>).kind === "number"
      && Number.isInteger((token as Record<string, unknown>).number)
      ? [Number((token as Record<string, unknown>).number)]
      : []
  )))].filter((number) => number >= 1 && number <= numberCount).slice(0, limit);
}

export const MATH_HOOKS: Record<string, RecipeHooks> = {
  implicit_surface_with_section: {
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
    numbers_from_parameters: (parameters, { numberCount, limit }) => formulaNumbers(parameters, numberCount, limit),
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
    validate_numbers(numbers, content, { path, fail }) {
      if (numbers.length > 2 && (content.parameters as Record<string, unknown>)?.expression_tokens === undefined) {
        fail("LESSON_PLAN_EXPRESSION", `${path}.numbers`, "static curves support at most two independent sample points");
      }
    },
    bound_numbers(content: LessonPlanVisualContent, { path, numberCount, validateMathExpression }) {
      if (content.parameters?.expression_tokens === undefined) return undefined;
      const curveNumbers = validateMathExpression(content.parameters.expression_tokens, path, numberCount, true);
      return curveNumbers.length ? curveNumbers : undefined;
    },
  },
  coordinate_circle: {
    // A declared radius formula maps an input quantity to radius; its input
    // is not itself a radius. Keep shared height/time/etc. controls intact.
    number_purpose: (content) => (content.parameters?.radius_expression !== undefined ? "generic" : undefined),
  },
};
