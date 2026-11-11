import type { LessonPlan, LessonPlanMathExpression, LessonPlanOutline, LessonPlanSectionDraft, LessonPlanVisualContent } from "../lesson-plan.js";
import { MATH_HOOKS, MATH_PLUGIN_HOOKS } from "./math-hooks.js";
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
  /** True when the visual's number at this input is an input to a recipe formula: it has no registry purpose and no program range. */
  free_number?(content: LessonPlanVisualContent, index: number): boolean;
  /** Adjusts the plan for this visual before compiling, such as separating initial values. */
  before_compile?(content: LessonPlanVisualContent, plan: LessonPlan, sectionIndex: number): void;
  /** The number range a `surface_section` input can take for this visual. */
  section_range?(content: LessonPlanVisualContent, path: string): { min: number; max: number };
  /** Checks the visual's parameters (undefined when it has none), after the general parameter checks. */
  validate_parameters?(parameters: unknown, context: RecipeValidationContext): void;
  /** Checks the visual's number list, after each reference is checked. */
  validate_numbers?(numbers: unknown[], content: Record<string, unknown>, context: RecipeValidationContext): void;
  /** Lesson numbers that drive this visual, when its parameters decide them. */
  bound_numbers?(content: LessonPlanVisualContent): number[];
}

export type { LessonPlanMathExpression };

/** Hooks of the installed plugins, keyed by recipe. */
// Null prototype: lookups use model-written capability names, and a name such
// as "constructor" must find nothing.
export const RECIPE_HOOKS: Readonly<Record<string, RecipeHooks | undefined>> = Object.assign(Object.create(null), MATH_HOOKS, SHARED_HOOKS);

export interface DraftSpecializationContext {
  outline: LessonPlanOutline;
  request: string;
  accepted: readonly LessonPlanSectionDraft[];
  adjust(event: { kind: "plot_binding_rebuilt" | "plot_control_removed"; section: number; moment: number; reason: string; detail?: string }): void;
}

/** Plugin steps that work on the whole request or lesson rather than one recipe. */
export interface PluginHooks {
  /** Adjusts the accepted outline for the request. */
  prepare_outline?(outline: LessonPlanOutline, context: { request: string; language?: string }): void;
  /** Adjusts a section draft for the request, before it is compiled. */
  specialize_draft?(draft: LessonPlanSectionDraft, context: DraftSpecializationContext): void;
  /** Normalizes the resolved plan before compiling. Runs for every plugin before any check_plan. */
  normalize_plan?(plan: LessonPlan): void;
  /** Rejects a plan whose narration contradicts what its visuals show. */
  check_plan?(plan: LessonPlan): void;
}

/** Plugin-level hooks of the installed plugins, in plugin order. */
export const PLUGIN_HOOKS: readonly PluginHooks[] = [MATH_PLUGIN_HOOKS];
