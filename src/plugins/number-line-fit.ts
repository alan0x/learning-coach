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
// Nothing here rejects, and the fit never discards itself: a window that does not fit keeps the
// model's ranges, but the values and sliders still sit on the lesson's ticks.
import type { LessonPlan, LessonPlanNumber, LessonPlanVisualContent } from "../lesson-plan.js";

/**
 * How close a value must be to a multiple of 1/d to count as that fraction:
 * 0.33 is 1/3, but 1/11 (0.0909) is not 1/10. The tolerance shrinks with d,
 * so neighbouring denominators stay apart.
 */
const fractionTolerance = (denominator: number) => Math.min(0.011, 0.25 / (denominator * denominator));
/**
 * The widest window the fit narrows a line to, in its counting unit; anything wider keeps every
 * reachable value. With the compiler's padding a window this wide still draws a tick per unit (60).
 */
const MAX_WINDOW = 58;

const near = (value: number, grid: number) => Math.abs(value - Math.round(value / grid) * grid) <= fractionTolerance(Math.round(1 / grid));
const snap = (value: number, grid: number) => Number((Math.round(value / grid) * grid).toPrecision(12));
const floorTo = (value: number, grid: number) => Number((Math.ceil(value / grid - 1e-9) * grid).toPrecision(12));
const ceilTo = (value: number, grid: number) => Number((Math.floor(value / grid + 1e-9) * grid).toPrecision(12));

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
/** Whether n/d in lowest terms has a repeating decimal (its denominator has a prime factor other than 2 or 5). */
const repeats = (numerator: number, denominator: number) => {
  let rest = denominator / gcd(Math.abs(numerator), denominator);
  for (const prime of [2, 5]) while (rest % prime === 0) rest /= prime;
  return rest !== 1;
};
/** A value exactly on 1/d's grid, up to floating-point error (2/3 written to 12 places counts). */
const exactlyOn = (value: number, denominator: number) => Math.abs(value * denominator - Math.round(value * denominator)) <= 1e-9 * Math.max(1, Math.abs(value * denominator));
/** How many decimal places a value is written to (0.8333 → 4). */
const decimalPlaces = (value: number) => {
  const text = String(Math.abs(value));
  if (text.includes("e")) return 0;
  return text.includes(".") ? text.length - text.indexOf(".") - 1 : 0;
};
/**
 * A value written as a repeating fraction of 1/d's grid, rounded or cut to the places it shows: 0.67,
 * 0.6666 and 0.666667 are 2/3, and 0.8333 is 5/6. Never a terminating value (0.51 is not 1/2), never one
 * a place off (0.34 is not 1/3, which shows as 0.33), never one place only (0.3 is 3/10), and at two
 * places only thirds and sixths.
 */
const roundedFrom = (value: number, denominator: number) => {
  const places = decimalPlaces(value);
  if (places < 2 || places > 12) return false;
  const numerator = Math.round(value * denominator);
  if (!repeats(numerator, denominator)) return false;
  // Two places identify only thirds and sixths (0.33, 0.67, 0.17, 0.83, as the model writes them); with
  // denominators up to 24, nearly any two-place value is near some fraction (0.04 is 1/21 cut short).
  const lowest = denominator / gcd(Math.abs(numerator), denominator);
  if (places === 2 && lowest !== 3 && lowest !== 6) return false;
  const exact = numerator / denominator;
  const scale = 10 ** places;
  return Math.abs(value - Number(exact.toFixed(places))) < 0.5 / scale / 1000
    || Math.abs(value - Math.trunc(exact * scale) / scale) < 0.5 / scale / 1000;
};

/**
 * The grid for a lesson's values, without changing how they relate (review of #67): snapped onto it, two
 * different values must stay different and in the same order (0.66 and 0.67 must not both become 2/3).
 * Values written as decimals in a decimal question are taken literally: no fraction is recovered from them.
 */
export function valuesGrid(values: readonly number[], content: LessonPlanVisualContent): number | undefined {
  const literal = (content.parameters as { label_style?: unknown } | undefined)?.label_style === "decimal";
  const denominator = inferDenominator(values, { approximate: !literal });
  if (!denominator) return undefined;
  const grid = 1 / denominator;
  const snapped = values.map((value) => snap(value, grid));
  for (let i = 0; i < values.length; i += 1) for (let j = i + 1; j < values.length; j += 1) {
    const written = Math.sign(Number((values[i]! - values[j]!).toPrecision(12)));
    const drawn = Math.sign(Number((snapped[i]! - snapped[j]!).toPrecision(12)));
    if (written !== drawn) return undefined;
  }
  return denominator;
}

