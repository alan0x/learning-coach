// How the place-value trade card's lesson numbers change (OLL decision 0026, need 35P-07): adding and
// subtracting on the place-value chart, drawn as the written column method. The model writes five lesson
// numbers, in order: the question's two numbers, a practice pair (another pair, of the same columns) and
// "columns finished, counting from the right" (0 at the start). The demonstration moves only the last: each
// value finishes one more column from the right, and the card plays that column's bring-down, trades and
// breaks by its own rules. The numbers never move in the lesson. These rules are pure, so the compiler, the
// model's section facts and the judge agree on every value; the card's own rules (faults, columns) are OLL's.
import {
  placeValueColumnName, placeValueTradeColumns, placeValueTradeColumnsFor, placeValueTradeFault, placeValueTradeFaultText,
  type PlaceValueTradeOperation,
} from "octos-lesson-language/plugin-math";
import { placeValueThousandths } from "./place-value-moves.js";

export const PLACE_VALUE_TRADE_OPERATIONS = ["add", "subtract"] as const satisfies readonly PlaceValueTradeOperation[];

/** The card's five lesson numbers, by position. */
export const TRADE_NUMBER = { first: 0, second: 1, practiceFirst: 2, practiceSecond: 3, finished: 4 } as const;
const ROLES = ["first number", "second number", "practice pair's first number", "practice pair's second number"] as const;

/** A lesson number as the card holds it, in integer thousandths with at most two decimals, or undefined. */
export function placeValueTradeThousandths(value: number): number | undefined {
  const thousandths = placeValueThousandths(value);
  return thousandths !== undefined && thousandths % 10 === 0 && thousandths <= 999_999_990 ? thousandths : undefined;
}

/** A value in thousandths as the plain decimal a lesson number holds: 2750 -> 2.75. */
export const tradeDecimal = (thousandths: number): number => Number((thousandths / 1000).toFixed(3));

/** The columns a pair needs, highest first (OLL's rule: a pair below 1 has no ones column). */
export function placeValueTradeColumnsOf(operation: PlaceValueTradeOperation, a: number, b: number): number[] {
  const { top_place, low_place } = placeValueTradeColumnsFor(operation, a, b);
  return placeValueTradeColumns(top_place, low_place);
}

const span = (columns: readonly number[]) => `${placeValueColumnName(columns[0]!).toLowerCase()} to ${placeValueColumnName(columns.at(-1)!).toLowerCase()}`;

/**
 * Why the card cannot start on these lesson numbers ([first, second, practice first, practice second, columns
 * finished]) with this operation, or undefined. Every fault OLL would refuse at the card is found here first, so
 * the compiler names the card and a section whose repairs are spent on it loses the picture, not the lesson.
 */
export function placeValueTradeStartFault(values: readonly number[], operation: unknown): string | undefined {
  if (!PLACE_VALUE_TRADE_OPERATIONS.includes(operation as PlaceValueTradeOperation)) return "operation is add or subtract";
  if (values.length !== 5) {
    return "the card takes five lesson numbers, in order: the first number, the second number, the practice pair's first and second number (another pair of the same columns, for the learner), and columns finished (0 at the start)";
  }
  const thousandths = values.slice(0, 4).map(placeValueTradeThousandths);
  for (const [index, value] of thousandths.entries()) {
    if (value === undefined) return `the ${ROLES[index]} is a number from 0 to 999,999.99 with at most two decimal places (hundredths): the card's last column is the hundredths`;
  }
  const [a, b, pa, pb] = thousandths as number[];
  const op = operation as PlaceValueTradeOperation;
  const fault = placeValueTradeFault(op, a!, b!);
  if (fault) return `the question's pair: ${placeValueTradeFaultText(fault, op, a, b)}`;
  const practiceFault = placeValueTradeFault(op, pa!, pb!);
  if (practiceFault) return `the practice pair: ${placeValueTradeFaultText(practiceFault, op, pa, pb)}`;
  if (pa === a && pb === b) {
    return "the practice pair is the learner's own: another pair than the question's (one number different is enough), so the learner does not copy the demonstration";
  }
  const columns = placeValueTradeColumnsOf(op, a!, b!);
  const practiceColumns = placeValueTradeColumnsOf(op, pa!, pb!);
  if (columns.join() !== practiceColumns.join()) {
    return `the practice pair needs the columns from ${span(practiceColumns)} and the question's pair from ${span(columns)}: the card keeps its columns, so write a practice pair with the same places (as many whole digits and decimal places, and an answer that gains a column only when the question's does)`;
  }
  return undefined;
}

/**
 * The card's state when it is drawn: its five lesson numbers as it reads them (the numbers as written, columns
 * finished 0: the chart starts with no column done), then the operation (0 add, 1 subtract), which no step changes.
 */
export function placeValueTradeState(start: readonly number[], content?: { parameters?: Record<string, unknown> }): number[] {
  return [...start.slice(0, 4), 0, content?.parameters?.operation === "subtract" ? 1 : 0];
}

