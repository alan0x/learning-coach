import { compileText, setLessonTextLanguage } from "./lesson-text.js";
import { CompiledVisualRegistry, type CompiledVisual } from "./compiled-visual-reuse.js";
import { applyLessonOpeningPolicy, type LessonOpeningPolicy, compileMathExpression, normalizeAuthoringLesson, reduceCanonicalEvents, validateAuthoringLesson, validateAuthoringSchema, type AuthoringAction, type AuthoringLesson, type ResourceContext } from "octos-lesson-language";
import { LESSON_PLAN_CAPABILITY_REGISTRY, LessonPlanError, countRange, isNumberLineCapability, recipeDeclares, LESSON_PLAN_CAPABILITY_NUMBER_LIMITS, numericAnswerTolerance, roundingPlaces, roundingTolerance, resolveLessonPlan, type LessonPlan, type LessonPlanBoardContent, type LessonPlanBoardKind, type LessonPlanHostReference, type LessonPlanVisualContent, type ResolveLessonPlanOptions, type ResolvedLessonPlan, type ResolvedLessonPlanReference } from "./lesson-plan.js";
import { fail, pad, variableAlias, parameters, optionalNumber, assertRange, safeFunctionExpression, mathExpressionToOll, place, includeWrittenCardsInFocus, namedNumbers, actionWhen } from "./recipe-kit.js";
import { PLUGIN_COMPILERS, VISUAL_COMPILERS } from "./plugins/compilers.js";
import { INSTALLED_PLUGINS, RECIPE_PLUGIN } from "./plugins/index.js";
import { PLUGIN_HOOKS, RECIPE_HOOKS } from "./plugins/hooks.js";
import { praiseArithmetic } from "./praise-arithmetic.js";
export { PLUGIN_COMPILERS };

export { includeWrittenCardsInFocus, mathExpressionToOll } from "./recipe-kit.js";

export interface CompileLessonPlanOptions extends ResolveLessonPlanOptions {
  construction_rules?: "legacy" | "explicit-v1";
  opening_policy?: LessonOpeningPolicy;
  language?: string;
  adaptation_context_refs?: string[];
  board_context?: { board_id: string; revision: number };
  validation_host?: { lesson_id?: string; board_id?: string; base_revision?: number };
}


export interface CompiledLessonPlan {
  lesson: AuthoringLesson;
  resolved: ResolvedLessonPlan;
  /** Plugin ID to version for the plugins that built this lesson's visuals. */
  plugins: Record<string, string>;
  /** Visual decisions the program made for this lesson, by section (1-based). */
  view_adjustments: Array<{ section: number; reason: string; detail: string }>;
  /** Other program changes to the lesson's text, by section (1-based); each names its kind. */
  program_adjustments: Array<{ section: number; kind: "success_message_removed" | "success_message_unchecked" | "activity_removed"; reason: string; detail: string; task: string }>;
}

/** Compiled kinds a lesson number can drive: every output kind of a registered recipe with number inputs. */
// A recipe whose card binds variables it creates itself (the trading mat's counts, which the lesson taps and
// animates) is number-driven too.
const NUMBER_DRIVEN_KINDS: ReadonlySet<string> = new Set(Object.values(LESSON_PLAN_CAPABILITY_REGISTRY as Record<string, { number_inputs?: readonly string[]; output_kinds?: readonly string[] }>)
  .flatMap((recipe) => (recipe.number_inputs?.length ? recipe.output_kinds ?? [] : [])));

function normalizedVisualIdentity(content: LessonPlanVisualContent, includeNumbers = true): string {
  const sourceParameters = content.parameters ?? {};
  const parameters = Object.fromEntries(
    LESSON_PLAN_CAPABILITY_REGISTRY[content.capability].semantic_parameters
      .filter((name) => sourceParameters[name] !== undefined)
      .map((name) => [name, sourceParameters[name]]),
  );
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    );
  };
  return JSON.stringify(normalize({
    capability: content.capability,
    parameters,
    ...(includeNumbers ? { numbers: content.numbers ?? [] } : {}),
  }));
}


function mergeEquivalentVisualInputs(plan: LessonPlan): void {
  const groups = new Map<string, LessonPlanVisualContent[]>();
  for (const section of plan.sections) {
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (action.action !== "create" || action.kind !== "visual") continue;
        const content = action.content as LessonPlanVisualContent;
        const identity = normalizedVisualIdentity(content, false);
        const group = groups.get(identity) ?? [];
        group.push(content);
        groups.set(identity, group);
      }
    }
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const inputs = [...new Set(group.flatMap((content) => content.numbers ?? []))];
    const limit = LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[group[0].capability];
    if (inputs.length > limit) continue;
    for (const content of group) content.numbers = [...inputs];
  }
}

/**
 * The plugins whose recipes built this plan's visuals, with the plugins they
 * depend on, each at its installed version. This is compilation metadata: it
 * says what produced the lesson, not what a player needs to play it.
 */
export function lessonPlanPlugins(plan: LessonPlan): Record<string, string> {
  const installed = new Map(INSTALLED_PLUGINS.map((plugin) => [plugin.manifest.id as string, plugin.manifest]));
  const used = new Set<string>();
  const add = (id: string): void => {
    if (used.has(id)) return;
    used.add(id);
    for (const dependency of Object.keys(installed.get(id)?.depends ?? {})) add(dependency);
  };
  for (const section of plan.sections) for (const moment of section.moments) for (const action of moment.actions) {
    if (action.action !== "create" || action.kind !== "visual") continue;
    add(RECIPE_PLUGIN[(action.content as LessonPlanVisualContent).capability]);
  }
  return Object.fromEntries([...used].sort().map((id) => [id, installed.get(id)!.version]));
}

function intersectProgramRange(
  definition: NonNullable<LessonPlan["numbers"]>[number],
  allowedMin: number,
  allowedMax: number,
): void {
  let min = Math.max(definition.min, allowedMin);
  let max = Math.min(definition.max, allowedMax);
  if (!(min < max)) {
    min = allowedMin;
    max = allowedMax;
  }
  definition.min = min;
  definition.max = max;
  definition.initial = Math.min(max, Math.max(min, definition.initial));
  if (definition.student_control) definition.student_control.step = (max - min) / 200;
}

function positiveProgramRange(definition: NonNullable<LessonPlan["numbers"]>[number]): void {
  if (definition.max <= 0) {
    definition.min = 0.1;
    definition.max = 5;
    definition.initial = 1;
  } else {
    const positiveMinimum = Math.max(1e-6, definition.max / 1_000);
    definition.min = Math.max(definition.min, positiveMinimum);
    if (!(definition.min < definition.max)) definition.min = Math.max(1e-6, definition.max / 200);
    definition.initial = Math.min(definition.max, Math.max(definition.min, definition.initial));
  }
  if (definition.student_control) {
    definition.student_control.step = (definition.max - definition.min) / 200;
  }
}

function positiveIntegerProgramRange(
  definition: NonNullable<LessonPlan["numbers"]>[number],
  maximum: number,
): void {
  // Edges round like the counts they bound (3.4 squares draws as 3), so a decimal edge never excludes
  // the count its own starting value draws.
  const min = Math.max(1, Math.round(definition.min));
  const max = Math.min(maximum, Math.round(definition.max));
  if (min <= max) {
    definition.min = min;
    definition.max = max;
    definition.initial = Math.min(max, Math.max(min, Math.round(definition.initial)));
  } else {
    definition.min = 1;
    definition.max = maximum;
    definition.initial = Math.min(maximum, Math.max(1, Math.round(definition.initial)));
  }
  if (definition.student_control) definition.student_control.step = 1;
}


/**
 * Apply physical and rendering constraints after the model-authored teaching
 * plan has been resolved, but before OLL variables, animations, and tasks are
 * emitted. The model may request a useful teaching range; installed
 * capabilities own the executable range that can actually affect a visual.
 */
