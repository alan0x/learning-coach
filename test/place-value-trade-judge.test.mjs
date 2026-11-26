// The place-value trade judge (OLL decision 0026, need 35P-07): the development cases are well formed, and the
// judge is tried on trade lessons written by hand in the card's shape (OLL #116's SPEC example:
// the pair and "columns finished" bound bare, one status per column, a `complete` task by taps on a practice
// pair, then a typed answer anchored to the card), and on real lessons the compiler makes today (the
// place-value chart, a number line). A served lesson passes, including one whose demonstration stops partway;
// a near miss with a trade card fails; a served question drawn on the place-value chart fails; and a card or
// task that is not the question's, or a goal the learner cannot reach, fails; a lesson OLL refuses also fails
// "the lesson plays". Lessons the recipe makes are judged in test/place-value-trade-recipe.test.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { judgePlaceValueTrade, tradeNumeral, tradePairFault, tradeThousandths } from "../scripts/place-value-trade-judge.mjs";
import { placeValuePlan, samplePlan } from "./sample-plans.mjs";
import { buildPlaceValueChart } from "octos-lesson-language/plugin-math";

const ALIASES = { 5: "hundred-thousands", 4: "ten-thousands", 3: "thousands", 2: "hundreds", 1: "tens", 0: "ones", [-1]: "tenths", [-2]: "hundredths" };
const variableOf = (place) => `col_${ALIASES[place].replace(/-/g, "_")}`;
const value = (text) => tradeThousandths(text);

/** The columns of a pair, highest first, as the card draws them (OLL #115's rule). */
function columnsOf(operation, a, b) {
  const decimals = (v) => (v % 1000 === 0 ? 0 : v % 100 === 0 ? 1 : 2);
  const top = (v) => (v >= 1000 ? String(Math.floor(v / 1000)).length - 1 : v >= 100 ? -1 : v >= 10 ? -2 : -3);
  const low = -Math.max(decimals(a), decimals(b));
  const high = Math.max(top(a), top(b), top(operation === "add" ? a + b : a - b), low);
  return Array.from({ length: high - low + 1 }, (_, i) => high - i);
}

/** A trade lesson as the recipe is to write it: the card, each value of "columns finished" animated, practice pairs. */
function tradeLesson({ operation, a, b, language = "en-US", cardLanguage = language, practice = [], finished = [], answers }) {
  const A = value(a), B = value(b);
  const columns = columnsOf(operation, A, B);
  // A range is never one value: one more unit of the lowest column, which the card's columns still hold.
  const unit = 10 ** (columns.at(-1) + 3);
  const pairs = practice.map(([pa, pb]) => [value(pa), value(pb)]);
  const result = (x, y) => (operation === "add" ? x + y : x - y);
  const tasks = pairs.flatMap(([pa, pb], i) => [
    {
      as: `practice-${i + 1}`,
      prompt: operation === "add" ? "Add on the chart, column by column." : "Subtract on the chart, column by column.",
      availability: { kind: "after_lesson" },
      start: { kind: "practice", variables: ["a", "b", "finished", ...columns.map(variableOf)], values: { a: pa, b: pb, finished: 0, ...Object.fromEntries(columns.map((place) => [variableOf(place), 0])) } },
      allowed_operations: [{ kind: "card_tap", node: "sum" }],
      completion: { kind: "card_fact", node: "sum", fact: "complete" },
      hints: ["Start with any column."],
    },
    {
      as: `answer-${i + 1}`, anchor: "sum",
      prompt: operation === "add" ? "What is the total?" : "What is left?",
      availability: { kind: "after_lesson" },
      allowed_operations: [{ kind: "answer_entry" }],
      completion: { kind: "numeric_answer", answer: answers?.[i] ?? tradeNumeral(result(pa, pb)) },
      hints: ["Read the answer row, one digit per column."],
    },
  ]);
  const content = {
    ...(cardLanguage !== "en-US" ? { language: cardLanguage } : {}),
    operation, top_place: columns[0], low_place: columns.at(-1), a: A, b: B, finished: 0,
    places: columns.map((place) => ({ as: ALIASES[place], place, status: 0 })),
    bindings: [{ target: "a", expression: "a" }, { target: "b", expression: "b" }, { target: "finished", expression: "finished" },
      ...columns.map((place) => ({ target: `${ALIASES[place]}.status`, expression: variableOf(place) }))],
  };
  return {
    dsl: "octos.lesson", version: "0.1", profile: "authoring",
    lesson: {
      mode: "explain", language, title: "Column method", goals: ["Add and subtract with trades"],
      variables: [
        { as: "a", label: "a", initial: A, min: Math.min(A, ...pairs.map(([x]) => x)), max: Math.max(A + unit, ...pairs.map(([x]) => x)) },
        { as: "b", label: "b", initial: B, min: Math.min(B, ...pairs.map(([, y]) => y)), max: Math.max(B + unit, ...pairs.map(([, y]) => y)) },
        { as: "finished", label: "columns finished", initial: 0, min: 0, max: columns.length },
        ...columns.map((place) => ({ as: variableOf(place), label: variableOf(place), initial: 0, min: 0, max: operation === "add" ? 2 : 3 })),
      ],
      tasks,
    },
    steps: [{
      key: "show", purpose: "See the problem",
      beats: [
        { key: "draw", say: "Here is the problem.", actions: [{ do: "write", as: "sum", kind: "place_value_trade", role: "main_visual", content, place: { relation: "new_region" } }] },
        ...finished.map((k) => ({ key: `col-${k}`, say: "Look.", actions: [{ do: "animate", variable: "finished", value: k }] })),
      ],
    }],
    close: { summary: "Ten of a place make one of the next.", focus: ["sum"] },
  };
}

