// How the place-value chart's lesson numbers change (OLL decision 0025, need 35P-05), on the trading mat's
// pattern: the chart takes the question's number and the practice number as lesson numbers, and the model
// shows its demonstration as targets on the data, never by naming a control. The chart's number is read as
// the value on the chart:
// - building, it starts at 0 when the chart is drawn and each step adds whole places of the question's number
//   (0 -> 60000 -> 60400 -> 60408, or straight to 60408); writing the number again changes nothing, so a later
//   section that writes the full number to show it on the chart is no change (objective check 1: PV-02 and
//   PV-05 were lost when "the number still to do" was written as the number in section 2). A chart to build whose
//   own section never puts any of its number on it is drawn showing the whole number, already built (PT-15 and
//   PF-01, 35P-04/35P-07 run 2: the learner saw an empty chart); sections publish one at a time, so only the section
//   that draws it decides. A later section's step to the number changes nothing, and one to a part of it is left
//   out: the part is on the chart already;
// - pulling apart, it is what is still on the chart: it starts at the number and each step takes whole places
//   out (60408 -> 408 -> 8 -> 0).
// The practice number is the learner's own: it never moves in the lesson. These rules are pure, so the
// compiler, the model's section facts and the judge agree on every value.
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
    if (leak === "zero") {
      // Seen in objective check 1 (PV-10, PV-13): the model declared 0, the chart's empty start, with the number as
      // its max. Say what to write instead, so the repair can fix it.
      return `the ${roles[index]} is 0: there is nothing to ${given === "numeral" ? "pull apart" : "build"}. Write the number itself as its value (for example 0.309), not 0: the chart starts empty by itself${given === "numeral" ? "" : ", and the demonstration animates the number up from 0"}`;
    }
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

const PLACES = Array.from({ length: PLACE_VALUE_MAX_PLACE - PLACE_VALUE_MIN_PLACE + 1 }, (_, i) => PLACE_VALUE_MAX_PLACE - i);

/** The places (6 to -3), highest first, that hold a digit in `with` and none in `without`. */
function placesOnlyIn(withDigits: number, without: number): number[] {
  return PLACES.filter((place) => placeValueDigitAt(withDigits, place) && !placeValueDigitAt(without, place));
}

/**
 * The places a step changes, highest first: building, the places it puts on the chart (none in `from`, a digit
 * in `to`); pulling apart, the places it takes out (a digit in `from`, none in `to`).
 */
export function placeValueStepPlaces(from: number, to: number, build: boolean): number[] {
  return build ? placesOnlyIn(to, from) : placesOnlyIn(from, to);
}

/** The chart's last state entry: pulling apart, building from empty, or building drawn with the whole number on it. */
const PULL_APART = 0, BUILD = 1, DRAWN_BUILT = 2;

/** An action of the section that draws a card, as far as the chart reads it: an animation of a lesson number. */
export interface DrawnWithAction { action: string; number?: number; end_value?: number }

/**
 * Whether the section that draws a chart to build puts any of its number on it: an animation of the chart's number
 * (`number`, its first lesson number) to a value above 0 in `drawnWith`, that section's actions from the moment the
 * chart is drawn on (an animation before the chart is drawn is left out, and one to 0 changes nothing). An
 * animation the chart refuses fails the section, so it never decides a published chart.
 */
export function placeValueBuiltWhereDrawn(number: number, drawnWith: readonly DrawnWithAction[]): boolean {
  return drawnWith.some((action) => action.action === "animate" && action.number === number
    && (placeValueThousandths(Number(action.end_value)) ?? 1) > 0);
}

/**
 * The chart's state when it is drawn, from its lesson numbers ([the question's number, the practice number]), its
 * content and, when known, what the section that draws it does (`drawnWith`: see placeValueBuiltWhereDrawn): the
 * value on the chart (building: 0, the chart starts empty, or the number when that section never builds it; pulling
 * apart: the number, whole), the practice number when there is one, then the question's number and how the chart
 * reads (pulling apart 0, building 1, building drawn with the number on it 2), which no step changes. The leading
 * entries are the lesson numbers as the chart reads them.
 */
export function placeValueState(start: readonly number[], content?: { parameters?: Record<string, unknown>; numbers?: readonly number[] }, drawnWith?: readonly DrawnWithAction[]): number[] {
  const build = content?.parameters?.given !== "numeral";
  const drawnBuilt = build && drawnWith !== undefined && content?.numbers?.[0] !== undefined && !placeValueBuiltWhereDrawn(content.numbers[0], drawnWith);
  return [build && !drawnBuilt ? 0 : start[0]!, ...start.slice(1), start[0]!, !build ? PULL_APART : drawnBuilt ? DRAWN_BUILT : BUILD];
}

