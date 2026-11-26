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
    // The chart reads its number as the value on it: 0 when a chart to build is drawn, the number when one to pull apart is.
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
  // value of columns finished does and which column it finishes, in the card's own sentences, and the practice
  // pair. Everything in the lesson's units (2.75, never thousandths). Facts, not instructions: a lesson may
  // rightly stop with columns still to do.
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
    // The card reads columns finished from 0 when it is drawn; a value it cannot take leaves it where it was.
    const now = state.get(lessonNumbers[TRADE_NUMBER.finished]!) ?? 0;
    const k = Number.isInteger(now) && now >= 0 && now <= columns.length ? now : 0;
    const card = placeValueTradeFacts(placeValueTradeDemoState(problem, k));
    const name = (place: number) => placeValueColumnName(place, cardLanguage);
    return { facts: {
      numbers: lessonNumbers,
      operation: op,
      pair: [tradeDecimal(a), tradeDecimal(b)],
      answer: tradeDecimal(op === "add" ? a + b : a - b),
      columns: columns.map(name),
      columns_finished: k,
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
