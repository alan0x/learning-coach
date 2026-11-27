// The place-value compare judge (OLL decision 0029, need 35P-06): the development cases are well formed, and the
// judge is tried on compare lessons written by hand in the card's shape (OLL #130's SPEC example: the pair, the
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
  // A start that leaves a bound field out of its variables (OLL reads start.variables).
  const partial = compareLesson(base);
  partial.lesson.tasks[0].start.variables = partial.lesson.tasks[0].start.variables.filter((alias) => alias !== "marked");
  delete partial.lesson.tasks[0].start.values.marked;
  assert.deepEqual(one(partial), ["practice-1: the practice start sets every field the card binds"]);
  // Listed without a value: OLL resets it to its starting value (0 here), so the start is whole (review of #195, P7a).
  const listed = compareLesson(base);
  for (const alias of ["compared", "marked", "signed"]) delete listed.lesson.tasks[0].start.values[alias];
  assert.deepEqual(one(listed), []);
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

// ---------------------------------------------------------------- review of #195: the reviewer's probe lessons

const W = (value) => Math.round(Number(value) * 1000);
const base = () => compareLesson({ a: "7284", b: "7248", practice: [["5602", "5620"]], compared: [4] });
/** A second compare card (`chart2`, its own variables) after a correct first, with a practice task of its own. */
function twoCards({ second, secondLanguage, practice2 }) {
  const lesson = base();
  const [sa, sb] = second;
  const content = { ...(secondLanguage ? { language: secondLanguage } : {}), a: W(sa), b: W(sb), compared: 0, marked: 0, signed: 0,
    bindings: ["a", "b", "compared", "marked", "signed"].map((field) => ({ target: field, expression: `${field}2` })) };
  lesson.lesson.variables.push({ as: "a2", initial: content.a, min: 0, max: 9_999_999_999 }, { as: "b2", initial: content.b, min: 0, max: 9_999_999_999 },
    { as: "compared2", initial: 0, min: 0, max: 8 }, { as: "marked2", initial: 0, min: 0, max: 7 }, { as: "signed2", initial: 0, min: 0, max: 1 });
  lesson.steps.push({ key: "second", purpose: "Another pair", beats: [{ key: "draw2", say: "Another pair.", actions: [{ do: "write", as: "chart2", kind: "place_value_compare", role: "main_visual", content, place: { relation: "new_region" } }] }] });
  const [pa, pb] = practice2;
  lesson.lesson.tasks.push({ as: "practice-2", prompt: "Compare the two numbers.", availability: { kind: "after_lesson" },
    start: { kind: "practice", variables: ["a2", "b2", "compared2", "marked2", "signed2"], values: { a2: W(pa), b2: W(pb), compared2: 0, marked2: 0, signed2: 0 } },
    allowed_operations: [{ kind: "card_tap", node: "chart2" }], completion: { kind: "card_fact", node: "chart2", fact: "complete" }, hints: ["Start at the left."] });
  return lesson;
}
/** An unbound card revised later (a lesson variable and a typed task keep the lesson whole). */
function revised(a, b, revisions) {
  const lesson = compareLesson({ a, b });
  delete lesson.steps[0].beats[0].actions[0].content.bindings;
  lesson.lesson.variables = [{ as: "k", initial: 0, min: 0, max: 1 }];
  revisions.forEach((content, i) => lesson.steps[0].beats.push({ key: `rev${i}`, say: "Now look.", actions: [{ do: "revise", target: "chart", content, reason: "another look" }] }));
  return lesson;
}
const animateBeat = (variable, value, when) => ({ key: `set-${variable}-${value}`, say: "Watch.", actions: [{ do: "animate", variable, value, ...(when ? { when } : {}) }] });
const replayBeat = (values) => ({ key: "replay", say: "Once more.", start: { kind: "replay", variables: Object.keys(values), values }, actions: [{ do: "point", target: "chart" }] });
const judged = (id, lesson) => failed(judgePlaceValueCompare(byId[id], lesson)).sort();

