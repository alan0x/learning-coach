// The make-ten judge (OLL decision 0027, need K2N-19): the development cases are well formed, and the judge is tried
// on make-ten lessons written by hand in the card's shape (OLL #122's SPEC example: the pair, the count in the
// bigger frame and the count moved bound bare, a `complete` task by taps on a practice pair, then the row of four
// blanks anchored to the card). A served lesson passes, also one whose demonstration stops partway; a near miss
// with a make-ten card fails; a served question drawn on the trading mat or a number line fails; and a card or a
// task that is not the question's, or a goal the learner cannot reach, fails; a lesson OLL refuses fails "the lesson
// plays". Lessons the recipe makes are judged in test/make-ten-recipe.test.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { judgeMakeTen, makeTenPairFault, makeTenRowAnswers } from "../scripts/make-ten-judge.mjs";

/** A pair's row answers, or a placeholder for a pair the card refuses (it has no row). */
const rowAnswers = (a, b) => { try { return makeTenRowAnswers(a, b); } catch { return [0, 0, 0, a + b]; } };

/** The row of four blanks for a pair, as OLL's makeTenRow writes it. */
function row(a, b, answers = rowAnswers(a, b)) {
  const big = Math.max(a, b);
  const [first, second, third, total] = answers.map(String);
  return a >= b
    ? [{ text: `${a} + ${b} = ${a} +` }, { blank: { as: "to-ten", answer: first, label: "to make ten" } }, { text: "+" }, { blank: { as: "rest", answer: second } }, { text: "= 10 +" }, { blank: { as: "ones", answer: third } }, { text: "=" }, { blank: { as: "total", answer: total } }]
    : [{ text: `${a} + ${b} =` }, { blank: { as: "rest", answer: first } }, { text: "+" }, { blank: { as: "to-ten", answer: second, label: "to make ten" } }, { text: `+ ${big} =` }, { blank: { as: "ones", answer: third } }, { text: "+ 10 =" }, { blank: { as: "total", answer: total } }];
}

/** A make-ten lesson as the recipe is to write it: the card, the demonstration's count animated, practice pairs. */
function makeTenLesson({ a, b, language = "en-US", cardLanguage = language, practice = [], filled = [], rows, starts = [], typed = false }) {
  const tasks = practice.flatMap(([pa, pb], i) => [
    {
      as: `practice-${i + 1}`, prompt: "Make a ten.", availability: { kind: "after_lesson" },
      start: { kind: "practice", variables: ["a", "b", "filled", "moved"], values: { a: pa, b: pb, filled: Math.max(pa, pb), moved: 0, ...(starts[i] ?? {}) } },
      allowed_operations: [{ kind: "card_tap", node: "frames" }],
      completion: { kind: "card_fact", node: "frames", fact: "complete" },
      hints: ["How many more does the bigger number need to make ten?"],
    },
    typed
      ? { as: `answer-${i + 1}`, anchor: "frames", prompt: "What is the sum?", availability: { kind: "after_lesson" }, allowed_operations: [{ kind: "answer_entry" }], completion: { kind: "numeric_answer", answer: String(pa + pb) }, hints: ["Ten and the ones left."] }
      : { as: `row-${i + 1}`, anchor: "frames", prompt: "Write it as a number sentence.", availability: { kind: "after_lesson" }, allowed_operations: [{ kind: "row_entry" }],
        completion: { kind: "numeric_row", parts: rows?.[i] ?? row(pa, pb) }, hints: ["Read the full frame, then the other one."] },
  ]);
  const content = {
    ...(cardLanguage !== "en-US" ? { language: cardLanguage } : {}),
    a, b, filled: Math.max(a, b), moved: 0,
    bindings: [{ target: "a", expression: "a" }, { target: "b", expression: "b" }, { target: "filled", expression: "filled" }, { target: "moved", expression: "moved" }],
  };
  return {
    dsl: "octos.lesson", version: "0.1", profile: "authoring",
    lesson: {
      mode: "explain", language, title: "Making ten", goals: ["Add by making ten"],
      variables: [
        { as: "a", label: "a", initial: a, min: 1, max: 9 }, { as: "b", label: "b", initial: b, min: 1, max: 9 },
        { as: "filled", label: "in the bigger frame", initial: Math.max(a, b), min: 0, max: 10 }, { as: "moved", label: "moved", initial: 0, min: 0, max: 4 },
      ],
      tasks,
    },
    steps: [{
      key: "show", purpose: "See the problem",
      beats: [
        { key: "draw", say: "Here are the two numbers.", actions: [{ do: "write", as: "frames", kind: "make_ten", role: "main_visual", content, place: { relation: "new_region" } }] },
        ...filled.map((k) => ({ key: `to-${k}`, say: "Look.", actions: [{ do: "animate", variable: "filled", value: k }] })),
      ],
    }],
    close: { summary: "One number gives part of itself to make the other ten.", focus: ["frames"] },
  };
}