function normalizeProgramOwnedNumberRanges(plan: LessonPlan): void {
  const constrained = new Set<number>();
  const integerSides = new Set<number>();
  // Numbers a number line fitted to its ticks, with the tick step (0: ranges only, no ticks to snap to).
  const tickSteps = new Map<number, number>();
  // How many visuals show each number: a number line fits only numbers no other visual shows.
  const visualsUsing = new Map<number, number>();
  for (const section of plan.sections) for (const moment of section.moments) for (const action of moment.actions) {
    if (action.action !== "create" || action.kind !== "visual") continue;
    // The numbers a visual binds, as the loop below resolves them: a function plot's come from its
    // formula and sample points, not only from its number list.
    const content = action.content as LessonPlanVisualContent;
    const bound = RECIPE_HOOKS[content.capability]?.bound_numbers?.(content);
    const numbers = bound?.length ? bound : bound ? [] : content.numbers ?? [];
    for (const number of new Set(numbers)) visualsUsing.set(number, (visualsUsing.get(number) ?? 0) + 1);
  }
  // Counts a recipe draws (squares in a row, sides of a polygon), with the model's own starting values,
  // checked after fitting. The program may narrow a slider's range, but never moves a count the lesson
  // shows and its narration states: a lesson titled "12 cookies" must not draw 8 squares (M2/M3
  // baseline, Coach #77). Such a count fails, and the model repairs the plan. Positions in a recipe's
  // own frame (a cube's section from −1 to 1) are still fitted: the model cannot know that frame.
  // Every count recipe that draws a number, in plan order: a count is checked against each of them, so the
  // verdict never depends on which visual comes first.
  const counts = new Map<number, Array<{ capability: string; path: string; section: number; min: number; max: number }>>();
  const written = new Map((plan.numbers ?? []).map((definition, index) => [index + 1, definition.initial]));
  // How each recipe's fit changed a number's range, in order: a stated count pushed out of the range is
  // blamed on the fit that pushed it out (a 3 by 3 square drawn 1 by 3 beside a cube section from −1 to 1),
  // not on the first visual that happens to share the number.
  const fits = new Map<number, Array<{ capability: string; path: string; before: [number, number]; after: [number, number] }>>();
  const publishedFixedRangeNumbers = new Set<number>();
  for (const [sectionIndex, section] of plan.sections.entries()) {
    const newFixedRangeNumbers = new Set<number>();
    for (const [momentIndex, moment] of section.moments.entries()) {
      for (const [actionIndex, action] of moment.actions.entries()) {
        if ((action.action !== "create" && action.action !== "revise")
          || action.kind !== "visual") continue;
        const content = action.content as LessonPlanVisualContent;
        const bound = RECIPE_HOOKS[content.capability]?.bound_numbers?.(content);
        if (bound?.length) content.numbers = bound;
        else if (bound) delete content.numbers;
        if (recipeDeclares(content.capability, "ranges_fixed_once_shown")) {
          for (const number of bound ?? content.numbers ?? []) newFixedRangeNumbers.add(number);
        }
        const fit = RECIPE_HOOKS[content.capability]?.fit_numbers;
        if (fit && action.action === "create") {
          const shared = new Set([...visualsUsing].filter(([number, count]) => count > 1 && content.numbers?.includes(number)).map(([number]) => number));
          for (const [number, step] of fit(content, plan, shared)) {
            constrained.add(number);
            if (step > 0) tickSteps.set(number, step);
          }
        }
        const policies = LESSON_PLAN_CAPABILITY_REGISTRY[content.capability].number_input_policies;
        for (const [inputIndex, numberIndex] of (content.numbers ?? []).entries()) {
          const definition = plan.numbers?.[numberIndex - 1];
          const policy = policies[inputIndex];
          if (!definition || !policy) continue;
          if (RECIPE_HOOKS[content.capability]?.free_number?.(content, inputIndex)) continue;
          const path = `$lessonPlan.sections[${sectionIndex}].moments[${momentIndex}].actions[${actionIndex}].content.parameters`;
          const prior = publishedFixedRangeNumbers.has(numberIndex)
            ? { min: definition.min, max: definition.max, initial: definition.initial, step: definition.student_control?.step }
            : undefined;
          const range = countRange(policy);
          if (range && !counts.get(numberIndex)?.some((owner) => owner.capability === content.capability)) {
            counts.set(numberIndex, [...(counts.get(numberIndex) ?? []), { capability: content.capability, path, section: sectionIndex, ...range }]);
          }
          const before: [number, number] = [definition.min, definition.max];
          if (policy.kind === "side_count") {
            integerSides.add(numberIndex);
            intersectProgramRange(definition, range!.min, range!.max);
            definition.min = Math.round(definition.min);
            definition.max = Math.round(definition.max);
            if (definition.min >= definition.max) { definition.min = range!.min; definition.max = range!.max; }
            definition.initial = Math.min(definition.max, Math.max(definition.min, Math.round(definition.initial)));
            if (definition.student_control) definition.student_control.step = 1;
            constrained.add(numberIndex);
          } else if (policy.kind === "bounded") {
            intersectProgramRange(definition, policy.min, policy.max);
            constrained.add(numberIndex);
          } else if (policy.kind === "positive") {
            positiveProgramRange(definition);
            constrained.add(numberIndex);
          } else if (policy.kind === "positive_integer") {
            positiveIntegerProgramRange(definition, range!.max);
            constrained.add(numberIndex);
          } else if (policy.kind === "surface_section") {
            const allowed = RECIPE_HOOKS[content.capability]?.section_range?.(content, path);
            if (allowed && allowed.min < allowed.max) {
              intersectProgramRange(definition, allowed.min, allowed.max);
              constrained.add(numberIndex);
            }
          }
          if (definition.min !== before[0] || definition.max !== before[1]) {
            fits.set(numberIndex, [...(fits.get(numberIndex) ?? []), { capability: content.capability, path, before, after: [definition.min, definition.max] }]);
          }
          if (prior && (definition.min !== prior.min || definition.max !== prior.max || definition.initial !== prior.initial
            || definition.student_control?.step !== prior.step)) {
            fail("LESSON_PLAN_INTERACTION_MISMATCH", path,
              `Use a number that fits this visual without changing number ${numberIndex} in the published graph`);
          }
        }
      }
    }
    for (const number of newFixedRangeNumbers) publishedFixedRangeNumbers.add(number);
  }
  if (constrained.size === 0) return;
  // Counts are whole numbers: 3.4 squares draws as 3, which is a rounding, not a change.
  const count = (value: number) => Math.round(value);
  // A count the lesson states is never moved: it is drawn as stated, or refused for the part of the plan
  // that can change it. `kind` says what states it: the outline's starting value, an animation, or a task.
  const check = (number: number, value: number, path: string, kind: "start" | "animation" | "task") => {
    // Messages quote the whole count: a target the program snapped to a slider step (9 became 8.975) is
    // reported as the 9 the model wrote, never as a number it did not write.
    const drawn = count(value);
    // First every recipe that draws the count: a count one of them cannot draw is never another's fault.
    for (const own of counts.get(number)!) {
      if (drawn >= own.min && drawn <= own.max) continue;
      const range = `the ${own.capability} visual can draw only ${own.min} to ${own.max}`;
      if (kind === "start" && own.section === 0) {
        // Before first playable, only a new outline can fix it: the outline chose both the visual and the
        // count, and is asked again without this recipe (decision 0013's outline-owned fault).
        throw new LessonPlanError("LESSON_PLAN_OUTLINE_VISUAL", `$lessonPlan.numbers[${number - 1}].initial`,
          `number ${number} is ${drawn}, but ${range}; choose another visual, or none`, own.capability);
      }
      // After first playable the outline cannot change. The outline check guarantees a lesson number the
      // visual can draw (checkOutlineVisuals), so the section that creates it can drive it with that one.
      if (kind === "start") {
        fail("LESSON_PLAN_NUMBER_NOT_DRAWABLE", own.path, `number ${number} is ${drawn}, but ${range}; drive this visual with a lesson number in that range`);
      }
      fail("LESSON_PLAN_NUMBER_NOT_DRAWABLE", path, `number ${number} would reach ${drawn}, but ${range}; use a value in that range`);
    }
    // Then the range the fits left: the fit that pushed the count out is the visual to change.
    const definition = plan.numbers![number - 1]!;
    if (drawn >= definition.min && drawn <= definition.max) return;
    const pushed = fits.get(number)?.find(({ before, after }) => drawn >= before[0] && drawn <= before[1] && (drawn < after[0] || drawn > after[1]));
    if (pushed) {
      fail("LESSON_PLAN_SHARED_NUMBER", pushed.path,
        `number ${number} is ${drawn}, a count the ${counts.get(number)![0]!.capability} visual shows, but the ${pushed.capability} visual sharing it allows only ${definition.min} to ${definition.max}; drive the ${pushed.capability} visual with a different lesson number, or with none`);
    }
    // No fit excluded it: the plan's own range for the number does (an animation past the slider's end).
    fail("LESSON_PLAN_NUMBER_NOT_DRAWABLE", path, `number ${number} would reach ${drawn}, outside its range ${definition.min} to ${definition.max}; use a value in that range`);
  };
  for (const number of counts.keys()) {
    const value = written.get(number);
    if (value !== undefined) check(number, value, `$lessonPlan.numbers[${number - 1}].initial`, "start");
  }
  // Side counts are whole numbers; a fitted number line's numbers sit on its ticks.
  const roundToProgramGrid = (number: number, value: number) => {
    if (integerSides.has(number)) return Math.round(value);
    const step = tickSteps.get(number);
    return step ? Number((Math.round(value / step) * step).toPrecision(12)) : value;
  };
  for (const [sectionIndex, section] of plan.sections.entries()) {
    for (const [momentIndex, moment] of section.moments.entries()) {
      for (const [actionIndex, action] of moment.actions.entries()) {
        if (action.action !== "animate" || !constrained.has(action.number)) continue;
        // A count is checked, never moved; other numbers are fitted to the range their visual draws.
        if (counts.has(action.number)) {
          check(action.number, action.end_value, `$lessonPlan.sections[${sectionIndex}].moments[${momentIndex}].actions[${actionIndex}].end_value`, "animation");
        }
        const definition = plan.numbers![action.number - 1]!;
        action.end_value = Math.min(definition.max, Math.max(definition.min, roundToProgramGrid(action.number, action.end_value)));
      }
    }
    // A practice target on a count is checked like an animation: moving it to the visual's edge could land
    // on the starting value, and the task would then ask for a count the lesson never named (a target of 12
    // on an array starting at 8 became "set it to 1"; Coach #78 review). Other numbers keep the earlier rule:
    // a target beyond the visual's range moves to its edge, with the task prompt rewritten to match (probe 3).
    for (const [activityIndex, activity] of (section.student_activities ?? []).entries()) {
      if (activity.kind !== "number_target") continue;
      const number = activity.number_controls[0]?.number;
      if (!number || !constrained.has(number)) continue;
      if (counts.has(number) && !activity.expression) {
        check(number, activity.value, `$lessonPlan.sections[${sectionIndex}].student_activities[${activityIndex}].value`, "task");
        // A count's target is a whole number, whichever section asked for it: a section that does not
        // create the visual still has its target snapped to the slider's step (6 became 5.995).
        activity.value = count(activity.value);
      }
      const definition = plan.numbers![number - 1]!;
      const original = activity.value;
      activity.value = Math.min(definition.max, Math.max(definition.min, activity.expression ? activity.value : roundToProgramGrid(number, activity.value)));
      activity.tolerance = Math.max(
        (definition.student_control?.step ?? (definition.max - definition.min) / 200) / 2,
        (definition.max - definition.min) / 1_000,
        1e-6,
      );
      if (activity.value !== original) {
        const value = Number(activity.value.toPrecision(12));
        const label = definition.label?.trim() || compileText(plan, "数值");
        const unit = definition.unit?.trim();
        activity.prompt = compileText(plan, "请把{{v0}}调到 {{v1}}{{v2}}。", { v0: label, v1: value, v2: unit ? ` ${unit}` : "" });
        activity.success_message = compileText(plan, "完成，{{v0}}已经调到 {{v1}}{{v2}}。", { v0: label, v1: value, v2: unit ? ` ${unit}` : "" });
      }
    }
  }
}

