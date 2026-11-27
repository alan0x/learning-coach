// How the place-value times-ten card's lesson numbers change (OLL decision 0028, need 35P-04): the same amount
// counted in another unit. The card has five lesson numbers, in order, named by role as the model sees them: the
// amount (0.3 for "3 tenths"), the unit asked (0.001; a times pair's smaller number, 70; the card's "target"), a
// practice of the card's shape (its amount and unit asked) and the start unit, "counted in": the unit the amount is
// counted in now. Counted in starts at the unit the question names. A breaking question (the amount counted in its own
// place makes a count toward a smaller unit) and a times pair start at the amount's own place: the program supplies
// it, and a fifth number the outline writes is read over, never refused (35P-04 run 2, PF-01: 1000, 10, ..., 10 lost
// the card). Only a put-together question writes its own (40 hundredths: 0.01). The two never compete: a put-together
// asks for the amount's own place, from which the amount makes no question.
// The demonstration moves only counted in, along the problem's path toward the target (0.1 -> 0.01 -> 0.001, or
// 100 -> 70), never back; the card plays each row's move. Values are as the model writes them (0.01); the card holds
// thousandths. These rules are pure, so the compiler, the model's section facts and the judge agree on every value;
// the card's own rules (the problem it takes, its path, its answers) are OLL's.
import {
  placeValueColumnName, placeValueTimesTenFaultText, placeValueTimesTenPath, placeValueTimesTenPlaceOfUnit, placeValueTimesTenPracticeProblem,
  placeValueTimesTenProblem, placeValueTimesTenPosition,
  type PlaceValueTimesTenProblem,
} from "octos-lesson-language/plugin-math";
import { placeValueThousandths } from "./place-value-moves.js";

/** The card's five lesson numbers, by position. */
export const TIMES_TEN_NUMBER = { amount: 0, target: 1, practiceAmount: 2, practiceTarget: 3, countedIn: 4 } as const;

/** A value in thousandths as the plain decimal a lesson number holds: 300 -> 0.3. */
export const timesTenDecimal = (thousandths: number): number => Number((thousandths / 1000).toFixed(3));
const decimal = timesTenDecimal;

/**
 * The card's problem from the amount, the target and "counted in" as written (thousandths): a times pair always
 * starts in the larger number's own place (a declared start is read over); a count starts where counted in says.
 */
export function timesTenProblemOf(amount: number, target: number, countedIn: number | undefined): PlaceValueTimesTenProblem | { fault: string } {
  const plain = placeValueTimesTenProblem(amount, target);
  if (!("fault" in plain) && plain.question === "times") return plain;
  return placeValueTimesTenProblem(amount, target, countedIn);
}

/**
 * The start of "counted in" the program supplies when the outline does not declare it: the unit of the amount's own
 * place (0.3 -> 0.1; 700 -> 100), as the model writes it. A put-together question names a smaller unit itself; when
 * its outline leaves it out (or the numbers make no problem), there is no start to supply: NaN, so the program
 * supplies nothing and the card is dropped at once (`min_lesson_numbers`), before any section is asked for it.
 */
export function timesTenStartOf(amount: number, target: number): number {
  const A = placeValueThousandths(amount), T = placeValueThousandths(target);
  if (A === undefined || T === undefined) return Number.NaN;
  const plain = placeValueTimesTenProblem(A, T);
  return "fault" in plain ? Number.NaN : decimal(plain.start);
}

