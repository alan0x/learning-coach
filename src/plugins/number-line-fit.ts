// Fits a number line's lesson numbers to what the lesson teaches (OLL decision
// 0013). The model writes the numbers it means: a start and a change, maybe as
// decimals (0.33 for 1/3), with whatever slider steps and ranges come to mind.
// The program owns how they are drawn, as it owns a polygon's side count:
// - each unit is split into the lesson's denominator (the smallest 1–12 its
//   values use, else a coarse slider step such as 0.25), and the numbers'
//   starting values, ranges and slider steps are snapped onto those ticks;
//   whole numbers too far apart to count in ones are counted in 2s, 5s or 10s;
// - the numbers' ranges shrink to a window around the values the lesson uses
//   (0, the start, the end, animation targets and practice targets), so the
//   line is readable and hops fit.
// Nothing here rejects: a lesson the fit cannot improve keeps its numbers.
import type { LessonPlan, LessonPlanNumber, LessonPlanVisualContent } from "../lesson-plan.js";

/**
 * How close a value must be to a multiple of 1/d to count as that fraction:
 * 0.33 is 1/3, but 1/11 (0.0909) is not 1/10. The tolerance shrinks with d,
 * so neighbouring denominators stay apart.
 */
const fractionTolerance = (denominator: number) => Math.min(0.011, 0.25 / (denominator * denominator));
/** The widest window the fit narrows a line to; anything wider keeps every reachable value. */
const MAX_WINDOW = 40;

const near = (value: number, grid: number) => Math.abs(value - Math.round(value / grid) * grid) <= fractionTolerance(Math.round(1 / grid));
const snap = (value: number, grid: number) => Number((Math.round(value / grid) * grid).toPrecision(12));
const floorTo = (value: number, grid: number) => Number((Math.ceil(value / grid - 1e-9) * grid).toPrecision(12));
const ceilTo = (value: number, grid: number) => Number((Math.floor(value / grid + 1e-9) * grid).toPrecision(12));

/** The smallest denominator 1–12 that puts every value within 0.01 of one of its fractions. */
export function inferDenominator(values: readonly number[]): number | undefined {
  for (let denominator = 1; denominator <= 12; denominator += 1) {
    if (values.every((value) => near(value, 1 / denominator))) return denominator;
  }
  return undefined;
}

const UNIT_STEPS = [2, 3, 4, 5, 6];
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * The denominator of a lesson whose values are all whole numbers, from its slider steps:
 * - a step of exactly 1/2 to 1/6 (counting by fourths) says what the lesson counts in;
 * - several such steps share their least common denominator (halves and thirds: sixths), so
 *   every value either slider reaches stays on a tick;
 * - when that denominator would exceed 12, the sliders are left as written (undefined);
 * - any other step (0.1, 0.4, 1.5) says nothing about fractions, and the lesson is whole (1).
 */
export function wholeLessonDenominator(steps: ReadonlyArray<number | undefined>): number | undefined {
  const units = steps.filter((step): step is number => typeof step === "number" && step > 0)
    .map((step) => UNIT_STEPS.find((parts) => Math.abs(step - 1 / parts) <= fractionTolerance(parts)))
    .filter((parts): parts is number => parts !== undefined);
  if (!units.length) return 1;
  const common = units.reduce((lcm, parts) => (lcm * parts) / gcd(lcm, parts), 1);
  return common <= 12 ? common : undefined;
}

/** Values the lesson sets a number to: animation end values and practice targets on the number itself. */
function lessonValues(plan: LessonPlan, number: number): number[] {
  const values: number[] = [];
  for (const section of plan.sections) {
    for (const moment of section.moments) for (const action of moment.actions) {
      if (action.action === "animate" && action.number === number) values.push(action.end_value);
    }
    for (const activity of section.student_activities ?? []) {
      if (activity.kind === "number_target" && !activity.expression && activity.number_controls[0]?.number === number) values.push(activity.value);
    }
  }
  return values;
}

/** Practice targets set directly on a number. */
function taskValues(plan: LessonPlan, number: number): number[] {
  return plan.sections.flatMap((section) => (section.student_activities ?? []).flatMap((activity) =>
    activity.kind === "number_target" && !activity.expression && activity.number_controls[0]?.number === number ? [activity.value] : []));
}

/**
 * Fits the start and change numbers of one number line visual in place.
 * Returns each fitted number with its tick step, so the caller snaps the
 * lesson's animation and practice values to the same ticks; empty when the
 * numbers are left as they are.
 */