function compileVisual(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  if ((content.numbers?.length ?? 0) > LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[content.capability]) {
    fail(
      "LESSON_PLAN_COMPILER_CONTROL_LIMIT",
      `${path}.numbers`,
      `'${content.capability}' supports at most ${LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[content.capability]} numeric inputs`,
    );
  }
  const compiler = VISUAL_COMPILERS[content.capability];
  if (!compiler) fail("LESSON_PLAN_COMPILER_CAPABILITY", path, `no compiler is registered for '${String(content.capability)}'`);
  return compiler(base, content, role, placement, plan, path);
}

function compilePlainContent(
  kind: Exclude<LessonPlanBoardKind, "visual">,
  content: LessonPlanBoardContent,
  options: CompileLessonPlanOptions,
  path: string,
): Record<string, unknown> {
  if (kind === "text" || kind === "shape") return { text: (content as { text: string }).text };
  if (kind === "math") return { latex: (content as { latex: string }).latex };
  if (kind === "note") {
    const note = content as { title: string; items: string[] };
    return { title: note.title, items: [...note.items] };
  }
  if (kind === "table") {
    const table = content as { columns: string[]; rows: Array<Array<string | number>> };
    return { columns: [...table.columns], rows: table.rows.map((row) => [...row]) };
  }
  if (kind === "image") {
    const image = content as { resource: number; alt?: string };
    const resource = options.image_resources?.[image.resource - 1];
    if (!resource) fail("LESSON_PLAN_IMAGE_RESOURCE", `${path}.resource`, "image resource is unavailable");
    return { asset_id: resource.asset_id, ...(image.alt ? { alt: image.alt } : {}) };
  }
  fail("LESSON_PLAN_COMPILER", path, `unsupported plain board kind '${kind}'`);
}

/**
 * A practice task already met when the learner reaches it would have nothing to do. On a number line
 * (owner, option a, after run 5), the line goes back to where it starts before the learner tries, and
 * the target stays the one the lesson is about:
 * - met at the end of the lesson (the model animated the change to 48, then asked for 48): the number
 *   returns to 0 (or the end of its range farthest from the target) after the last moment's speech;
 * - met by the starting value itself (the change starts at 0.75 and the task asks for 0.75), which OLL
 *   rejects outright: the number also starts there, and moves to the value the lesson shows as soon
 *   as its line appears (unless that moment already animates it).
 * Other visuals' targets are moved to the end of the range when the model's reply is lowered, as before.
 * The plan is the compiler's own copy, so each compile of a growing lesson does this once.
 */
/** Moves a practice target its number already starts at to the far end of its range, on its slider. */
function moveMetTarget(
  plan: LessonPlan,
  activity: Extract<NonNullable<LessonPlan["sections"][number]["student_activities"]>[number], { kind: "number_target" }>,
  definition: NonNullable<LessonPlan["numbers"]>[number],
  path: string,
): void {
  const step = definition.student_control?.step;
  const onSlider = (value: number) => {
    let reachable = Math.min(definition.max, Math.max(definition.min, value));
    if (typeof step === "number" && Number.isFinite(step) && step > 0) {
      reachable = Math.min(definition.max, Math.max(definition.min, definition.min + Math.round((reachable - definition.min) / step) * step));
    }
    return Number(reachable.toPrecision(12));
  };
  const alternative = [definition.min, definition.max]
    .sort((a, b) => Math.abs(b - definition.initial) - Math.abs(a - definition.initial))
    .map(onSlider)
    .find((value) => Math.abs(value - definition.initial) > activity.tolerance * (1 + 1e-9));
  if (alternative === undefined) fail("LESSON_PLAN_ACTIVITY", path, "numeric task has no reachable target distinct from the initial value");
  activity.value = alternative;
  const label = definition.label?.trim() || compileText(plan, "数值");
  const unit = definition.unit?.trim();
  const formatted = Number(alternative.toPrecision(12));
  activity.prompt = compileText(plan, "请把{{v0}}调到 {{v1}}{{v2}}。", { v0: label, v1: formatted, v2: unit ? ` ${unit}` : "" });
  activity.hints = [compileText(plan, "拖动左下角的滑杆，观察数值和画面同步变化。")];
  activity.success_message = compileText(plan, "完成，{{v0}}已经调到 {{v1}}{{v2}}。", { v0: label, v1: formatted, v2: unit ? ` ${unit}` : "" });
}