const failed = (verdict) => verdict.checks.filter((check) => !check.pass).map((check) => check.check);
const noted = (verdict) => verdict.notes.filter((check) => !check.pass).map((check) => check.check);

const cases = JSON.parse(await readFile(new URL("../testsuite/place-value-trade-dev-cases.json", import.meta.url), "utf8")).cases;
const blueprint = JSON.parse(await readFile(new URL("../testsuite/place-value-trade-blueprint.json", import.meta.url), "utf8"));
const byId = Object.fromEntries(cases.map((item) => [item.id, item]));

test("the development cases: 15 this need serves, each a pair the card takes with its result, and 6 near misses", () => {
  assert.equal(cases.length, 21);
  assert.deepEqual(blueprint.rows.map((row) => row.id), ["A1", "A2", "A3", "A4", "A5", "A6"]);
  const served = cases.filter((item) => !item.expect.forbid);
  assert.equal(served.length, 15);
  assert.deepEqual(cases.filter((item) => item.expect.forbid).map((item) => item.expect.forbid), Array(6).fill(["place_value_trade"]));
  assert.ok(cases.filter((item) => item.expect.forbid).every((item) => item.expect.need !== "35P-07" && item.row === null));
  assert.deepEqual([served.filter((item) => item.language === "en-US").length, served.filter((item) => item.language === "zh-CN").length], [8, 7]);
  assert.deepEqual([served.filter((item) => item.expect.operation === "add").length, served.filter((item) => item.expect.operation === "subtract").length], [7, 8]);
  for (const item of served) {
    assert.equal(item.expect.need, "35P-07", item.id);
    assert.ok(blueprint.rows.some((row) => row.id === item.row), item.id);
    const [a, b] = item.expect.numbers.map(tradeThousandths);
    assert.equal(tradePairFault(item.expect.operation, a, b), undefined, item.id);
    assert.equal(item.expect.operation === "add" ? a + b : a - b, tradeThousandths(item.expect.result), item.id);
  }
});