const failed = (verdict) => verdict.checks.filter((check) => !check.pass).map((check) => check.check);
const noted = (verdict) => verdict.notes.filter((check) => !check.pass).map((check) => check.check);
const cases = JSON.parse(await readFile(new URL("../testsuite/make-ten-dev-cases.json", import.meta.url), "utf8")).cases;
const blueprint = JSON.parse(await readFile(new URL("../testsuite/make-ten-blueprint.json", import.meta.url), "utf8"));
const byId = Object.fromEntries(cases.map((item) => [item.id, item]));

test("the development cases: 15 this need serves, each a pair the card takes with its split and sum, and 7 near misses", () => {
  assert.equal(cases.length, 22);
  assert.deepEqual(blueprint.rows.map((row) => row.id), ["M1", "M2", "M3", "M4", "M5", "M6"]);
  const served = cases.filter((item) => !item.expect.forbid);
  assert.equal(served.length, 15);
  assert.deepEqual(cases.filter((item) => item.expect.forbid).map((item) => item.expect.forbid), Array(7).fill(["make_ten"]));
  assert.ok(cases.filter((item) => item.expect.forbid).every((item) => item.expect.need !== "K2N-19" && item.row === null));
  assert.deepEqual([served.filter((item) => item.language === "en-US").length, served.filter((item) => item.language === "zh-CN").length], [8, 7]);
  for (const item of served) {
    assert.equal(item.expect.need, "K2N-19", item.id);
    assert.ok(blueprint.rows.some((row) => row.id === item.row), item.id);
    const [a, b] = item.expect.numbers.map(Number);
    assert.equal(makeTenPairFault(a, b), undefined, item.id);
    assert.deepEqual([Number(item.expect.moved), Number(item.expect.left), Number(item.expect.result)], [10 - Math.max(a, b), a + b - 10, a + b], item.id);
    assert.equal(item.expect.fill, a >= b ? "first" : "second", item.id);
  }
});

test("the card's rules: two numbers 1 to 9 whose sum is more than ten; the row's answers in the owner's order", () => {
  assert.deepEqual([[8, 6], [6, 3], [7, 3], [12, 5], [0, 9], [8.5, 3]].map(([a, b]) => makeTenPairFault(a, b)), [undefined, "under_ten", "exactly_ten", "not_one_digit", "not_one_digit", "unreadable"]);
  assert.deepEqual(makeTenRowAnswers(8, 6), [2, 4, 4, 14], "8 + 6 = 8 + 2 + 4 = 10 + 4 = 14");
  assert.deepEqual(makeTenRowAnswers(3, 8), [1, 2, 1, 11], "3 + 8 = 1 + 2 + 8 = 1 + 10 = 11");
});

