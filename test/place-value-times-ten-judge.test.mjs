// The place-value times-ten judge (OLL decision 0028, need 35P-04): the development cases are well formed, and the
// judge is tried on times-ten lessons written by hand in the card's shape (OLL #123's SPEC example: the amount, the
// target, "counted in" and the row sets bound bare, a `complete` task by taps on a practice of the card's shape,
// then the card's answer row anchored to it). A served lesson passes, also one whose demonstration stops partway; a
// near miss with a times-ten card fails; a served question drawn on the place-value chart fails; and a card or a
// task that is not the question's, or a goal the learner cannot reach, fails.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { judgePlaceValueTimesTen, thousandths, timesTenProblem, timesTenProblemOfShape } from "../scripts/place-value-times-ten-judge.mjs";

const v = thousandths;
const shapeOf = (p) => ({ question: p.question, toward: p.dir < 0 ? "right" : "left", apart: p.g });

/** The card's answer row for a problem, as OLL's placeValueTimesTenAnswerParts writes it (English). */
function row(p, answers = p.answers) {
  return p.question === "times"
    ? [{ text: "x =" }, { blank: { as: "renamed", answer: String(answers[0]) } }, { text: "y;" }, { text: "z is" }, { blank: { as: "times", answer: String(answers[1]) } }, { text: "times w" }]
    : [{ text: "x =" }, { blank: { as: "count", answer: String(answers[0]) } }, { text: "y" }];
}

/** A times-ten lesson as the recipe is to write it: the card, "counted in" animated, practices with the card's row. */
function timesTenLesson({ amount, target, start, language = "en-US", cardLanguage = language, practice = [], counted = [], rows, starts = [], typed, cardStart = {}, asWritten = false }) {
  const p = timesTenProblem(v(amount), v(target), start === undefined ? undefined : v(start));
  if (p.fault) throw new Error(`fixture: ${p.fault}`);
  const fields = p.g === 2 ? ["moved_once", "moved_twice"] : ["moved_once"];
  const tasks = practice.flatMap(([pa, pt], i) => {
    const q = timesTenProblemOfShape(shapeOf(p), v(pa), v(pt));
    // As written (asWritten): the numbers as given, a times pair possibly smaller first; else as the card takes them.
    const values = { amount: asWritten ? v(pa) : q.amount ?? v(pa), target: asWritten ? v(pt) : q.target ?? v(pt), counted_in: q.start ?? 0, ...Object.fromEntries(fields.map((field) => [field, 0])), ...(starts[i] ?? {}) };
    return [
      {
        as: `practice-${i + 1}`, prompt: "Move every disk to the target column.", availability: { kind: "after_lesson" },
        start: { kind: "practice", variables: Object.keys(values), values },
        allowed_operations: [{ kind: "card_tap", node: "chart" }],
        completion: { kind: "card_fact", node: "chart", fact: "complete" },
        hints: ["Tap any disk."],
      },
      typed
        ? { as: `answer-${i + 1}`, anchor: "chart", prompt: "How many?", availability: { kind: "after_lesson" }, allowed_operations: [{ kind: "answer_entry" }], completion: { kind: "numeric_answer", answer: typed[i] }, hints: ["Count."] }
        : { as: `row-${i + 1}`, anchor: "chart", prompt: "How many?", availability: { kind: "after_lesson" }, allowed_operations: [{ kind: "row_entry" }],
          completion: { kind: "numeric_row", parts: rows?.[i] ?? (q.fault ? [{ text: "?" }] : row(q)) }, hints: ["Count the target column."] },
    ];
  });
  const content = {
    ...(cardLanguage !== "en-US" ? { language: cardLanguage } : {}),
    ...shapeOf(p), amount: asWritten ? v(amount) : p.amount, target: asWritten ? v(target) : p.target, counted_in: p.start, moved_once: 0, ...(p.g === 2 ? { moved_twice: 0 } : {}), ...cardStart,
    bindings: ["amount", "target", "counted_in", ...fields].map((field) => ({ target: field, expression: field })),
  };
  return {
    dsl: "octos.lesson", version: "0.1", profile: "authoring",
    lesson: {
      mode: "explain", language, title: "Ten of one place", goals: ["Count an amount in another unit"],
      variables: [
        { as: "amount", initial: asWritten ? v(amount) : p.amount, min: 1, max: 9_000_000_000 }, { as: "target", initial: asWritten ? v(target) : p.target, min: 1, max: 9_000_000_000 },
        { as: "counted_in", initial: cardStart.counted_in ?? p.start, min: 0, max: 9_000_000_000 }, ...fields.map((field) => ({ as: field, initial: cardStart[field] ?? 0, min: 0, max: 511 })),
      ],
      tasks,
    },
    steps: [{
      key: "show", purpose: "See the problem",
      beats: [
        { key: "draw", say: "Here is the amount.", actions: [{ do: "write", as: "chart", kind: "place_value_times_ten", role: "main_visual", content, place: { relation: "new_region" } }] },
        ...counted.map((value) => ({ key: `to-${value}`, say: "Look.", actions: [{ do: "animate", variable: "counted_in", value }] })),
      ],
    }],
    close: { summary: "Ten of one place make one of the next.", focus: ["chart"] },
  };
}