function resolveMetNumberTargets(plan: LessonPlan): void {
  const lineNumbers = new Set<number>();
  // Where each number's line is first drawn, so the number can move there as the line appears.
  const lineCreations = new Map<number, { moment: LessonPlan["sections"][number]["moments"][number]; isStart: boolean }>();
  for (const section of plan.sections) for (const moment of section.moments) for (const action of moment.actions) {
    if (action.action === "create" && action.kind === "visual" && isNumberLineCapability((action.content as LessonPlanVisualContent).capability)) {
      for (const [position, number] of ((action.content as LessonPlanVisualContent).numbers ?? []).entries()) {
        lineNumbers.add(number);
        if (!lineCreations.has(number)) lineCreations.set(number, { moment, isStart: position === 0 });
      }
    }
  }
  const ownNumbers = new Set(plan.sections.flatMap((section) => section.moments).flatMap((moment) => moment.actions).flatMap((action) => (
    action.action === "create" && action.kind === "visual" && RECIPE_HOOKS[(action.content as LessonPlanVisualContent).capability]?.number_moves
      ? (action.content as LessonPlanVisualContent).numbers ?? [] : [])));
  const lastMoment = plan.sections.at(-1)?.moments.at(-1);
  // One return per number, however many of its tasks the lesson's end would meet.
  const resetNumbers = new Set<number>();
  // A number's value when the lesson ends: its starting value, then each animation in order.
  const valueAtEnd = (number: number) => {
    let value = plan.numbers![number - 1]!.initial;
    for (const section of plan.sections) for (const moment of section.moments) for (const action of moment.actions) {
      if (action.action === "animate" && action.number === number) value = action.end_value;
    }
    return value;
  };
  for (const [sectionIndex, section] of plan.sections.entries()) {
    for (const [activityIndex, activity] of (section.student_activities ?? []).entries()) {
      if (activity.kind !== "number_target" || activity.expression || activity.number_controls.length !== 1) continue;
      const number = activity.number_controls[0]!.number;
      const definition = plan.numbers?.[number - 1];
      if (!definition || !lastMoment) continue;
      // A card that moves its own numbers (the trading mat) starts its task from its own pile and checks
      // the value itself: nothing here moves the target or the number.
      if (ownNumbers.has(number)) continue;
      const met = (value: number) => Math.abs(activity.value - value) <= activity.tolerance * (1 + 1e-9);
      if (!lineNumbers.has(number)) {
        // Other visuals: the reply's lowering already moved a target its starting value met, but a
        // visual's own range can clamp both afterwards to the same limit (a unit-square array of 15,
        // target 20, both capped): move the target to the end of the range farthest from the start,
        // as lowering does, and name it in the task's words.
        if (met(definition.initial)) moveMetTarget(plan, activity, definition, `$lessonPlan.sections[${sectionIndex}].student_activities[${activityIndex}]`);
        continue;
      }
      const metAtStart = met(definition.initial);
      if (!metAtStart && !met(valueAtEnd(number))) continue;
      const path = `$lessonPlan.sections[${sectionIndex}].student_activities[${activityIndex}]`;
      const step = definition.student_control?.step;
      const onSlider = (value: number) => {
        let reachable = Math.min(definition.max, Math.max(definition.min, value));
        if (typeof step === "number" && Number.isFinite(step) && step > 0) {
          reachable = Math.min(definition.max, Math.max(definition.min, definition.min + Math.round((reachable - definition.min) / step) * step));
        }
        return Number(reachable.toPrecision(12));
      };
      const reset = [0, ...[definition.min, definition.max].sort((a, b) => Math.abs(b - activity.value) - Math.abs(a - activity.value))]
        .map(onSlider).find((value) => !met(value));
      if (reset === undefined) fail("LESSON_PLAN_ACTIVITY", path, "numeric task has no reachable target distinct from the initial value");
      if (metAtStart) {
        const shown = definition.initial;
        definition.initial = reset;
        // Appended, never inserted: references were recorded by each action's position.
        // The change moves while the teacher speaks, as the demonstration itself ("move 3 quarters");
        // the start moves before the speech, so the line never shows another problem while the
        // teacher says "we start at 5".
        const created = lineCreations.get(number);
        if (created && !created.moment.actions.some((action) => action.action === "animate" && action.number === number)) {
          created.moment.actions.push({
            action: "animate", number, end_value: shown, easing: "ease_in_out",
            duration_intent: created.isStart ? "brief" : "normal", timing: created.isStart ? "before_speech" : "during_speech",
          });
        }
      }
      if (met(valueAtEnd(number)) && !resetNumbers.has(number)) {
        resetNumbers.add(number);
        lastMoment.actions.push({ action: "animate", number, end_value: reset, easing: "ease_in_out", duration_intent: "brief", timing: "after_speech" });
      }
    }
  }
}