test("served lessons pass, in both languages, whether or not the demonstration fills the frame", () => {
  const whole = judgeMakeTen(byId["MT-01"], makeTenLesson({ a: 8, b: 6, practice: [[7, 5]], filled: [9, 10] }));
  assert.deepEqual([failed(whole), noted(whole), whole.pass], [[], [], true]);
  const second = judgeMakeTen(byId["MT-07"], makeTenLesson({ a: 4, b: 9, language: "zh-CN", practice: [[3, 8]], filled: [10] }));
  assert.deepEqual(failed(second), []);
  // The pair in the other order is the question's pair (0027 §10).
  assert.ok(judgeMakeTen(byId["MT-06"], makeTenLesson({ a: 8, b: 3, practice: [[9, 4]], filled: [10] })).pass);
  // A lesson may stop partway: noted, not failed.
  const partway = judgeMakeTen(byId["MT-08"], makeTenLesson({ a: 6, b: 5, practice: [[5, 7]], filled: [8] }));
  assert.ok(partway.pass);
  assert.deepEqual(noted(partway), ["the demonstration fills the bigger frame"]);
  // A typed sum after the card's task, instead of the row, is judged too.
  assert.ok(judgeMakeTen(byId["MT-05"], makeTenLesson({ a: 9, b: 8, practice: [[9, 6]], filled: [10], typed: true })).pass);
});

test("a near miss that draws the card fails; a served question drawn otherwise fails", () => {
  const near = judgeMakeTen(byId["MT-16"], makeTenLesson({ a: 7, b: 5 }));
  assert.deepEqual([near.pass, failed(near)], [false, ["no make-ten card for this question"]]);
  const elsewhere = makeTenLesson({ a: 8, b: 6 });
  elsewhere.steps[0].beats[0].actions[0] = { do: "write", as: "line", kind: "number_line", role: "main_visual", content: {}, place: { relation: "new_region" } };
  elsewhere.lesson.tasks = [];
  const verdict = judgeMakeTen(byId["MT-01"], elsewhere);
  assert.equal(verdict.pass, false);
  assert.match(verdict.checks.find((check) => check.check === "a make-ten card is drawn").detail, /drawn instead: a number line/);
  const words = makeTenLesson({ a: 8, b: 6 });
  words.steps[0].beats[0].actions[0] = { do: "write", as: "note", kind: "text", role: "note", content: { text: "27 sticks: 2 bundles of ten and 7." }, place: { relation: "new_region" } };
  words.lesson.tasks = [];
  words.lesson.variables = [];
  words.close.focus = ["note"];
  assert.deepEqual(failed(judgeMakeTen(byId["MT-19"], words)), [], "a near miss without the card passes");
});

test("the card or a task that is not the question's, or a goal the learner cannot reach, fails", () => {
  // The judge names each fault itself; OLL refuses most of these lessons too ("the lesson plays"), left out here.
  const fails = (item, lesson, expected) => assert.deepEqual(failed(judgeMakeTen(item, lesson)).filter((check) => check !== "the lesson plays"), expected);
  fails(byId["MT-01"], makeTenLesson({ a: 8, b: 5, practice: [[7, 5]] }), ["the card's pair is the question's (either order)"]);
  fails(byId["MT-02"], makeTenLesson({ a: 7, b: 5, language: "zh-CN", cardLanguage: "en-US", practice: [[8, 6]] }), ["the card speaks the lesson's language"]);
  // The card opens with the ten already made.
  const made = makeTenLesson({ a: 8, b: 6, practice: [[7, 5]] });
  made.lesson.variables[2].initial = 10;
  fails(byId["MT-01"], made, ["the card opens fresh"]);
  assert.ok(failed(judgeMakeTen(byId["MT-01"], made)).includes("the lesson plays"), "OLL refuses a card that opens with the ten made");
  // Practice pairs: the card refuses it; the lesson's own pair, in either order; not fresh.
  fails(byId["MT-01"], makeTenLesson({ a: 8, b: 6, practice: [[5, 4]] }), ["practice-1: the practice pair is one the card takes", "row-1: the row after the card's task asks its pair's chain"]);
  fails(byId["MT-01"], makeTenLesson({ a: 8, b: 6, practice: [[6, 8]] }), ["practice-1: the practice pair is not the lesson's (either order)"]);
  fails(byId["MT-01"], makeTenLesson({ a: 8, b: 6, practice: [[7, 5]], starts: [{ filled: 10 }] }), ["practice-1: the practice starts fresh"]);
  fails(byId["MT-01"], makeTenLesson({ a: 8, b: 6, practice: [[7, 5]], starts: [{ moved: 1 }] }), ["practice-1: the practice starts fresh"]);
  // The row's answers: the split the other way round (2 + 3, not 3 + 2) and the lesson's pair's chain are wrong.
  fails(byId["MT-01"], makeTenLesson({ a: 8, b: 6, practice: [[7, 5]], rows: [row(7, 5, [2, 3, 2, 12])] }), ["row-1: the row after the card's task asks its pair's chain"]);
  fails(byId["MT-01"], makeTenLesson({ a: 8, b: 6, practice: [[7, 5]], rows: [row(8, 6)] }), ["row-1: the row after the card's task asks its pair's chain"]);
  // A task on the card with "done", or another fact.
  const done = makeTenLesson({ a: 8, b: 6, practice: [[7, 5]] });
  done.lesson.tasks[0].allowed_operations.push({ kind: "card_submit" });
  fails(byId["MT-01"], done, ["practice-1: the task on the card is its complete fact, by taps"]);
  // No task on the card and no row: noted only.
  const bare = judgeMakeTen(byId["MT-01"], makeTenLesson({ a: 8, b: 6, filled: [10] }));
  assert.ok(bare.pass);
  assert.deepEqual(noted(bare), ["the learner has a task on the card", "a row of blanks follows"]);
});