/** The problem the card's five lesson numbers make, or why the card cannot start on them (a sentence for the model). */
export function timesTenStartProblem(values: readonly number[]): { problem: PlaceValueTimesTenProblem; practice: PlaceValueTimesTenProblem } | { fault: string } {
  if (values.length !== 5) {
    return { fault: "the card takes five lesson numbers, in order: the amount (its value: 0.3 for 3 tenths), the unit asked (0.001; a times pair's smaller number, 70), the practice's amount and unit asked (another problem of the same kind), and the start unit (the unit the question counts the amount in)" };
  }
  const [A, T, PA, PT, C] = values.map(placeValueThousandths);
  if ([A, T, PA, PT].some((value) => value === undefined || value <= 0)) return { fault: "the amount, the unit asked and the practice's two numbers are numbers above 0 with at most three decimal places (thousandths)" };
  // The amount counted in its own place decides first: when that makes a question (a breaking count, or a times
  // pair), the start unit is the program's and the fifth number as written is read over, whatever it is (0, the unit
  // asked, another start). Only a put-together question, which the amount's own place cannot make, starts where the
  // fifth number says. A fifth number written as the unit asked is read over too (PF-01, 35P-04 run 2: how many tens
  // in 1,000 written 1000, 10, ..., 10). Numbers that swap the unit asked and the start unit of a put-together
  // (objective run 1, PF-05: 40 hundredths = ? tenths written 0.4, 0.01, ..., 0.01) make a legal breaking question,
  // 4 tenths = ? hundredths, and are drawn as it: the numbers cannot tell the two apart; the roles' names are what
  // keeps them apart (owner, 2026-11-27).
  const own = timesTenProblemOf(A!, T!, undefined);
  const problem = "fault" in own ? timesTenProblemOf(A!, T!, C) : own;
  if ("fault" in problem) {
    const said = placeValueTimesTenFaultText(problem.fault as Parameters<typeof placeValueTimesTenFaultText>[0], A, T);
    if (C === T) {
      return { fault: `${said}; the unit asked (the second number) is the unit the question asks for and the start unit (the fifth number) the unit it counts the amount in: 40 hundredths = ? tenths is 0.4, 0.1, then the practice, then 0.01` };
    }
    return { fault: problem.fault === "same_unit" || problem.fault === "start_not_unit"
      ? `${said}; the start unit (the fifth number) is the unit the question counts the amount in, not the unit asked: 40 hundredths starts at 0.01, and 3 tenths at 0.1, which the program supplies`
      : `the question: ${said}` };
  }
  const practice = placeValueTimesTenPracticeProblem(problem, PA!, PT!);
  if ("fault" in practice) {
    if (practice.fault === "same_as_example") return { fault: "the practice is the learner's own: another amount or unit asked than the question's, so the learner does not copy the demonstration" };
    const how = problem.question === "times"
      ? "another times pair, the same digit in two neighbouring places (4,000 and 400)"
      : `another count ${problem.g === 2 ? "two places" : "one place"} ${problem.dir < 0 ? "to the right (breaking)" : "to the left (putting together)"}, like the question's`;
    return { fault: `the practice is ${how}: ${placeValueTimesTenFaultText(practice.fault as Parameters<typeof placeValueTimesTenFaultText>[0], PA, PT)}` };
  }
  return { problem, practice };
}

/**
 * Why the card cannot start on the outline's numbers (its five, in order, as the outline declares them with the
 * program's own), or undefined: the recipe's `outline_fault`. A section cannot change an outline number, so the card
 * goes at once, before any section is written for it (objective run 1: PF-05, PF-09, PF-17 spent three section
 * attempts each on numbers no section could fix).
 */
export function timesTenOutlineFault(values: readonly number[]): string | undefined {
  const found = timesTenStartProblem(values);
  return "fault" in found ? found.fault : undefined;
}

/** "0.1 (tenths) -> 0.01 (hundredths) -> 0.001 (thousandths)", or "100 (hundreds) -> 70". */
export function timesTenPathText(problem: PlaceValueTimesTenProblem): string {
  return placeValueTimesTenPath(problem).map((value) => {
    const place = placeValueTimesTenPlaceOfUnit(value);
    return place === undefined ? `${decimal(value)}` : `${decimal(value)} (${placeValueColumnName(place).toLowerCase()})`;
  }).join(" -> ");
}

/** The values "counted in" may take next from `from` (as written), as the refusals and the facts say them. */
export function timesTenNext(problem: PlaceValueTimesTenProblem, from: number): number[] {
  const path = placeValueTimesTenPath(problem);
  const at = placeValueTimesTenPosition(problem, placeValueThousandths(from) ?? 0);
  return path.filter((value, k) => k >= Math.ceil(at - 1e-9) && value !== placeValueThousandths(from)).map(decimal);
}

/** Where the card's state keeps its problem's start (as written), after its five lesson numbers. */
const TIMES_TEN_START = 5;

/**
 * The problem the card shows: the state keeps the problem's start after the five lesson numbers (sixth, as written),
 * since counted in itself moves (a put-together that has reached its target no longer says where it started).
 * Without it (a state written by hand), the problem whose path holds counted in now: counted from the amount's own
 * place when that path holds it, else from counted in itself.
 */
function timesTenProblemNow(state: readonly number[]): { problem: PlaceValueTimesTenProblem } | { fault: string } {
  const [A, T] = [state[TIMES_TEN_NUMBER.amount], state[TIMES_TEN_NUMBER.target]].map(placeValueThousandths);
  const S = state[TIMES_TEN_START] === undefined ? undefined : placeValueThousandths(state[TIMES_TEN_START]!);
  const C = placeValueThousandths(state[TIMES_TEN_NUMBER.countedIn] ?? Number.NaN);
  if (A !== undefined && T !== undefined && S !== undefined) {
    const started = timesTenProblemOf(A, T, S);
    if (!("fault" in started)) return { problem: started };
  }
  if (A !== undefined && T !== undefined && C !== undefined) {
    const own = timesTenProblemOf(A, T, undefined);
    if (!("fault" in own) && placeValueTimesTenPath(own).includes(C)) return { problem: own };
    const at = timesTenProblemOf(A, T, C);
    if (!("fault" in at)) return { problem: at };
  }
  const found = timesTenStartProblem(state.slice(0, 5));
  return "fault" in found ? found : { problem: found.problem };
}