/**
 * The values (in thousandths) the chart's number can go to next from `from`, putting on or taking out whole
 * places highest first: building, the values on the chart as the next highest places go on (0 -> 60000, 60400,
 * 60408); pulling apart, the values left as the highest places still on come out (60408 -> 408, 8, 0). Empty when
 * the number is built or nothing is left on the chart. The mover's refusal and the section facts both list these.
 */
export function placeValueNextValues(number: number, from: number, build: boolean): number[] {
  if (build) {
    const parts = placeValueParts(number);
    return [...new Set([...parts.map((_, k) => parts.slice(0, k + 1).reduce((sum, part) => sum + part.value, 0)), number])]
      .filter((value) => value > from && placesOnlyIn(from, value).length === 0);
  }
  return placeValueParts(from).map((_, k, all) => all.slice(k + 1).reduce((sum, part) => sum + part.value, 0));
}

/**
 * The state after the chart's number at `position` (0: the value on the chart; 1: the practice number) is
 * animated to `to`, or the reason the chart cannot make that change. Values are the lesson numbers' own
 * (decimals). A move to the value already there changes nothing.
 */
export function placeValueMove(state: readonly number[], position: number, to: number): number[] | string {
  if (position !== 0 || state.length < 3) return "the practice number is the learner's: it does not move in the lesson. Animate the question's number to show the demonstration";
  const build = state.at(-1) !== PULL_APART;
  const number = Math.round(state.at(-2)! * 1000);
  const from = Math.round(state[0]! * 1000);
  const target = placeValueThousandths(to);
  if (target === undefined) return "the chart's number is a number from 0 to 9,999,999.999 with at most three decimal places";
  if (target === from) return [...state];
  // Every digit of the new value is the number's digit or 0, and a step only adds places (building) or only
  // takes them out (pulling apart).
  const ofNumber = PLACES.every((place) => !placeValueDigitAt(target, place) || placeValueDigitAt(target, place) === placeValueDigitAt(number, place));
  const kept = build ? placesOnlyIn(from, target).length === 0 : placesOnlyIn(target, from).length === 0;
  if (!ofNumber || !kept) {
    if (build) {
      const placed = placeValueNextValues(number, from, true);
      return `building, the chart's number is the value on the chart: it starts at 0 and each step puts whole places of ${placeValueDecimal(number)} on the chart, highest first; places already on stay, so from ${placeValueDecimal(from)} it can be ${placed.length ? placed.map(placeValueDecimal).join(", ") : `only ${placeValueDecimal(from)}: the number is built`}`;
    }
    const left = placeValueNextValues(number, from, false);
    return `pulling apart, the chart's number is what is still on the chart: it starts at the number and each step takes whole places out, highest first, so from ${placeValueDecimal(from)} it can be ${left.map(placeValueDecimal).join(", ")}`;
  }
  const next = [...state];
  next[0] = placeValueDecimal(target);
  return next;
}

/**
 * Why a step on a chart drawn with its whole number on it is left out, or undefined: a step to a part of the number
 * (a value whose every digit is the number's own, 60000 or 60400 of 60408) puts on places that are on already.
 */
function placeValueDrawnBuiltPart(state: readonly number[], position: number, to: number): string | undefined {
  if (position !== 0 || state.at(-1) !== DRAWN_BUILT) return undefined;
  const number = Math.round(state.at(-2)! * 1000);
  const target = placeValueThousandths(to);
  if (target === undefined || target === number) return undefined;
  if (!PLACES.every((place) => !placeValueDigitAt(target, place) || placeValueDigitAt(target, place) === placeValueDigitAt(number, place))) return undefined;
  return `the chart has shown all of ${placeValueDecimal(number)} since it was drawn (the section that drew it put none of it on), so ${placeValueDecimal(target)} is on it already`;
}

/**
 * Several animations of one chart in one moment, applied in order; the states after each, or the first refusal. On a
 * chart drawn with its whole number on it, a step to a part of the number is left out (`ignored`), not refused: the
 * program drew the number, so a later section that builds it again does not lose the chart.
 */
export function placeValueMoves(state: readonly number[], moves: ReadonlyArray<{ position: number; to: number }>):
  { steps: Array<{ position: number; from: number[]; to: number[] }>; ignored?: Array<{ index: number; position: number; reason: string }> } | { refused: { position: number; reason: string } } {
  const steps: Array<{ position: number; from: number[]; to: number[] }> = [];
  const ignored: Array<{ index: number; position: number; reason: string }> = [];
  let current = [...state];
  for (const [index, move] of moves.entries()) {
    const part = placeValueDrawnBuiltPart(current, move.position, move.to);
    if (part) {
      ignored.push({ index, position: move.position, reason: part });
      continue;
    }
    const result = placeValueMove(current, move.position, move.to);
    if (typeof result === "string") return { refused: { position: move.position, reason: result } };
    steps.push({ position: move.position, from: current, to: result });
    current = result;
  }
  return { steps, ...(ignored.length ? { ignored } : {}) };
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