test("written numbers are read exactly: grouping, full-width digits and trailing zeros; never a float", () => {
  assert.deepEqual(["3,486", "4.230", "４．２３", "５", "0.05", "999999.99"].map(tradeThousandths), [3_486_000, 4230, 4230, 5000, 50, 999_999_990]);
  assert.deepEqual(["1.2345", "-3", "3/4", "", "1e3"].map(tradeThousandths), [undefined, undefined, undefined, undefined, undefined]);
  assert.deepEqual([6_225_000, 4230, 50, 0].map(tradeNumeral), ["6225", "4.23", "0.05", "0"]);
  // The card refuses a pair with no trade, a negative difference, more than two decimals or six columns.
  assert.equal(tradePairFault("add", value("1234"), value("4321")), "no_trade");
  assert.equal(tradePairFault("subtract", value("8765"), value("4321")), "no_trade");
  assert.equal(tradePairFault("subtract", value("2476"), value("50003")), "negative");
  assert.equal(tradePairFault("add", value("389457"), value("947568")), "too_wide");
  assert.equal(tradePairFault("add", value("12345"), value("0.05")), "too_wide");
  assert.equal(tradePairFault("add", 3_486_005, value("2739")), "decimals");
  assert.equal(tradePairFault("add", value("2.75"), value("1.48")), undefined);
  // A pair below 1 has no ones column (OLL #115, review): 0.35 + 0.48 is two columns, and still carries.
  assert.equal(tradePairFault("add", value("0.35"), value("0.48")), undefined);
});

test("served lessons pass, in both languages, whether or not the demonstration finishes every column", () => {
  const whole = judgePlaceValueTrade(byId["PT-01"], tradeLesson({ operation: "add", a: "3486", b: "2739", practice: [["4658", "1573"]], finished: [1, 2, 3, 4] }));
  assert.deepEqual(failed(whole), []);
  assert.deepEqual(noted(whole), []);
  assert.ok(whole.pass);
  const across = judgePlaceValueTrade(byId["PT-09"], tradeLesson({ operation: "subtract", a: "50003", b: "2476", practice: [["40002", "3585"]], finished: [1, 5] }));
  assert.deepEqual(failed(across), []);
  const zh = judgePlaceValueTrade(byId["PT-15"], tradeLesson({ operation: "subtract", language: "zh-CN", a: "8.2", b: "3.75", practice: [["9.3", "4.68"]], finished: [1, 2, 3] }));
  assert.deepEqual(failed(zh), []);
  // The owner, 2026-11-25: a lesson may demonstrate part of the method; judged by its content, not a rule.
  const partway = judgePlaceValueTrade(byId["PT-12"], tradeLesson({ operation: "add", a: "2.75", b: "1.48", practice: [["3.86", "2.57"]], finished: [1] }));
  assert.ok(partway.pass);
  assert.deepEqual(noted(partway), ["the demonstration finishes every column"]);
  // A pair below 1 draws no ones column: two columns finished is the whole demonstration.
  const below = judgePlaceValueTrade({ id: "below-1", expect: { need: "35P-07", operation: "add", numbers: ["0.35", "0.48"], result: "0.83" } },
    tradeLesson({ operation: "add", a: "0.35", b: "0.48", practice: [["0.27", "0.56"]], finished: [1, 2] }));
  assert.deepEqual([failed(below), noted(below)], [[], []]);
  // Without a task on the card the lesson still passes; the owner judges whether it teaches enough.
  const watch = judgePlaceValueTrade(byId["PT-05"], tradeLesson({ operation: "add", a: "4999", b: "2001", finished: [4] }));
  assert.ok(watch.pass);
  assert.deepEqual(noted(watch), ["the learner has a task on the card", "a typed answer follows"]);
});

