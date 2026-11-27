// The place-value compare judge (OLL decision 0029, need 35P-06): the development cases are well formed, and the
// judge is tried on compare lessons written by hand in the card's shape, played through OLL (OLL #130's SPEC example: the pair, the
// written decimals when a number ends in a written zero, "compared", "marked" and "signed" bound bare, a `complete`
// task by taps on a practice pair of its own). A served lesson passes, also one whose demonstration stops partway; a
// near miss with a compare card fails; a served question drawn on the place-value chart fails; and a card or a task
// that is not the question's, or a goal the learner cannot reach, fails.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compareFault, comparePair, judgePlaceValueCompare, ownDecimals, practiceFault, writtenNumber } from "../scripts/place-value-compare-judge.mjs";

const n = writtenNumber;

/** A compare lesson as the recipe is to write it: the card, "compared" animated, practice tasks on their own pair. */
function compareLesson({ a, b, language = "en-US", cardLanguage = language, practice = [], compared = [], starts = [], cardStart = {}, decimals = false, card = {}, task = {} }) {
  const A = n(a), B = n(b);
  const written = (x) => x.dec !== ownDecimals(x.value);
  const fields = ["a", "b", ...(decimals ? ["a_decimals", "b_decimals"] : []), "compared", "marked", "signed"];
  const content = {
    ...(cardLanguage !== "en-US" ? { language: cardLanguage } : {}),
    a: A.value, b: B.value,
    ...(decimals ? { a_decimals: A.dec, b_decimals: B.dec } : { ...(written(A) ? { a_decimals: A.dec } : {}), ...(written(B) ? { b_decimals: B.dec } : {}) }),
    compared: 0, marked: 0, signed: 0, ...cardStart, ...card,
    bindings: fields.map((field) => ({ target: field, expression: field })),
  };
  const tasks = practice.map(([pa, pb], i) => {
    const PA = n(pa), PB = n(pb);
    const values = { a: PA.value, b: PB.value, ...(decimals ? { a_decimals: PA.dec, b_decimals: PB.dec } : {}), compared: 0, marked: 0, signed: 0, ...(starts[i] ?? {}) };
    return {
      as: `practice-${i + 1}`, prompt: "Compare the two numbers.", availability: { kind: "after_lesson" },
      start: { kind: "practice", variables: Object.keys(values), values },
      allowed_operations: [{ kind: "card_tap", node: "chart" }],
      completion: { kind: "card_fact", node: "chart", fact: "complete" },
      hints: ["Start at the left."],
      ...task,
    };
  });
  return {
    dsl: "octos.lesson", version: "0.1", profile: "authoring",
    lesson: {
      mode: "explain", language, title: "Comparing by place", goals: ["Compare two numbers by place"],
      variables: [
        { as: "a", initial: A.value, min: 0, max: 9_999_999_999 }, { as: "b", initial: B.value, min: 0, max: 9_999_999_999 },
        ...(decimals ? [{ as: "a_decimals", initial: A.dec, min: 0, max: 3 }, { as: "b_decimals", initial: B.dec, min: 0, max: 3 }] : []),
        { as: "compared", initial: cardStart.compared ?? 0, min: 0, max: 8 }, { as: "marked", initial: cardStart.marked ?? 0, min: 0, max: 7 }, { as: "signed", initial: cardStart.signed ?? 0, min: 0, max: 1 },
      ],
      tasks,
    },
    steps: [{
      key: "show", purpose: "See the pair",
      beats: [
        { key: "draw", say: "Here are two numbers.", actions: [{ do: "write", as: "chart", kind: "place_value_compare", role: "main_visual", content, place: { relation: "new_region" } }] },
        ...compared.map((value) => ({ key: `to-${value}`, say: "Look.", actions: [{ do: "animate", variable: "compared", value }] })),
      ],
    }],
    close: { summary: "The first place that differs decides.", focus: ["chart"] },
  };
}

