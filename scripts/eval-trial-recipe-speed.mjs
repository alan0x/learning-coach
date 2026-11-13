#!/usr/bin/env node
// Speed gate for a trial recipe (decision E5): does offering a new recipe to
// the model cost first-playable time? Scaled down like the earlier speed
// checks: interleaved pairs, measured to the first playable section only.
//
// Both arms run the same Coach build through the real tool process, exactly
// as Octos starts it; they differ only in LEARNING_COACH_TRIAL_RECIPES, so the
// candidate's requests also offer the trial recipe (its card, guidance and
// schema). Jev is left out: the gate is the same in both arms.
//
// Cases mix requests the recipe fits (constant-speed motion) with requests
// from other subjects, which pay for the larger request without using it.
// Each run records whether its first playable section used the trial recipe.
//
// Uses the owner's model key; run only with the owner's approval. The route
// and key come from the Octos profile inside this process; nothing about them
// is printed or written except the provider and model.
//
//   node scripts/eval-trial-recipe-speed.mjs --build <dir with main + lesson-plan.js>
//     --octos-profile ~/.octos/profiles/<id>.json [--recipes constant_speed_motion] [--pairs 20] [--max-calls 60]
//     [--quality-repeats 1] [--out <report.json>]
//   A probe: --pairs 0 --cases NL-03,NM-01 --quality-repeats 5 (candidate arm only, no speed pairs).
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { profileRouteEnvironment } from "./eval-payload-padding.mjs";
import { runTool, caseLanguage } from "./eval-shadow-speed.mjs";
import { planNumberLineTicks } from "octos-lesson-language/plugin-math";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Requests the constant-speed recipe fits; the other half of the pairs come from other subjects. */
export const MOTION_CASES = [
  { id: "CS-01", prompt: "物体做匀速直线运动时，路程是怎样随时间变化的？" },
  { id: "CS-02", prompt: "How does distance change over time when something moves at a constant speed?" },
  { id: "CS-03", prompt: "一辆车以每秒 15 米的速度匀速行驶，怎么画它的路程—时间图像？" },
  { id: "CS-04", prompt: "Why is the distance–time graph of constant speed a straight line?" },
  { id: "CS-05", prompt: "怎样从路程—时间图像看出谁跑得快？" },
  { id: "CS-06", prompt: "A cyclist rides at 5 m/s. How far does she go in 8 seconds? Show it on a graph." },
  { id: "CS-07", prompt: "速度、路程和时间之间是什么关系？" },
  { id: "CS-08", prompt: "What does the slope of a distance–time graph tell you?" },
  { id: "CS-09", prompt: "小明以 1.5 m/s 匀速走路，10 秒走多远？用图像讲讲。" },
  { id: "CS-10", prompt: "Explain speed = distance ÷ time with a moving object." },
];
/**
 * Requests the number line recipe fits (OLL decision 0013): integers, fractions and decimals on a
 * line, Chinese and English. Each says, before any run, what a correct line must show:
 * - `values`: numbers some point must sit on, in some state the lesson reaches (a hard check);
 * - `change`: the change the question asks for, which a slider or an animation must reach (hard);
 * - `parts`: the parts per unit a well-chosen line uses (soft: other parts can still be right);
 * - `integer`: an integer question, whose line should span at most 24 units with hops (soft);
 * - `format`: "decimal" when the question writes decimals, so 0.8 reads 0.8, not 8/10 (hard: the
 *   learner reads the line in the question's notation).
 * NL-01 to NL-10 are the requests runs 1–4 were tuned against.
 */
export const NUMBER_LINE_CASES = [
  { id: "NL-01", prompt: "用数轴讲一讲 3 加上负 5 等于多少。", expect: { values: [3, -2], change: -5, integer: true } },
  { id: "NL-02", prompt: "Show me on a number line why -2 + 7 = 5.", expect: { values: [-2, 5], change: 7, integer: true } },
  { id: "NL-03", prompt: "3/4 在数轴上的哪里？", expect: { values: [0.75], parts: 4 } },
  { id: "NL-04", prompt: "How do I add 1/4 and 2/4 on a number line?", expect: { values: [0.25, 0.75], parts: 4 } },
  { id: "NL-05", prompt: "温度从零下 3 度升高 8 度，用数轴表示是多少度？", expect: { values: [-3, 5], change: 8, integer: true } },
  { id: "NL-06", prompt: "Use a number line to explain 6 - 9.", expect: { values: [6, -3], change: -9, integer: true } },
  { id: "NL-07", prompt: "在数轴上比较 0.5 和 0.8 哪个大。", expect: { values: [0.5, 0.8], parts: 10, format: "decimal" } },
  { id: "NL-08", prompt: "Why is -4 less than -1? Show it on a number line.", expect: { values: [-4, -1], integer: true } },
  { id: "NL-09", prompt: "从 1/3 出发，再加 2/3，在数轴上是多少？", expect: { values: [1 / 3, 1], parts: 3 } },
  { id: "NL-10", prompt: "Count by fourths from 0 to 2 on a number line.", expect: { values: [0, 0.25], parts: 4 } },
];

/**
 * Quality cases, run once each on the candidate arm only (no speed pair), written before run 5:
 * - held-out number line requests no fix was tuned against (NL-11 to NL-18);
 * - near misses the recipe cannot fully express (NM-01 to NM-04): fifteenths (comparing 2/3 and 3/5),
 *   an inequality, rounding, an absolute value. The card excludes them (owner, after run 5). A lesson
 *   that avoids the number line passes; one that draws it gets the ordinary hard checks against the
 *   values the request needs, and is read by hand. They run on both arms, so a lesson can be compared
 *   with what the same request gets today.
 */