export function fitNumberLineNumbers(content: LessonPlanVisualContent, plan: LessonPlan, sharedNumbers: ReadonlySet<number>): Map<number, number> {
  const fitted = new Map<number, number>();
  const [startIndex, changeIndex] = content.numbers ?? [];
  if (!startIndex || !plan.numbers) return fitted;
  // A number another visual shows is that visual's too: changing it here would change it there.
  if (sharedNumbers.has(startIndex) || (changeIndex && sharedNumbers.has(changeIndex))) return fitted;
  // A practice task judged by an expression ("start + change = 5") depends on the numbers' exact
  // ranges and steps in ways a refit could break; leave its numbers as the model wrote them.
  const ours = new Set([startIndex, changeIndex].filter((index): index is number => index !== undefined));
  const expressionTask = plan.sections.some((section) => (section.student_activities ?? []).some((activity) =>
    activity.kind === "number_target" && activity.expression !== undefined
    && (activity.number_controls.some((control) => ours.has(control.number))
      || JSON.stringify(activity.expression).match(/"number":(\d+)/gu)?.some((match) => ours.has(Number(match.split(":")[1]))))));
  if (expressionTask) return fitted;
  const start = plan.numbers[startIndex - 1];
  const change = changeIndex ? plan.numbers[changeIndex - 1] : undefined;
  if (!start) return fitted;
  const original = [start, change].map((definition) => definition && structuredClone(definition));

  const startValues = [start.initial, ...lessonValues(plan, startIndex)];
  const changeValues = change ? [change.initial, ...lessonValues(plan, changeIndex!)] : [];
  // Points the line shows: the start's values, and the end for each value of the change.
  const shown = [...startValues, ...changeValues.map((value) => start.initial + value)];
  // The values decide first: 0.33 and 0.67 are thirds. Only when they are all whole numbers can a
  // slider step say what the lesson counts in, and only a coarse one (1/2 to 1/6, as in counting
  // by fourths): a fine step such as 0.1 on an integer lesson is not a lesson in tenths.
  const values = [...startValues, ...changeValues];
  const fromValues = inferDenominator(values);
  const denominator = fromValues === 1 ? wholeLessonDenominator([start.student_control?.step, change?.student_control?.step]) : fromValues;
  let grid = denominator ? 1 / denominator : undefined;

  const used = [0, ...shown];
  let low = Math.floor(Math.min(...used)) - 1;
  let high = Math.ceil(Math.max(...used)) + 1;
  let windowFits = high - low <= MAX_WINDOW;
  // Whole numbers too far apart to count in ones (35 and 75 on a line from 0) are counted in the
  // smallest of 2, 5 or 10 that every value is a multiple of, as a fraction lesson counts in its parts:
  // the values, slider steps and window snap to it, so each value sits on a tick the line can label.
  let unit = 1;
  if (denominator === 1 && !windowFits) {
    const coarse = [2, 5, 10].find((count) => values.every((value) => near(value / count, 1))
      && (Math.ceil(Math.max(...used) / count) - Math.floor(Math.min(...used) / count) + 2) <= MAX_WINDOW);
    if (coarse) {
      unit = coarse;
      grid = coarse;
      low = (Math.floor(Math.min(...used) / coarse) - 1) * coarse;
      high = (Math.ceil(Math.max(...used) / coarse) + 1) * coarse;
      windowFits = true;
    }
  }

  const fit = (definition: LessonPlanNumber, values: readonly number[], range: [number, number] | undefined) => {
    if (grid) {
      definition.initial = snap(definition.initial, grid);
      if (definition.student_control) definition.student_control.step = grid;
    }
    if (range) {
      // Keep the values the lesson uses; never widen past what the model allowed.
      const lowest = Math.min(definition.initial, ...values), highest = Math.max(definition.initial, ...values);
      definition.min = Math.max(definition.min, Math.min(range[0], lowest));
      definition.max = Math.min(definition.max, Math.max(range[1], highest));
    }
    if (grid) {
      definition.min = floorTo(definition.min, grid);
      definition.max = ceilTo(definition.max, grid);
    }
  };

  // Which range a number keeps:
  // - one the lesson drives (an animation or a practice target) shrinks to the window around the
  //   values the lesson uses, which still holds every value it drives;
  // - a change with a slider nothing drives keeps the model's range: the learner is meant to move it,
  //   perhaps to a value only the narration names, so a wider line beats an unreachable answer;
  // - one with neither is fixed in effect, and keeps a short range around its value.
  // - a start nothing drives keeps a short range even with a slider: the answer is carried by the change.
  const rangeFor = (definition: LessonPlanNumber, values: readonly number[], window: [number, number], carriesAnswer: boolean): [number, number] | undefined => {
    if (!windowFits) return undefined;
    if (values.length > 1) return window;
    if (definition.student_control && carriesAnswer) return undefined;
    return [definition.initial - unit, definition.initial + unit];
  };
  fit(start, startValues.map((value) => (grid ? snap(value, grid) : value)), rangeFor(start, startValues, [low, high], false));
  if (change) {
    // Every start and change together stays in the window: change in [low − start.min, high − start.max].
    fit(change, changeValues.map((value) => (grid ? snap(value, grid) : value)), rangeFor(change, changeValues, [low - start.min, high - start.max], true));
  }

  const valid = [start, change].every((definition) => !definition
    || (definition.min < definition.max && definition.initial >= definition.min && definition.initial <= definition.max));
  // A snapped practice target the snapped starting value already meets would be a task with nothing to do.
  const trivialTask = grid !== undefined && ([[startIndex, start], [changeIndex, change]] as Array<[number | undefined, LessonPlanNumber | undefined]>)
    .some(([index, definition]) => index !== undefined && definition !== undefined
      && taskValues(plan, index).some((value) => Math.abs(snap(value, grid) - definition.initial) < grid / 2));
  if (!valid || trivialTask) {
    // Leave the lesson as the model wrote it; the compiler draws what it can.
    Object.assign(start, original[0]);
    if (change) Object.assign(change, original[1]);
    if (original[0]?.student_control === undefined) delete start.student_control;
    if (change && original[1]?.student_control === undefined) delete change.student_control;
    return fitted;
  }
  const step = grid ?? 0;
  fitted.set(startIndex, step);
  if (changeIndex && change) fitted.set(changeIndex, step);
  return fitted;
}