export function compileLessonPlan(value: unknown, options: CompileLessonPlanOptions = {}): CompiledLessonPlan {
  const resolved = resolveLessonPlan(value, options);
  const plan = resolved.plan;
  setLessonTextLanguage(plan, options.language);
  for (const hooks of PLUGIN_HOOKS) hooks.normalize_plan?.(plan);
  for (const hooks of PLUGIN_HOOKS) hooks.check_plan?.(plan);
  normalizeProgramOwnedNumberRanges(plan);
  resolveMetNumberTargets(plan);
  mergeEquivalentVisualInputs(plan);
  for (const [sectionIndex, section] of plan.sections.entries()) for (const moment of section.moments) for (const action of moment.actions) {
    if (action.action !== "create" || action.kind !== "visual") continue;
    const visual = action.content as LessonPlanVisualContent;
    RECIPE_HOOKS[visual.capability]?.before_compile?.(visual, plan, sectionIndex);
  }
  const resolvedReferences = new Map(resolved.references.map((item) => [item.path, item]));
  const wholeTargets = new Map<string, string>();
  const partTargets = new Map<string, Map<string, string>>();
  const primaryScenes = new Map<string, string>();
  const reusableVisuals = new Map<string, CompiledVisual>();
  // Sliders a visual creates itself (a solid's cut or net), by alias, in the order the visuals appear.
  const visualVariables = new Map<string, NonNullable<CompiledVisual["variables"]>[number]>();
  const viewAdjustments: CompiledLessonPlan["view_adjustments"] = [];
  const programAdjustments: CompiledLessonPlan["program_adjustments"] = [];
  // What visuals add themselves (OLL decision 0023): tasks before the model's, and the cards whose practice
  // the program writes, so the model's questions on them are dropped.
  // Visuals whose numbers change only by their own rules (the trading mat), by lesson number; and each
  // one's state as the lesson plays, so every move starts from what the card shows.
  const movers = new Map<number, { visual: CompiledVisual; capability: LessonPlanVisualContent["capability"]; position: number }>();
  const moverStates = new Map<CompiledVisual, { start: number[]; now: number[] }>();
  // Lesson numbers such a card reads but does not bind (the place-value chart): not declared in the lesson.
  const unboundNumbers = new Set<number>();
  // Every number such a card binds anywhere in the plan: none of them moves before its card is drawn.
  const cardNumbers = new Set(plan.sections.flatMap((section) => section.moments).flatMap((moment) => moment.actions).flatMap((action) => (
    action.action === "create" && action.kind === "visual" && RECIPE_HOOKS[(action.content as LessonPlanVisualContent).capability]?.number_moves
      ? (action.content as LessonPlanVisualContent).numbers ?? [] : [])));
  let renderedVisuals: CompiledVisualRegistry | undefined;
  const reuseCompiledVisual = (visual: CompiledVisual) => {
    // The first component cannot duplicate earlier content. Initialize the
    // subview registry only when a different component is actually requested.
    if (reusableVisuals.size === 0) return visual;
    if (!renderedVisuals) {
      renderedVisuals = new CompiledVisualRegistry();
      for (const earlier of reusableVisuals.values()) renderedVisuals.reuse(earlier);
    }
    return renderedVisuals.reuse(visual);
  };

  const resolvedReference = (path: string): ResolvedLessonPlanReference => {
    const item = resolvedReferences.get(path);
    if (!item) fail("LESSON_PLAN_COMPILER_REFERENCE", path, "validated reference was not recorded");
    return item;
  };
  const reference = (path: string): string => {
    const item = resolvedReference(path);
    if (!item.part) return wholeTargets.get(item.authoring_alias) ?? item.authoring_alias;
    if (item.part.kind === "capability") {
      const result = partTargets.get(item.authoring_alias)?.get(item.part.role);
      if (!result) fail("LESSON_PLAN_COMPILER_REFERENCE", path, `capability part '${item.part.role}' was not produced`);
      return result;
    }
    if (item.part.kind === "index") return `${item.authoring_alias}#part-${pad(item.part.index)}`;
    fail("LESSON_PLAN_COMPILER_REFERENCE", path, "unsupported reference part");
  };

  const steps: AuthoringLesson["steps"] = [];
  plan.sections.forEach((section, sectionOffset) => {
    const sectionIndex = sectionOffset + 1;
    const sectionPath = `$lessonPlan.sections[${sectionOffset}]`;
    const beats: AuthoringLesson["steps"][number]["beats"] = [];
    section.moments.forEach((moment, momentOffset) => {
      const momentIndex = momentOffset + 1;
      const momentPath = `${sectionPath}.moments[${momentOffset}]`;
      const actions: AuthoringAction[] = [];
      // A replayed number of such a visual replays the whole card: its other numbers and its own variables.
      const replayed = new Set((moment.restart_numbers ?? []).map(variableAlias));
      for (const number of moment.restart_numbers ?? []) {
        const mover = movers.get(number);
        const state = mover && moverStates.get(mover.visual);
        if (!mover && cardNumbers.has(number)) {
          // The card that moves this number is not drawn yet: there is nothing to restart (a card that reads its
          // numbers unbound has no variable for it, and OLL would refuse the lesson). Left out and recorded, as an
          // animation before its card is.
          replayed.delete(variableAlias(number));
          viewAdjustments.push({ section: sectionIndex, reason: "restart_before_card", detail: `${momentPath}.restart_numbers: number ${number} is replayed before the card that moves it is drawn; left out` });
          continue;
        }
        if (!mover || !state) continue;
        state.now = [...state.start];
        // A card that binds none of its numbers replays its own variables only (they are not declared).
        for (const other of mover.visual.mover!.numbers) {
          if (mover.visual.mover!.unbound) replayed.delete(variableAlias(other));
          else replayed.add(variableAlias(other));
        }
        for (const variable of mover.visual.variables ?? []) replayed.add(variable.as);
      }
      // This moment's animations of such a visual are one teaching step: applied lowest place first, and
      // played where the first of them stands. Worked out at that first animation, so a card drawn earlier
      // in the same moment can move in it.
      const moved = new Set<CompiledVisual>();
      // A card written in this moment, and the phase of its write: its moves play no earlier than it (OLL plays
      // before, during and after speech in turn), so a demonstration never moves a card before it is drawn (#184).
      const writtenHere = new Map<CompiledVisual, unknown>();
      // An animation left out because its card is drawn in a later section (below).
      let leftOut = false;
      const playMoves = (visual: CompiledVisual, capability: LessonPlanVisualContent["capability"]): AuthoringAction[] => {
        const state = moverStates.get(visual)!;
        const animations = moment.actions.flatMap((item, offset) => (item.action === "animate" && movers.get(item.number)?.visual === visual
          ? [{ offset, position: movers.get(item.number)!.position, to: item.end_value, timing: item.timing }] : []));
        const result = RECIPE_HOOKS[capability]!.number_moves!.moves(state.now, animations);
        if ("refused" in result) {
          const at = animations.find((animation) => animation.position === result.refused.position)!;
          // Named by the card's recipe, so a section whose repairs are spent on it can lose that card, not the
          // lesson (BT-31, check 4: two piles to compare, moved as one; Coach #170).
          fail("LESSON_PLAN_NUMBER_NOT_DRAWABLE", `${momentPath}.actions[${at.offset}].end_value`, result.refused.reason, capability);
        }
        // An animation the card leaves out (a number it never moves) is recorded, each at its own offset; the rest
        // play, at the timing of the first that plays (review of #188).
        const left = new Set<number>();
        for (const ignored of result.ignored ?? []) {
          const at = ignored.index !== undefined ? animations[ignored.index]! : animations.find((animation) => animation.position === ignored.position)!;
          left.add(at.offset);
          viewAdjustments.push({ section: sectionIndex, reason: "animation_left_out", detail: `${momentPath}.actions[${at.offset}]: ${ignored.reason}; left out` });
        }
        const playing = animations.filter((animation) => !left.has(animation.offset));
        const timed = playing[0] ?? animations[0]!;
        state.now = result.steps.at(-1)?.to ?? state.now;
        const PHASES = ["before_speech", "during_speech", "after_speech"];
        const phase = (timing: unknown) => PHASES.indexOf(String(timing ?? "during_speech"));
        const written = writtenHere.has(visual) ? writtenHere.get(visual) : undefined;
        const when = actionWhen(writtenHere.has(visual) && phase(written) > phase(timed.timing) ? written ?? "during_speech" : timed.timing);
        // What the moment can still hold: OLL's 24 actions in a beat, less what it has and what is to come.
        const first = animations[0]!.offset;
        const room = 24 - actions.length - moment.actions.slice(first + 1).filter((item) => !(item.action === "animate" && movers.get(item.number)?.visual === visual)).length;
        const played = visual.mover!.play(result.steps, room).map((action) => ({ ...action, ...when }));
        // An animation to the value already shown changes nothing: the moment still looks at the card.
        return played.length ? played : [{ do: "focus", targets: [visual.whole], intent: compileText(plan, "继续观察已有的同一画面"), ...when } as AuthoringAction];
      };
      let boardItemIndex = 0;
      let connectionIndex = 0;
      let groupIndex = 0;
      moment.actions.forEach((item, actionOffset) => {
        const actionPath = `${momentPath}.actions[${actionOffset}]`;
        if (item.action === "create") {
          boardItemIndex += 1;
          const alias = `section-${pad(sectionIndex)}-moment-${pad(momentIndex)}-item-${pad(boardItemIndex)}`;
          const placement = place(item.placement, `${actionPath}.placement`, reference);
          if (item.kind === "visual") {
            const visualContent = item.content as LessonPlanVisualContent;
            const identity = normalizedVisualIdentity(visualContent);
            const existing = reusableVisuals.get(identity);
            if (item.distinct_visual && existing) {
              fail(
                "LESSON_PLAN_COURSE_VISUAL",
                `${actionPath}.content.parameters`,
                "an explicit comparison must differ in teaching content, not only in title, viewport, camera, color, sampling, or layout",
              );
            }
            const visual = existing
              ?? (() => {
                const compiledVisual = compileVisual(alias, visualContent, item.role, placement, plan, `${actionPath}.content.parameters`);
                for (const adjustment of compiledVisual.adjustments ?? []) viewAdjustments.push({ section: sectionIndex, ...adjustment });
                return reuseCompiledVisual(compiledVisual);
              })();
            if (existing) {
              actions.push({
                do: "focus",
                targets: [existing.whole],
                intent: compileText(plan, "继续观察已有的同一画面"),
                ...actionWhen(item.timing),
              });
            } else {
              reusableVisuals.set(identity, visual);
              for (const variable of visual.variables ?? []) if (!visualVariables.has(variable.as)) visualVariables.set(variable.as, variable);
              actions.push(...visual.actions.map((action) => ({ ...action, ...actionWhen(item.timing) })));
              writtenHere.set(visual, item.timing);
              if (visual.mover && RECIPE_HOOKS[visualContent.capability]?.number_moves) {
                const start = visual.mover.numbers.map((number) => plan.numbers![number - 1]!.initial);
                const state = RECIPE_HOOKS[visualContent.capability]!.number_moves!.state(start, visualContent);
                moverStates.set(visual, { start: state, now: [...state] });
                visual.mover.numbers.forEach((number, position) => movers.set(number, { visual, capability: visualContent.capability, position }));
                if (visual.mover.unbound) for (const number of visual.mover.numbers) unboundNumbers.add(number);
              }
            }
            wholeTargets.set(alias, visual.whole);
            partTargets.set(alias, visual.parts);
            if (visual.primaryScene) primaryScenes.set(alias, visual.primaryScene);
          } else {
            actions.push({
              do: "write",
              as: alias,
              kind: item.kind,
              role: item.role,
              content: compilePlainContent(item.kind, item.content, options, `${actionPath}.content`),
              place: placement,
              ...actionWhen(item.timing),
            });
            wholeTargets.set(alias, alias);
          }
        } else if (item.action === "revise") {
          const target = reference(`${actionPath}.reference`);
          if (item.kind === "visual" || (item.content as LessonPlanVisualContent).capability) {
            // A recipe that declares `revised_by_program` draws its card's next step as a revision: the content
            // compiles as a create would, and the revision carries the whole card (OLL 0021 amendment 2).
            const visualContent = item.content as LessonPlanVisualContent;
            if (!recipeDeclares(visualContent.capability, "revised_by_program")) {
              fail("LESSON_PLAN_COMPILER_UNSUPPORTED_REVISION", `${actionPath}.content`, "visual capability revision is not in the first compiler batch");
            }
            const compiled = compileVisual(target, visualContent, "main_visual", { relation: "new_region" } as ReturnType<typeof place>, plan, `${actionPath}.content.parameters`);
            const write = compiled.actions.length === 1 && compiled.actions[0]!.do === "write" ? compiled.actions[0] as { content: Record<string, unknown> } : undefined;
            if (!write || write.content.bindings !== undefined || compiled.variables?.length) {
              fail("LESSON_PLAN_COMPILER_UNSUPPORTED_REVISION", `${actionPath}.content`, "a revised card is one fixed card, with no slider");
            }
            actions.push({ do: "revise", target, content: write!.content, reason: item.reason, ...actionWhen(item.timing) } as AuthoringAction);
            return;
          }
          const content = item.content as LessonPlanBoardContent;
          actions.push({
            do: "revise", target,
            content: compilePlainContent(item.kind, content, options, `${actionPath}.content`),
            reason: item.reason, ...actionWhen(item.timing),
          });
        } else if (item.action === "emphasize") {
          actions.push({ do: "emphasize", target: reference(`${actionPath}.reference`), emphasis: item.emphasis, ...actionWhen(item.timing) });
        } else if (item.action === "connect") {
          connectionIndex += 1;
          const alias = `section-${pad(sectionIndex)}-moment-${pad(momentIndex)}-connection-${pad(connectionIndex)}`;
          actions.push({
            do: "connect", as: alias,
            from: reference(`${actionPath}.from_ref`),
            to: reference(`${actionPath}.to_ref`),
            relation: item.relation,
            ...(item.label ? { label: item.label } : {}),
            ...actionWhen(item.timing),
          });
          wholeTargets.set(alias, alias);
        } else if (item.action === "group") {
          groupIndex += 1;
          const alias = `section-${pad(sectionIndex)}-moment-${pad(momentIndex)}-group-${pad(groupIndex)}`;
          actions.push({
            do: "group", as: alias, role: item.role, label: item.label,
            members: item.members.map((_member, index) => reference(`${actionPath}.members[${index}]`)),
            ...actionWhen(item.timing),
          });
          wholeTargets.set(alias, alias);
        } else if (item.action === "focus") {
          actions.push({
            do: "focus",
            targets: item.references.map((_item, index) => reference(`${actionPath}.references[${index}]`)),
            intent: item.intent,
            ...actionWhen(item.timing),
          });
        } else if (item.action === "point_at") {
          actions.push({ do: "point", target: reference(`${actionPath}.reference`), ...actionWhen(item.timing) });
        } else if (item.action === "teacher_expression") {
          actions.push({ do: "expression", expression: item.expression, ...actionWhen(item.timing) });
        } else if (movers.has(item.number)) {
          const { visual, capability } = movers.get(item.number)!;
          if (!moved.has(visual)) {
            moved.add(visual);
            actions.push(...playMoves(visual, capability));
          }
        } else if (cardNumbers.has(item.number) && plan.sections.slice(sectionOffset + 1).some((later) => later.moments.some((each) => each.actions.some((action) => action.action === "create" && action.kind === "visual" && ((action.content as LessonPlanVisualContent).numbers ?? []).includes(item.number) && RECIPE_HOOKS[(action.content as LessonPlanVisualContent).capability]?.number_moves)))) {
          // The card that moves this number is drawn in a later section, which cannot repair this one: the
          // animation is left out and recorded, as it is while only this section exists (no visual shows the
          // number yet). The card then starts from its lesson numbers (review of #160, round 2).
          viewAdjustments.push({ section: sectionIndex, reason: "animation_before_card", detail: `${actionPath}: number ${item.number} is animated before the card that moves it is drawn; left out` });
          leftOut = true;
        } else if (cardNumbers.has(item.number)) {
          // The card that moves this number is drawn later in this section: a plain animation would change its
          // pile without its rules, and the mat would start at a wrong amount (review of #160: 96 drawn for 116).
          fail("LESSON_PLAN_NUMBER_NOT_DRAWABLE", `${actionPath}.end_value`, "this number belongs to a card that is drawn later: animate it in the moment that draws the card, after its create, or in a later moment");
        } else {
          actions.push({
            do: "animate", variable: variableAlias(item.number), value: item.end_value,
            ...(item.easing ? { easing: item.easing } : {}),
            ...(item.duration_intent ? { duration_intent: item.duration_intent } : {}),
            ...actionWhen(item.timing),
          });
        }
      });
      if (actions.length > 24 && moved.size) {
        fail("LESSON_PLAN_NUMBER_NOT_DRAWABLE", `${momentPath}.actions`, "this moment holds more than the board can play at once with its trades: make the second place's trade, or the pointing, in the next moment");
      }
      // A moment left with nothing but its sentence keeps it, with the neutral expression the section got
      // while it stood alone (a dead animation is replaced the same way when a section is first accepted),
      // so a section already playing does not change (review of #160, round 3).
      if (actions.length === 0 && leftOut) actions.push({ do: "expression", expression: "neutral", when: "after_speech" } as AuthoringAction);
      if (actions.length === 0) {
        fail("LESSON_PLAN_COMPILER_EMPTY_BEAT", `${momentPath}.actions`, "OLL requires at least one action per moment");
      }
      // A replayed number of a card written in this moment: the card opens fresh anyway, so the replay has nothing
      // to restart there (a number no variable carries would refuse the lesson at OLL).
      for (const number of moment.restart_numbers ?? []) {
        const mover = movers.get(number);
        if (mover && writtenHere.has(mover.visual)) {
          for (const other of mover.visual.mover!.numbers) replayed.delete(variableAlias(other));
          for (const variable of mover.visual.variables ?? []) replayed.delete(variable.as);
        }
      }
      includeWrittenCardsInFocus(actions);
      beats.push({
        key: `moment-${pad(momentIndex)}`,
        ...(replayed.size ? { start: { kind: "replay" as const, variables: [...replayed] } } : {}),
        // The model sometimes writes a formula placeholder (n1) in spoken or
        // written text; learners hear and read the number's own symbol.
        ...(moment.narration ? { say: namedNumbers(moment.narration, plan) } : {}),
        ...(moment.delivery ? { delivery: moment.delivery } : {}),
        actions,
      });
    });
    steps.push({ key: `section-${pad(sectionIndex)}`, purpose: section.purpose, beats });
  });

  const tasks: NonNullable<AuthoringLesson["lesson"]["tasks"]> = [];
  const reflections: NonNullable<AuthoringLesson["lesson"]["reflections"]> = [];
  const seenTaskSemantics = new Set<string>();
  /**
   * `dropped` records a success message the arithmetic check left out; it is kept only if the task is (a
   * duplicate is thrown away, as on main). A duplicate's message never moves to the kept task: it was
   * written for another prompt.
   */
  const addTask = (task: NonNullable<AuthoringLesson["lesson"]["tasks"]>[number], dropped?: CompiledLessonPlan["program_adjustments"][number]): void => {
    const semanticKey = JSON.stringify({
      allowed_operations: task.allowed_operations,
      completion: task.completion,
    });
    if (seenTaskSemantics.has(semanticKey)) return;
    if (dropped) programAdjustments.push(dropped);
    seenTaskSemantics.add(semanticKey);
    // A task that brings its own pile (the trading mat's slider) keeps it: the mat restarts whole, trays too.
    if (options.construction_rules === "explicit-v1" && task.completion.kind === "expression_target" && !task.start) {
      task.start = { kind: "practice", variables: task.allowed_operations.flatMap(operation =>
        operation.kind === "variable_change" ? [operation.variable] : []) };
    }
    tasks.push(task);
  };
  plan.sections.forEach((section, sectionOffset) => {
    const sectionPath = `$lessonPlan.sections[${sectionOffset}]`;
    section.student_activities?.forEach((activity, activityOffset) => {
      const activityPath = `${sectionPath}.student_activities[${activityOffset}]`;
      if (activity.kind === "reflection") {
        const anchor = resolvedReference(`${activityPath}.reference`);
        const anchorTarget = wholeTargets.get(anchor.authoring_alias) ?? anchor.authoring_alias;
        reflections.push({
          as: `section-${pad(sectionOffset + 1)}-reflection-${pad(activityOffset + 1)}`,
          prompt: namedNumbers(activity.prompt, plan),
          answer: namedNumbers(activity.answer, plan),
          anchor: wholeTargets.get(anchor.authoring_alias) ?? anchor.authoring_alias,
          availability: { kind: "after_lesson" },
        });
        return;
      }
      // A success message whose arithmetic is false is dropped, never repaired (decision 0020; plan 3.6).
      const taskAlias = `section-${pad(sectionOffset + 1)}-task-${pad(activityOffset + 1)}`;
      let praise = activity.success_message ? namedNumbers(activity.success_message, plan) : undefined;
      // The check can only remove a message, never cost the lesson: if it fails, the message stays.
      // A task that asks for rounding to decimal places lets its message show results rounded to those places.
      // Whole-number rounding is left out: a bare "round" in a prompt ("Round 2: …") with a whole answer reads
      // as 0 places, and would let 7 ÷ 2 = 4 through.
      const asked = activity.kind === "numeric_answer" ? roundingPlaces(activity.prompt, String(activity.answer)) : undefined;
      const places = asked !== undefined && asked > 0 ? asked : undefined;
      let droppedPraise: CompiledLessonPlan["program_adjustments"][number] | undefined;
      let praiseClaims: ReturnType<typeof praiseArithmetic> | undefined;
      if (praise) {
        try { praiseClaims = praiseArithmetic(praise, { places }); } catch (error) {
          droppedPraise = { section: sectionOffset + 1, kind: "success_message_unchecked", reason: "praise_check_failed", task: taskAlias, detail: `${taskAlias} (${activityPath}.success_message): ${String((error as Error)?.message ?? error).slice(0, 200)}` };
        }
      }
      if (praiseClaims?.verdict === "false") {
        const wrong = praiseClaims.claims.filter((claim) => !claim.holds).map((claim) => claim.text).join("; ");
        droppedPraise = { section: sectionOffset + 1, kind: "success_message_removed", reason: "praise_false_arithmetic", task: taskAlias, detail: `${taskAlias} (${activityPath}.success_message): ${wrong}` };
        praise = undefined;
      }
      const common = {
        as: taskAlias,
        prompt: namedNumbers(activity.prompt, plan),
        availability: { kind: "after_lesson" as const },
        hints: activity.hints.map(hint => namedNumbers(hint, plan)),
        ...(activity.hint_after_attempts ? { hint_after_attempts: activity.hint_after_attempts } : {}),
        ...(praise ? { success_message: praise } : {}),
      };
      if (activity.kind === "number_target") {
        const firstNumber = activity.number_controls[0]?.number;
        if (!firstNumber) fail("LESSON_PLAN_ACTIVITY", `${activityPath}.number_controls`, "number task requires controls");
        const mover = movers.get(firstNumber);
        if (mover) {
          // The card's own task: "bring this number to a value" is done on the card, by its rules.
          // The mat's state when the lesson ends: every section's moves have been played by now.
          const end = moverStates.get(mover.visual)?.now ?? [];
          const own = mover.visual.mover!.task(mover.position, activity.value, end, [activity.prompt, ...activity.hints]);
          if ("refuse" in own) fail("LESSON_PLAN_ACTIVITY", `${activityPath}.value`, own.refuse);
          if ("drop" in own) {
            programAdjustments.push({ section: sectionOffset + 1, kind: "activity_removed", reason: own.reason ?? "nothing_to_do_on_card", task: taskAlias, detail: `${taskAlias} (${activityPath}): ${own.drop}` });
            return;
          }
          addTask({ ...common, ...own.task } as unknown as NonNullable<AuthoringLesson["lesson"]["tasks"]>[number], droppedPraise);
          // What the card adds after its task (the place-value chart's row of parts): its own prompt, and the
          // hints the model wrote for the task, which are about the same number's places.
          own.then?.forEach((extra, index) => addTask({
            as: `${taskAlias}-${index + 2}`, availability: { kind: "after_lesson" as const }, hints: [...common.hints],
            ...(common.hint_after_attempts ? { hint_after_attempts: common.hint_after_attempts } : {}), ...extra,
          } as unknown as NonNullable<AuthoringLesson["lesson"]["tasks"]>[number]));
          return;
        }
        addTask({
          ...common,
          allowed_operations: activity.number_controls.map((control) => ({
            kind: "variable_change" as const,
            variable: variableAlias(control.number),
            controls: [...control.controls],
          })),
          completion: {
            kind: "expression_target",
            expression: activity.expression ? mathExpressionToOll(activity.expression) : variableAlias(firstNumber),
            value: activity.value,
            tolerance: activity.tolerance,
          },
        }, droppedPraise);
      } else if (activity.kind === "numeric_answer") {
        const anchor = resolvedReference(`${activityPath}.reference`);
        // A rounded answer accepts anything that rounds to it, so a learner who
        // types the unrounded value or keeps more places is not marked wrong.
        const tolerance = Math.max(
          numericAnswerTolerance(activity.answer, compileMathExpression(activity.check, [])({})) ?? 0,
          roundingTolerance(activity.prompt, activity.answer) ?? 0,
        );
        addTask({
          ...common,
          anchor: wholeTargets.get(anchor.authoring_alias) ?? anchor.authoring_alias,
          allowed_operations: [{ kind: "answer_entry" }],
          completion: {
            kind: "numeric_answer",
            answer: activity.answer,
            ...(tolerance ? { tolerance } : {}),
            ...(activity.unit ? { unit: activity.unit } : {}),
            ...(activity.simplest_fraction ? { form: "simplest_fraction" as const } : {}),
          },
        }, droppedPraise);
} else {
        const resolvedTarget = resolvedReference(`${activityPath}.reference`);
        const node = primaryScenes.get(resolvedTarget.authoring_alias)
          ?? wholeTargets.get(resolvedTarget.authoring_alias)
          ?? resolvedTarget.authoring_alias;
        addTask({
          ...common,
          allowed_operations: [{ kind: "scene3d_view", node, controls: [...activity.controls] }],
          completion: {
            kind: "scene3d_view_target", node, match: activity.match,
            yaw: activity.yaw, pitch: activity.pitch, zoom: activity.zoom,
            angular_tolerance: activity.angular_tolerance, zoom_tolerance: activity.zoom_tolerance,
          },
        }, droppedPraise);
      }
    });
  });

  const hostReferences = options.host_references ?? [];
  if (hostReferences.length > 0 && !options.board_context) {
    fail("LESSON_PLAN_BOARD_CONTEXT", "$options.board_context", "host references require board context");
  }
  const closeFocus = plan.close.focus.map((_item, index) => reference(`$lessonPlan.close.focus[${index}]`));
  // A lesson number is declared only once the lesson uses it: a picture binds it, a move or a replay names it, a task
  // works it, or the learner has a control on it. A later part may add a variable, never drop or change one (the web
  // runtime's lessonOpenCanExtend): Learn rebuilds its runtime when lesson.open changes, and the class started over
  // when a card first drawn in section 2 read, unbound, numbers section 1's part had declared for nothing (2026-11-27).
  const used = new Set([...JSON.stringify({ steps: steps.map((step) => step.beats.map(({ actions, start }) => ({ actions, start }))), tasks })
    .matchAll(/\bnumber_(\d{2,})\b/gu)].map((match) => Number(match[1])));
  const declared = (index: number) => !unboundNumbers.has(index)
    && (used.has(index) || plan.numbers?.[index - 1]?.student_control !== undefined);
  const lesson: AuthoringLesson = {
    dsl: "octos.lesson",
    version: "0.1",
    profile: "authoring",
    ...(options.board_context ? {
      board_context: {
        board_id: options.board_context.board_id,
        revision: options.board_context.revision,
        references: hostReferences.map((host: LessonPlanHostReference, index) => ({
          as: `host-${pad(index + 1)}`,
          type: host.type,
          target_id: host.target_id,
          ...(host.label ? { label: host.label } : {}),
          fragments: (host.parts ?? []).map((targetId, partOffset) => ({
            as: `part-${pad(partOffset + 1)}`,
            target_id: targetId,
          })),
        })),
      },
    } : {}),
    lesson: {
      mode: "explain",
      language: options.language ?? "zh-CN",
      title: plan.title,
      goals: [...plan.goals],
      ...((plan.teaching_strategies?.length ?? 0) > 0 || (options.adaptation_context_refs?.length ?? 0) > 0 ? {
        adaptation: {
          ...(plan.teaching_strategies?.length ? { strategies: [...plan.teaching_strategies] } : {}),
          ...(options.adaptation_context_refs?.length ? { context_refs: [...options.adaptation_context_refs] } : {}),
        },
      } : {}),
      ...((plan.numbers ?? []).some((_number, index) => declared(index + 1)) || visualVariables.size ? {
        variables: [...(plan.numbers ?? []).flatMap((number, index) => (declared(index + 1) ? [number] : []).map((number) => ({
          as: variableAlias(index + 1), initial: number.initial, min: number.min, max: number.max,
          ...(number.label ? { label: number.label } : {}),
          ...(number.unit ? { unit: number.unit } : {}),
          ...(number.student_control ? {
            control: {
              kind: "slider" as const,
              ...(number.student_control.step ? { step: number.student_control.step } : {}),
            },
          } : {}),
        }))), ...[...visualVariables.values()].map((variable) => ({ ...variable, ...(variable.control ? { control: { ...variable.control } } : {}) }))],
      } : {}),
      ...(tasks.length ? { tasks } : {}),
      ...(reflections.length ? { reflections } : {}),
    },
    steps,
    close: { summary: plan.close.summary, focus: closeFocus },
  };
  return { lesson: applyLessonOpeningPolicy(lesson, options.opening_policy ?? (options.construction_rules === "explicit-v1" ? { kind: "title" } : { kind: "preserve" })), resolved, plugins: lessonPlanPlugins(plan), view_adjustments: viewAdjustments, program_adjustments: programAdjustments };
}