export const NUMBER_LINE_QUALITY_CASES = [
  { id: "NL-11", prompt: "在数轴上从 0.3 出发加 0.4 是多少？", expect: { values: [0.3, 0.7], parts: 10, format: "decimal" } },
  { id: "NL-12", prompt: "Show -1/2 + 3/4 on a number line.", expect: { values: [-0.5, 0.25], parts: 4 } },
  { id: "NL-13", prompt: "用数轴表示 1 又 1/2 加上 1 又 1/4。", expect: { values: [1.5, 2.75], parts: 4 } },
  { id: "NL-14", prompt: "Use a number line to show 5 - 8.", expect: { values: [5, -3], change: -8, integer: true } },
  { id: "NL-15", prompt: "在 0 到 100 的数轴上，从 35 往后数 40 是多少？", expect: { values: [35, 75], change: 40 } },
  { id: "NL-16", prompt: "What is -2.5 + 4? Show it on a number line.", expect: { values: [-2.5, 1.5], parts: 2, format: "decimal" } },
  { id: "NL-17", prompt: "从 -6 出发向右走 6 格，用数轴看看到了哪里。", expect: { values: [-6, 0], change: 6, integer: true } },
  { id: "NL-18", prompt: "Show 2/3 - 1/3 on a number line.", expect: { values: [2 / 3, 1 / 3], parts: 3 } },
  { id: "NL-19", prompt: "用数轴算 23 + 48。", expect: { values: [23, 71], change: 48 } },
  { id: "NL-20", prompt: "Use an open number line to add 17 and 26.", expect: { values: [17, 43], change: 26 } },
  { id: "NM-01", prompt: "用数轴比较 2/3 和 3/5 哪个大。", nearMiss: true, expect: { values: [2 / 3, 0.6] } },
  { id: "NM-02", prompt: "Graph x > -2 on a number line.", nearMiss: true, expect: { values: [-2] } },
  { id: "NM-03", prompt: "用数轴说明 47 四舍五入到十位是多少。", nearMiss: true, expect: { values: [47, 50] } },
  { id: "NM-04", prompt: "Solve |x - 3| < 2 on a number line.", nearMiss: true, expect: { values: [1, 5] } },
];
/**
 * Comparing two numbers (decision 0016, number_line_compare), written before the recipe or any probe:
 * both values must be shown on labelled ticks. CMP-03 needs 24ths (5/6 and 7/8), CMP-04 twentieths.
 */
export const NUMBER_LINE_COMPARE_CASES = [
  { id: "CMP-01", prompt: "在数轴上比较 3/4 和 2/3 哪个大。", expect: { values: [0.75, 2 / 3] } },
  { id: "CMP-02", prompt: "Which is bigger, -1.5 or -2? Show both on a number line.", expect: { values: [-1.5, -2] } },
  { id: "CMP-03", prompt: "用数轴比较 5/6 和 7/8 的大小。", expect: { values: [5 / 6, 7 / 8] } },
  { id: "CMP-04", prompt: "Compare 0.35 and 0.4 on a number line.", expect: { values: [0.35, 0.4], format: "decimal" } },
  { id: "CMP-05", prompt: "比较 -3 和 2，哪个数在数轴上更靠右？", expect: { values: [-3, 2] } },
];
/**
 * Solution sets (decision 0016, number_line_solution), written before the recipe or any probe. Beyond
 * the boundary values, `solution` gives the exact set: each piece's ends (null: the ray runs on) and
 * whether each end is included (a filled circle) or not (an open one). SOL-06 must be solved first.
 */
export const NUMBER_LINE_SOLUTION_CASES = [
  { id: "SOL-01", prompt: "Graph x > -2 on a number line.", expect: { values: [-2], solution: [{ from: -2, to: null, fromClosed: false }] } },
  { id: "SOL-02", prompt: "在数轴上表示 x ≤ 3 的解集。", expect: { values: [3], solution: [{ from: null, to: 3, toClosed: true }] } },
  { id: "SOL-03", prompt: "Show the solution of 1 < x ≤ 4 on a number line.", expect: { values: [1, 4], solution: [{ from: 1, to: 4, fromClosed: false, toClosed: true }] } },
  { id: "SOL-04", prompt: "用数轴表示 |x − 3| < 2 的解。", expect: { values: [1, 5], solution: [{ from: 1, to: 5, fromClosed: false, toClosed: false }] } },
  { id: "SOL-05", prompt: "Graph the solution of x < -1 or x ≥ 2 on a number line.", expect: { values: [-1, 2], solution: [{ from: null, to: -1, toClosed: false }, { from: 2, to: null, fromClosed: true }] } },
  { id: "SOL-06", prompt: "解不等式 2x + 1 > 7，并在数轴上表示解集。", expect: { values: [3], solution: [{ from: 3, to: null, fromClosed: false }] } },
];
/**
 * Rounding (decision 0016, number_line_rounding), written before the recipe or any probe: the number and
 * the two neighbours it falls between are shown, and `rounding.result` is where a jump from the number
 * ends (halves round up, as taught in grade 3). RND-04 needs hundredths; RND-05 is the halfway case.
 */
