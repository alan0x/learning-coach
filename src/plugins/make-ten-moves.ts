// How the make-ten card's lesson numbers change (OLL decision 0027, need K2N-19): making ten to add on two ten
// frames. The card has six lesson numbers, in order: the question's pair, a practice pair, the count in the bigger
// addend's frame (`filled`, which starts at the bigger addend: the program supplies it) and the count the learner
// moves (`moved`, 0: the program supplies it). The demonstration moves only `filled`: forward a whole number at a
// time, up to 10, the card moving one counter for each. These rules are pure, so the compiler, the model's section
// facts and the judge agree on every value; the card's own rules (the pair it takes, the row) are OLL's.
import { MAKE_TEN_PLACES, makeTenFault, makeTenFaultText, makeTenFreshCount } from "octos-lesson-language/plugin-math";

/** The card's six lesson numbers, by position. */
export const MAKE_TEN_NUMBER = { first: 0, second: 1, practiceFirst: 2, practiceSecond: 3, filled: 4, moved: 5 } as const;

/** The pair's sum, as the row's last blank and the practice's answer hold it. */
export const makeTenSum = (a: number, b: number): number => a + b;

/**
 * Why the card cannot start on these lesson numbers ([first, second, practice first, practice second, filled,
 * moved]), or undefined. Every fault OLL would refuse at the card is found here first, so the compiler names the
 * card and a section whose repairs are spent on it loses the picture, not the lesson.
 */
export function makeTenStartFault(values: readonly number[]): string | undefined {
  if (values.length !== 6) {
    return "the card takes six lesson numbers, in order: the first number, the second number, the practice pair's two numbers (another pair, for the learner), the count in the bigger number's frame (the bigger number at the start) and the count moved (0)";
  }
  const [a, b, pa, pb, filled, moved] = values as [number, number, number, number, number, number];
  const fault = makeTenFault(a, b);
  if (fault) return `the question's pair: ${makeTenFaultText(fault, a, b)}`;
  const practiceFault = makeTenFault(pa, pb);
  if (practiceFault) return `the practice pair: ${makeTenFaultText(practiceFault, pa, pb)}`;
  if ((pa === a && pb === b) || (pa === b && pb === a)) {
    return "the practice pair is the learner's own: another pair than the question's (the same two numbers in the other order are the same pair), so the learner does not copy the demonstration";
  }
  if (filled !== makeTenFreshCount(a, b)) {
    return `the count in the bigger number's frame starts at the bigger number, ${makeTenFreshCount(a, b)}, not ${filled}: the frames start apart, nothing moved`;
  }
  if (moved !== 0) return `the count moved starts at 0, not ${moved}: only the learner's taps change it`;
  return undefined;
}

/**
 * The card's six lesson numbers as the program reads them: the four the model wrote, and the two counts where the
 * pair puts them (the bigger number, 0), whatever was declared for them. A number the card does not have stays missing.
 */
export function makeTenStartValues(values: readonly number[]): number[] {
  return values.map((value, position) => (position === MAKE_TEN_NUMBER.filled ? makeTenFreshCount(values[0]!, values[1]!) : position === MAKE_TEN_NUMBER.moved ? 0 : value));
}

/** The card's state when it is drawn: its six lesson numbers as it reads them (fresh: filled at the bigger number, moved 0). */
export function makeTenState(start: readonly number[]): number[] {
  const [a, b] = [start[0] ?? 0, start[1] ?? 0];
  return [...start.slice(0, 4), makeTenFreshCount(a, b), 0];
}

/** What the next value of the count in the bigger frame does, as the compiler's refusals and the facts say it. */
export function makeTenNext(a: number, b: number, filled: number): string {
  const big = Math.max(a, b), small = a >= b ? b : a;
  return filled >= MAKE_TEN_PLACES ? `the ${big}'s frame holds ten at ${MAKE_TEN_PLACES}` : `the next value, ${filled + 1}, moves one of the ${small} into the ${big}'s frame`;
}

/** The state after the card's number at `position` is animated to `to`, or the reason the card cannot make that change. */
export function makeTenMove(state: readonly number[], position: number, to: number): number[] | string {
  if (position < 0 || position > MAKE_TEN_NUMBER.moved) return "the card has six lesson numbers";
  if (to === state[position]) return [...state];
  const [a, b] = [state[0]!, state[1]!];
  const start = makeTenFreshCount(a, b);
  if (position === MAKE_TEN_NUMBER.moved) return "the count moved changes only by the learner's taps: the demonstration moves the count in the bigger number's frame";
  if (position !== MAKE_TEN_NUMBER.filled) {
    return `the two numbers and the practice pair stay as written: the demonstration moves only the count in the bigger number's frame (the card's fifth lesson number), from ${start} up to ${MAKE_TEN_PLACES}, one counter at a time`;
  }
  const from = state[MAKE_TEN_NUMBER.filled]!;
  if (!Number.isInteger(to) || to < start || to > MAKE_TEN_PLACES) {
    return `the count in the bigger number's frame is a whole number from ${start} to ${MAKE_TEN_PLACES}, not ${to}; from ${from}, ${makeTenNext(a, b, from)}`;
  }
  if (to < from) return `the count in the bigger number's frame goes forward, never back: from ${from} it can be ${from} to ${MAKE_TEN_PLACES}; ${makeTenNext(a, b, from)}`;
  const moved = [...state];
  moved[MAKE_TEN_NUMBER.filled] = to;
  return moved;
}

/** Several animations of one card in one moment, applied in order; the states after each, or the first refusal. */
export function makeTenMoves(state: readonly number[], moves: ReadonlyArray<{ position: number; to: number }>):
  { steps: Array<{ position: number; from: number[]; to: number[] }>; ignored?: Array<{ index: number; position: number; reason: string }> } | { refused: { position: number; reason: string } } {
  const steps: Array<{ position: number; from: number[]; to: number[] }> = [];
  const ignored: Array<{ index: number; position: number; reason: string }> = [];
  let current = [...state];
  for (const [index, move] of moves.entries()) {
    // The pair and the practice pair never move: an animation of one is left out (and recorded by the compiler), not
    // refused, so no section's repairs are spent on it, as the times-ten card's are not (#188). A picture that shows
    // the pair has a copy of its own, and its moves are the copy's (design note "second example and copies", 2026-11-27).
    if (move.position >= MAKE_TEN_NUMBER.first && move.position <= MAKE_TEN_NUMBER.practiceSecond && move.to !== current[move.position]) {
      ignored.push({ index, position: move.position, reason: "the pair and the practice pair stay as written: the demonstration moves only the count in the bigger number's frame (the card's fifth lesson number)" });
      continue;
    }
    const result = makeTenMove(current, move.position, move.to);
    if (typeof result === "string") return { refused: { position: move.position, reason: result } };
    steps.push({ position: move.position, from: current, to: result });
    current = result;
  }
  return { steps, ...(ignored.length ? { ignored } : {}) };
}

const FULL_WIDTH = /[０-９＝]/gu;
const halfWidth = (text: string) => text.replace(FULL_WIDTH, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));

/**
 * Whether a task's words give away the practice's sum: a numeral that is the sum. The pair's own numbers are fine
 * to write (the card shows them); 10 is too (a ten frame holds ten, the point of the card).
 */
export function makeTenWordsGiveAnswer(words: string, sum: number): boolean {
  for (const match of halfWidth(String(words)).matchAll(/\d+/gu)) if (Number(match[0]) === sum) return true;
  return false;
}
