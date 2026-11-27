// A second card of a kind (design note "second example and copies", PR 3; owner direction and lead, 2026-11-27): a
// later section draws another card of the kind on another example, a demonstration only. The example is the section's
// own: its create writes the example's two numbers as role-named parameters (example_first_addend, ...), never
// outline numbers; the program supplies the one number its demonstration moves (a lesson number appended before that
// section is written, `prepare_section`) and binds the create to it. The pair is drawn as written; the practice, its
// task and its answer row stay on the lesson's first card. These rules are pure, so the compiler, the section facts
// and the walk of the lesson's numbers agree.
import { makeTenFault, makeTenFaultText, makeTenFreshCount, placeValueTimesTenPracticeProblem, placeValueTradeFault, placeValueTradeFaultText, type PlaceValueTimesTenProblem } from "octos-lesson-language/plugin-math";
import { makeTenStartValues } from "./make-ten-moves.js";
import { placeValueTradeColumnsOf, placeValueTradeThousandths, tradeDecimal } from "./place-value-trade-moves.js";
import { timesTenDecimal, timesTenStartProblem } from "./place-value-times-ten-moves.js";
import { placeValueThousandths } from "./place-value-moves.js";

/** The kinds that take a second card, each with its example's parameters and what the program supplies. */
export const SECOND_CARDS = {
  make_ten: { parameters: ["example_first_addend", "example_second_addend"], demonstration: 4, label: "第二个例子：大数那一框里有几个", max: 10 },
  place_value_trade: { parameters: ["example_first_number", "example_second_number"], demonstration: 4, label: "第二个例子：做完了几列", max: 6 },
  place_value_times_ten: { parameters: ["example_amount", "example_unit_asked"], demonstration: 4, label: "第二个例子：现在用什么单位在数", max: 1_000_000 },
} as const;
export type SecondCardKind = keyof typeof SECOND_CARDS;
export const isSecondCardKind = (capability: string): capability is SecondCardKind => capability in SECOND_CARDS;

/** The example a create writes ([first, second]), or undefined when it writes none (a first card). */
export function exampleOf(capability: string, parameters: Record<string, unknown> | undefined): [number, number] | undefined {
  if (!isSecondCardKind(capability) || !parameters) return undefined;
  const [first, second] = SECOND_CARDS[capability].parameters.map((name) => parameters[name]);
  if (first === undefined && second === undefined) return undefined;
  return [Number(first), Number(second)];
}

/**
 * Whether a create is a second card: it writes an example, and the kind's first create in the plan (`sections`, in
 * order) is another card, the lesson's first, whatever parameters that one writes (a first card's example parameters
 * are read over; review of #199).
 */
export function isSecondCard(capability: string, content: { parameters?: Record<string, unknown> }, sections: ReadonlyArray<{ moments: ReadonlyArray<{ actions: ReadonlyArray<unknown> }> }>): boolean {
  if (!isSecondCardKind(capability) || !exampleOf(capability, content.parameters)) return false;
  for (const section of sections) for (const moment of section.moments) for (const raw of moment.actions) {
    const action = raw as { action?: string; kind?: string; content?: { capability?: string; parameters?: Record<string, unknown> } };
    if (action.action !== "create" || action.kind !== "visual" || action.content?.capability !== capability) continue;
    return action.content !== content;
  }
  return false;
}

/**
 * The second card's full starting values, in the kind's number order (its example pair where the question's pair
 * goes, the first card's practice, its demonstration fresh), from the first card's values (in its order, as the outline
 * declares them) and parameters; or why the example cannot be drawn, as a fact. The example is another of the kind:
 * never the question's pair nor the practice's (the same two numbers in the other order are the same sum).
 */