export const NUMBER_LINE_ROUNDING_CASES = [
  { id: "RND-01", prompt: "用数轴说明 47 四舍五入到十位是多少。", expect: { values: [40, 47, 50], rounding: { number: 47, result: 50 } } },
  { id: "RND-02", prompt: "Round 362 to the nearest hundred using a number line.", expect: { values: [300, 362, 400], rounding: { number: 362, result: 400 } } },
  { id: "RND-03", prompt: "把 3.6 四舍五入到个位，用数轴表示。", expect: { values: [3, 3.6, 4], rounding: { number: 3.6, result: 4 } } },
  { id: "RND-04", prompt: "Round 1.24 to the nearest tenth on a number line.", expect: { values: [1.2, 1.24, 1.3], rounding: { number: 1.24, result: 1.2 } } },
  { id: "RND-05", prompt: "Use a number line to round 85 to the nearest ten.", expect: { values: [80, 85, 90], rounding: { number: 85, result: 90 } } },
];
export const TRIAL_QUALITY_CASES = { number_line: NUMBER_LINE_QUALITY_CASES, number_line_compare: NUMBER_LINE_COMPARE_CASES, number_line_solution: NUMBER_LINE_SOLUTION_CASES, number_line_rounding: NUMBER_LINE_ROUNDING_CASES };

/** The requests each trial recipe fits. */
export const TRIAL_CASES = { constant_speed_motion: MOTION_CASES, number_line: NUMBER_LINE_CASES };
/**
 * The quality cases of every recipe a run offers, in the order named (run 9 took only the first recipe's,
 * so its comparing, solution-set and rounding cases never ran).
 */
export function qualityCasesFor(recipes) {
  return recipes.split(",").map((name) => name.trim()).filter(Boolean).flatMap((name) => TRIAL_QUALITY_CASES[name] ?? []);
}

/** Held-out requests the recipe does not fit (subject-routing-heldout.json). */
export const OTHER_CASE_IDS = ["HO-MA-01", "HO-PH-02", "HO-CH-01", "HO-BI-01", "HO-ES-01", "HO-MA-04", "HO-PH-04", "HO-CH-04", "HO-BI-04", "HO-ES-04"];

/**
 * What a first part's number line shows, for judging quality alongside speed:
 * the range, ticks, hops, start and end. Undefined when it has none.
 */
export function numberLineInPart(part) {
  const write = (part.steps ?? []).flatMap((step) => step.beats ?? []).flatMap((beat) => beat.actions ?? [])
    .find((action) => action.do === "write" && action.kind === "number_line");
  if (!write) return undefined;
  const { range, ticks, jumps = [], points = [], bindings = [] } = write.content ?? {};
  // The sliders behind the start and the change, so a check can see which answers a learner can reach.
  const slider = (target) => {
    const name = bindings.find((binding) => binding.target === target)?.expression?.trim();
    const variable = (part.lesson?.variables ?? []).find((candidate) => candidate.as === name);
    return variable ? { min: variable.min, max: variable.max, initial: variable.initial, step: variable.control?.step ?? null } : null;
  };
  return {
    span: range ? range.max - range.min : null, range: range ?? null,
    subdivisions: ticks?.subdivisions ?? 1, step: ticks?.step ?? null,
    hops: jumps[0]?.hops ?? null, by: jumps[0]?.by ?? null,
    start: points.find((point) => point.as === "start")?.value ?? null,
    end: points.find((point) => point.as === "end")?.value ?? null,
    start_slider: slider("start.value"), change_slider: slider("move.by"),
  };
}

/** A first part's number line, with what drives it: the card, the variables, animations and tasks. */
export function numberLineLesson(part) {
  const actions = (part.steps ?? []).flatMap((step) => step.beats ?? []).flatMap((beat) => beat.actions ?? []);
  const write = actions.find((action) => action.do === "write" && action.kind === "number_line");
  if (!write) return undefined;
  // What the lesson does to the line, in order: animations change values, and emphasis on one of the
  // line's parts ("line#end") shows a point that is shown only when emphasized; emphasis "none" hides it
  // again. That is what the runtime does: `emphasize` becomes board.emphasize, whose state the number
  // line's styles use; `point` (teacher.point) and `focus` (board.focus) leave a hidden point hidden
  // (review of #63, checked in Chromium playback).
  const partOf = (target) => (typeof target === "string" && target.startsWith(`${write.as}#`) ? target.slice(write.as.length + 1) : undefined);
  const sequence = actions.flatMap((action) => {
    if (action.do === "animate") return [{ kind: "animate", variable: action.variable, value: action.value }];
    const part = action.do === "emphasize" ? partOf(action.target) : undefined;
    return part ? [{ kind: action.emphasis === "none" ? "hide" : "reveal", part }] : [];
  });
  return {
    content: write.content, variables: part.lesson?.variables ?? [], tasks: part.lesson?.tasks ?? [],
    animations: actions.filter((action) => action.do === "animate").map((action) => [action.variable, action.value]),
    sequence,
  };
}

const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a));

/** A binding's value at given variable values: arithmetic and OLL's floor, round, ceil and abs. */
export function evaluateExpression(expression, values) {
  const text = String(expression)
    .replace(/[a-z][a-z0-9_]*/gu, (name) => (["floor", "round", "ceil", "abs"].includes(name) ? `Math.${name}` : name in values ? `(${values[name]})` : "NaN"));
  return /^(?:[-+*/().\d\seNa,]|Math\.(?:floor|round|ceil|abs))+$/u.test(text) ? Number(Function(`"use strict"; return (${text});`)()) : Number.NaN;
}

/**
 * The states a lesson puts its number line in: every combination of each variable's starting
 * value, animation targets and practice targets, with each point's value in that state.
 */
