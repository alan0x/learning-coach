// How the place-value times-ten card's lesson numbers change (OLL decision 0028, need 35P-04): the same amount
// counted in another unit. The card has five lesson numbers, in order: the amount (0.3 for "3 tenths"), the target
// (0.001; a times pair's smaller number, 70), a practice of the card's shape (its amount and target) and "counted
// in", the unit the amount is counted in now. Counted in starts at the unit the question names: the program
// supplies it from the amount (its own place), and a put-together question writes its own (40 hundredths: 0.01).
// A value written where the amount cannot start (0, or 0.01 for 3 tenths) is read over: the card opens at the
// amount's own place (the two never compete: a put-together's target is the amount's own place).
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
 * place (0.3 -> 0.1; 700 -> 100), as the model writes it. A put-together question names a smaller unit itself.
 */
export function timesTenStartOf(amount: number, target: number): number {
  const A = placeValueThousandths(amount), T = placeValueThousandths(target);
  if (A === undefined || T === undefined) return 0;
  const plain = placeValueTimesTenProblem(A, T);
  return "fault" in plain ? 0 : decimal(plain.start);
}

/** The problem the card's five lesson numbers make, or why the card cannot start on them (a sentence for the model). */
export function timesTenStartProblem(values: readonly number[]): { problem: PlaceValueTimesTenProblem; practice: PlaceValueTimesTenProblem } | { fault: string } {
  if (values.length !== 5) {
    return { fault: "the card takes five lesson numbers, in order: the amount (its value: 0.3 for 3 tenths), the target (0.001; a times pair's smaller number, 70), the practice's amount and target (another problem of the same kind), and counted in (the unit the question names)" };
  }
  const [A, T, PA, PT, C] = values.map(placeValueThousandths);
  if ([A, T, PA, PT].some((value) => value === undefined || value <= 0)) return { fault: "the amount, the target and the practice's two numbers are numbers above 0 with at most three decimal places (thousandths)" };
  // Counted in as written decides the problem only where it names a unit the amount can start in (a put-together
  // question's 0.01); one that cannot (0, or 0.01 for 3 tenths) is read over when the amount's own place makes a
  // problem: the card opens fresh there.
  const written = timesTenProblemOf(A!, T!, C);
  const own = "fault" in written ? timesTenProblemOf(A!, T!, undefined) : written;
  const problem = "fault" in own ? written : own;
  if ("fault" in problem) {
    const said = placeValueTimesTenFaultText(problem.fault as Parameters<typeof placeValueTimesTenFaultText>[0], A, T);
    return { fault: problem.fault === "same_unit" || problem.fault === "start_not_unit"
      ? `${said}; counted in (the fifth number) is the unit the question names, not the target: 3 tenths starts at 0.1, 40 hundredths at 0.01`
      : `the question: ${said}` };
  }
  const practice = placeValueTimesTenPracticeProblem(problem, PA!, PT!);
  if ("fault" in practice) {
    if (practice.fault === "same_as_example") return { fault: "the practice is the learner's own: another amount or target than the question's, so the learner does not copy the demonstration" };
    const how = problem.question === "times"
      ? "another times pair, the same digit in two neighbouring places (4,000 and 400)"
      : `another count ${problem.g === 2 ? "two places" : "one place"} ${problem.dir < 0 ? "to the right (breaking)" : "to the left (putting together)"}, like the question's`;
    return { fault: `the practice is ${how}: ${placeValueTimesTenFaultText(practice.fault as Parameters<typeof placeValueTimesTenFaultText>[0], PA, PT)}` };
  }
  return { problem, practice };
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

/**
 * The problem the card shows while "counted in" is at `state`'s value: the state holds counted in as it is now, not
 * where it started, so the problem is the one whose path holds it. Counted from the amount's own place when that
 * path holds it (0.3: 0.1 -> 0.01 -> 0.001), else from counted in itself (a put-together question's declared start,
 * 40 hundredths from 0.01: the path from there to the target is the same).
 */
function timesTenProblemNow(state: readonly number[]): { problem: PlaceValueTimesTenProblem } | { fault: string } {
  const [A, T] = [state[TIMES_TEN_NUMBER.amount], state[TIMES_TEN_NUMBER.target]].map(placeValueThousandths);
  const C = placeValueThousandths(state[TIMES_TEN_NUMBER.countedIn] ?? Number.NaN);
  if (A !== undefined && T !== undefined && C !== undefined) {
    const own = timesTenProblemOf(A, T, undefined);
    if (!("fault" in own) && placeValueTimesTenPath(own).includes(C)) return { problem: own };
    const at = timesTenProblemOf(A, T, C);
    if (!("fault" in at)) return { problem: at };
  }
  const found = timesTenStartProblem(state);
  return "fault" in found ? found : { problem: found.problem };
}

/** The card's state when it is drawn: its five lesson numbers as it reads them (counted in at the problem's start). */
export function placeValueTimesTenState(start: readonly number[]): number[] {
  const values = [...start.slice(0, 5)];
  const found = timesTenStartProblem(values);
  if (!("fault" in found)) values[TIMES_TEN_NUMBER.countedIn] = decimal(found.problem.start);
  return values;
}

/** The state after the card's number at `position` is animated to `to`, or the reason the card cannot make that change. */
export function placeValueTimesTenMove(state: readonly number[], position: number, to: number): number[] | string {
  if (position < 0 || position > TIMES_TEN_NUMBER.countedIn) return "the card has five lesson numbers";
  if (to === state[position]) return [...state];
  if (position !== TIMES_TEN_NUMBER.countedIn) {
    return "the amount, the target and the practice stay as written: the demonstration moves only counted in (the card's fifth lesson number), the unit the amount is counted in now, and the card plays each row";
  }
  const found = timesTenProblemNow(state);
  if ("fault" in found) return found.fault;
  const { problem } = found;
  const from = state[TIMES_TEN_NUMBER.countedIn]!;
  const path = placeValueTimesTenPath(problem);
  const index = path.indexOf(placeValueThousandths(to) ?? Number.NaN);
  const next = timesTenNext(problem, from);
  const said = next.length ? `from ${from} the next values are ${next.join(" or ")}` : `from ${from} it has reached the target, ${decimal(problem.target)}`;
  if (index < 0) return `counted in is the unit the amount is counted in now: ${timesTenPathText(problem)}; ${to} is not one of its values; ${said}`;
  if (index + 1e-9 < placeValueTimesTenPosition(problem, placeValueThousandths(from) ?? 0)) return `counted in goes forward along ${timesTenPathText(problem)}, never back to ${to}; ${said}`;
  const moved = [...state];
  moved[TIMES_TEN_NUMBER.countedIn] = to;
  return moved;
}

/** Several animations of one card in one moment, applied in order; the states after each, or the first refusal. */
export function placeValueTimesTenMoves(state: readonly number[], moves: ReadonlyArray<{ position: number; to: number }>):
  { steps: Array<{ position: number; from: number[]; to: number[] }> } | { refused: { position: number; reason: string } } {
  const steps: Array<{ position: number; from: number[]; to: number[] }> = [];
  let current = [...state];
  for (const move of moves) {
    const result = placeValueTimesTenMove(current, move.position, move.to);
    if (typeof result === "string") return { refused: { position: move.position, reason: result } };
    steps.push({ position: move.position, from: current, to: result });
    current = result;
  }
  return { steps };
}

const FULL_WIDTH = /[０-９．，＝]/gu;
const halfWidth = (text: string) => text.replace(FULL_WIDTH, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));

/**
 * Whether a task's words give away the practice's count (a numeral that is it: 500 hundredths, or a times pair's
 * renamed count). The amount and target themselves are fine to write (the card shows them), and so is 10.
 */
export function placeValueTimesTenWordsGiveAnswer(words: string, practice: PlaceValueTimesTenProblem): boolean {
  const count = practice.question === "times" ? practice.renamed! : practice.result;
  const shown = new Set([practice.amount, practice.target].map(decimal));
  for (const match of halfWidth(String(words)).matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d*\.\d+|\d+/gu)) {
    const value = Number(match[0].replace(/,/gu, ""));
    if (value === count && !shown.has(value)) return true;
  }
  return false;
}
