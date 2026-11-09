import { compileText, setLessonTextLanguage } from "./lesson-text.js";
import { CompiledVisualRegistry, type CompiledVisual } from "./compiled-visual-reuse.js";
import { applyLessonOpeningPolicy, type LessonOpeningPolicy, compileMathExpression, normalizeAuthoringLesson, reduceCanonicalEvents, validateAuthoringLesson, validateAuthoringSchema, type AuthoringAction, type AuthoringLesson, type ResourceContext } from "octos-lesson-language";
import { LESSON_PLAN_CAPABILITY_REGISTRY, LESSON_PLAN_CAPABILITY_NUMBER_LIMITS, resolveLessonPlan, type LessonPlan, type LessonPlanBoardContent, type LessonPlanBoardKind, type LessonPlanHostReference, type LessonPlanVisualContent, type ResolveLessonPlanOptions, type ResolvedLessonPlan, type ResolvedLessonPlanReference } from "./lesson-plan.js";
import { implicitSurfaceDomain } from "./scene3d-surfaces.js";
import { fail, pad, variableAlias, parameters, optionalNumber, assertRange, safeFunctionExpression, mathExpressionToOll, place, includeWrittenCardsInFocus, namedNumbers, actionWhen, type VisualCompiler } from "./recipe-kit.js";
import { MATH_COMPILERS } from "./plugins/math-compilers.js";
import { PLUGIN_HOOKS, RECIPE_HOOKS } from "./plugins/hooks.js";
import { PHYSICS_COMPILERS } from "./plugins/physics-compilers.js";
import { SHARED_COMPILERS } from "./plugins/shared-compilers.js";

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

/** Each installed plugin's recipe compilers, keyed by plugin ID. */
export const PLUGIN_COMPILERS = { math: MATH_COMPILERS, physics: PHYSICS_COMPILERS, shared: SHARED_COMPILERS } as const;

const VISUAL_COMPILERS = {
  ...MATH_COMPILERS,
  ...PHYSICS_COMPILERS,
  ...SHARED_COMPILERS,
} satisfies Record<LessonPlanVisualContent["capability"], VisualCompiler>;

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
  const min = Math.max(1, Math.ceil(definition.min));
  const max = Math.min(maximum, Math.floor(definition.max));
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
  for (const [sectionIndex, section] of plan.sections.entries()) {
    for (const [momentIndex, moment] of section.moments.entries()) {
      for (const [actionIndex, action] of moment.actions.entries()) {
        if ((action.action !== "create" && action.action !== "revise")
          || action.kind !== "visual") continue;
        const content = action.content as LessonPlanVisualContent;
        const policies = LESSON_PLAN_CAPABILITY_REGISTRY[content.capability].number_input_policies;
        for (const [inputIndex, numberIndex] of (content.numbers ?? []).entries()) {
          const definition = plan.numbers?.[numberIndex - 1];
          const policy = policies[inputIndex];
          if (!definition || !policy) continue;
          if (RECIPE_HOOKS[content.capability]?.free_number?.(content, inputIndex)) continue;
          const path = `$lessonPlan.sections[${sectionIndex}].moments[${momentIndex}].actions[${actionIndex}].content.parameters`;
          if (policy.kind === "side_count") {
            integerSides.add(numberIndex);
            intersectProgramRange(definition, 3, 384);
            definition.min = Math.ceil(definition.min);
            definition.max = Math.floor(definition.max);
            if (definition.min >= definition.max) { definition.min = 3; definition.max = 384; }
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
            positiveIntegerProgramRange(definition, policy.max);
            constrained.add(numberIndex);
          } else if (policy.kind === "surface_section") {
            const allowed = RECIPE_HOOKS[content.capability]?.section_range?.(content, path);
            if (allowed && allowed.min < allowed.max) {
              intersectProgramRange(definition, allowed.min, allowed.max);
              constrained.add(numberIndex);
            }
          }
        }
      }
    }
  }
  if (constrained.size === 0) return;
  for (const section of plan.sections) {
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (action.action !== "animate" || !constrained.has(action.number)) continue;
        const definition = plan.numbers![action.number - 1]!;
        action.end_value = Math.min(definition.max, Math.max(definition.min, integerSides.has(action.number) ? Math.round(action.end_value) : action.end_value));
      }
    }
    for (const activity of section.student_activities ?? []) {
      if (activity.kind !== "number_target") continue;
      const number = activity.number_controls[0]?.number;
      if (!number || !constrained.has(number)) continue;
      const definition = plan.numbers![number - 1]!;
      const original = activity.value;
      activity.value = Math.min(definition.max, Math.max(definition.min, integerSides.has(number) ? Math.round(activity.value) : activity.value));
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

export function compileLessonPlan(value: unknown, options: CompileLessonPlanOptions = {}): CompiledLessonPlan {
  const resolved = resolveLessonPlan(value, options);
  const plan = resolved.plan;
  setLessonTextLanguage(plan, options.language);
  for (const hooks of PLUGIN_HOOKS) hooks.normalize_plan?.(plan);
  for (const hooks of PLUGIN_HOOKS) hooks.check_plan?.(plan);
  normalizeProgramOwnedNumberRanges(plan);
  mergeEquivalentVisualInputs(plan);
  for (const section of plan.sections) for (const moment of section.moments) for (const action of moment.actions) {
    if (action.action !== "create" || action.kind !== "visual") continue;
    const visual = action.content as LessonPlanVisualContent;
    RECIPE_HOOKS[visual.capability]?.before_compile?.(visual, plan);
  }
  const resolvedReferences = new Map(resolved.references.map((item) => [item.path, item]));
  const wholeTargets = new Map<string, string>();
  const partTargets = new Map<string, Map<string, string>>();
  const primaryScenes = new Map<string, string>();
  const reusableVisuals = new Map<string, CompiledVisual>();
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
              ?? reuseCompiledVisual(
                compileVisual(alias, visualContent, item.role, placement, plan, `${actionPath}.content.parameters`),
              );
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
        addTask({
          ...common,
          anchor: wholeTargets.get(anchor.authoring_alias) ?? anchor.authoring_alias,
          allowed_operations: [{ kind: "answer_entry" }],
          completion: {
            kind: "numeric_answer",
            answer: activity.answer,
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
  return { lesson: applyLessonOpeningPolicy(lesson, options.opening_policy ?? (options.construction_rules === "explicit-v1" ? { kind: "title" } : { kind: "preserve" })), resolved };
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
    if (action.do !== "write" || !["geometry", "plot", "scene3d"].includes(action.kind)) return;
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