// The judge names each fault itself; OLL refuses most of these lessons too ("the lesson plays"), left out here and
// tested on its own.
const failedAll = (verdict) => verdict.checks.filter((check) => !check.pass).map((check) => check.check);
const failed = (verdict) => failedAll(verdict).filter((check) => check !== "the lesson plays");
const noted = (verdict) => verdict.notes.filter((check) => !check.pass).map((check) => check.check);
const cases = JSON.parse(await readFile(new URL("../testsuite/place-value-times-ten-dev-cases.json", import.meta.url), "utf8")).cases;
const blueprint = JSON.parse(await readFile(new URL("../testsuite/place-value-times-ten-blueprint.json", import.meta.url), "utf8"));
const byId = Object.fromEntries(cases.map((item) => [item.id, item]));

test("the development cases: 15 this need serves, each a problem the card takes with its answers, and 7 near misses", () => {
  assert.equal(cases.length, 22);
  assert.deepEqual(blueprint.rows.map((each) => each.id), ["T1", "T2", "T3", "T4", "T5"]);
  const served = cases.filter((item) => !item.expect.forbid);
  assert.equal(served.length, 15);
  assert.deepEqual(cases.filter((item) => item.expect.forbid).map((item) => item.expect.forbid), Array(7).fill(["place_value_times_ten"]));
  assert.ok(cases.filter((item) => item.expect.forbid).every((item) => item.expect.need !== "35P-04" && item.row === null));
  assert.deepEqual([served.filter((item) => item.language === "en-US").length, served.filter((item) => item.language === "zh-CN").length], [8, 7]);
  assert.deepEqual([served.filter((item) => item.expect.ask === "count").length, served.filter((item) => item.expect.ask === "times").length], [9, 6]);
  for (const item of served) {
    assert.equal(item.expect.need, "35P-04", item.id);
    assert.ok(blueprint.rows.some((each) => each.id === item.row), item.id);
    const p = timesTenProblem(v(item.expect.amount), v(item.expect.target), item.expect.start ? v(item.expect.start) : undefined);
    assert.equal(p.fault, undefined, item.id);
    assert.equal(p.question, item.expect.ask, item.id);
    assert.deepEqual(p.answers, item.expect.ask === "times" ? [Number(item.expect.renamed), 10] : [Number(item.expect.result)], item.id);
  }
});