test("a near miss with a trade card fails; without one it passes", async () => {
  const lesson = tradeLesson({ operation: "add", a: "3486", b: "2739", practice: [["4658", "1573"]], finished: [4] });
  const near = judgePlaceValueTrade(byId["PT-16"], lesson);
  assert.equal(near.pass, false);
  assert.deepEqual(failed(near), ["no place-value trade card for this question"]);
  const api = await import("../lesson-plan.js");
  const { lesson: plain } = api.compileAndValidateLessonPlan(samplePlan("number_line"), { language: "en-US" });
  assert.ok(judgePlaceValueTrade(byId["PT-16"], plain).pass);
  // PT-18 (expanded form, 35P-05) is the chart's own: a chart there is not this judge's concern.
  const { lesson: chart } = api.compileAndValidateLessonPlan(placeValuePlan({ number: 6.04, practice: 3.07, given: "numeral" }), { language: "en-US" });
  assert.ok(judgePlaceValueTrade(byId["PT-18"], chart).pass);
});

test("a served question drawn on the place-value chart instead of the trade card fails, as does one with no card", async () => {
  const api = await import("../lesson-plan.js");
  const { lesson: chart } = api.compileAndValidateLessonPlan(placeValuePlan({ number: 7352, practice: 2618, given: "numeral" }), { language: "en-US" });
  assert.deepEqual(failed(judgePlaceValueTrade(byId["PT-06"], chart)), ["adding and subtracting is not drawn on the place-value chart"]);
  const { lesson: plain } = api.compileAndValidateLessonPlan(samplePlan("number_line"), { language: "en-US" });
  assert.deepEqual(failed(judgePlaceValueTrade(byId["PT-06"], plain)), ["a place-value trade card is drawn"]);
  // A chart beside the trade card is noted, not failed.
  const both = tradeLesson({ operation: "subtract", a: "7352", b: "2618", practice: [["8461", "3729"]], finished: [4] });
  both.steps[0].beats.push({ key: "chart", say: "Here is the chart.", actions: buildPlaceValueChart({ as: "chart", role: "supporting_visual", place: { relation: "new_region" }, mode: "build", given: "name", target: 7_352_000 }).actions });
  const verdict = judgePlaceValueTrade(byId["PT-06"], both);
  assert.ok(verdict.pass);
  assert.deepEqual(noted(verdict), ["no place-value chart beside the trade card"]);
});

test("a card that is not the question's fails: other numbers, the pair swapped, the other operation, another language", () => {
  const item = byId["PT-01"];
  const other = judgePlaceValueTrade(item, tradeLesson({ operation: "add", a: "3486", b: "2793", practice: [["4658", "1573"]] }));
  assert.deepEqual(failed(other), ["the card's two numbers are the question's, in order", "the card's pair gives the question's result"]);
  const swapped = judgePlaceValueTrade(item, tradeLesson({ operation: "add", a: "2739", b: "3486", practice: [["4658", "1573"]] }));
  assert.deepEqual(failed(swapped), ["the card's two numbers are the question's, in order"]);
  const subtracted = judgePlaceValueTrade(byId["PT-06"], tradeLesson({ operation: "add", a: "7352", b: "2618", practice: [["4658", "1573"]] }));
  assert.deepEqual(failed(subtracted), ["the card's operation is the question's", "the card's pair gives the question's result"]);
  const english = judgePlaceValueTrade(byId["PT-02"], tradeLesson({ operation: "add", language: "zh-CN", cardLanguage: "en-US", a: "4527", b: "1685", practice: [["3876", "2459"]] }));
  assert.deepEqual(failed(english), ["the card speaks the lesson's language"]);
  // The numbers are read where the card's bindings put them: at the variables' starting values.
  const bound = tradeLesson({ operation: "add", a: "3486", b: "2739", practice: [["4658", "1573"]] });
  bound.steps[0].beats[0].actions[0].content.a = value("3999");
  assert.ok(judgePlaceValueTrade(item, bound).pass);
  bound.lesson.variables[0].initial = value("3487");
  assert.deepEqual(failed(judgePlaceValueTrade(item, bound)), ["the card's two numbers are the question's, in order", "the card's pair gives the question's result"]);
});

