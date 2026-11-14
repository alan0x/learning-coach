import { compileText, setLessonTextLanguage } from "./lesson-text.js";
import { CompiledVisualRegistry, type CompiledVisual } from "./compiled-visual-reuse.js";
import { applyLessonOpeningPolicy, type LessonOpeningPolicy, compileMathExpression, normalizeAuthoringLesson, reduceCanonicalEvents, validateAuthoringLesson, validateAuthoringSchema, type AuthoringAction, type AuthoringLesson, type ResourceContext } from "octos-lesson-language";
import { LESSON_PLAN_CAPABILITY_REGISTRY, LessonPlanError, countRange, isNumberLineCapability, LESSON_PLAN_CAPABILITY_NUMBER_LIMITS, numericAnswerTolerance, roundingTolerance, resolveLessonPlan, type LessonPlan, type LessonPlanBoardContent, type LessonPlanBoardKind, type LessonPlanHostReference, type LessonPlanVisualContent, type ResolveLessonPlanOptions, type ResolvedLessonPlan, type ResolvedLessonPlanReference } from "./lesson-plan.js";
import { fail, pad, variableAlias, parameters, optionalNumber, assertRange, safeFunctionExpression, mathExpressionToOll, place, includeWrittenCardsInFocus, namedNumbers, actionWhen } from "./recipe-kit.js";
import { PLUGIN_COMPILERS, VISUAL_COMPILERS } from "./plugins/compilers.js";
import { INSTALLED_PLUGINS, RECIPE_PLUGIN } from "./plugins/index.js";
import { PLUGIN_HOOKS, RECIPE_HOOKS } from "./plugins/hooks.js";
export { PLUGIN_COMPILERS };

export { LESSON_PLAN_SCENE_INITIAL_CAMERAS, includeWrittenCardsInFocus, mathExpressionToOll } from "./recipe-kit.js";

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
}

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
  const publishedPlotNumbers = new Set<number>();
  for (const [sectionIndex, section] of plan.sections.entries()) {
    const newPlotNumbers = new Set<number>();
    for (const [momentIndex, moment] of section.moments.entries()) {
      for (const [actionIndex, action] of moment.actions.entries()) {
        if ((action.action !== "create" && action.action !== "revise")
          || action.kind !== "visual") continue;
        const content = action.content as LessonPlanVisualContent;
        const bound = RECIPE_HOOKS[content.capability]?.bound_numbers?.(content);
        if (bound?.length) content.numbers = bound;
        else if (bound) delete content.numbers;
        if (content.capability === "function_plot") {
          for (const number of bound ?? []) newPlotNumbers.add(number);
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
          const prior = publishedPlotNumbers.has(numberIndex)
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
    for (const number of newPlotNumbers) publishedPlotNumbers.add(number);
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
  const viewAdjustments: CompiledLessonPlan["view_adjustments"] = [];
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
              actions.push(...visual.actions.map((action) => ({ ...action, ...actionWhen(item.timing) })));
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
            fail("LESSON_PLAN_COMPILER_UNSUPPORTED_REVISION", `${actionPath}.content`, "visual capability revision is not in the first compiler batch");
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
        } else {
          actions.push({
            do: "animate", variable: variableAlias(item.number), value: item.end_value,
            ...(item.easing ? { easing: item.easing } : {}),
            ...(item.duration_intent ? { duration_intent: item.duration_intent } : {}),
            ...actionWhen(item.timing),
          });
        }
      });
      if (actions.length === 0) {
        fail("LESSON_PLAN_COMPILER_EMPTY_BEAT", `${momentPath}.actions`, "OLL requires at least one action per moment");
      }
      includeWrittenCardsInFocus(actions);
      beats.push({
        key: `moment-${pad(momentIndex)}`,
        ...(moment.restart_numbers?.length ? { start: { kind: "replay" as const, variables: moment.restart_numbers.map(variableAlias) } } : {}),
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
  const addTask = (task: NonNullable<AuthoringLesson["lesson"]["tasks"]>[number]): void => {
    const semanticKey = JSON.stringify({
      allowed_operations: task.allowed_operations,
      completion: task.completion,
    });
    if (seenTaskSemantics.has(semanticKey)) return;
    seenTaskSemantics.add(semanticKey);
    if (options.construction_rules === "explicit-v1" && task.completion.kind === "expression_target") {
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
        reflections.push({
          as: `section-${pad(sectionOffset + 1)}-reflection-${pad(activityOffset + 1)}`,
          prompt: namedNumbers(activity.prompt, plan),
          answer: namedNumbers(activity.answer, plan),
          anchor: wholeTargets.get(anchor.authoring_alias) ?? anchor.authoring_alias,
          availability: { kind: "after_lesson" },
        });
        return;
      }
      const common = {
        as: `section-${pad(sectionOffset + 1)}-task-${pad(activityOffset + 1)}`,
        prompt: namedNumbers(activity.prompt, plan),
        availability: { kind: "after_lesson" as const },
        hints: activity.hints.map(hint => namedNumbers(hint, plan)),
        ...(activity.hint_after_attempts ? { hint_after_attempts: activity.hint_after_attempts } : {}),
        ...(activity.success_message ? { success_message: namedNumbers(activity.success_message, plan) } : {}),
      };
      if (activity.kind === "number_target") {
        const firstNumber = activity.number_controls[0]?.number;
        if (!firstNumber) fail("LESSON_PLAN_ACTIVITY", `${activityPath}.number_controls`, "number task requires controls");
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
        });
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
        });
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
        });
      }
    });
  });

  const hostReferences = options.host_references ?? [];
  if (hostReferences.length > 0 && !options.board_context) {
    fail("LESSON_PLAN_BOARD_CONTEXT", "$options.board_context", "host references require board context");
  }
  const closeFocus = plan.close.focus.map((_item, index) => reference(`$lessonPlan.close.focus[${index}]`));
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
      ...(plan.numbers?.length ? {
        variables: plan.numbers.map((number, index) => ({
          as: variableAlias(index + 1), initial: number.initial, min: number.min, max: number.max,
          ...(number.label ? { label: number.label } : {}),
          ...(number.unit ? { unit: number.unit } : {}),
          ...(number.student_control ? {
            control: {
              kind: "slider" as const,
              ...(number.student_control.step ? { step: number.student_control.step } : {}),
            },
          } : {}),
        })),
      } : {}),
      ...(tasks.length ? { tasks } : {}),
      ...(reflections.length ? { reflections } : {}),
    },
    steps,
    close: { summary: plan.close.summary, focus: closeFocus },
  };
  return { lesson: applyLessonOpeningPolicy(lesson, options.opening_policy ?? (options.construction_rules === "explicit-v1" ? { kind: "title" } : { kind: "preserve" })), resolved, plugins: lessonPlanPlugins(plan), view_adjustments: viewAdjustments };
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
    if (action.do !== "write" || !["geometry", "plot", "scene3d", "number_line"].includes(action.kind)) return;
    const content = action.content as Record<string, unknown>;
    const bindings = Array.isArray(content.bindings) ? content.bindings : [];
    bindings.forEach((binding) => {
      if (binding && typeof binding === "object" && !Array.isArray(binding)) {
        visualExpressions.push((binding as Record<string, unknown>).expression);
      }
    });
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
    fail("LESSON_PLAN_OLL_SCHEMA", first?.instancePath ?? "$lesson", first?.message ?? "compiled OLL failed schema validation");
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