test("review of #195: every compare card is judged; another card shows another pair", () => {
  assert.deepEqual(judged("PC-01", twoCards({ second: ["7428", "7248"], secondLanguage: "zh-CN", practice2: ["7248", "7428"] })),
    ["chart2: the card speaks the lesson's language", "practice-2: the practice pair is one the card takes, not the lesson's pair in either order"]);
  assert.deepEqual(judged("PC-01", twoCards({ second: ["7284", "7248"], practice2: ["7248", "7284"] })),
    ["chart2: another card shows another pair than the question's and the practice's", "practice-2: the practice pair is one the card takes, not the lesson's pair in either order"]);
  assert.deepEqual(judged("PC-01", twoCards({ second: ["5602", "5620"], practice2: ["3910", "3901"] })), ["chart2: another card shows another pair than the question's and the practice's"], "the first card's practice pair");
  assert.deepEqual(judged("PC-01", twoCards({ second: ["3910", "3901"], practice2: ["8125", "8152"] })), [], "another example on a pair of its own");
});

test("review of #195: a revision, an animation of the pair or its decimals, or a replay is followed through the lesson", () => {
  const stays = "the card's pair stays as written";
  assert.deepEqual(judged("PC-01", revised("7284", "7248", [{ a: 7428000, b: 7248000, compared: 0, marked: 0, signed: 0 }])), [stays]);
  assert.deepEqual(judged("PC-08", revised("0.8", "0.75", [{ a: 800, a_decimals: 2, b: 750, compared: 0, marked: 0, signed: 0 }])), [stays], "0.8 revised to 0.80");
  assert.deepEqual(judged("PC-01", revised("7284", "7248", [{ a: 7284000, b: 7248000, compared: 3, marked: 0, signed: 0 }, { a: 7284000, b: 7248000, compared: 2, marked: 0, signed: 0 }])),
    ["the demonstration moves compared forward, whole, never past the sign"], "a revision is not a replay: 3 then 2 goes back");
  assert.deepEqual(judged("PC-01", revised("7284", "7248", [{ a: 7284000, b: 7248000, compared: 5, marked: 0, signed: 0 }])), ["the demonstration moves compared forward, whole, never past the sign"], "past the sign (4)");
  assert.deepEqual(judged("PC-01", revised("7284", "7248", [{ language: "zh-CN", a: 7284000, b: 7248000, compared: 0, marked: 0, signed: 0 }])), ["the card speaks the lesson's language"]);
  assert.deepEqual(judged("PC-01", revised("7284", "7248", [{ a: 7284000, b: 7248000, compared: 0, marked: 3, signed: 1 }])), ["the lesson never judges or signs for the learner"]);
  // Animations of the card's other fields, after it is written or before.
  const after = (variable, value, options = { a: "7284", b: "7248", practice: [["5602", "5620"]], compared: [4] }, id = "PC-01") => {
    const lesson = compareLesson(options);
    lesson.steps[0].beats.splice(1, 0, animateBeat(variable, value));
    return judged(id, lesson);
  };
  const before = (variable, value, options, id) => {
    const lesson = compareLesson(options);
    lesson.steps.unshift({ key: "pre", purpose: "pre", beats: [{ ...animateBeat(variable, value), key: "pre" }] });
    return judged(id, lesson);
  };
  assert.deepEqual(after("a", 7428000), [stays]);
  assert.deepEqual(after("marked", 2), ["the lesson never judges or signs for the learner"]);
  assert.deepEqual(after("b_decimals", 1, { a: "0.7", b: "0.70", decimals: true, practice: [["0.4", "0.5"]] }, "PC-14"), [stays], "0.70 animated to 0.7");
  assert.deepEqual(after("a_decimals", 2, { a: "0.8", b: "0.75", decimals: true, practice: [["0.6", "0.55"]], compared: [3] }, "PC-08"), [stays], "0.8 animated to 0.80");
  assert.deepEqual(before("a", 7428000, { a: "7284", b: "7248", practice: [["5602", "5620"]], compared: [4] }, "PC-01"),
    ["the card's pair is the question's, each number as written", "the demonstration moves compared forward, whole, never past the sign"], "a moved before the card is written (7,428 and 7,248 end at 3)");
  assert.deepEqual(before("b_decimals", 1, { a: "0.7", b: "0.70", decimals: true, practice: [["0.4", "0.5"]] }, "PC-14"),
    ["the card's pair is one the card takes", "the card's pair is the question's, each number as written"], "0.70 drawn as 0.7");
  assert.deepEqual(before("compared", 2, { a: "7284", b: "7248", practice: [["5602", "5620"]], compared: [4] }, "PC-01"), ["the card opens fresh"], "compared moved before the card is written");
  // Replays: their values apply; a replay may put compared back (it shows the demonstration again), never past the sign.
  const replay = (values, options = { a: "7284", b: "7248", practice: [["5602", "5620"]], compared: [4] }, id = "PC-01") => {
    const lesson = compareLesson(options);
    lesson.steps[0].beats.push(replayBeat(values));
    return judged(id, lesson);
  };
  assert.deepEqual(replay({ a: 7428000, b: 7248000, compared: 0, marked: 0, signed: 0 }), [stays]);
  assert.deepEqual(replay({ a_decimals: 2, compared: 0, marked: 0, signed: 0 }, { a: "0.8", b: "0.75", decimals: true, practice: [["0.6", "0.55"]], compared: [3] }, "PC-08"), [stays]);
  assert.deepEqual(replay({ compared: 2, marked: 0, signed: 0 }), []);
  assert.deepEqual(replay({ compared: 6, marked: 0, signed: 0 }), ["the demonstration moves compared forward, whole, never past the sign"]);
  assert.deepEqual(replay({ a: 405, b: 450, compared: 0, marked: 0, signed: 0 }, { language: "zh-CN", a: "0.45", b: "0.405", practice: [["0.36", "0.306"]], compared: [4] }, "PC-09"), [], "the same pair the other way round");
});