test("every pair is judged on the card's own columns: a practice of another shape, or a card too narrow for its pair, fails", () => {
  const item = byId["PT-01"];
  // On PT-01's card (thousands to ones), 9,486 + 2,739 = 12,225 needs a ten-thousands column: the thousands' ten
  // has nowhere to go, so the chart can never be completed, and its answer cannot be read off it.
  assert.deepEqual(failed(judgePlaceValueTrade(item, tradeLesson({ operation: "add", a: "3486", b: "2739", practice: [["9486", "2739"]] }))),
    ["practice-1: the practice pair fits the card's columns", "answer-1: the typed answer after the card's task is the result of its pair"]);
  // A pair below 1 on the same card has no ones column of its own: another shape.
  assert.deepEqual(failed(judgePlaceValueTrade(item, tradeLesson({ operation: "add", a: "3486", b: "2739", practice: [["0.35", "0.48"]] }))),
    ["practice-1: the practice pair fits the card's columns", "answer-1: the typed answer after the card's task is the result of its pair"]);
  // A card drawn on thousands to ones cannot hold 68,957 + 21,068.
  const narrow = tradeLesson({ operation: "add", language: "zh-CN", a: "68957", b: "21068", practice: [["57846", "32175"]], finished: [5] });
  narrow.steps[0].beats[0].actions[0].content.top_place = 3;
  assert.deepEqual(failed(judgePlaceValueTrade(byId["PT-04"], narrow)), [
    "the card's columns are its pair's",
    "practice-1: the practice pair fits the card's columns",
    "answer-1: the typed answer after the card's task is the result of its pair",
  ]);
});

test("the answer typed after a task on the card is exactly its pair's result, anchored or not", () => {
  const item = byId["PT-01"];
  const lesson = (extra = {}) => tradeLesson({ operation: "add", a: "3486", b: "2739", practice: [["4658", "1573"]], finished: [4], ...extra });
  // The card's result is exact: a tolerance does not let another answer through.
  const loose = lesson({ answers: ["6230"] });
  loose.lesson.tasks[1].completion.tolerance = 1;
  assert.deepEqual(failed(judgePlaceValueTrade(item, loose)), ["answer-1: the typed answer after the card's task is the result of its pair"]);
  // Not anchored to the card: noted, and still held to the pair's result.
  const unanchored = lesson();
  delete unanchored.lesson.tasks[1].anchor;
  const verdict = judgePlaceValueTrade(item, unanchored);
  assert.deepEqual([failed(verdict), noted(verdict)], [[], ["answer-1: the typed answer after the card's task is anchored to the card"]]);
  unanchored.lesson.tasks[1].completion.answer = "6225";
  assert.deepEqual(failed(judgePlaceValueTrade(item, unanchored)), ["answer-1: the typed answer after the card's task is the result of its pair"]);
});