test("a served lesson passes: a count, a times pair, a put-together question in Chinese; a demonstration may stop partway", () => {
  const count = timesTenLesson({ amount: "0.2", target: "0.001", practice: [["5", "0.01"]], counted: [10, 1] });
  assert.deepEqual(judgePlaceValueTimesTen(byId["PF-12"], count), judgePlaceValueTimesTen(byId["PF-12"], count));
  let verdict = judgePlaceValueTimesTen(byId["PF-12"], count);
  assert.equal(verdict.pass, true, JSON.stringify(failed(verdict)));
  assert.deepEqual(noted(verdict), []);
  const times = timesTenLesson({ amount: "700", target: "70", practice: [["4000", "400"]], counted: [70_000] });
  verdict = judgePlaceValueTimesTen(byId["PF-07"], times);
  assert.equal(verdict.pass, true, JSON.stringify(failed(verdict)));
  const smallerFirst = timesTenLesson({ amount: "0.3", target: "3", practice: [["0.6", "0.06"]] });
  verdict = judgePlaceValueTimesTen(byId["PF-14"], smallerFirst);
  assert.equal(verdict.pass, true, `a question written smaller first, drawn larger first: ${JSON.stringify(failed(verdict))}`);
  assert.deepEqual(noted(verdict), ["the demonstration reaches the target"], "no demonstration: a note, never a failure");
  const together = timesTenLesson({ amount: "0.4", target: "0.1", start: "0.01", language: "zh-CN", practice: [["0.06", "0.01"]], counted: [100] });
  verdict = judgePlaceValueTimesTen(byId["PF-05"], together);
  assert.equal(verdict.pass, true, JSON.stringify(failed(verdict)));
  const partway = timesTenLesson({ amount: "0.2", target: "0.001", practice: [["5", "0.01"]], counted: [10] });
  verdict = judgePlaceValueTimesTen(byId["PF-12"], partway);
  assert.equal(verdict.pass, true, "a lesson may stop partway");
  assert.deepEqual(noted(verdict), ["the demonstration reaches the target"]);
});

test("a near miss that draws the card fails; a served case drawn on the chart fails", () => {
  const lesson = timesTenLesson({ amount: "0.3", target: "0.001", practice: [["5", "0.01"]] });
  const near = judgePlaceValueTimesTen(byId["PF-17"], lesson);
  assert.equal(near.pass, false);
  assert.deepEqual(failed(near), ["no times-ten card for this question"]);
  assert.deepEqual(failed(judgePlaceValueTimesTen(byId["PF-17"], { lesson: {}, steps: [] })), [], "no card: the near miss holds");
  const chart = { lesson: { language: "en-US", tasks: [] }, steps: [{ beats: [{ actions: [{ do: "write", as: "c", kind: "place_value_chart", content: {} }] }] }] };
  const served = judgePlaceValueTimesTen(byId["PF-12"], chart);
  assert.deepEqual(served.checks.filter((check) => check.check !== "the lesson plays").map((check) => check.detail), ["no times-ten card; drawn instead: the place-value chart"]);
});

test("a card that is not the question's fails: the numbers, the question, the start unit, the language, opening fresh", () => {
  const fails = (item, input) => failed(judgePlaceValueTimesTen(byId[item], timesTenLesson(input)));
  assert.deepEqual(fails("PF-12", { amount: "0.3", target: "0.001", practice: [["5", "0.01"]] }), ["the card's amount and target are the question's"]);
  // 3 tenths written as the count 3 (the model's likely slip, 0028 §10): another problem.
  assert.deepEqual(fails("PF-12", { amount: "2", target: "0.01", practice: [["5", "0.01"]] }), ["the card's amount and target are the question's", "the card counts from the question's unit"]);
  assert.ok(fails("PF-07", { amount: "7", target: "0.7", practice: [["4", "0.4"]] }).includes("the card's amount and target are the question's"));
  // A times question drawn as a count (7 hundreds = ? tens): the question's shape is wrong.
  assert.deepEqual(fails("PF-07", { amount: "700", target: "10", practice: [["400", "10"]] }), ["the card's amount and target are the question's", "the card's question is the question's (count or times)"]);
  // A put-together question drawn starting from its own place: the start unit is wrong.
  const fromOwn = timesTenLesson({ amount: "0.4", target: "0.1", start: "0.001", language: "zh-CN", practice: [["0.6", "0.1"]] });
  assert.ok(failed(judgePlaceValueTimesTen(byId["PF-05"], fromOwn)).includes("the card counts from the question's unit"));
  assert.deepEqual(fails("PF-12", { amount: "0.2", target: "0.001", language: "zh-CN", cardLanguage: "en-US", practice: [["5", "0.01"]] }), ["the card speaks the lesson's language"]);
  assert.deepEqual(fails("PF-12", { amount: "0.2", target: "0.001", practice: [["5", "0.01"]], cardStart: { counted_in: 0 } }), ["the card opens fresh, at its start unit"]);
  assert.deepEqual(fails("PF-12", { amount: "0.2", target: "0.001", practice: [["5", "0.01"]], cardStart: { moved_once: 1 } }), ["the card opens fresh, at its start unit"]);
});

