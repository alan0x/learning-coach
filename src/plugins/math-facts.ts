// Section facts of the math plugin: what a later section is told about a
// math visual already planned or on the board.
import { REARRANGEMENT_FACTS, REARRANGEMENT_MODEL_GUIDANCE, type RearrangementConstruction } from "../rearrangement.js";
import { fixedLineSamples } from "./math-teaching-contracts.js";
import type { SectionFactsHook } from "./section-facts.js";
import { baseTenFacts, baseTenStartFault } from "./base-ten-moves.js";
import { placeValueDecimal, placeValueNextValues, placeValueStartFault } from "./place-value-moves.js";
import {
  placeValueColumnName, placeValueColumns, placeValueColumnsFor, placeValueParts,
  placeValueTradeDemoState, placeValueTradeFacts, placeValueTradeProblemOn, placeValueTradeStepSentences,
} from "octos-lesson-language/plugin-math";
import { TRADE_NUMBER, placeValueTradeColumnsOf, placeValueTradeStartFault, placeValueTradeThousandths, tradeDecimal } from "./place-value-trade-moves.js";
import { MAKE_TEN_PLACES, makeTenFrame, makeTenFreshCount, makeTenProblemOf, makeTenStepSentences, makeTenToTen } from "octos-lesson-language/plugin-math";
import { MAKE_TEN_NUMBER, makeTenNext, makeTenStartFault, makeTenStartValues } from "./make-ten-moves.js";
import {
  placeValueTimesTenDemoState, placeValueTimesTenFacts, placeValueTimesTenPath, placeValueTimesTenPosition, placeValueTimesTenStepSentences,
} from "octos-lesson-language/plugin-math";
import { TIMES_TEN_NUMBER, timesTenDecimal, timesTenStartProblem } from "./place-value-times-ten-moves.js";
import { placeValueCompareColumn, placeValueCompareDemoEnd, placeValueCompareDemoState, placeValueCompareStepSentences } from "octos-lesson-language/plugin-math";
import { COMPARE_NUMBER, compareNumeral, compareStartProblem } from "./place-value-compare-moves.js";

