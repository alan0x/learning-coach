// How the place-value chart's lesson numbers change (OLL decision 0025, need 35P-05), on the trading mat's
// pattern: the chart takes the question's number and the practice number as lesson numbers, and the model
// shows its demonstration as targets on the data, never by naming a control. The chart's number is read as
// what is still to do: what is not yet placed when building, what is still on the chart when pulling apart.
// It starts at the number itself and each step clears whole places (60408 -> 408 -> 8 -> 0), so both tasks
// read the same way and a step's places are the ones whose digits went to 0. The practice number is the
// learner's own: it never moves in the lesson. These rules are pure, so the compiler, the model's section
// facts and the judge agree on every value.
import {
  PLACE_VALUE_MAX_PLACE, PLACE_VALUE_MAX_VALUE, PLACE_VALUE_MIN_PLACE,
  placeValueDigitAt, placeValueParts, placeValueTaskFault,
} from "octos-lesson-language/plugin-math";

/** The most a pull-apart number may have non-zero places: the row of blanks after it holds six (OLL NUMERIC_ROW_LIMITS). */
export const PLACE_VALUE_ROW_PARTS = 6;
/** What the model may give for each task: a build task's forms, and the numeral for pulling apart. */
export const PLACE_VALUE_GIVENS = ["name", "expanded", "expanded_factors", "place_counts", "numeral"] as const;
export type PlaceValueModelGiven = typeof PLACE_VALUE_GIVENS[number];
/**
 * How far a value times 1000 may sit from a whole number and still be exact thousandths: a fixed amount, far
 * above floating-point error up to 9,999,999.999 and far below a ten-thousandth (600000.1234 is refused).
 */
const THOUSANDTHS_SLACK = 1e-4;

/** A lesson number in integer thousandths, or undefined when the chart cannot hold it (negative, past thousandths, or over 9,999,999.999). */
export function placeValueThousandths(value: number): number | undefined {
  if (!Number.isFinite(value) || value < 0) return undefined;
  const thousandths = Math.round(value * 1000);
  if (Math.abs(value * 1000 - thousandths) > THOUSANDTHS_SLACK) return undefined;
  return thousandths <= PLACE_VALUE_MAX_VALUE ? thousandths : undefined;
}

/** A value in thousandths as the plain decimal a lesson number holds: 26075 -> 26.075. */
export function placeValueDecimal(thousandths: number): number {
  return Number((thousandths / 1000).toFixed(3));
}

/** The text of a value in thousandths as a learner types it, with no grouping: 26075 -> "26.075". */
export function placeValuePlain(thousandths: number): string {
  return String(placeValueDecimal(thousandths));
}

/** Why one lesson number cannot be a chart's number, or undefined. `role` names it in the message. */
function numberFault(value: number, role: string): string | undefined {
  if (!Number.isFinite(value) || value < 0) return `the ${role} is a number from 0 to 9,999,999.999`;
  if (Math.abs(value * 1000 - Math.round(value * 1000)) > THOUSANDTHS_SLACK) return `the ${role} has at most three decimal places (thousandths): the chart's last column is the thousandths`;
  if (Math.round(value * 1000) > PLACE_VALUE_MAX_VALUE) return `the ${role} is at most 9,999,999.999: the chart's highest column is the millions`;
  return undefined;
}

/**
 * Why a chart cannot start on these lesson numbers ([the question's number, the practice number]), or
 * undefined. `given` is what the card gives (a build form, or the numeral for pulling apart).
 */
export function placeValueStartFault(values: readonly number[], given: string): string | undefined {
  if (values.length < 1 || values.length > 2) return "the chart takes two lesson numbers: the question's number, then a different practice number for the learner";
  const roles = ["question's number", "practice number"];
  for (const [index, value] of values.entries()) {
    const fault = numberFault(value, roles[index]!);
    if (fault) return fault;
  }
  const [number, practice] = values.map((value) => Math.round(value * 1000));
  for (const [index, value] of [number, practice].entries()) {
    if (value === undefined) continue;
    const leak = placeValueTaskFault(value, given);
    if (leak === "zero") return `the ${roles[index]} is 0: there is nothing to ${given === "numeral" ? "pull apart" : "build"}`;
    if (leak) {
      return `the ${roles[index]} ${placeValueDecimal(value)} has one non-zero place, so ${given === "numeral" ? "pulling it apart" : `its ${given.replace("_", " ")} form`} shows the answer itself: choose a number with two or more non-zero places${given === "numeral" ? "" : ", or give its name or place counts"}`;
    }
  }
  if (practice !== undefined && practice === number) return "the practice number is the learner's own: a different number from the question's, so the learner does not copy the demonstration";
  if (given === "numeral" && practice !== undefined && placeValueParts(practice).length > PLACE_VALUE_ROW_PARTS) {
    return `a practice number to pull apart has at most ${PLACE_VALUE_ROW_PARTS} non-zero places: its parts are written in one row of at most ${PLACE_VALUE_ROW_PARTS} blanks`;
  }
  return undefined;
}