function expressionReferencesVariable(expression: unknown, variable: string): boolean {
  if (typeof expression !== "string") return false;
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`, "u").test(expression);
}

/**
 * Verify the compiler's output rather than trusting a capability declaration.
 * Every exposed, animated, or task-controlled number must occur in a real
 * visual expression: a geometry/3D binding or a plot curve expression.
 */
function validateCompiledVisualEffects(lesson: AuthoringLesson): void {
  const required = new Map<string, string>();
  (lesson.lesson.variables ?? []).forEach((variable, index) => {
    if (variable.control) required.set(variable.as, `$lesson.lesson.variables[${index}]`);
  });
  lesson.steps.forEach((step, stepIndex) => step.beats.forEach((beat, beatIndex) => {
    beat.actions.forEach((action, actionIndex) => {
      if (action.do === "animate") {
        required.set(action.variable, `$lesson.steps[${stepIndex}].beats[${beatIndex}].actions[${actionIndex}].variable`);
      }
    });
  }));
  (lesson.lesson.tasks ?? []).forEach((task, taskIndex) => {
    task.allowed_operations.forEach((operation, operationIndex) => {
      if (operation.kind === "variable_change") {
        required.set(operation.variable, `$lesson.lesson.tasks[${taskIndex}].allowed_operations[${operationIndex}].variable`);
      }
    });
  });
  if (required.size === 0) return;

  const visualExpressions: unknown[] = [];
  lesson.steps.forEach((step) => step.beats.forEach((beat) => beat.actions.forEach((action) => {
    if (action.do !== "write" || !NUMBER_DRIVEN_KINDS.has(action.kind)) return;
    const content = action.content as Record<string, unknown>;
    const bindings = Array.isArray(content.bindings) ? content.bindings : [];
    bindings.forEach((binding) => {
      if (binding && typeof binding === "object" && !Array.isArray(binding)) {
        visualExpressions.push((binding as Record<string, unknown>).expression);
      }
    });
    // An OLL plot also evaluates each curve's formula (an OLL field, whichever plugin built the plot).
    if (action.kind === "plot") {
      const curves = Array.isArray(content.curves) ? content.curves : [];
      curves.forEach((curve) => {
        if (curve && typeof curve === "object" && !Array.isArray(curve)) {
          visualExpressions.push((curve as Record<string, unknown>).expression);
        }
      });
    }
  })));

  for (const [variable, path] of required) {
    const matchingExpressions = visualExpressions.filter((expression) => (
      expressionReferencesVariable(expression, variable)
    ));
    if (matchingExpressions.length === 0) {
      fail(
        "LESSON_PLAN_COMPILED_NO_EFFECT",
        path,
        `numeric control '${variable}' does not affect any compiled visual`,
      );
    }

    const definitions = lesson.lesson.variables ?? [];
    const definition = definitions.find((candidate) => candidate.as === variable);
    if (!definition) continue;
    const aliases = [...new Set([...definitions.map((candidate) => candidate.as), "x", "y", "z"])];
    const baseValues = Object.fromEntries(definitions.map((candidate) => [candidate.as, candidate.initial]));
    const samples = [definition.min, (definition.min + definition.max) / 2, definition.max];
    const coordinates = [
      { x: -1, y: -1, z: -1 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
      { x: 2, y: -0.5, z: 0.5 },
    ];
    const changes = matchingExpressions.some((expression) => {
      if (typeof expression !== "string") return false;
      let evaluateExpression: ReturnType<typeof compileMathExpression>;
      try {
        evaluateExpression = compileMathExpression(expression, aliases);
      } catch {
        return false;
      }
      return coordinates.some((coordinate) => {
        const results = samples.map((sample) => {
          try {
            return evaluateExpression({ ...baseValues, ...coordinate, [variable]: sample });
          } catch {
            return Number.NaN;
          }
        }).filter(Number.isFinite);
        if (results.length < 2) return false;
        const spread = Math.max(...results) - Math.min(...results);
        const scale = Math.max(1, ...results.map((result) => Math.abs(result)));
        return spread > scale * 1e-9;
      });
    });
    if (!changes) {
      fail(
        "LESSON_PLAN_COMPILED_NO_EFFECT",
        path,
        `numeric control '${variable}' is mentioned but does not change any compiled visual across its range`,
      );
    }
  }
}

export function compileAndValidateLessonPlan(value: unknown, options: CompileLessonPlanOptions = {}): CompiledLessonPlan {
  const compiled = compileLessonPlan(value, options);
  validateCompiledVisualEffects(compiled.lesson);
  const schemaResult = validateAuthoringSchema(compiled.lesson);
  if (!schemaResult.valid) {
    const first = schemaResult.errors[0];
    // Too many lesson variables: a picture whose recipe declares `binds_many_variables` (the place-value chart, two
    // a column) is the one that can go, and the lesson is kept without it (review of #174: a Chinese pull-apart
    // beside two other numbers was lost whole).
    // The picture named is one the last section drew, the section being written: a lesson that a later section's
    // pictures push over the limit loses one of them, never a card an earlier, published section drew (that one
    // cannot be withdrawn, and the lesson would end there). Read from the section's own creates, by recipe: an OLL kind
    // names no recipe (number_line, geometry, plot and scene3d are each drawn by several; review of #193, B1). Its
    // heavy picture first; else its last picture on lesson numbers; else its last picture; else, as before, a heavy
    // picture anywhere.
    const overVariables = first?.instancePath === "/lesson/variables" && first?.keyword === "maxItems";
    const createsIn = (sections: LessonPlan["sections"]) => sections.flatMap((section) => section.moments.flatMap((moment) => moment.actions))
      .flatMap((action) => (action.action === "create" && action.kind === "visual" ? [action.content as LessonPlanVisualContent] : []));
    const isHeavy = (content: LessonPlanVisualContent) => recipeDeclares(content.capability, "binds_many_variables");
    const sections = compiled.resolved.plan.sections;
    const lastDrawn = createsIn(sections.slice(-1));
    const blamed = !overVariables ? undefined
      : (lastDrawn.filter(isHeavy).at(-1) ?? lastDrawn.filter((content) => (content.numbers?.length ?? 0) > 0).at(-1) ?? lastDrawn.at(-1)
        ?? createsIn(sections).find(isHeavy))?.capability;
    fail("LESSON_PLAN_OLL_SCHEMA", first?.instancePath ?? "$lesson", first?.message ?? "compiled OLL failed schema validation", blamed);
  }
  const resourceContext: ResourceContext = {
    assets: (options.image_resources ?? []).map((resource) => ({ asset_id: resource.asset_id })),
  };
  try {
    validateAuthoringLesson(compiled.lesson, resourceContext);
    const events = normalizeAuthoringLesson(compiled.lesson, {
      lessonId: options.validation_host?.lesson_id ?? "lesson-plan-validation",
      boardId: options.validation_host?.board_id ?? options.board_context?.board_id ?? "lesson-plan-board",
      baseRevision: options.validation_host?.base_revision ?? options.board_context?.revision ?? 0,
      resourceContext,
    });
    if (!compiled.lesson.board_context?.references.length) reduceCanonicalEvents(events);
  } catch (error) {
    fail("LESSON_PLAN_OLL_SEMANTIC", "$lesson", error instanceof Error ? error.message : "compiled OLL failed semantic validation");
  }
  return compiled;
}