/**
 * The card's state when it is drawn: its five lesson numbers as it reads them (counted in at the problem's start),
 * then that start, kept while counted in moves.
 */
export function placeValueTimesTenState(start: readonly number[]): number[] {
  const values = [...start.slice(0, 5)];
  const found = timesTenStartProblem(values);
  if (!("fault" in found)) {
    values[TIMES_TEN_NUMBER.countedIn] = decimal(found.problem.start);
    values[TIMES_TEN_START] = decimal(found.problem.start);
  }
  return values;
}

/** The state after the card's number at `position` is animated to `to`, or the reason the card cannot make that change. */
export function placeValueTimesTenMove(state: readonly number[], position: number, to: number): number[] | string {
  if (position < 0 || position > TIMES_TEN_NUMBER.countedIn) return "the card has five lesson numbers";
  if (to === state[position]) return [...state];
  if (position !== TIMES_TEN_NUMBER.countedIn) {
    return "the amount, the unit asked and the practice stay as written: the demonstration moves only the start unit, counted in (the card's fifth lesson number), the unit the amount is counted in now, and the card plays each row";
  }
  const found = timesTenProblemNow(state);
  if ("fault" in found) return found.fault;
  const { problem } = found;
  const from = state[TIMES_TEN_NUMBER.countedIn]!;
  const path = placeValueTimesTenPath(problem);
  const index = path.indexOf(placeValueThousandths(to) ?? Number.NaN);
  const next = timesTenNext(problem, from);
  const said = next.length ? `from ${from} the next values are ${next.join(" or ")}` : `from ${from} it has reached the unit asked, ${decimal(problem.target)}`;
  if (index < 0) return `counted in is the unit the amount is counted in now: ${timesTenPathText(problem)}; ${to} is not one of its values; ${said}`;
  if (index + 1e-9 < placeValueTimesTenPosition(problem, placeValueThousandths(from) ?? 0)) return `counted in goes forward along ${timesTenPathText(problem)}, never back to ${to}; ${said}`;
  const moved = [...state];
  moved[TIMES_TEN_NUMBER.countedIn] = to;
  return moved;
}

/** Several animations of one card in one moment, applied in order; the states after each, or the first refusal. */
export function placeValueTimesTenMoves(state: readonly number[], moves: ReadonlyArray<{ position: number; to: number }>):
  { steps: Array<{ position: number; from: number[]; to: number[] }>; ignored?: Array<{ index: number; position: number; reason: string }> } | { refused: { position: number; reason: string } } {
  const steps: Array<{ position: number; from: number[]; to: number[] }> = [];
  const ignored: Array<{ index: number; position: number; reason: string }> = [];
  let current = [...state];
  for (const [index, move] of moves.entries()) {
    // The amount, the unit asked and the practice never move: an animation of one is left out (and recorded by the
    // compiler), not refused, so a section's repairs are not spent on it (objective run 1, PF-02 and PF-10).
    if (move.position >= 0 && move.position < TIMES_TEN_NUMBER.countedIn && move.to !== current[move.position]) {
      ignored.push({ index, position: move.position, reason: "the amount, the unit asked and the practice stay as written: the demonstration moves only the start unit, counted in (the card's fifth lesson number)" });
      continue;
    }
    const result = placeValueTimesTenMove(current, move.position, move.to);
    if (typeof result === "string") return { refused: { position: move.position, reason: result } };
    steps.push({ position: move.position, from: current, to: result });
    current = result;
  }
  return { steps, ...(ignored.length ? { ignored } : {}) };
}

const FULL_WIDTH = /[０-９．，＝]/gu;
const halfWidth = (text: string) => text.replace(FULL_WIDTH, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));

/**
 * Whether a task's words give away the practice's count (a numeral that is it: 500 hundredths, or a times pair's
 * renamed count). The amount and target themselves are fine to write (the card shows them), and so is 10, the
 * rule's own number ("10 of one place make 1 of the next"): a practice whose count is 10 (1 one = 10 tenths) is
 * never dropped for it, since words cannot say the rule without it.
 */
export function placeValueTimesTenWordsGiveAnswer(words: string, practice: PlaceValueTimesTenProblem): boolean {
  const count = practice.question === "times" ? practice.renamed! : practice.result;
  if (count === 10) return false;
  const shown = new Set([practice.amount, practice.target].map(decimal));
  for (const match of halfWidth(String(words)).matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d*\.\d+|\d+/gu)) {
    const value = Number(match[0].replace(/,/gu, ""));
    if (value === count && !shown.has(value)) return true;
  }
  return false;
}