/** The places (6 to -3), highest first, whose digits a step clears: non-zero in `from`, 0 in `to`. */
export function placeValueCleared(from: number, to: number): number[] {
  const places: number[] = [];
  for (let place = PLACE_VALUE_MAX_PLACE; place >= PLACE_VALUE_MIN_PLACE; place -= 1) {
    if (placeValueDigitAt(from, place) && !placeValueDigitAt(to, place)) places.push(place);
  }
  return places;
}

/**
 * The state after the chart's number at `position` (0: the number left to do; 1: the practice number) is
 * animated to `to`, or the reason the chart cannot make that change. Values are the lesson numbers' own
 * (decimals). A move to the value already there changes nothing.
 */
export function placeValueMove(state: readonly number[], position: number, to: number): number[] | string {
  if (position !== 0) return "the practice number is the learner's: it does not move in the lesson. Animate the question's number to show the demonstration";
  const from = Math.round(state[0]! * 1000);
  const target = placeValueThousandths(to);
  if (target === undefined) return "the chart's number is a number from 0 to 9,999,999.999 with at most three decimal places";
  if (target === from) return [...state];
  // Each step clears whole places: every digit of the new value is the old digit or 0.
  const keeps = Array.from({ length: PLACE_VALUE_MAX_PLACE - PLACE_VALUE_MIN_PLACE + 1 }, (_, i) => i + PLACE_VALUE_MIN_PLACE)
    .every((place) => placeValueDigitAt(target, place) === 0 || placeValueDigitAt(target, place) === placeValueDigitAt(from, place));
  if (!keeps || target > from) {
    // The values left as the highest places are done one at a time: 60408 -> 408, 8, 0.
    const parts = placeValueParts(from);
    const left = parts.map((_, k) => parts.slice(k + 1).reduce((sum, part) => sum + part.value, 0));
    return `the chart's number is what is still to do (not yet placed when building, still on the chart when pulling apart): it starts at the number and each step clears whole places, highest first, so from ${placeValueDecimal(from)} it can be ${left.map(placeValueDecimal).join(", ")}`;
  }
  const next = [...state];
  next[0] = placeValueDecimal(target);
  return next;
}

/** Several animations of one chart in one moment, applied in order; the states after each, or the first refusal. */
export function placeValueMoves(state: readonly number[], moves: ReadonlyArray<{ position: number; to: number }>):
  { steps: Array<{ position: number; from: number[]; to: number[] }> } | { refused: { position: number; reason: string } } {
  const steps: Array<{ position: number; from: number[]; to: number[] }> = [];
  let current = [...state];
  for (const move of moves) {
    const result = placeValueMove(current, move.position, move.to);
    if (typeof result === "string") return { refused: { position: move.position, reason: result } };
    steps.push({ position: move.position, from: current, to: result });
    current = result;
  }
  return { steps };
}

const FULL_WIDTH = /[０-９．，]/gu;
const halfWidth = (text: string) => text.replace(FULL_WIDTH, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));

/**
 * Whether words write a number's digits (in thousandths): any numeral in them, read as a learner writes it
 * (thousands grouped with commas or spaces, full-width digits, a leading point), that is the number.
 * The compiler drops a build task whose words do; the judge fails a lesson whose task still does.
 */
export function placeValueWordsWrite(words: string, thousandths: number): boolean {
  const text = halfWidth(String(words));
  const numerals = text.match(/\d{1,3}(?:[,   ]\d{3})+(?:\.\d+)?|\d*\.\d+|\d+/gu) ?? [];
  return numerals.some((numeral) => placeValueThousandths(Number(numeral.replace(/[,   ]/gu, ""))) === thousandths);
}