/** The columns of the card in a state, highest first, or undefined for a pair the card refuses. */
function stateColumns(state: readonly number[]): number[] | undefined {
  const operation: PlaceValueTradeOperation = state.at(-1) === 1 ? "subtract" : "add";
  const [a, b] = [state[0]!, state[1]!].map(placeValueTradeThousandths);
  if (a === undefined || b === undefined || placeValueTradeFault(operation, a, b)) return undefined;
  return placeValueTradeColumnsOf(operation, a, b);
}

/** What the next value of columns finished does after `k` columns, as the compiler's refusals and the facts say it. */
export function placeValueTradeNext(columns: readonly number[], k: number): string {
  const place = columns[columns.length - 1 - k];
  return place === undefined ? `every column is finished at ${columns.length}` : `the next value, ${k + 1}, finishes the ${placeValueColumnName(place).toLowerCase()}`;
}

const FULL_WIDTH = /[０-９．，＝]/gu;
const halfWidth = (text: string) => text.replace(FULL_WIDTH, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
/** Words just before a numeral that state it as the answer: "= 500", "the answer is 500", 「等于 500」「得数是500」. */
const STATES_ANSWER = /(?:=|\b(?:equals?|makes?|answer(?:\s+is)?|total(?:\s+is)?|difference(?:\s+is)?|result(?:\s+is)?|is\s+left)|等于|得数是?|答案是?|结果是?|一共是?|还剩)\s*$/iu;

/**
 * Whether a task's words give away the practice's answer (both in thousandths): a numeral that is the answer,
 * unless it is one of the practice numbers themselves (1,000 − 500 = 500: writing the pair is fine), which gives
 * the answer away only where the words state it as the answer ("= 500", "the answer is 500").
 */
export function placeValueTradeWordsGiveAnswer(words: string, answer: number, practice: readonly number[]): boolean {
  const text = halfWidth(String(words));
  for (const match of text.matchAll(/\d{1,3}(?:[,   ]\d{3})+(?:\.\d+)?|\d*\.\d+|\d+/gu)) {
    if (placeValueThousandths(Number(match[0].replace(/[,   ]/gu, ""))) !== answer) continue;
    if (!practice.includes(answer)) return true;
    if (STATES_ANSWER.test(text.slice(0, match.index))) return true;
  }
  return false;
}

/** The state after the card's number at `position` is animated to `to`, or the reason the card cannot make that change. */
export function placeValueTradeMove(state: readonly number[], position: number, to: number): number[] | string {
  if (position < 0 || position > TRADE_NUMBER.finished) return "the card has five lesson numbers";
  if (to === state[position]) return [...state];
  const columns = stateColumns(state);
  const n = columns?.length ?? 0;
  if (position !== TRADE_NUMBER.finished) {
    return `the two numbers and the practice pair stay as written: the demonstration moves only columns finished (the card's fifth lesson number), from 0 up to ${n}, and the card plays each column`;
  }
  const from = state[TRADE_NUMBER.finished]!;
  const next = columns ? placeValueTradeNext(columns, from) : "";
  if (!Number.isInteger(to) || to < 0 || to > n) {
    return `columns finished counts the columns the demonstration has finished, counting from the right: a whole number from 0 to ${n}, not ${to}; from ${from}, ${next}`;
  }
  if (to < from) return `columns finished goes forward, a column or more at a time, never back: from ${from} it can be ${from} to ${n}; ${next}`;
  const moved = [...state];
  moved[TRADE_NUMBER.finished] = to;
  return moved;
}

/** Several animations of one card in one moment, applied in order; the states after each, or the first refusal. */
export function placeValueTradeMoves(state: readonly number[], moves: ReadonlyArray<{ position: number; to: number }>):
  { steps: Array<{ position: number; from: number[]; to: number[] }>; ignored?: Array<{ index: number; position: number; reason: string }> } | { refused: { position: number; reason: string } } {
  const steps: Array<{ position: number; from: number[]; to: number[] }> = [];
  const ignored: Array<{ index: number; position: number; reason: string }> = [];
  let current = [...state];
  for (const [index, move] of moves.entries()) {
    // The pair and the practice pair never move: an animation of one is left out (and recorded by the compiler), not
    // refused, as the times-ten card's are (#188); a picture that shows the pair moves a copy of its own.
    if (move.position >= TRADE_NUMBER.first && move.position < TRADE_NUMBER.finished && move.to !== current[move.position]) {
      ignored.push({ index, position: move.position, reason: "the two numbers and the practice pair stay as written: the demonstration moves only columns finished (the card's fifth lesson number)" });
      continue;
    }
    const result = placeValueTradeMove(current, move.position, move.to);
    if (typeof result === "string") return { refused: { position: move.position, reason: result } };
    steps.push({ position: move.position, from: current, to: result });
    current = result;
  }
  return { steps, ...(ignored.length ? { ignored } : {}) };
}