export function numberLineStates({ content, variables, tasks, animations }) {
  const values = new Map(variables.map((variable) => [variable.as, [variable.initial]]));
  for (const [variable, value] of animations) values.get(variable)?.push(value);
  for (const task of tasks) {
    const completion = task.completion ?? {};
    if (completion.kind === "expression_target" && values.has(String(completion.expression).trim())) values.get(String(completion.expression).trim()).push(completion.value);
  }
  let states = [{}];
  for (const [name, list] of values) states = states.flatMap((state) => [...new Set(list)].map((value) => ({ ...state, [name]: value })));
  const evaluate = (expression, state) => evaluateExpression(expression, state);
  const fraction = (value) => (typeof value === "string" && value.includes("/") ? value.trim().split(/\s+/u).reduce((sum, piece) => {
    const [top, bottom] = piece.split("/").map(Number);
    return bottom ? sum + Math.sign(sum || top) * Math.abs(top) / bottom : sum + Number(piece);
  }, 0) : Number(value));
  return states.map((state) => Object.fromEntries((content.points ?? []).map((point) => {
    const binding = (content.bindings ?? []).find((entry) => entry.target === `${point.as}.value`);
    return [point.as, binding ? evaluate(binding.expression, state) : fraction(point.value)];
  })));
}

/** The variables' values in each state the lesson shows: the starting values, then after each animation. */
function variableStates({ variables, animations, sequence: steps }) {
  let current = Object.fromEntries(variables.map((variable) => [variable.as, variable.initial]));
  const states = [current];
  for (const step of steps ?? animations.map(([variable, value]) => ({ kind: "animate", variable, value }))) {
    if (step.kind !== "animate") continue;
    current = { ...current, [step.variable]: step.value };
    states.push(current);
  }
  return states;
}

/** A line's solution-set pieces at one state: each interval's ends (null: a ray runs on) and which ends are included. */
export function solutionPieces(content, values) {
  const evaluate = (expression) => evaluateExpression(expression, values);
  const fraction = (value) => (typeof value === "string" && value.includes("/") ? value.trim().split("/").map(Number).reduce((a, b) => a / b) : Number(value));
  const end = (interval, side) => {
    if (interval[side] === null || interval[side] === undefined) return null;
    const binding = (content.bindings ?? []).find((entry) => entry.target === `${interval.as}.${side}`);
    return binding ? evaluate(binding.expression) : fraction(interval[side]);
  };
  return (content.intervals ?? []).map((interval) => ({
    from: end(interval, "from"), to: end(interval, "to"),
    fromClosed: interval.from_closed ?? true, toClosed: interval.to_closed ?? true,
  }));
}

/** The points' values in each state the lesson shows: the starting values, then after each animation. */
export function lessonShownStates({ content, variables, animations, sequence: steps }) {
  // Review of #63: a point shown only when emphasized counts only once something reveals it, so an
  // answer kept hidden throughout does not satisfy "3/4 is shown".
  const latent = new Set((content.points ?? []).filter((point) => point.shown === "when_emphasized").map((point) => point.as));
  const revealed = new Set();
  const sequence = [];
  let current = Object.fromEntries(variables.map((variable) => [variable.as, variable.initial]));
  const pointsAt = (values) => {
    const all = numberLineStates({ content, variables: Object.entries(values).map(([as, initial]) => ({ as, initial })), tasks: [], animations: [] })[0];
    return Object.fromEntries(Object.entries(all).filter(([as]) => !latent.has(as) || revealed.has(as)));
  };
  sequence.push(pointsAt(current));
  for (const step of steps ?? animations.map(([variable, value]) => ({ kind: "animate", variable, value }))) {
    if (step.kind === "animate") current = { ...current, [step.variable]: step.value };
    else if (step.kind === "reveal") revealed.add(step.part);
    else revealed.delete(step.part);
    sequence.push(pointsAt(current));
  }
  return sequence;
}

/**
 * Judges one number line against its case's expectations (set before the run):
 * - hard: compiled; every value the question names is shown by a point in some state; the asked-for
 *   change is reachable (by an animation, or on the slider's grid from its minimum); and every visible point, in every state, sits on a tick the label policy
 *   labels, so its number is drawn (OLL draws a labelled tick under a point even when labels thin);
 * - hard, too: a question written in decimals is labelled in decimals, and no practice task is already
 *   met when the lesson ends;
 * - soft: the parts per unit, and for integer questions a span of at most 24 units with hops.
 * Returns the lists of misses, empty when it passes.
 */