export const MATH_SECTION_FACTS: Record<string, SectionFactsHook> = {
  // The trading mat in its own terms (owner, 2026-11-24): where practice starts, the amount no trade changes,
  // the counts each place passes as it is traded, and the pile with every trade made.
  // Only for a mat already drawn: before that, which lesson numbers it shows is the section's own choice, and a
  // guess states a wrong pile (review of #169). The guidance's rules hold either way.
  base_ten_trade: ({ established, numbers, state }) => {
    if (!numbers) return {};
    const lessonNumbers = established?.numbers ?? [];
    const start = lessonNumbers.map((number) => Number(numbers[number - 1]?.initial ?? 0));
    if (!lessonNumbers.length || baseTenStartFault(start)) return {};
    const now = lessonNumbers.map((number, place) => state.get(number) ?? start[place]!);
    return { facts: { numbers: lessonNumbers, ...baseTenFacts(start, now) } };
  },
  // The place-value chart in its own terms (OLL 0025), once it is drawn: the number, what the card gives, its
  // columns and the parts it pulls apart into, where the demonstration stands in the guidance's own terms (building:
  // the value on the chart now and what is still to place; pulling apart: what is still on the chart, what is
  // out, the places still on and the values the number can go to next), and the learner's practice number.
  place_value_chart: ({ established, numbers, state, language }) => {
    if (!numbers || !established?.numbers?.length) return {};
    const lessonNumbers = established.numbers;
    const values = lessonNumbers.map((number) => Number(numbers[number - 1]?.initial ?? 0));
    const given = String(established.parameters?.given ?? "");
    if (placeValueStartFault(values, given)) return {};
    const chartLanguage = /^en(?:-|$)/iu.test(language ?? "") ? "en-US" : "zh-CN";
    const number = Math.round(values[0]! * 1000);
    const { top_place, decimals } = placeValueColumnsFor(values.map((value) => Math.round(value * 1000)), chartLanguage);
    const build = given !== "numeral";
    // The chart reads its number as the value on it: 0 when a chart to build is drawn, the number when one to pull apart
    // is, or one to build that its own section never builds (the state the section is written from, `state`, says which).
    const now = Math.round((state.get(lessonNumbers[0]!) ?? (build ? 0 : values[0]!)) * 1000);
    return { facts: {
      numbers: lessonNumbers,
      number: values[0],
      task: given === "numeral" ? "pull_apart" : "build",
      given,
      columns: placeValueColumns(top_place, decimals).map((place) => placeValueColumnName(place, chartLanguage)),
      parts: placeValueParts(number).map((part) => ({ place: placeValueColumnName(part.place, chartLanguage), digit: part.digit, value: placeValueDecimal(part.value) })),
      ...(build
        ? { on_chart_now: placeValueDecimal(now), still_to_place: placeValueDecimal(number - now) }
        : {
          still_on_chart: placeValueDecimal(now), taken_out: placeValueDecimal(number - now),
          // Where the demonstration can go next, as facts (objective check 1: PV-07 and PV-09 wrote the value
          // still on the chart again in a later section, which changes nothing, and two more never moved it again).
          // Not an instruction: a lesson may rightly stop with places still on the chart.
          places_still_on_chart: placeValueParts(now).map((part) => placeValueColumnName(part.place, chartLanguage)),
          ...(now > 0 ? { next_values: placeValueNextValues(number, now, false).map(placeValueDecimal) } : {}),
        }),
      ...(values[1] !== undefined ? { practice_number: values[1] } : {}),
    } };
  },
  // The place-value trade card in its own terms (OLL 0026), once it is drawn: the pair, its answer and columns,
  // where the demonstration stands (columns finished, and the chart as it stands: each finished column's digit
  // below the line, each other column's disks in its rows and a carried disk waiting above it), what the next
  // value of columns finished does and which column it finishes, in the card's own sentences, where the
  // demonstration goes (every column, to the answer: owner, 2026-11-27, PT-12 stopped after the hundredths with an
  // unfinished sum on the board; information only, no check enforces it), and the practice pair. Everything in the
  // lesson's units (2.75, never thousandths).
  place_value_trade: ({ established, numbers, state, language }) => {
    if (!numbers || !established?.numbers?.length) return {};
    const lessonNumbers = established.numbers;
    const values = lessonNumbers.map((number) => Number(numbers[number - 1]?.initial ?? 0));
    const operation = established.parameters?.operation;
    if (placeValueTradeStartFault(values, operation)) return {};
    const op = operation as "add" | "subtract";
    const cardLanguage = /^en(?:-|$)/iu.test(language ?? "") ? "en-US" : "zh-CN";
    const [a, b, pa, pb] = values.slice(0, 4).map((value) => placeValueTradeThousandths(value)!) as [number, number, number, number];
    const columns = placeValueTradeColumnsOf(op, a, b);
    const problem = placeValueTradeProblemOn(op, a, b, columns);
    // Columns finished is 0 when the card is drawn, and a step the card refuses does not change it. It is read as
    // the card reads its own field: a whole number of columns, within the card's (OLL's placeValueTradeState).
    const now = Number(state.get(lessonNumbers[TRADE_NUMBER.finished]!) ?? 0);
    const k = Number.isFinite(now) ? Math.min(columns.length, Math.max(0, Math.floor(now + 1e-9))) : 0;
    const card = placeValueTradeFacts(placeValueTradeDemoState(problem, k));
    const name = (place: number) => placeValueColumnName(place, cardLanguage);
    return { facts: {
      numbers: lessonNumbers,
      operation: op,
      pair: [tradeDecimal(a), tradeDecimal(b)],
      answer: tradeDecimal(op === "add" ? a + b : a - b),
      columns: columns.map(name),
      columns_finished: k,
      demonstration_to: { columns_finished: columns.length, answer: tradeDecimal(op === "add" ? a + b : a - b) },
      chart_now: card.cells.map((cell) => (cell.down
        ? { column: name(cell.place), below_line: cell.answer }
        : op === "add"
          ? { column: name(cell.place), row_1: cell.top, row_2: cell.second, ...(cell.carry ? { carried_in: cell.carry } : {}) }
          : { column: name(cell.place), row_1: cell.top, take_away: cell.second })),
      ...(card.next
        ? { next: { value: card.next.finished, finishes: name(card.next.place), does: placeValueTradeStepSentences(problem, card.next.finished, cardLanguage) } }
        : { every_column_finished: true }),
      practice_pair: [tradeDecimal(pa), tradeDecimal(pb)],
    } };
  },
  // The make-ten card in its own terms (OLL 0027), once it is drawn: the pair and its sum, which frame fills (the
  // bigger number's) and which gives, how many cross to make ten and the ones left then, where the demonstration
  // stands (the count in the bigger frame now, each frame's count), what the next value does in the card's own
  // sentences, where the demonstration goes (the bigger frame full, 10: owner, 2026-11-27; information only, no check
  // enforces it, OLL 0027 §9), and the practice pair.
  make_ten: ({ established, numbers, state, language }) => {
    if (!numbers || !established?.numbers?.length) return {};
    const lessonNumbers = established.numbers;
    const values = makeTenStartValues(lessonNumbers.map((number) => Number(numbers[number - 1]?.initial ?? 0)));
    if (makeTenStartFault(values)) return {};
    const cardLanguage = /^en(?:-|$)/iu.test(language ?? "") ? "en-US" : "zh-CN";
    const [a, b, pa, pb] = values as [number, number, number, number];
    const problem = makeTenProblemOf(a, b);
    const start = makeTenFreshCount(a, b);
    // The count is the bigger number when the card is drawn; a step the card refuses does not change it. It is read
    // as the card reads its own field: a whole number from the bigger number to 10 (OLL's makeTenState).
    const now = Number(state.get(lessonNumbers[MAKE_TEN_NUMBER.filled]!) ?? start);
    const filled = Number.isFinite(now) ? Math.min(MAKE_TEN_PLACES, Math.max(start, Math.floor(now + 1e-9))) : start;
    const card = { problem, moved: filled - start };
    return { facts: {
      numbers: lessonNumbers,
      pair: [a, b],
      sum: a + b,
      fills: { number: Math.max(a, b), frame: problem.big === 0 ? "first" : "second" },
      gives: Math.min(a, b) === Math.max(a, b) ? b : Math.min(a, b),
      to_make_ten: makeTenToTen(problem),
      ones_left: problem.left,
      in_bigger_frame_now: filled,
      demonstration_to: { in_bigger_frame: MAKE_TEN_PLACES },
      frames_now: [makeTenFrame(card, 0).count, makeTenFrame(card, 1).count],
      ...(filled < MAKE_TEN_PLACES
        ? { next: { value: filled + 1, does: makeTenNext(a, b, filled), says: makeTenStepSentences(problem, filled, filled + 1, cardLanguage) } }
        : { ten_made: true }),
      practice_pair: [pa, pb],
    } };
  },
  // The times-ten card in its own terms (OLL 0028), once it is drawn: the question (a count or a times pair), the
  // amount and the unit asked (named by role, as the outline's numbers are), the answer, the path "counted in" takes,
  // where the demonstration stands (counted in now, and each column's disks, rows of ten and squares), each later
  // value of counted in with what it does in the card's own sentences, where the demonstration goes (counted in to
  // the unit asked: owner, 2026-11-27; information only, no check enforces it), and the practice. Everything as the
  // lesson writes it (0.01, never thousandths).
  place_value_times_ten: ({ established, numbers, state, language }) => {
    if (!numbers || !established?.numbers?.length) return {};
    const lessonNumbers = established.numbers;
    const found = timesTenStartProblem(lessonNumbers.map((number) => Number(numbers[number - 1]?.initial ?? 0)));
    if ("fault" in found) return {};
    const { problem, practice } = found;
    const cardLanguage = /^en(?:-|$)/iu.test(language ?? "") ? "en-US" : "zh-CN";
    const path = placeValueTimesTenPath(problem);
    // Counted in starts at the problem's start unit; a step the card refuses does not change it. It is read as the
    // card reads its own field: its place along the path, whole steps only (a value between two is the earlier).
    const now = Number(state.get(lessonNumbers[TIMES_TEN_NUMBER.countedIn]!) ?? timesTenDecimal(problem.start));
    const position = Number.isFinite(now) ? Math.floor(placeValueTimesTenPosition(problem, Math.round(now * 1000)) + 1e-9) : 0;
    const k = Math.min(path.length - 1, Math.max(0, position));
    const chart = placeValueTimesTenFacts(placeValueTimesTenDemoState(problem, k));
    const does = placeValueTimesTenStepSentences(problem, cardLanguage);
    const name = (place: number) => placeValueColumnName(place, cardLanguage);
    return { facts: {
      numbers: lessonNumbers,
      question: problem.question,
      amount: timesTenDecimal(problem.amount),
      unit_asked: timesTenDecimal(problem.target),
      answer: problem.question === "times" ? { renamed: problem.renamed, times: problem.result } : { count: problem.result },
      counted_in_path: path.map(timesTenDecimal),
      counted_in_now: timesTenDecimal(path[k]!),
      demonstration_to: { counted_in: timesTenDecimal(path.at(-1)!) },
      chart_now: chart.columns.map((column) => ({ column: name(column.place), disks: column.disks, rows_of_ten: column.rows, squares: column.squares })),
      ...(k < path.length - 1
        ? { next: path.slice(k + 1).map((value, i) => ({ value: timesTenDecimal(value), does: does[k + i]! })) }
        : { reached_target: true }),
      practice: [timesTenDecimal(practice.amount), timesTenDecimal(practice.target)],
    } };
  },
  // The compare card in its own terms (OLL 0029), once it is drawn: the pair as written (0.70 keeps its zero), its
  // columns, the deciding place and the true sign (the lesson's own pair: the demonstration shows it), where the
  // demonstration stands (compared now, and each column as judged so far), what the next value does in the card's own
  // sentences, where the demonstration goes (compared to the sign: owner, 2026-11-27; information only, no check
  // enforces it), and the practice pair as written (never its answer: the learner finds it on the card).
  place_value_compare: ({ established, numbers, state, language }) => {
    if (!numbers || !established?.numbers?.length) return {};
    const lessonNumbers = established.numbers;
    const definitions = lessonNumbers.map((number) => numbers[number - 1]);
    const found = compareStartProblem(definitions.map((definition) => Number(definition?.initial ?? 0)), definitions.map((definition) => definition?.written_decimals));
    if ("fault" in found) return {};
    const { pair, numbers: [a, b, pa, pb] } = found;
    const cardLanguage = /^en(?:-|$)/iu.test(language ?? "") ? "en-US" : "zh-CN";
    const end = placeValueCompareDemoEnd(pair);
    // Compared starts at 0; a value past the end is the end; it is read as the card reads its own field.
    const now = Number(state.get(lessonNumbers[COMPARE_NUMBER.compared]!) ?? 0);
    const k = Number.isFinite(now) ? Math.min(end, Math.max(0, Math.floor(now + 1e-9))) : 0;
    const shown = placeValueCompareDemoState(pair, k);
    const name = (place: number) => placeValueColumnName(place, cardLanguage);
    const says = placeValueCompareStepSentences(pair, 0, end, cardLanguage);
    return { facts: {
      numbers: lessonNumbers,
      pair: [compareNumeral(a!), compareNumeral(b!)],
      columns: pair.columns.map(name),
      deciding_place: pair.equal ? null : name(pair.place),
      relation: pair.relation,
      compared_now: k,
      chart_now: pair.columns.map((place, index) => {
        const column = placeValueCompareColumn(shown, index);
        return { column: name(place), first: column.a, second: column.b, ...(column.status === "open" ? {} : { marked: column.status === "same" ? "=" : column.status === "decides" ? "≠" : "doesn't matter" }) };
      }),
      ...(k < end
        ? { next: Array.from({ length: end - k }, (_, i) => ({ value: k + i + 1, does: says[k + i]! })) }
        : { sign_chosen: pair.relation }),
      demonstration_to: { compared: end },
      practice_pair: [compareNumeral(pa!), compareNumeral(pb!)],
    } };
  },
  function_plot: ({ established }) => (established && fixedLineSamples(established) ? { lead: { sample_slope: "constant" } } : {}),
  geometric_rearrangement: ({ mode, established, numbers, state }) => {
    let facts: Record<string, unknown> = {};
    if (established) {
      const construction = (established.parameters?.construction ?? "right_triangle_square") as RearrangementConstruction;
      const definition = REARRANGEMENT_FACTS[construction];
      const number = established.numbers?.[0];
      const range = number ? numbers?.[number - 1] : undefined;
      facts = definition ? {
        construction, pieces: definition.pieces, shows: definition.shows,
        container: definition.container, at_start: definition.initial, at_end: definition.final,
        fixed_legs: { a: established.parameters?.leg_a ?? 3, b: established.parameters?.leg_b ?? 2 },
        ...(range && number ? { progress: { number, current_value: state.get(number),
          normalized: ((state.get(number) ?? range.initial) - range.min) / (range.max - range.min) } } : {}),
      } : {};
    }
    return { facts: { ...facts, ...(mode === "create" ? { construction_choices: REARRANGEMENT_MODEL_GUIDANCE } : {}) } };
  },
  circle_polygon_bounds: ({ established }) => ({
    facts: { circle_fixed: true, radius: established?.parameters?.radius ?? 2,
      side_count: { min: 3, max: 384, integer: true },
      pi_lower: "n*sin(pi/n)", pi_upper: "n*tan(pi/n)",
      n96: { lower: 3.1410319508905093, upper: 3.142714599645368 },
      caution: "Use the actual regular polygons, not circle_and_arc; displayed bounds are approximations, not exact historical rational bounds." },
  }),
};
