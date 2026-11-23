// How the trading mat's lesson numbers change (OLL decision 0023, rebuilt on the earlier components'
// pattern, 2026-11-23): the mat takes its pile from lesson numbers (loose ones, tens, and hundreds when
// the lesson has them), and the model moves them in its own timeline. A pile changes only by trades: ten
// ones become one ten, ten tens become one hundred. So an animation of the ones is a number of trades,
// and the tens follow by themselves. These rules are pure, so the compiler, the model's section facts and
// the judge agree on every value.

/** The most of each place the mat draws (OLL BASE_TEN_TRADE_LIMITS.drawn), and the most a pile starts with. */
export const BASE_TEN_DRAWN = [59, 34, 9] as const;
export const BASE_TEN_START = [59, 19, 9] as const;

const whole = (value: number) => Number.isInteger(value) && value >= 0;

/** A pile's value: its numbers are [ones, tens] or [ones, tens, hundreds]. */
export function baseTenValue(values: readonly number[]): number {
  return (values[0] ?? 0) + 10 * (values[1] ?? 0) + 100 * (values[2] ?? 0);
}

/** Three columns when the pile has hundreds or makes a hundred; else tens and ones (a hundreds number of 0 adds no column). */
export function baseTenColumns(values: readonly number[]): 2 | 3 {
  return (values[2] ?? 0) > 0 || baseTenValue(values) >= 100 ? 3 : 2;
}

/** Why a pile cannot start a mat, or undefined. */
export function baseTenStartFault(values: readonly number[]): string | undefined {
  if (values.length < 2 || values.length > 3) return "the mat takes two or three lesson numbers: the loose ones, the tens, and the hundreds when the question has them";
  const names = ["loose ones", "tens", "hundreds"];
  for (const [p, value] of values.entries()) {
    if (!whole(value)) return `the ${names[p]} are a whole number (0 when the question has none)`;
    if (value > BASE_TEN_START[p]!) return `a pile starts with at most ${BASE_TEN_START[p]} ${names[p]}`;
  }
  const value = baseTenValue(values);
  if (value > 999) return "after trading a pile has at most 9 hundreds (999)";
  if (value < 10) return `a pile of ${value} has no ten to make: the mat is for numbers of ten or more`;
  return undefined;
}

/**
 * The mat's state for a starting pile: one count per column. A pile of tens and ones that makes a hundred
 * gets a hundreds column of its own, starting at 0, though the lesson has no number for it.
 */
export function baseTenState(start: readonly number[]): number[] {
  return baseTenColumns(start) === 3 ? [start[0] ?? 0, start[1] ?? 0, start[2] ?? 0] : [start[0] ?? 0, start[1] ?? 0];
}

/**
 * The state after its count at `position` (0 ones, 1 tens, 2 hundreds) is animated to `to`; or the reason
 * the mat cannot make that change. A move to the value already there changes nothing.
 */
export function baseTenMove(state: readonly number[], position: number, to: number): number[] | string {
  const next = [...state];
  const from = state[position];
  if (from === undefined) return "the mat has no such number";
  if (to === from) return next;
  if (!whole(to)) return "blocks are counted in whole numbers";
  const reachable = Array.from({ length: Math.floor(from / 10) }, (_, k) => from - 10 * (k + 1));
  if (position === 0) {
    if (to > from) return `the loose ones only go down, ten at a time, as they are traded for tens: they are ${from} now`;
    if ((from - to) % 10 !== 0) {
      return reachable.length ? `the loose ones go down by tens (each ten ones become one ten): from ${from} they can be ${reachable.join(" or ")}` : `there are only ${from} loose ones: no ten to trade`;
    }
    const tens = state[1]! + (from - to) / 10;
    if (tens > (state.length === 2 ? 9 : BASE_TEN_DRAWN[1])) return `the mat cannot hold ${tens} tens`;
    next[0] = to;
    next[1] = tens;
    return next;
  }
  if (position === 1) {
    if (to > from) return `the tens rise by themselves when ones are traded: animate the loose ones down by tens, and the tens follow (they are ${from} now)`;
    if (state.length === 2) return "this mat has tens and ones only: the tens are not traded";
    if ((from - to) % 10 !== 0) {
      return reachable.length ? `the tens go down by tens (each ten tens become one hundred): from ${from} they can be ${reachable.join(" or ")}` : `there are only ${from} tens: no hundred to make`;
    }
    const hundreds = state[2]! + (from - to) / 10;
    if (hundreds > BASE_TEN_DRAWN[2]) return `the mat cannot hold ${hundreds} hundreds`;
    next[1] = to;
    next[2] = hundreds;
    return next;
  }
  return `the hundreds rise by themselves when tens are traded: animate the tens down by tens (the hundreds are ${from} now)`;
}

/**
 * Several animations of one mat in one moment, applied lowest place first whatever order they were
 * written in: "tens to 11" beside "ones to 6" is the same teaching step, and the tens only reach 11 once
 * the ones are traded. Returns the state after each move, in the order applied, or the first refusal.
 */
export function baseTenMoves(state: readonly number[], moves: ReadonlyArray<{ position: number; to: number }>):
  { steps: Array<{ position: number; from: number[]; to: number[] }> } | { refused: { position: number; reason: string } } {
  const steps: Array<{ position: number; from: number[]; to: number[] }> = [];
  let current = [...state];
  for (const move of [...moves].sort((a, b) => a.position - b.position)) {
    const result = baseTenMove(current, move.position, move.to);
    if (typeof result === "string") return { refused: { position: move.position, reason: result } };
    steps.push({ position: move.position, from: current, to: result });
    current = result;
  }
  return { steps };
}

/** The state with every trade made: no place below the highest holds ten or more. */
export function baseTenTraded(state: readonly number[]): number[] {
  const value = baseTenValue(state);
  return state.length === 3 ? [value % 10, Math.floor(value / 10) % 10, Math.floor(value / 100)] : [value % 10, Math.floor(value / 10)];
}