/**
 * The smallest denominator 1–24 (decision 0016) whose fractions hold every value:
 * - first exactly, so the numbers a lesson names keep their positions (review of #67: 0.5 and 0.51 must
 *   not both become 0.5; 5/24 and 19/24 must not become 1/5 and 4/5);
 * - then, only with `approximate`, letting a value stand for the repeating fraction it shows rounded or
 *   cut (0.33 for 1/3, as in run 3; 0.8333 for 5/6, as in compare probe 1). A terminating value (0.51)
 *   and one a place off (0.34) are never moved.
 * Undefined when none does; the values are then left as written.
 */
export function inferDenominator(values: readonly number[], { approximate = true }: { approximate?: boolean } = {}): number | undefined {
  for (let denominator = 1; denominator <= 24; denominator += 1) {
    if (values.every((value) => exactlyOn(value, denominator))) return denominator;
  }
  if (!approximate) return undefined;
  for (let denominator = 1; denominator <= 24; denominator += 1) {
    if (values.every((value) => exactlyOn(value, denominator) || roundedFrom(value, denominator))) return denominator;
  }
  return undefined;
}

/** Values the lesson sets a number to: animation end values and practice targets on the number itself. */
export function lessonValues(plan: LessonPlan, number: number): number[] {
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
  // The values alone decide what the lesson counts in: 0.33 and 0.67 are thirds. A slider step is never
  // evidence: the model does not write one, and the step it arrives with is derived from the range
  // (span / 200), so 0.5 on a 0–100 range says nothing about halves (run 5).
  const values = [...startValues, ...changeValues];
  const denominator = valuesGrid(values, content);
  let grid = denominator ? 1 / denominator : undefined;

  // 0 anchors the line when it fits; a lesson far from 0 (23 + 48) is shown around its own values.
  const withZero = [0, ...shown];
  const used = Math.ceil(Math.max(...withZero)) - Math.floor(Math.min(...withZero)) + 2 <= MAX_WINDOW ? withZero : shown;
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
  // - a change with a slider nothing drives, starting at 0, keeps the model's range: the learner is
  //   meant to find the change, perhaps one only the narration names ("6 − 9"), so a wider line beats
  //   an unreachable answer;
  // - one starting elsewhere states the change the lesson is about (3/4 in −1/2 + 3/4): it shrinks to
  //   the window, which always keeps that value. Keeping ±10 squeezed −1/2 + 3/4 into one unit of 25;
  // - one with neither is fixed in effect, and keeps a short range around its value.
  // - a start nothing drives keeps a short range even with a slider: the answer is carried by the change.
  const rangeFor = (definition: LessonPlanNumber, values: readonly number[], window: [number, number], carriesAnswer: boolean): [number, number] | undefined => {
    if (!windowFits) return undefined;
    if (values.length > 1) return window;
    if (definition.student_control && carriesAnswer && definition.initial === 0) return undefined;
    if (definition.student_control && carriesAnswer) return window;
    return [definition.initial - unit, definition.initial + unit];
  };
  fit(start, startValues.map((value) => (grid ? snap(value, grid) : value)), rangeFor(start, startValues, [low, high], false));
  if (change) {
    // Every start and change together stays in the window: change in [low − start.min, high − start.max].
    fit(change, changeValues.map((value) => (grid ? snap(value, grid) : value)), rangeFor(change, changeValues, [low - start.min, high - start.max], true));
  }

  const valid = [start, change].every((definition) => !definition
    || (definition.min < definition.max && definition.initial >= definition.min && definition.initial <= definition.max));
  if (!valid) {
    // A window the numbers do not fit: keep the model's ranges, but still put the values and the
    // sliders on the lesson's ticks, so the line stays readable. (A target the number already starts
    // at is resolved when the lesson compiles: the line goes back before the learner tries.)
    for (const [definition, before] of [[start, original[0]], [change, original[1]]] as const) {
      if (!definition || !before) continue;
      definition.min = grid ? floorTo(before.min, grid) : before.min;
      definition.max = grid ? ceilTo(before.max, grid) : before.max;
      if (!(definition.min < definition.max)) { definition.min = before.min; definition.max = before.max; }
      definition.initial = Math.min(definition.max, Math.max(definition.min, definition.initial));
    }
  }
  const step = grid ?? 0;
  fitted.set(startIndex, step);
  if (changeIndex && change) fitted.set(changeIndex, step);
  return fitted;
}

/**
 * Fits the points a line shows (decision 0016): two compared numbers, or a solution set's boundaries, in place: both values, and the values the lesson sets them
 * to, snap to their common denominator (up to 24); the sliders step by it; each range narrows to the
 * whole units around both values, never past what the model allowed and always keeping the values.
 * Shared numbers and numbers an expression task reads are left as written, as for the number line.
 */