test("a task the learner cannot reach fails: another shape, the lesson's own, not fresh, a wrong row or typed answer", () => {
  const fails = (input, item = "PF-12") => failed(judgePlaceValueTimesTen(byId[item], timesTenLesson({ amount: "0.2", target: "0.001", ...input })));
  assert.deepEqual(fails({ practice: [["7", "0.7"]] }), ["practice-1: the practice is a problem of the card's shape", "row-1: the row after the card's task asks its problem's answers"]);
  assert.deepEqual(fails({ practice: [["0.2", "0.001"]] }), ["practice-1: the practice is not the lesson's own problem"]);
  assert.deepEqual(fails({ practice: [["5", "0.01"]], starts: [{ counted_in: 0 }] }), ["practice-1: the practice starts fresh, at its own start unit"]);
  assert.deepEqual(fails({ practice: [["5", "0.01"]], starts: [{ counted_in: 10 }] }), ["practice-1: the practice starts fresh, at its own start unit"], "not the demonstration's value either");
  assert.deepEqual(fails({ practice: [["5", "0.01"]], starts: [{ moved_twice: 2 }] }), ["practice-1: the practice starts fresh, at its own start unit"]);
  assert.deepEqual(fails({ practice: [["5", "0.01"]], rows: [row({ question: "count", answers: [50] })] }), ["row-1: the row after the card's task asks its problem's answers"]);
  assert.deepEqual(fails({ practice: [["5", "0.01"]], typed: ["500"] }), []);
  assert.deepEqual(fails({ practice: [["5", "0.01"]], typed: ["50"] }), ["answer-1: the typed answer after the card's task is one of its problem's answers"]);
  // A times pair's row: the renamed count, then 10.
  const timesFails = (input) => failed(judgePlaceValueTimesTen(byId["PF-07"], timesTenLesson({ amount: "700", target: "70", ...input })));
  assert.deepEqual(timesFails({ practice: [["4000", "400"]], rows: [row({ question: "times", answers: [400, 10] })] }), ["row-1: the row after the card's task asks its problem's answers"]);
  assert.deepEqual(timesFails({ practice: [["4000", "400"]], rows: [[{ text: "4,000 is" }, { blank: { as: "times", answer: "10" } }]] }), ["row-1: the row after the card's task asks its problem's answers"]);
  assert.deepEqual(timesFails({ practice: [["4000", "400"]], typed: ["10"] }), []);
  // The task allows only tapping the card.
  const lesson = timesTenLesson({ amount: "0.2", target: "0.001", practice: [["5", "0.01"]] });
  lesson.lesson.tasks[0].allowed_operations.push({ kind: "card_submit" });
  assert.deepEqual(failed(judgePlaceValueTimesTen(byId["PF-12"], lesson)), ["practice-1: the task on the card is its complete fact, by taps"]);
});

