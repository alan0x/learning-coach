// How the place-value compare card's lesson numbers change (OLL decision 0029, need 35P-06): comparing two numbers by
// place, from the largest place down. The card has five lesson numbers, in order, named by role as the model sees
// them: the two numbers to compare, a practice pair (another pair, for the learner) and "compared", the columns the
// demonstration has judged from the left, then one more for the sign (0 at the start: the program supplies it). Each
// number keeps the decimals it is written with (0.70 is not 0.7): the outline's number carries them
// (`written_decimals`, read from the model's own mantissa and scale), and the card binds them when any of the four is
// written with a trailing zero.
// The demonstration moves only "compared": forward, a whole number at a time, the card judging one column for each
// and choosing the sign at the end. A value past the end is the end (the demonstration runs to the sign; owner,
// 2026-11-27). Values are as the model writes them (0.625); the card holds thousandths. These rules are pure, so the
// compiler, the model's section facts and the judge agree on every value; the card's own rules (the pairs it takes,
// its columns, its true sign) are OLL's.
import {
  PLACE_VALUE_COMPARE_MAX_COLUMNS, placeValueCompareDemoEnd, placeValueCompareFault, placeValueCompareFaultText, placeValueCompareFromDecimal,
  placeValueCompareOwnDecimals, placeValueComparePairOf, placeValueComparePracticeFault,
  type PlaceValueCompareNumber, type PlaceValueComparePair,
} from "octos-lesson-language/plugin-math";

/** The card's five lesson numbers, by position. */
export const COMPARE_NUMBER = { first: 0, second: 1, practiceFirst: 2, practiceSecond: 3, compared: 4 } as const;
/** The most "compared" can be on any pair: seven columns, then the sign. */
export const COMPARE_MOST = PLACE_VALUE_COMPARE_MAX_COLUMNS + 1;

/**
 * A lesson number as the card holds it: its value in thousandths and the decimals it is written with (the outline's
 * `written_decimals` when it has them, else the value's own). Undefined when the card cannot hold it.
 */
export function compareNumberOf(value: number, written?: number): PlaceValueCompareNumber | undefined {
  if (!Number.isFinite(value) || value < 0) return undefined;
  const thousandths = Math.round(value * 1000);
  if (Math.abs(thousandths - value * 1000) > 1e-6) return undefined;
  const own = placeValueCompareOwnDecimals(thousandths);
  const dec = written !== undefined && Number.isInteger(written) && written >= own && written <= 3 ? written : own;
  return placeValueCompareFromDecimal(thousandths, 3) ? { value: thousandths, dec } : undefined;
}

/** A number as written: 0.70, 4,530 (plain digits). */
export const compareNumeral = (n: PlaceValueCompareNumber): string =>
  `${Math.floor(n.value / 1000)}${n.dec ? `.${String(n.value % 1000).padStart(3, "0").slice(0, n.dec)}` : ""}`;

/**
 * The pair and the practice pair the card's five lesson numbers make (each number with its written decimals), or why
 * the card cannot start on them (a sentence for the model). Every fault OLL would refuse at the card is found here,
 * so the compiler names the card and a section whose repairs are spent on it loses the picture, not the lesson.
 */
export function compareStartProblem(values: readonly number[], written: ReadonlyArray<number | undefined> = [], { decimalsUnknown = false }: { decimalsUnknown?: boolean } = {}):
  { pair: PlaceValueComparePair; practice: PlaceValueComparePair; numbers: PlaceValueCompareNumber[] } | { fault: string } {
  if (values.length !== 5) {
    return { fault: "the card takes five lesson numbers, in order: the two numbers to compare (as the question writes them: 0.70 keeps its zero), the practice pair (another pair, for the learner) and compared (0)" };
  }
  const numbers = values.slice(0, 4).map((value, i) => compareNumberOf(value, written[i]));
  if (numbers.some((n) => n === undefined)) return { fault: "the two numbers and the practice pair are numbers from 0 to 9,999,999 with at most three decimal places (thousandths)" };
  const [a, b, pa, pb] = numbers as [PlaceValueCompareNumber, PlaceValueCompareNumber, PlaceValueCompareNumber, PlaceValueCompareNumber];
  // Values alone (the outline's check) cannot tell 0.7 from 0.70: an equal-valued pair may be written differently, so
  // only the compiler, which has the written decimals, refuses the same numeral twice.
  const sameNumeral = (x: PlaceValueCompareNumber, y: PlaceValueCompareNumber) => decimalsUnknown && x.value === y.value;
  if (sameNumeral(a, b)) b.dec = Math.min(3, Math.max(a.dec, b.dec) + 1);
  if (sameNumeral(pa, pb)) pb.dec = Math.min(3, Math.max(pa.dec, pb.dec) + 1);
  const fault = placeValueCompareFault(a, b);
  if (fault) {
    return { fault: fault === "same_numeral"
      ? `the two numbers are the same numeral, ${compareNumeral(a)}: there is nothing to compare; a number with a written zero keeps it (0.7 and 0.70: write 0.70 as mantissa 70, scale 2)`
      : `the question's pair: ${placeValueCompareFaultText(fault, a, b)}` };
  }
  const pair = placeValueComparePairOf(a, b);
  const practiceFault = placeValueComparePracticeFault(pair, pa, pb);
  if (practiceFault) {
    return { fault: practiceFault === "same_pair"
      ? "the practice pair is the learner's own: another pair than the question's (the same two numbers in the other order are the same pair), so the learner does not copy the demonstration"
      : `the practice pair: ${placeValueCompareFaultText(practiceFault, pa, pb)}` };
  }
  // OLL compares the values a practice starts on: the question's values written another way (0.7 and 0.700 after
  // 0.7 and 0.70) would be refused there as the lesson's own pair.
  if ([[pa, pb], [pb, pa]].some(([x, y]) => x!.value === a.value && y!.value === b.value)) {
    return { fault: "the practice pair is the learner's own: other numbers than the question's, not the same values written another way" };
  }
  if (values[COMPARE_NUMBER.compared] !== 0) return { fault: `compared starts at 0, not ${values[COMPARE_NUMBER.compared]}: the card opens with no column judged` };
  return { pair, practice: placeValueComparePairOf(pa, pb), numbers: [a, b, pa, pb] };
}