export function judgeNumberLine(item, lesson) {
  const hard = [], soft = [];
  if (item.nearMiss && !lesson) return { hard: [], soft };
  if (!lesson) return { hard: ["no number line"], soft };
  if (lesson.error) return { hard: [`compile error: ${String(lesson.error).slice(0, 80)}`], soft };
  const { content, variables, animations } = lesson;
  const states = numberLineStates(lesson);
  const expect = item.expect ?? {};
  // What the lesson itself shows: its starting values, then each animation in order. A practice
  // target is the learner's to reach, not something the lesson shows (run 6: a line that showed
  // 0 − 8 throughout would have passed "5 − 8" on the task's target alone).
  const shownStates = lessonShownStates(lesson);
  // A solution set's interval and ray ends are values the lesson shows too (decision 0016).
  const endStates = variableStates(lesson).map((values) => Object.fromEntries(solutionPieces(content, values)
    .flatMap((piece, index) => [[`set${index}.from`, piece.from], [`set${index}.to`, piece.to]]).filter(([, end]) => end !== null)));
  for (const value of expect.values ?? []) {
    if (![...shownStates, ...endStates].some((state) => Object.values(state).some((shown) => close(shown, value)))) {
      hard.push(`wrong value: ${Number(value.toFixed(4))} is never shown (points: ${[...new Set(shownStates.flatMap((state) => Object.values(state)).map((shown) => Number(shown.toFixed(4))))].join(", ")})`);
    }
  }
  if (expect.change !== undefined) {
    const name = String((content.bindings ?? []).find((binding) => binding.target === "move.by")?.expression ?? "").trim();
    const change = variables.find((variable) => variable.as === name);
    const animated = animations.filter(([variable]) => variable === name).map(([, value]) => value);
    // A slider reaches its minimum plus whole steps; the fit may have coarsened the step (1 to 5).
    const step = change?.control?.step;
    const onSlider = change && change.min - 1e-9 <= expect.change && expect.change <= change.max + 1e-9
      && (!step || close(Math.round((expect.change - change.min) / step) * step + change.min, expect.change));
    if (!change || !(onSlider || animated.some((value) => close(value, expect.change)))) hard.push(`cannot reach ${expect.change}`);
  }
  // A practice task the learner finds already met (the lesson ended where the task points) has nothing to do.
  const atEnd = new Map(variables.map((variable) => [variable.as, variable.initial]));
  for (const [variable, value] of animations) atEnd.set(variable, value);
  for (const task of lesson.tasks ?? []) {
    const completion = task.completion ?? {};
    const name = String(completion.expression ?? "").trim();
    if (completion.kind === "expression_target" && atEnd.has(name) && Math.abs(atEnd.get(name) - completion.value) <= (completion.tolerance ?? 0)) {
      hard.push(`practice task already met when it starts (${name} ends at ${Number(atEnd.get(name).toFixed(4))})`);
    }
  }
  // A solution set (decision 0016): some state the lesson shows draws exactly the expected pieces, each
  // end open or included as expected, and no filled point sits on an end left open.
  if (expect.solution) {
    const sameEnd = (a, b) => (a === null || b === null ? a === b : close(a, b));
    const matches = (pieces) => pieces.length === expect.solution.length && expect.solution.every((want) => pieces.some((piece) =>
      sameEnd(piece.from, want.from ?? null) && sameEnd(piece.to, want.to ?? null)
      && (want.from === null || want.from === undefined || piece.fromClosed === Boolean(want.fromClosed))
      && (want.to === null || want.to === undefined || piece.toClosed === Boolean(want.toClosed))));
    const states = variableStates(lesson);
    const drawn = states.map((values) => solutionPieces(content, values));
    if (!drawn.some(matches)) {
      const describe = (pieces) => pieces.map((piece) => `${piece.from === null ? "−∞" : `${piece.fromClosed ? "[" : "("}${Number(piece.from.toFixed(4))}`}, ${piece.to === null ? "+∞" : `${Number(piece.to.toFixed(4))}${piece.toClosed ? "]" : ")"}`}`).join(" ∪ ") || "nothing";
      hard.push(`wrong solution set: expected ${describe(expect.solution.map((want) => ({ from: want.from ?? null, to: want.to ?? null, fromClosed: Boolean(want.fromClosed), toClosed: Boolean(want.toClosed) })))}, drawn ${describe(drawn.at(-1) ?? [])}`);
    }
    const openEnds = expect.solution.flatMap((want) => [want.from !== null && want.from !== undefined && !want.fromClosed ? want.from : undefined, want.to !== null && want.to !== undefined && !want.toClosed ? want.to : undefined]).filter((value) => value !== undefined);
    const filled = (content.points ?? []).filter((point) => point.style !== "open" && point.shown !== "when_emphasized");
    for (const state of lessonShownStates(lesson)) {
      for (const point of filled) if (openEnds.some((value) => state[point.as] !== undefined && close(state[point.as], value))) hard.push(`a filled point sits on the open end ${state[point.as]}`);
    }
  }
  // Rounding (decision 0016): some state the lesson shows jumps from the number being rounded to the
  // expected result. Both ends count: a jump from 40 to 50 beside a point at 47 rounds nothing (review of #69).
  if (expect.rounding) {
    const jumps = variableStates(lesson).flatMap((values) => {
      const points = numberLineStates({ content, variables: Object.entries(values).map(([as, initial]) => ({ as, initial })), tasks: [], animations: [] })[0];
      return (content.jumps ?? []).map((jump) => {
        const bound = (side) => (content.bindings ?? []).find((entry) => entry.target === `${jump.as}.${side}`);
        const from = typeof jump.from === "string" && jump.from in points ? points[jump.from] : bound("from") ? evaluateExpression(bound("from").expression, values) : Number(jump.from);
        const by = bound("by") ? evaluateExpression(bound("by").expression, values) : Number(jump.by);
        return { from, to: from + by };
      });
    });
    const { number, result } = expect.rounding;
    if (!jumps.some((jump) => close(jump.from, number) && close(jump.to, result))) {
      const drawn = [...new Set(jumps.map((jump) => `${Number(jump.from.toFixed(6))} → ${Number(jump.to.toFixed(6))}`))].join(", ") || "none";
      hard.push(`wrong rounding: no jump from ${number} to ${result} (jumps: ${drawn})`);
    }
  }
  const labelled = planNumberLineTicks(content).filter((tick) => tick.label).map((tick) => tick.value);
  const visible = new Set((content.points ?? []).filter((point) => point.shown !== "when_emphasized").map((point) => point.as));
  const unreadable = new Set();
  for (const state of states) for (const [as, value] of Object.entries(state)) {
    if (visible.has(as) && !labelled.some((tick) => close(tick, value))) unreadable.add(`${as} at ${Number(value.toFixed(4))}`);
  }
  for (const state of endStates) for (const [end, value] of Object.entries(state)) {
    if (!labelled.some((tick) => close(tick, value))) unreadable.add(`${end} at ${Number(value.toFixed(4))}`);
  }
  if (unreadable.size) hard.push(`unreadable: ${[...unreadable].join(", ")} on no labelled tick`);
  const parts = content.ticks?.subdivisions ?? 1;
  if (expect.parts && parts !== expect.parts) soft.push(`${parts} parts, not ${expect.parts}`);
  // Labels are fractions unless the card asks otherwise (OLL's default for split units). A line with
  // whole-number ticks only labels integers, which read the same either way.
  const format = content.ticks?.format ?? (parts > 1 ? "fraction" : "integer");
  if (expect.format === "decimal" && format === "fraction") hard.push("labels as fractions, the question writes decimals");
  if (expect.integer) {
    const span = content.range.max - content.range.min;
    if (span > 24) soft.push(`${span} units wide`);
    if (!(content.jumps ?? [])[0]?.hops) soft.push("no hops");
  }
  return { hard, soft };
}