test("every task on the card has a goal the learner can reach", () => {
  const item = byId["PT-01"];
  const lesson = (practice, extra = {}) => tradeLesson({ operation: "add", a: "3486", b: "2739", practice, finished: [4], ...extra });
  // The practice pair is the lesson's own: the learner would copy the demonstration.
  assert.deepEqual(failed(judgePlaceValueTrade(item, lesson([["3486", "2739"]]))), ["the lesson plays", "practice-1: the practice pair is not the lesson's"]);
  // One number changed is another pair.
  assert.ok(judgePlaceValueTrade(item, lesson([["3486", "2738"]])).pass);
  // A pair with no carry, or one the card cannot draw, has no task on the card to do.
  // The typed answer after it has no finished chart to read either.
  assert.deepEqual(failed(judgePlaceValueTrade(item, lesson([["1234", "4321"]]))),
    ["the lesson plays", "practice-1: the practice pair is one the card takes", "answer-1: the typed answer after the card's task is the result of its pair"]);
  assert.deepEqual(failed(judgePlaceValueTrade(byId["PT-06"], tradeLesson({ operation: "subtract", a: "7352", b: "2618", practice: [["2618", "7352"]] }))),
    ["the lesson plays", "practice-1: the practice pair is one the card takes", "answer-1: the typed answer after the card's task is the result of its pair"]);
  // A practice that starts demonstrated or worked.
  const demoed = lesson([["4658", "1573"]]);
  demoed.lesson.tasks[0].start.values.finished = 2;
  assert.deepEqual(failed(judgePlaceValueTrade(item, demoed)), ["the lesson plays", "practice-1: the practice starts fresh"]);
  const worked = lesson([["4658", "1573"]]);
  worked.lesson.tasks[0].start.values.col_ones = 1;
  assert.deepEqual(failed(judgePlaceValueTrade(item, worked)), ["the lesson plays", "practice-1: the practice starts fresh"]);
  // The card's fact by taps alone (no "done"; 0026 §3).
  const withDone = lesson([["4658", "1573"]]);
  withDone.lesson.tasks[0].allowed_operations.push({ kind: "card_submit" });
  assert.deepEqual(failed(judgePlaceValueTrade(item, withDone)), ["the lesson plays", "practice-1: the task on the card is its complete fact, by taps"]);
  const noStart = lesson([["4658", "1573"]]);
  delete noStart.lesson.tasks[0].start;
  // Without a start the card keeps the lesson's pair, so the answer to the practice pair is not on it.
  assert.deepEqual(failed(judgePlaceValueTrade(item, noStart)),
    ["the lesson plays", "practice-1: the task on the card starts on its own pair", "answer-1: the typed answer after the card's task is the result of its pair"]);
  // The typed answer after the task is read off its finished chart: the practice pair's result, read exactly.
  assert.deepEqual(failed(judgePlaceValueTrade(item, lesson([["4658", "1573"]], { answers: ["6225"] }))), ["answer-1: the typed answer after the card's task is the result of its pair"]);
  assert.ok(judgePlaceValueTrade(item, lesson([["4658", "1573"]], { answers: ["6,231"] })).pass);
  assert.ok(judgePlaceValueTrade(byId["PT-12"], tradeLesson({ operation: "add", a: "2.75", b: "1.48", practice: [["3.86", "2.57"]], answers: ["6.430"] })).pass);
  // Two practice pairs: each answer follows its own pair.
  const two = lesson([["4658", "1573"], ["2847", "3965"]]);
  assert.deepEqual(failed(judgePlaceValueTrade(item, two)), []);
  two.lesson.tasks[3].completion.answer = "6231";
  assert.deepEqual(failed(judgePlaceValueTrade(item, two)), ["answer-2: the typed answer after the card's task is the result of its pair"]);
  // Any other typed question by the card (Coach places a model's question by the last card) asks what its own
  // words say: noted against the pair on the card, never failed.
  const asked = lesson([]);
  asked.lesson.tasks.push({ as: "total", anchor: "sum", prompt: "What is 3,486 + 2,739?", availability: { kind: "after_lesson" }, allowed_operations: [{ kind: "answer_entry" }], completion: { kind: "numeric_answer", answer: "6225" }, hints: ["Add each column."] });
  assert.deepEqual([failed(judgePlaceValueTrade(item, asked)), noted(judgePlaceValueTrade(item, asked))], [[], ["the learner has a task on the card"]]);
  asked.lesson.tasks[0].completion.answer = "57";
  assert.deepEqual([failed(judgePlaceValueTrade(item, asked)), noted(judgePlaceValueTrade(item, asked))], [[], ["total: a typed question by the card asks the result of the pair on it", "the learner has a task on the card"]]);
  // After a practice and its answer, a question about the lesson's own pair is noted, not failed.
  const later = lesson([["4658", "1573"]]);
  later.lesson.tasks.push({ as: "again", anchor: "sum", prompt: "And 3,486 + 2,739?", availability: { kind: "after_lesson" }, allowed_operations: [{ kind: "answer_entry" }], completion: { kind: "numeric_answer", answer: "6225" }, hints: ["Add each column."] });
  assert.ok(judgePlaceValueTrade(item, later).pass);
  assert.deepEqual(noted(judgePlaceValueTrade(item, later)), ["again: a typed question by the card asks the result of the pair on it"]);
});