export function exampleStart(capability: SecondCardKind, example: readonly number[], first: readonly number[], firstParameters: Record<string, unknown> | undefined):
  { start: number[] } | { fault: string } {
  const [x, y] = example as [number, number];
  if (![x, y].every((value) => Number.isFinite(value))) return { fault: `the second ${cardName(capability)} writes its example's two numbers (${SECOND_CARDS[capability].parameters.join(", ")})` };
  const same = (a: number, b: number, c: number, d: number, ordered: boolean) => (a === c && b === d) || (!ordered && a === d && b === c);
  if (capability === "make_ten") {
    const [a, b, pa, pb] = makeTenStartValues(first);
    const fault = makeTenFault(x, y);
    if (fault) return { fault: `the second make-ten card's example: ${makeTenFaultText(fault, x, y)}` };
    if (same(x, y, a!, b!, false)) return { fault: `the second make-ten card's example ${x} + ${y} is the question's pair` };
    if (same(x, y, pa!, pb!, false)) return { fault: `the second make-ten card's example ${x} + ${y} is the practice pair, which the learner works after class` };
    return { start: [x, y, pa!, pb!, makeTenFreshCount(x, y), 0] };
  }
  if (capability === "place_value_trade") {
    const operation = firstParameters?.operation;
    const [a, b, pa, pb] = first;
    if (operation !== "add" && operation !== "subtract") return { fault: "the second place-value trade card adds or subtracts as the first does" };
    const [X, Y, A, B] = [x, y, a!, b!].map((value) => placeValueTradeThousandths(value));
    if ([X, Y].some((value) => value === undefined)) return { fault: `the second place-value trade card's example ${x}, ${y}: two numbers from 0 to 999,999.99 with at most two decimal places` };
    // The example's own fault, named as the example's (review of #199): a difference below zero, no trade, too wide.
    const own = placeValueTradeFault(operation, X!, Y!);
    if (own) return { fault: `the second place-value trade card's example ${x} ${operation === "add" ? "+" : "−"} ${y}: ${placeValueTradeFaultText(own, operation, X!, Y!)}` };
    if (A !== undefined && B !== undefined && placeValueTradeColumnsOf(operation, X!, Y!).join() !== placeValueTradeColumnsOf(operation, A, B).join()) {
      return { fault: `the second place-value trade card's example ${x}, ${y} has other places than the question's pair ${a}, ${b}: the second card keeps the question's places (as many whole digits and decimal places, and an answer that gains a column only when the question's does)` };
    }
    const ordered = operation === "subtract";
    if (same(x, y, a!, b!, ordered)) return { fault: `the second place-value trade card's example ${x}, ${y} is the question's pair` };
    if (same(x, y, pa!, pb!, ordered)) return { fault: `the second place-value trade card's example ${x}, ${y} is the practice pair, which the learner works after class` };
    return { start: [x, y, pa!, pb!, 0] };
  }
  const found = timesTenStartProblem(first);
  if ("fault" in found) return { fault: `the times-ten card the lesson starts with has no problem: ${found.fault}` };
  const [X, Y] = [placeValueThousandths(x), placeValueThousandths(y)];
  if (X === undefined || Y === undefined) return { fault: "the second times-ten card's example is two numbers above 0 with at most three decimal places" };
  const problem = placeValueTimesTenPracticeProblem(found.problem, X, Y) as PlaceValueTimesTenProblem | { fault: string };
  if ("fault" in problem) return { fault: `the second times-ten card's example ${x}, ${y} is not a problem of the question's kind (${problem.fault})` };
  if (same(X, Y, found.problem.amount, found.problem.target, true)) return { fault: `the second times-ten card's example ${x}, ${y} is the question` };
  if (same(X, Y, found.practice.amount, found.practice.target, true)) return { fault: `the second times-ten card's example ${x}, ${y} is the practice, which the learner works after class` };
  return { start: [x, y, first[2]!, first[3]!, timesTenDecimal(problem.start)] };
}

export const cardName = (capability: SecondCardKind) => ({ make_ten: "make-ten card", place_value_trade: "place-value trade card", place_value_times_ten: "times-ten card" })[capability];

/** The example as a plain pair, as the lesson writes it (trade values may be decimals in thousandths). */
export const exampleText = (capability: SecondCardKind, start: readonly number[]) => (capability === "place_value_trade"
  ? [tradeDecimal(placeValueTradeThousandths(start[0]!)!), tradeDecimal(placeValueTradeThousandths(start[1]!)!)] : [start[0]!, start[1]!]);