/** The recipes whose builder output the first playable part contains. */
export function recipesInPart(part) {
  const actions = (part.steps ?? []).flatMap((step) => step.beats ?? []).flatMap((beat) => beat.actions ?? []);
  const writes = actions.filter((action) => action.do === "write");
  const found = [];
  const motion = writes.some((action) => action.kind === "geometry" && String(action.as).endsWith("-track")
    && (action.content?.points ?? []).some((point) => point.as === "object"));
  if (motion) found.push("constant_speed_motion");
  // The number-line family (decision 0016): a comparison draws points "first" and "second"; the
  // start-plus-move line draws "start" (and "end").
  for (const write of writes.filter((action) => action.kind === "number_line")) {
    const points = new Set((write.content?.points ?? []).map((point) => point.as));
    found.push((write.content?.intervals ?? []).length ? "number_line_solution"
      : points.has("first") && points.has("second") ? "number_line_compare"
        : points.has("lower") && points.has("upper") ? "number_line_rounding" : "number_line");
  }
  return found;
}

const median = (values) => {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * The owner's rule for run 5 (2026-11-11, option B): the program may cause no hard miss; the model
 * may slip once, and never twice on the same request. Whether a miss is the model's is read by hand
 * from its raw reply, so one miss is "review", not "pass"; near misses are always read by hand.
 */
export function slipVerdict(judged) {
  const misses = judged.filter((row) => row.quality.hard.length);
  const byCase = new Map();
  for (const row of misses) byCase.set(row.case, (byCase.get(row.case) ?? 0) + 1);
  const repeated = [...byCase].filter(([, count]) => count > 1).map(([id]) => id);
  if (repeated.length) return { result: "fail", reason: `the same request missed more than once: ${repeated.join(", ")}` };
  if (misses.length > 1) return { result: "fail", reason: `${misses.length} hard misses; at most one model slip is allowed` };
  if (misses.length === 1) return { result: "review", reason: `one hard miss (${misses[0].case}): it passes only if its raw reply shows the model's slip, not the program's` };
  return { result: "pass", reason: "no hard misses" };
}

/**
 * How many times the quality cases run: as given, else once, except in other-only mode (--other-cases),
 * which measures speed on requests the recipes do not fit and runs no quality cases unless asked
 * (review of #73: run 10's documented command would otherwise have spent its budget on them).
 */
export function qualityRepeats(given, otherOnly) {
  return given !== undefined ? Number(given) : otherOnly ? 0 : 1;
}

/** Thinking tokens of a turn's first model call (the bootstrap), from the last usage record the provider streamed. */
export function firstCallThoughts(raw) {
  const usage = raw.split("\n").filter((line) => line.includes("lesson-plan-bootstrap") && line.includes("usageMetadata")).at(-1);
  if (!usage) return undefined;
  return Number(usage.match(/"thoughtsTokenCount":(\d+)/u)?.[1] ?? 0);
}

/**
 * The speed rule (owner, 2026-11-12): requests the new recipe fits and requests it does not are judged on
 * their own, each by its paired median (candidate minus baseline) at most +0.5 s. One median over both
 * hid a loss on the requests that do not use the recipe behind a gain on those that do (runs 9 and 9b).
 * A group with no pairs (an other-only run) is not judged.
 */
export function speedVerdict(groups, planned = ["fitting", "other"], limitMs = 500) {
  const named = { fitting: groups.motion, other: groups.other };
  // A group the run planned but could not measure (every pair missing an arm, say a candidate that hit
  // the call cap) makes the verdict incomplete; only a group the run left out is skipped (review of #73).
  const unmeasured = planned.filter((name) => !named[name]?.complete_pairs);
  if (unmeasured.length) return { result: "incomplete", reason: unmeasured.map((name) => `no complete ${name} pairs`).join("; ") };
  const judged = planned.map((name) => [name, named[name]]);
  const over = judged.filter(([, group]) => group.paired_difference_ms.median > limitMs);
  return over.length
    ? { result: "fail", reason: over.map(([name, group]) => `${name} requests +${Math.round(group.paired_difference_ms.median)} ms over +${limitMs} ms`).join("; ") }
    : { result: "pass", reason: judged.map(([name, group]) => `${name} requests ${Math.round(group.paired_difference_ms.median)} ms`).join("; ") };
}

export function summarize(rows) {
  const group = (filter, candidate = "candidate") => {
    const ok = (arm) => rows.filter((row) => filter(row) && row.arm === arm && row.outcome === "first_playable");
    const pairs = new Map();
    for (const row of rows.filter((entry) => filter(entry) && entry.outcome === "first_playable")) pairs.set(row.pair, { ...pairs.get(row.pair), [row.arm]: row.first_playable_ms });
    const differences = [...pairs.values()].filter((pair) => pair.baseline !== undefined && pair[candidate] !== undefined).map((pair) => pair[candidate] - pair.baseline);
    const mean = differences.length ? differences.reduce((sum, value) => sum + value, 0) / differences.length : null;
    const sd = differences.length > 1 ? Math.sqrt(differences.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (differences.length - 1)) : null;
    const se = sd !== null ? sd / Math.sqrt(differences.length) : null;
    return {
      complete_pairs: differences.length,
      p50_first_playable_ms: { baseline: median(ok("baseline").map((row) => row.first_playable_ms)), candidate: median(ok(candidate).map((row) => row.first_playable_ms)) },
      p50_prompt_tokens: { baseline: median(ok("baseline").map((row) => row.prompt_tokens)), candidate: median(ok(candidate).map((row) => row.prompt_tokens)) },
      paired_difference_ms: { median: median(differences), mean, ci95: se !== null ? [mean - 1.96 * se, mean + 1.96 * se] : null },
      candidate_used_trial_recipe: ok(candidate).filter((row) => row.recipes?.length).length,
      thinking_turns: Object.fromEntries(["baseline", candidate].map((arm) => {
        const counted = ok(arm).filter((row) => row.first_call_thoughts !== undefined);
        return [arm, `${counted.filter((row) => row.first_call_thoughts > 0).length}/${counted.length}`];
      })),
      errors: rows.filter((row) => filter(row) && row.outcome !== "first_playable").length,
    };
  };
  // Quality, for recipes whose cases carry expectations: hard misses block, soft ones are reported.
  const judged = rows.filter((row) => row.arm === "candidate" && row.quality);
  const quality = judged.length ? {
    judged: judged.length,
    hard_pass: judged.filter((row) => !row.quality.hard.length).length,
    hard_misses: judged.filter((row) => row.quality.hard.length).map((row) => ({ case: row.case, hard: row.quality.hard, ...(row.quality.review ? { review: row.quality.review } : {}) })),
    soft_misses: judged.filter((row) => row.quality.soft.length).map((row) => ({ case: row.case, soft: row.quality.soft })),
    near_misses_for_review: rows.filter((row) => row.kind === "near_miss" && row.arm === "candidate").map((row) => ({ case: row.case, recipes: row.recipes ?? null })),
    verdict: slipVerdict(judged),
  } : undefined;
  // Speed is measured on the pairs only; quality cases run on one arm and would skew the medians.
  const groups = { all: group((row) => row.kind === "motion" || row.kind === "other"), motion: group((row) => row.kind === "motion"), other: group((row) => row.kind === "other") };
  // A third arm (--previous-build): the same recipes from an earlier build, against the same baseline.
  const previous = rows.some((row) => row.arm === "previous") ? { previous: { motion: group((row) => row.kind === "motion", "previous"), other: group((row) => row.kind === "other", "previous") } } : {};
  // The groups a run planned are the kinds its speed pairs carry, whatever their outcome.
  const planned = [["motion", "fitting"], ["other", "other"]].filter(([kind]) => rows.some((row) => row.kind === kind)).map(([, name]) => name);
  return { ...groups, ...previous, speed: speedVerdict(groups, planned), ...(quality ? { quality } : {}) };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
  const pairs = Number(option("--pairs", "20"));
  const maxCalls = Number(option("--max-calls", "60"));
  const recipes = option("--recipes", "constant_speed_motion");
  const build = resolve(option("--build", root));
  const profilePath = option("--octos-profile");
  const out = option("--out");
  if (!profilePath) throw new Error("--octos-profile is required");
  const routeEnv = await profileRouteEnvironment(profilePath);
  const heldOut = new Map(JSON.parse(await readFile(join(root, "eval/subject-routing-heldout.json"), "utf8")).cases.map((item) => [item.id, item]));
  const fitting = TRIAL_CASES[recipes.split(",")[0].trim()];
  if (!fitting) throw new Error(`no fitting requests for trial recipe '${recipes}'`);
  // "motion" marks requests the trial recipe fits, whichever recipe that is.
  // --other-cases HO-MA-01,M01-linear-system-question,…: speed pairs on requests the recipes do not fit only
  // (held-out routing cases or natural math cases), to measure what offering the recipes costs them.
  const naturalMath = new Map(JSON.parse(await readFile(join(root, "testsuite/math-natural-course-cases.json"), "utf8")).cases.map((item) => [item.id, item]));
  const otherIds = option("--other-cases")?.split(",").map((id) => id.trim()).filter(Boolean);
  const cases = otherIds
    ? otherIds.map((id) => {
      const item = heldOut.get(id) ?? naturalMath.get(id);
      if (!item) throw new Error(`no held-out or natural math case '${id}'`);
      return { ...item, kind: "other" };
    })
    : fitting.flatMap((fit, index) => [{ ...fit, kind: "motion" }, { ...heldOut.get(OTHER_CASE_IDS[index]), kind: "other" }]);
  // --previous-build <dir>: a third arm, the same recipes from an earlier build (for example the wording
  // before a rewrite), interleaved with the other two so the three share the same time window.
  const previousBuild = option("--previous-build") ? resolve(option("--previous-build")) : undefined;
  // Quality cases run once each, candidate arm only, after the speed pairs.
  // A probe (--cases NL-03,NM-01) runs only the named cases, on the candidate arm, with no speed pairs:
  // a cheap first look at how the model meets a change, before any gate run.
  const probeIds = option("--cases")?.split(",").map((id) => id.trim()).filter(Boolean);
  // Any case of any trial recipe can be probed (number_line,number_line_compare offers both).
  const allCases = [...Object.values(TRIAL_CASES).flat(), ...Object.values(TRIAL_QUALITY_CASES).flat()];
  const qualityCases = (probeIds ? probeIds.map((id) => {
    const item = allCases.find((entry) => entry.id === id);
    if (!item) throw new Error(`no case '${id}'`);
    return item;
  }) : qualityCasesFor(recipes)).map((item) => ({ ...item, kind: item.nearMiss ? "near_miss" : "quality" }));
  const workDir = await mkdtemp(join(tmpdir(), "coach-trial-"));
  // Coach logs each raw model reply, which the harness keeps beside the run's compiled parts, so a
  // later fit can be replayed against what the model actually wrote at no cost.
  const env = { ...process.env, ...routeEnv, OCTOS_WORK_DIR: workDir, OLL_DEBUG_GENERATION: "1" };
  delete env.LEARNING_COACH_TRIAL_RECIPES;
  const route = { provider: routeEnv.OCTOS_PROFILE_LLM_PROVIDER, model: routeEnv.OCTOS_PROFILE_LLM_MODEL };
  const budget = { remaining: maxCalls };
  const rows = [];
  const notRun = [];
  const persist = async () => {
    if (!out) return;
    await mkdir(dirname(resolve(out)), { recursive: true });
    // The compiled first parts stay in work_dir after the run, as evidence of what each lesson drew.
    await writeFile(resolve(out), `${JSON.stringify({ measured_at: new Date().toISOString(), ...route, trial_recipes: recipes, pairs, max_calls: maxCalls, work_dir: workDir, summary: { ...summarize(rows), ...(notRun.length ? { not_run: notRun } : {}) }, rows }, null, 1)}\n`);
  };
  console.error(JSON.stringify({ stage: "trial-recipe-speed", ...route, trial_recipes: recipes, pairs, max_calls: maxCalls }));
  const { appendFileSync, readFileSync } = await import("node:fs");
  const runOne = async (pair, item, arm, order) => {
    const input = { turn_id: `trial-${pair}-${arm}-${Date.now()}`, learner_request: item.prompt, request_source: "self_contained", language: caseLanguage(item), input_modality: "text" };
    const tool = await runTool({
      build: arm === "previous" ? previousBuild : build, input, env: arm === "baseline" ? env : { ...env, LEARNING_COACH_TRIAL_RECIPES: recipes },
      maxCalls: Math.min(3, budget.remaining), onCall: () => { budget.remaining -= 1; },
      onRaw: (line) => appendFileSync(join(workDir, `${input.turn_id}.raw-model.txt`), `${line}\n`),
      onFirstPart: (path) => {
        try {
          const part = JSON.parse(readFileSync(path, "utf8"));
          const line = numberLineInPart(part);
          const judged = arm === "candidate" && item.expect ? { quality: judgeNumberLine(item, numberLineLesson(part)) } : {};
          return { recipes: recipesInPart(part), ...(line ? { number_line: line } : {}), ...judged };
        } catch { return { recipes: null }; }
      },
    });
    const { first_part_path: _path, ...kept } = tool;
    const row = { pair, case: item.id, kind: item.kind, arm, order: order.indexOf(arm), ...kept };
    // The first call's thinking tokens, from its last usage record (runs 9 and 9b: offering the recipes
    // made the model think more often on requests they do not fit).
    try { row.first_call_thoughts = firstCallThoughts(readFileSync(join(workDir, `${input.turn_id}.raw-model.txt`), "utf8")); } catch { /* no reply kept */ }
    // A case with expectations that produced no judged part is a hard miss, never a silent gap.
    if (arm === "candidate" && item.expect && !row.quality) row.quality = { hard: [`not judged: ${row.outcome}`], soft: [] };
    // The run stops at the first playable part, so the judge sees only the first section; when the
    // outline has more, a later section may show what the first lacks, and the miss is read by hand.
    if (row.quality?.hard.length && row.sections > 1) row.quality.review = "later sections not judged: read by hand";
    if (arm === "candidate" && item.nearMiss && (row.recipes ?? []).includes("number_line")) row.quality = { ...(row.quality ?? { hard: [], soft: [] }), review: "near miss drew a number line: read by hand" };
    rows.push(row);
    console.error(JSON.stringify({ pair, case: item.id, kind: item.kind, arm, outcome: row.outcome, ms: row.first_playable_ms, calls: row.calls, recipes: row.recipes ?? null, ...(row.quality ? { hard: row.quality.hard } : {}) }));
    await persist();
  };
  for (let pair = 0; pair < pairs && budget.remaining > 0; pair += 1) {
    const item = cases[pair % cases.length];
    // Two arms alternate which goes first; three cycle through all six orders.
    const order = previousBuild
      ? [["baseline", "candidate", "previous"], ["candidate", "previous", "baseline"], ["previous", "baseline", "candidate"], ["baseline", "previous", "candidate"], ["previous", "candidate", "baseline"], ["candidate", "baseline", "previous"]][pair % 6]
      : Math.floor(pair / 2) % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
    for (const arm of order) {
      if (budget.remaining <= 0) break;
      await runOne(pair, item, arm, order);
    }
  }
  const repeats = qualityRepeats(option("--quality-repeats"), Boolean(otherIds));
  const queue = Array.from({ length: repeats }, () => qualityCases).flat();
  for (const [index, item] of queue.entries()) {
    if (budget.remaining <= 0) break;
    // Near misses run on both arms, alternating which goes first, so a lesson can be read against
    // what the same request gets without the recipe.
    const arms = item.nearMiss && !probeIds ? (index % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) : ["candidate"];
    for (const arm of arms) if (budget.remaining > 0) await runOne(pairs + index, item, arm, arms);
  }
  // Every planned case must have run: a budget that ran out is reported, not passed over.
  const ran = rows.filter((row) => row.arm === "candidate").length;
  const planned = pairs + queue.length;
  // (Baseline near-miss runs are extra and not counted against the candidate plan.)
  notRun.push(...(ran < planned ? [`${planned - ran} candidate runs did not run (budget ${maxCalls} calls)`] : []));
  await persist();
  console.log(JSON.stringify({ ...summarize(rows), ...(notRun.length ? { not_run: notRun } : {}) }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