// The judge names each fault itself; OLL refuses most of these lessons too ("the lesson plays"), left out here and
// tested on its own.
const failedAll = (verdict) => verdict.checks.filter((check) => !check.pass).map((check) => check.check);
const failed = (verdict) => failedAll(verdict).filter((check) => check !== "the lesson plays");
const noted = (verdict) => verdict.notes.filter((check) => !check.pass).map((check) => check.check);
const cases = JSON.parse(await readFile(new URL("../testsuite/place-value-compare-dev-cases.json", import.meta.url), "utf8")).cases;
const blueprint = JSON.parse(await readFile(new URL("../testsuite/place-value-compare-blueprint.json", import.meta.url), "utf8"));
const byId = Object.fromEntries(cases.map((item) => [item.id, item]));
const PLACE_NAMES = { 6: "millions", 5: "hundred_thousands", 4: "ten_thousands", 3: "thousands", 2: "hundreds", 1: "tens", 0: "ones", [-1]: "tenths", [-2]: "hundredths", [-3]: "thousandths" };

test("the development cases: 15 this need serves, each a pair the card takes with its relation and deciding place, and 6 near misses", () => {
  assert.deepEqual(blueprint.rows.map((row) => row.id), ["C1", "C2", "C3", "C4", "C5", "C6"]);
  const served = cases.filter((item) => !item.expect.forbid);
  const near = cases.filter((item) => item.expect.forbid);
  assert.equal(served.length, 15);
  assert.equal(near.length, 6);
  for (const item of served) {
    const [a, b] = item.expect.numbers.map(n);
    assert.equal(compareFault(a, b), undefined, item.id);
    const pair = comparePair(a, b);
    assert.equal(pair.relation, item.expect.relation, item.id);
    assert.equal(pair.deciding === null ? null : PLACE_NAMES[pair.deciding], item.expect.deciding_place, item.id);
    assert.ok(blueprint.rows.some((row) => row.id === item.row), item.id);
  }
  assert.ok(near.every((item) => item.expect.forbid.includes("place_value_compare") && item.expect.need !== "35P-06"));
  assert.deepEqual([...new Set(cases.map((item) => item.language))].sort(), ["en-US", "zh-CN"]);
  // Two equal pairs, written differently (C6): the card serves them, and keeps each written zero.
  assert.deepEqual(served.filter((item) => item.expect.relation === "=").map((item) => item.expect.numbers), [["0.7", "0.70"], ["4.300", "4.3"]]);
});

test("the card's rules: written decimals, the pairs it refuses, practice pairs (as OLL's placeValueComparePracticeFault)", () => {
  assert.deepEqual(n("0.70"), { value: 700, dec: 2 });
  assert.deepEqual(n("４，５３０".replace("，", ",")), { value: 4_530_000, dec: 0 });
  assert.equal(n("1.2345"), undefined);
  assert.equal(compareFault(n("0.7"), n("0.70")), undefined, "equal values written differently are a pair");
  assert.equal(compareFault(n("4530"), n("4530")), "same_numeral");
  assert.equal(compareFault(n("1234567"), n("0.5")), "too_wide");
  assert.equal(compareFault({ value: 625, dec: 2 }, n("0.7")), "decimals", "0.625 written with two decimals");
  assert.deepEqual(comparePair(n("1000000"), n("999999")), { deciding: 6, relation: ">", end: 2 });
  assert.deepEqual(comparePair(n("0.7"), n("0.70")), { deciding: null, relation: "=", end: 4 });
  const shown = [n("4530"), n("4503")];
  assert.equal(practiceFault(shown, n("6281"), n("6218")), undefined);
  assert.equal(practiceFault(shown, n("4530"), n("4503")), "same_pair");
  assert.equal(practiceFault(shown, n("4503"), n("4530")), "same_pair", "the lesson's pair the other way round");
  assert.equal(practiceFault(shown, n("6281"), n("6281")), "same_numeral");
});