/** Why the card cannot start on the outline's numbers (the program's compared included), or undefined. */
export const compareOutlineFault = (values: readonly number[]): string | undefined => {
  const found = compareStartProblem(values.length === 4 ? [...values, 0] : values, [], { decimalsUnknown: true });
  return "fault" in found ? found.fault : undefined;
};

/**
 * The last value of "compared" on the pair these values make: the deciding column plus two (each column judged, then
 * the sign). An equal pair's end depends on the written decimals, which values alone do not carry: there it is the
 * most it can be (the compiler, which has them, plays to the true end).
 */
export function compareEndOf(values: readonly number[], written: ReadonlyArray<number | undefined> = []): number {
  const a = compareNumberOf(values[0] ?? Number.NaN, written[0]), b = compareNumberOf(values[1] ?? Number.NaN, written[1]);
  if (!a || !b) return COMPARE_MOST;
  if (a.value === b.value && written[0] === undefined && written[1] === undefined) return COMPARE_MOST;
  return placeValueCompareDemoEnd(placeValueComparePairOf(a, b));
}

/** The card's state when it is drawn: its five lesson numbers, compared at 0. */
export function compareState(start: readonly number[]): number[] {
  return [...start.slice(0, 4), 0];
}

/** The state after the card's number at `position` is animated to `to`, or the reason the card cannot make that change. */
export function compareMove(state: readonly number[], position: number, to: number): number[] | string {
  if (position !== COMPARE_NUMBER.compared) return "the card has five lesson numbers; the demonstration moves only compared";
  const from = state[COMPARE_NUMBER.compared]!;
  if (!Number.isInteger(to) || to < 0) return `compared counts the columns judged from the left, then the sign: a whole number from 0, not ${to}; from ${from}, the next value is ${from + 1}`;
  const end = compareEndOf(state);
  const value = Math.min(to, end);
  if (value < from) return `compared goes forward, never back: from ${from} it can be ${from} to ${end}`;
  const moved = [...state];
  moved[COMPARE_NUMBER.compared] = value;
  return moved;
}

/** Several animations of one card in one moment, applied in order: the states after each, or the first refusal. */
export function compareMoves(state: readonly number[], moves: ReadonlyArray<{ position: number; to: number }>):
  { steps: Array<{ position: number; from: number[]; to: number[] }>; ignored?: Array<{ index: number; position: number; reason: string }> } | { refused: { position: number; reason: string } } {
  const steps: Array<{ position: number; from: number[]; to: number[] }> = [];
  const ignored: Array<{ index: number; position: number; reason: string }> = [];
  let current = [...state];
  for (const [index, move] of moves.entries()) {
    // The two numbers and the practice pair never move: an animation of one is left out (and recorded), not
    // refused, so a section's repairs are not spent on it (as the times-ten card, review of #188).
    if (move.position >= 0 && move.position < COMPARE_NUMBER.compared && move.to !== current[move.position]) {
      ignored.push({ index, position: move.position, reason: "the two numbers and the practice pair stay as written: the demonstration moves only compared (the card's fifth lesson number)" });
      continue;
    }
    if (move.position < COMPARE_NUMBER.compared) { steps.push({ position: move.position, from: current, to: [...current] }); continue; }
    const result = compareMove(current, move.position, move.to);
    if (typeof result === "string") return { refused: { position: move.position, reason: result } };
    steps.push({ position: move.position, from: current, to: result });
    current = result;
  }
  return { steps, ...(ignored.length ? { ignored } : {}) };
}

const FULL_WIDTH = /[０-９．，＜＞＝]/gu;
const halfWidth = (text: string) => text.replace(FULL_WIDTH, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));

/**
 * Whether a task's words give away the practice's answer: the practice's two numbers with the true sign between
 * them ("5602 < 5620", or the other way round "5620 > 5602"), or a word that says which one is greater or smaller
 * next to them. The two numbers alone are fine to write (the card shows them).
 */
export function compareWordsGiveAnswer(words: string, practice: PlaceValueComparePair): boolean {
  const text = halfWidth(String(words)).replace(/(\d),(?=\d{3})/gu, "$1");
  const x = compareNumeral({ value: practice.a, dec: practice.aDec }), y = compareNumeral({ value: practice.b, dec: practice.bDec });
  const flip = { ">": "<", "<": ">", "=": "=" } as const;
  const esc = (s: string) => s.replace(/\./gu, "\\.");
  const said = (p: string, sign: string, q: string) => new RegExp(`(?<!\\d)(?<!\\d\\.)${esc(p)}\\s*${sign}\\s*${esc(q)}(?!\\d)(?!\\.\\d)`, "u").test(text);
  return said(x, practice.relation, y) || said(y, flip[practice.relation], x);
}