test("a times pair is written larger first, and the practice is never the lesson's pair the other way round (review of #185)", () => {
  // The card written smaller first (0.3 and 3): OLL refuses it.
  const smaller = timesTenLesson({ amount: "0.3", target: "3", practice: [["0.6", "0.06"]], asWritten: true });
  assert.deepEqual(failed(judgePlaceValueTimesTen(byId["PF-14"], smaller)), ["the times pair is written larger first"]);
  // PF-07: the practice is the lesson's 700 and 70 written the other way round, with the lesson's row [70, 10].
  const reversed = timesTenLesson({ amount: "700", target: "70", practice: [["70", "700"]], asWritten: true });
  assert.deepEqual(failed(judgePlaceValueTimesTen(byId["PF-07"], reversed)),
    ["practice-1: the practice is not the lesson's own problem", "practice-1: the practice's times pair is written larger first"]);
  // PF-14: the card smaller first, the practice its own pair larger first.
  const both = timesTenLesson({ amount: "0.3", target: "3", practice: [["3", "0.3"]], asWritten: true });
  assert.deepEqual(failed(judgePlaceValueTimesTen(byId["PF-14"], both)), ["the times pair is written larger first", "practice-1: the practice is not the lesson's own problem"]);
  // Another pair, written smaller first: only the order fails.
  const other = timesTenLesson({ amount: "3", target: "0.3", practice: [["0.06", "0.6"]], asWritten: true });
  assert.deepEqual(failed(judgePlaceValueTimesTen(byId["PF-14"], other)), ["practice-1: the practice's times pair is written larger first"]);
});

test("the demonstration stays on its path, forward; a practice start sets every field the card binds (review of #185)", () => {
  const fails = (input, item = "PF-12") => failed(judgePlaceValueTimesTen(byId[item], timesTenLesson({ amount: "0.2", target: "0.001", practice: [["5", "0.01"]], ...input })));
  const path = "the demonstration moves counted in along its path, forward";
  assert.deepEqual(fails({ counted: [10, 1] }), []);
  assert.deepEqual(fails({ counted: [1] }), [], "straight to the target");
  assert.deepEqual(fails({ counted: [50] }), [path], "between two of its values");
  assert.deepEqual(fails({ counted: [10, 100] }), [path], "back");
  assert.deepEqual(fails({ counted: [10_000] }), [path], "off the path");
  assert.deepEqual(failed(judgePlaceValueTimesTen(byId["PF-07"], timesTenLesson({ amount: "700", target: "70", practice: [["4000", "400"]], counted: [10_000] }))), [path], "a times pair's path is 100 then 70");
  // A practice start without a bound row set.
  const lesson = timesTenLesson({ amount: "0.2", target: "0.001", practice: [["5", "0.01"]] });
  const start = lesson.lesson.tasks[0].start;
  delete start.values.moved_twice;
  start.variables = start.variables.filter((variable) => variable !== "moved_twice");
  assert.deepEqual(failed(judgePlaceValueTimesTen(byId["PF-12"], lesson)), ["practice-1: the practice start sets every field the card binds"]);
});

test("the lesson plays through OLL: a served lesson plays; OLL's own refusals are reported as such", () => {
  const plays = (item, lesson) => !failedAll(judgePlaceValueTimesTen(byId[item], lesson)).includes("the lesson plays");
  assert.ok(plays("PF-12", timesTenLesson({ amount: "0.2", target: "0.001", practice: [["5", "0.01"]], counted: [10, 1] })));
  assert.ok(plays("PF-07", timesTenLesson({ amount: "700", target: "70", practice: [["4000", "400"]], counted: [70_000] })));
  assert.ok(plays("PF-05", timesTenLesson({ amount: "0.4", target: "0.1", start: "0.01", language: "zh-CN", practice: [["0.06", "0.01"]], counted: [100] })));
  // OLL refuses each of these too: a card that opens with rows moved, a times pair smaller first, the lesson's own
  // pair as the practice, counted in off its path.
  assert.equal(plays("PF-12", timesTenLesson({ amount: "0.2", target: "0.001", practice: [["5", "0.01"]], cardStart: { moved_once: 1 } })), false);
  assert.equal(plays("PF-14", timesTenLesson({ amount: "0.3", target: "3", practice: [["0.6", "0.06"]], asWritten: true })), false);
  assert.equal(plays("PF-07", timesTenLesson({ amount: "700", target: "70", practice: [["70", "700"]], asWritten: true })), false);
  assert.equal(plays("PF-12", timesTenLesson({ amount: "0.2", target: "0.001", practice: [["5", "0.01"]], counted: [50] })), false);
});