test("a served lesson passes: the pair as written, a fresh card, the demonstration to the sign, a practice of its own", () => {
  const whole = judgePlaceValueCompare(byId["PC-01"], compareLesson({ a: "7284", b: "7248", practice: [["5602", "5620"]], compared: [2, 4] }));
  assert.deepEqual(failed(whole), []);
  assert.deepEqual(noted(whole), []);
  // Either order: the card's relation is read the other way round.
  assert.deepEqual(failed(judgePlaceValueCompare(byId["PC-01"], compareLesson({ a: "7248", b: "7284", practice: [["5602", "5620"]], compared: [4] }))), []);
  // An equal pair written differently, its written decimals bound; a practice of its own written decimals.
  const equal = judgePlaceValueCompare(byId["PC-14"], compareLesson({ a: "0.7", b: "0.70", decimals: true, practice: [["2.50", "2.5"]], compared: [4] }));
  assert.deepEqual(failed(equal), []);
  // Chinese.
  assert.deepEqual(failed(judgePlaceValueCompare(byId["PC-09"], compareLesson({ language: "zh-CN", a: "0.45", b: "0.405", practice: [["0.36", "0.306"]], compared: [4] }))), []);
  // A demonstration that stops partway is a note, not a failure (no "must finish" rule).
  const partway = judgePlaceValueCompare(byId["PC-01"], compareLesson({ a: "7284", b: "7248", practice: [["5602", "5620"]], compared: [2] }));
  assert.deepEqual(failed(partway), []);
  assert.deepEqual(noted(partway), ["the demonstration reaches the sign"]);
});

test("a near miss drawn on the compare card fails; a served question drawn on the chart fails, naming it", () => {
  const near = judgePlaceValueCompare(byId["PC-16"], compareLesson({ a: "352", b: "325" }));
  assert.deepEqual(failed(near), ["no compare card for this question"]);
  const chart = compareLesson({ a: "7284", b: "7248" });
  chart.steps[0].beats[0].actions[0] = { do: "write", as: "chart", kind: "place_value_chart", role: "main_visual", content: {}, place: { relation: "new_region" } };
  const verdict = judgePlaceValueCompare(byId["PC-01"], chart);
  assert.deepEqual(failed(verdict), ["a compare card is drawn"]);
  assert.match(verdict.checks.find((check) => check.check === "a compare card is drawn").detail, /drawn instead: the place-value chart/);
  assert.deepEqual(failed(judgePlaceValueCompare(byId["PC-01"], { lesson: {}, steps: [] })), ["a compare card is drawn"]);
});

test("the card is the question's: its pair as written, one the card takes, in the lesson's language, opened fresh, its demonstration forward", () => {
  assert.deepEqual(failed(judgePlaceValueCompare(byId["PC-01"], compareLesson({ a: "7284", b: "7428" }))), ["the card's pair is the question's, each number as written"]);
  // 0.70 drawn as 0.7: a written zero lost (the card then holds the same numeral twice too).
  const lost = judgePlaceValueCompare(byId["PC-14"], compareLesson({ a: "0.7", b: "0.7" }));
  assert.ok(failed(lost).includes("the card's pair is the question's, each number as written"));
  assert.match(lost.checks.find((check) => check.check.startsWith("the card's pair is the question's")).detail, /a written zero is lost or added/);
  assert.ok(failed(lost).includes("the card's pair is one the card takes"));
  const zeroAdded = judgePlaceValueCompare(byId["PC-08"], compareLesson({ a: "0.80", b: "0.75" }));
  assert.match(zeroAdded.checks.find((check) => !check.pass).detail, /a written zero is lost or added/);
  // A number written with fewer decimals than it has: the card refuses it.
  assert.ok(failed(judgePlaceValueCompare(byId["PC-10"], compareLesson({ a: "0.389", b: "0.4", card: { a_decimals: 2 } }))).includes("the card's pair is one the card takes"));
  assert.deepEqual(failed(judgePlaceValueCompare(byId["PC-02"], compareLesson({ language: "zh-CN", cardLanguage: "en-US", a: "36815", b: "36851" }))), ["the card speaks the lesson's language"]);
  for (const cardStart of [{ marked: 1 }, { compared: 2 }, { marked: 2, signed: 1 }]) {
    assert.deepEqual(failed(judgePlaceValueCompare(byId["PC-01"], compareLesson({ a: "7284", b: "7248", cardStart }))), ["the card opens fresh"], JSON.stringify(cardStart));
  }
  for (const compared of [[3, 2], [6], [1.5]]) {
    assert.deepEqual(failed(judgePlaceValueCompare(byId["PC-01"], compareLesson({ a: "7284", b: "7248", compared }))), ["the demonstration moves compared forward, whole, never past the sign"], JSON.stringify(compared));
  }
});

