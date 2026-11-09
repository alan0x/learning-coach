import type { LessonPlanMathExpression, LessonPlanVisualContent } from "../lesson-plan.js";
import { MATH_HOOKS } from "./math-hooks.js";
import { SHARED_HOOKS } from "./shared-hooks.js";

/** Lesson Plan validation helpers a recipe's checks may use. */
export interface RecipeValidationContext {
  path: string;
  numberCount: number;
  fail(code: string, path: string, message: string): never;
  record(value: unknown, path: string): Record<string, unknown>;
  array(value: unknown, path: string): unknown[];
  /** Validates expression tokens and returns the lesson numbers they use. */
  validateMathExpression(value: unknown, path: string, numberCount: number, allowInput: boolean): number[];
}

/**
 * Recipe-specific steps Coach runs at fixed points of generation and
 * validation. Every hook is optional; a recipe without one gets Coach's
 * general behaviour.
 */
export interface RecipeHooks {
  /** Rewrites the model's parameters in place, before keys the recipe does not accept are dropped. */
  lower_model_parameters?(parameters: Record<string, unknown>, context: { numberCount: number }): { no_numbers?: boolean } | void;
  /** Lesson numbers the lowered parameters bind; a non-empty list replaces the model's own list. */
  numbers_from_parameters?(parameters: Record<string, unknown>, context: { numberCount: number; limit: number }): number[];
  /** Why the program removes this visual from the lesson, or undefined to keep it. */
  removal_reason?(content: LessonPlanVisualContent): string | undefined;
  /** "generic" when a number does not carry its registry purpose for this visual. */
  number_purpose?(content: LessonPlanVisualContent, index: number): "generic" | undefined;
  /** Checks the visual's parameters (undefined when it has none), after the general parameter checks. */
  validate_parameters?(parameters: unknown, context: RecipeValidationContext): void;
  /** Checks the visual's number list, after each reference is checked. */
  validate_numbers?(numbers: unknown[], content: Record<string, unknown>, context: RecipeValidationContext): void;
  /** Lesson numbers that drive this visual, when its parameters decide them. */
  bound_numbers?(content: LessonPlanVisualContent, context: RecipeValidationContext): number[] | undefined;
}

export type { LessonPlanMathExpression };

/** Hooks of the installed plugins, keyed by recipe. */
// Null prototype: lookups use model-written capability names, and a name such
// as "constructor" must find nothing.
export const RECIPE_HOOKS: Readonly<Record<string, RecipeHooks | undefined>> = Object.assign(Object.create(null), MATH_HOOKS, SHARED_HOOKS);
