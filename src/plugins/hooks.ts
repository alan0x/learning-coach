import type { LessonPlan, LessonPlanAction, LessonPlanMathExpression, LessonPlanNumber, LessonPlanOutline, LessonPlanSectionDraft, LessonPlanVisualContent } from "../lesson-plan.js";
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
  lower_model_parameters?(parameters: Record<string, unknown>, context: { numberCount: number; numberLabels?: readonly string[]; visualNumbers?: readonly number[] }): { no_numbers?: boolean } | void;
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
  /**
   * Fits the numbers a newly created visual shows to what the lesson teaches (a number line's ticks),
   * in place; returns each fitted number with its tick step (0: ranges only). `shared` holds numbers
   * another visual also shows, which a recipe must leave alone.
   */
  fit_numbers?(content: LessonPlanVisualContent, plan: LessonPlan, shared: ReadonlySet<number>): Map<number, number>;
  /**
   * For a visual whose numbers do not change freely (the trading mat: ones go down by tens, and the tens
   * follow). `start` holds the starting values of the visual's lesson numbers, in its number order.
   * `state(start)` is the card's state at the start; `move` gives the state after the visual's number at
   * `position` is animated to `to`, or the reason the card cannot make that change. A state's first
   * entries are the visual's lesson numbers, in order, as the card reads them when it is drawn: usually
   * their starting values, but a place-value chart to build reads its number as the value on the chart,
   * which starts at 0 (`content` is the visual's, for a card whose reading depends on it), or at the number when
   * the section that draws it never builds it (`drawnWith`: that section's actions from the moment the card is
   * drawn on; every caller that draws the card passes it, so the compiler, the section facts and the judge agree).
   */
  number_moves?: {
    state(start: readonly number[], content?: LessonPlanVisualContent, drawnWith?: readonly LessonPlanAction[]): number[];
    // `ignored`: animations the card leaves out rather than refuses (a number it never moves), each with its index
    // in `moves` and why; the compiler records them and plays the rest.
    moves(state: readonly number[], moves: ReadonlyArray<{ position: number; to: number }>):
      { steps: Array<{ position: number; from: number[]; to: number[] }>; ignored?: Array<{ index?: number; position: number; reason: string }> } | { refused: { position: number; reason: string } };
  };
  /**
   * Why the visual cannot start on the outline's numbers, or undefined. `values` are its lesson numbers' starting
   * values as the outline declares them (with the program's own), in its number order; asked only when the visual
   * is the outline's first numbered picture, so those are its numbers. A section cannot change an outline number,
   * so the visual goes at once, before any section is written for it.
   */
  outline_fault?(values: readonly number[], definitions?: readonly LessonPlanNumber[]): string | undefined;
  /**
   * The lesson variables the card will bind on these starting values (its lesson numbers, in its order, as the outline
   * declares them with the program's own), at most: the worst case of what its create decides later (the column card's
   * operation). Read when the lesson's first section compiles, so a lesson that cannot hold its planned cards loses the
   * other picture before anything is published (review of #194, B2). Undefined when the values make no card.
   */
  planned_variables?(values: readonly number[]): number | undefined;
  /**
   * A second card of the kind (a demonstration on the section's own example): the position in the kind's number order of
   * each of its lesson numbers (the one its demonstration moves) and its state when drawn, as `number_moves.state`
   * gives it. `sections` are the lesson's, in order; `numbers` its lesson numbers. Undefined for any other create.
   */
  second_card?(content: LessonPlanVisualContent, sections: ReadonlyArray<{ moments: ReadonlyArray<{ actions: ReadonlyArray<unknown> }> }>, numbers: ReadonlyArray<{ initial: number }>):
    { positions: number[]; started: number[] } | undefined;
  /**
   * The model wrote several first-section creates of this course visual (their contents, in order): the
   * index of the one the card is made from, drawn at the first create's moment. Without the hook Coach
   * keeps the first and drops the rest. Out of range or not a whole number: the first.
   */
  choose_first_create?(contents: readonly Record<string, unknown>[]): number;
  /**
   * After `choose_first_create` chose `chosen`: the index of a later create (in the same contents) that is
   * the card's next step, drawn as a revision of the card at that create's moment; or undefined. Only for a
   * recipe that declares `revised_by_program`.
   */
  then_create?(contents: readonly Record<string, unknown>[], chosen: number): number | undefined;
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
  /**
   * Adjusts the outline in place before `section` is written, once the sections before it are accepted: lesson numbers
   * appended then are new to the lesson (a later part adds them; no published variable changes).
   */
  prepare_section?(outline: LessonPlanOutline, section: number, context: { language?: string }): void;
  /** Adjusts a section draft for the request, before it is compiled. */
  specialize_draft?(draft: LessonPlanSectionDraft, context: DraftSpecializationContext): void;
  /** Normalizes the resolved plan before compiling. Runs for every plugin before any check_plan. */
  normalize_plan?(plan: LessonPlan): void;
  /** Rejects a plan whose narration contradicts what its visuals show. */
  check_plan?(plan: LessonPlan): void;
}

/** Plugin-level hooks of the installed plugins, in plugin order. */
export const PLUGIN_HOOKS: readonly PluginHooks[] = [MATH_PLUGIN_HOOKS];