export function fitComparedNumbers(content: LessonPlanVisualContent, plan: LessonPlan, sharedNumbers: ReadonlySet<number>): Map<number, number> {
  const fitted = new Map<number, number>();
  // Two compared numbers, or a solution set's one or two boundaries (decision 0016).
  const indexes = (content.numbers ?? []).slice(0, 2);
  if (indexes.length < 1 || !plan.numbers || indexes.some((index) => sharedNumbers.has(index))) return fitted;
  const ours = new Set(indexes);
  const expressionTask = plan.sections.some((section) => (section.student_activities ?? []).some((activity) =>
    activity.kind === "number_target" && activity.expression !== undefined
    && (activity.number_controls.some((control) => ours.has(control.number))
      || JSON.stringify(activity.expression).match(/"number":(\d+)/gu)?.some((match) => ours.has(Number(match.split(":")[1]))))));
  if (expressionTask) return fitted;
  const definitions = indexes.map((index) => plan.numbers![index - 1]);
  if (definitions.some((definition) => !definition)) return fitted;
  const values = indexes.flatMap((index, position) => [definitions[position]!.initial, ...lessonValues(plan, index)]);
  // Compared values are the question itself: an exact grid, or the repeating fractions the values show
  // rounded (0.8333 is 5/6), never one that makes different values equal or swaps their order (0.66 and
  // 0.67), nor fractions read from a decimal question's decimals. Values no grid up to 24 parts holds are
  // left as written, and the line refuses them (the outline is asked again).
  const denominator = valuesGrid(values, content);
  if (!denominator) return fitted;
  const grid = 1 / denominator;
  const low = Math.floor(Math.min(...values) + 1e-9);
  const high = Math.max(low + 1, Math.ceil(Math.max(...values) - 1e-9));
  const original = definitions.map((definition) => structuredClone(definition!));
  for (const [position, definition] of definitions.entries()) {
    const own = [definition!.initial, ...lessonValues(plan, indexes[position]!)].map((value) => snap(value, grid));
    definition!.initial = snap(definition!.initial, grid);
    if (definition!.student_control) definition!.student_control.step = grid;
    definition!.min = floorTo(Math.max(definition!.min, Math.min(low, ...own)), grid);
    definition!.max = ceilTo(Math.min(definition!.max, Math.max(high, ...own)), grid);
  }
  const valid = definitions.every((definition) => definition!.min < definition!.max && definition!.initial >= definition!.min && definition!.initial <= definition!.max);
  if (!valid) {
    // Keep the model's ranges, but the values and sliders still sit on the common ticks.
    for (const [position, definition] of definitions.entries()) {
      definition!.min = original[position]!.min;
      definition!.max = original[position]!.max;
      definition!.initial = Math.min(definition!.max, Math.max(definition!.min, definition!.initial));
    }
  }
  for (const index of indexes) fitted.set(index, grid);
  return fitted;
}

/**
 * Fits a solution set's boundaries (decision 0016): as for compared numbers, then, with two boundaries,
 * keeps their ranges apart, so a slider can never carry the lower boundary past the upper one (OLL checks
 * every interval runs from smaller to larger at every slider extreme). The split falls between them, on
 * the grid when there is one.
 */
export function fitSolutionNumbers(content: LessonPlanVisualContent, plan: LessonPlan, sharedNumbers: ReadonlySet<number>): Map<number, number> {
  const fitted = fitComparedNumbers(content, plan, sharedNumbers);
  const [lowIndex, highIndex] = content.numbers ?? [];
  const low = lowIndex ? plan.numbers?.[lowIndex - 1] : undefined;
  const high = highIndex ? plan.numbers?.[highIndex - 1] : undefined;
  if (!low || !high || !(low.initial < high.initial) || sharedNumbers.has(lowIndex!) || sharedNumbers.has(highIndex!)) return fitted;
  if (low.max < high.min) return fitted;
  const grid = fitted.get(lowIndex!) || undefined;
  const middle = (low.initial + high.initial) / 2;
  // (floorTo and ceilTo round inwards, for ranges: floorTo rounds up, ceilTo down; corrected below.)
  let lowMax = grid ? floorTo(middle - 1e-9, grid) : middle;
  let highMin = grid ? ceilTo(middle, grid) : middle;
  if (grid && lowMax > middle) lowMax -= grid;
  if (grid && highMin < middle) highMin += grid;
  // On a grid, the two may meet at the middle tick: the lower boundary stops one tick short.
  if (lowMax >= highMin) lowMax = grid ? Number((highMin - grid).toPrecision(12)) : highMin - Math.max(1e-6, (high.initial - low.initial) / 1000);
  if (lowMax < low.initial || highMin > high.initial) return fitted;
  low.max = Math.min(low.max, lowMax);
  high.min = Math.max(high.min, highMin);
  if (low.min >= low.max || high.min >= high.max) return fitted;
  return fitted;
}