test("a task on the card has a goal the learner can reach: complete by taps alone, its own pair, fresh, drawn as written", () => {
  const base = { a: "7284", b: "7248", practice: [["5602", "5620"]], compared: [4] };
  const one = (lesson) => failed(judgePlaceValueCompare(byId["PC-01"], lesson));
  assert.deepEqual(one(compareLesson({ ...base, task: { allowed_operations: [{ kind: "card_tap", node: "chart" }, { kind: "card_submit" }] } })), ["practice-1: the task on the card is its complete fact, by taps alone"]);
  assert.deepEqual(one(compareLesson({ ...base, task: { completion: { kind: "card_fact", node: "chart", fact: "decided" } } })), ["practice-1: the task on the card is its complete fact, by taps alone"]);
  assert.deepEqual(one(compareLesson({ ...base, practice: [["7284", "7248"]] })), ["practice-1: the practice pair is one the card takes, not the lesson's pair in either order"]);
  assert.deepEqual(one(compareLesson({ ...base, practice: [["7248", "7284"]] })), ["practice-1: the practice pair is one the card takes, not the lesson's pair in either order"]);
  assert.deepEqual(one(compareLesson({ ...base, practice: [["5602", "5602"]] })), ["practice-1: the practice pair is one the card takes, not the lesson's pair in either order"]);
  for (const start of [{ marked: 1 }, { compared: 1 }, { signed: 1 }]) assert.deepEqual(one(compareLesson({ ...base, starts: [start] })), ["practice-1: the practice starts fresh"], JSON.stringify(start));
  // A start that leaves a bound field unset.
  const partial = compareLesson(base);
  delete partial.lesson.tasks[0].start.values.marked;
  assert.deepEqual(one(partial), ["practice-1: the practice start sets every field the card binds"]);
  const noStart = compareLesson(base);
  delete noStart.lesson.tasks[0].start;
  assert.deepEqual(one(noStart), ["practice-1: the task on the card starts on its own pair"]);
  // A practice inheriting the lesson's written decimals: 0.7 and 0.70 (b_decimals 2, not bound), a practice 0.4 and 0.5
  // draws 0.5 as 0.50.
  const inherits = judgePlaceValueCompare(byId["PC-14"], compareLesson({ a: "0.7", b: "0.70", practice: [["0.4", "0.5"]], compared: [4] }));
  assert.deepEqual(failed(inherits), ["practice-1: each practice number is drawn as the practice writes it, not with the lesson's written decimals"]);
  assert.match(inherits.checks.find((check) => !check.pass).detail, /b 0\.5 drawn as 0\.50/);
  // Bound and set by the start: the practice's own written decimals, passed.
  assert.deepEqual(failed(judgePlaceValueCompare(byId["PC-14"], compareLesson({ a: "0.7", b: "0.70", decimals: true, practice: [["0.4", "0.5"]], compared: [4] }))), []);
  // The task's words name no control: a note.
  assert.deepEqual(noted(judgePlaceValueCompare(byId["PC-01"], compareLesson({ ...base, task: { prompt: "Tap Same or Different under each column." } }))), ["practice-1: the task's words name no control"]);
  const none = compareLesson({ a: "7284", b: "7248", compared: [4] });
  assert.deepEqual(noted(judgePlaceValueCompare(byId["PC-01"], none)), ["the learner has a task on the card"]);
});

test("the lesson plays through OLL: an ideal lesson plays; one OLL refuses fails, and the judge still names the fault", () => {
  const good = judgePlaceValueCompare(byId["PC-14"], compareLesson({ a: "0.7", b: "0.70", decimals: true, practice: [["2.50", "2.5"]], compared: [4] }));
  assert.deepEqual(failedAll(good), []);
  const reversed = judgePlaceValueCompare(byId["PC-01"], compareLesson({ a: "7284", b: "7248", practice: [["7284", "7248"]], compared: [4] }));
  assert.ok(failedAll(reversed).includes("the lesson plays"), JSON.stringify(reversed.checks));
  const opened = judgePlaceValueCompare(byId["PC-01"], compareLesson({ a: "7284", b: "7248", cardStart: { marked: 1 } }));
  assert.deepEqual(failedAll(opened).sort(), ["the card opens fresh", "the lesson plays"]);
});