test("review of #195: plain bindings; a beat plays phase by phase; a start's listed fields; what a practice draws", () => {
  const binding = (target, expression) => { const lesson = base(); lesson.steps[0].beats[0].actions[0].content.bindings.find((each) => each.target === target).expression = expression; return judged("PC-01", lesson); };
  assert.deepEqual(binding("a", "a + 144000"), ["each field is bound to a lesson variable by name"]);
  assert.deepEqual(binding("a", "b"), ["practice-1: the practice pair is one the card takes, not the lesson's pair in either order", "the card's pair is one the card takes", "the card's pair is the question's, each number as written"], "a bound to b draws 7,248 twice (and 5,620 twice in practice)");
  // OLL plays a beat's actions phase by phase, not in document order.
  const phases = (first, second) => {
    const lesson = compareLesson({ a: "7284", b: "7248", practice: [["5602", "5620"]] });
    lesson.steps[0].beats.push({ key: "ph", say: "Look.", actions: [{ do: "animate", variable: "compared", ...first }, { do: "animate", variable: "compared", ...second }] });
    return judged("PC-01", lesson);
  };
  assert.deepEqual(phases({ value: 4, when: "after_speech" }, { value: 2, when: "during_speech" }), [], "plays 2, then 4");
  assert.deepEqual(phases({ value: 2, when: "after_speech" }, { value: 4, when: "during_speech" }), ["the demonstration moves compared forward, whole, never past the sign"], "plays 4, then 2");
  // A practice number drawn with the lesson's written zero: always a fault, also when it equals the lesson's number.
  assert.deepEqual(judged("PC-14", compareLesson({ a: "0.7", b: "0.70", practice: [["0.4", "0.7"]], compared: [4] })),
    ["practice-1: each practice number is drawn as the practice writes it, not with the lesson's written decimals"], "0.7 drawn as 0.70");
  assert.deepEqual(judged("PC-14", compareLesson({ a: "0.7", b: "0.70", practice: [["0.75", "0.7"]], compared: [4] })),
    ["practice-1: each practice number is drawn as the practice writes it, not with the lesson's written decimals"]);
  // A written-decimals field listed without a value takes its starting value: 0.5 drawn as 0.50.
  const omitted = compareLesson({ a: "0.7", b: "0.70", decimals: true, practice: [["0.4", "0.5"]], compared: [4] });
  delete omitted.lesson.tasks[0].start.values.b_decimals;
  assert.deepEqual(judged("PC-14", omitted), ["practice-1: each practice number is drawn as the practice writes it, not with the lesson's written decimals"]);
});

test("the lesson plays through OLL: an ideal lesson plays; one OLL refuses fails, and the judge still names the fault", () => {
  const good = judgePlaceValueCompare(byId["PC-14"], compareLesson({ a: "0.7", b: "0.70", decimals: true, practice: [["2.50", "2.5"]], compared: [4] }));
  assert.deepEqual(failedAll(good), []);
  const reversed = judgePlaceValueCompare(byId["PC-01"], compareLesson({ a: "7284", b: "7248", practice: [["7284", "7248"]], compared: [4] }));
  assert.ok(failedAll(reversed).includes("the lesson plays"), JSON.stringify(reversed.checks));
  const opened = judgePlaceValueCompare(byId["PC-01"], compareLesson({ a: "7284", b: "7248", cardStart: { marked: 1 } }));
  assert.deepEqual(failedAll(opened).sort(), ["the card opens fresh", "the lesson plays"]);
});