test("the lesson plays through OLL; a practice start of another kind fails; a row elsewhere is noted; a second card on the question's pair, with a task, fails", () => {
  // Every hand-written lesson above plays (OLL #122's SPEC shape).
  assert.ok(judgeMakeTen(byId["MT-01"], makeTenLesson({ a: 8, b: 6, practice: [[7, 5]], filled: [10] })).checks.find((check) => check.check === "the lesson plays").pass);
  const replay = makeTenLesson({ a: 8, b: 6, practice: [[7, 5]] });
  replay.lesson.tasks[0].start.kind = "replay";
  assert.ok(failed(judgeMakeTen(byId["MT-01"], replay)).includes("practice-1: the task on the card starts on a practice"));
  // A row anchored to the card that does not follow a task on it: noted against the pair the card holds then.
  const loose = makeTenLesson({ a: 8, b: 6, practice: [[7, 5]], filled: [10] });
  loose.lesson.tasks.push({ as: "extra", anchor: "frames", prompt: "And 8 + 6?", availability: { kind: "after_lesson" }, allowed_operations: [{ kind: "row_entry" }],
    completion: { kind: "numeric_row", parts: row(8, 6) }, hints: ["Look again."] });
  const looseVerdict = judgeMakeTen(byId["MT-01"], loose);
  assert.deepEqual(failed(looseVerdict), []);
  assert.deepEqual(noted(looseVerdict), ["extra: a row by the card asks about the pair on it"]);
  // A second make-ten card on the question's own pair, with a task on it: a second card (Coach #199) is judged.
  const twice = makeTenLesson({ a: 8, b: 6, practice: [[7, 5]] });
  const second = structuredClone(twice.steps[0].beats[0].actions[0]);
  second.as = "frames-2";
  twice.steps[0].beats.push({ key: "again", say: "Again.", actions: [second] });
  twice.lesson.tasks.push({ ...structuredClone(twice.lesson.tasks[0]), as: "practice-2", allowed_operations: [{ kind: "card_tap", node: "frames-2" }], completion: { kind: "card_fact", node: "frames-2", fact: "complete" } });
  const twiceFailed = failed(judgeMakeTen(byId["MT-01"], twice));
  assert.ok(twiceFailed.includes("frames-2 (a second card): its example differs from the question and the practice"), JSON.stringify(twiceFailed));
  assert.ok(twiceFailed.includes("frames-2 (a second card): no task is anchored on it"), JSON.stringify(twiceFailed));
});
