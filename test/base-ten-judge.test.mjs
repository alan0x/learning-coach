// The trading mat judge (OLL decision 0023): a good lesson passes, and each kind of break is caught.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildBaseTenTrade } from "octos-lesson-language/plugin-math";
import { judgeTradingMat } from "../scripts/base-ten-judge.mjs";

const v = (as, initial, max) => ({ as, initial, min: 0, max, label: as });
const tap = (kind, at) => ({ do: "tap", target: "mat", tap: kind, at });

/** A lesson as the recipe will write it: the question's pile, a demonstration, a practice pile and three questions. */
function tradingLesson({ lesson = [0, 3, 14], practice = [0, 2, 17], demoTrades = 1, numberAnswer, countsAnswers, partsAnswers, partsPrompt, label } = {}) {
  const [, t, o] = lesson;
  const [, pt, po] = practice;
  const value = pt * 10 + po;
  const built = buildBaseTenTrade({ as: "mat", role: "Tens and ones", place: { relation: "new_region" }, columns: 2,
    places: [{ count: { expression: "ones", initial: o }, tray: { expression: "tray_ones", initial: 0 } }, { count: { expression: "tens", initial: t } }] });
  const demo = [];
  for (let k = 0; k < demoTrades; k += 1) demo.push(...Array.from({ length: 10 }, () => tap("gather", "ones")), tap("make", "ones"));
  return {
    dsl: "octos.lesson", version: "0.1", profile: "authoring",
    lesson: {
      mode: "explain", language: "en-US", title: "Tens and ones", goals: ["Ten ones make a ten"],
      variables: [v("ones", o, 59), v("tray_ones", 0, 10), v("tens", t, 9)],
      tasks: [
        { as: "trade", start: { kind: "practice", variables: ["ones", "tray_ones", "tens"], values: { ones: po, tray_ones: 0, tens: pt } },
          prompt: `Your turn: ${pt} tens and ${po} ones. Make tens until you can't, then tap I'm done.`, availability: { kind: "after_lesson" },
          allowed_operations: [{ kind: "card_tap", node: "mat" }, { kind: "card_submit" }], completion: { kind: "card_fact", node: "mat", fact: "no_trade_left" }, hints: ["Put ones in the tray."] },
        { as: "number", anchor: "mat", prompt: "How many are there?", availability: { kind: "after_lesson" }, allowed_operations: [{ kind: "answer_entry" }],
          completion: { kind: "numeric_answer", answer: String(numberAnswer ?? value) }, hints: ["Count the tens, then the ones."] },
        { as: "counts", anchor: "mat", prompt: "How many of each are on the mat?", availability: { kind: "after_lesson" }, allowed_operations: [{ kind: "row_entry" }],
          completion: { kind: "numeric_row", parts: [{ blank: { as: "tens", answer: String((countsAnswers ?? [Math.floor(value / 10), value % 10])[0]) } }, { text: "tens" }, { blank: { as: "ones", answer: String((countsAnswers ?? [Math.floor(value / 10), value % 10])[1]) } }, { text: "ones" }] },
          hints: ["Count each column."] },
        { as: "parts", anchor: "mat", prompt: partsPrompt ?? `What are the tens and the ones worth? Write ${value} by places.`, availability: { kind: "after_lesson" }, allowed_operations: [{ kind: "row_entry" }],
          completion: { kind: "numeric_row", parts: [{ text: `${value} =` }, { blank: { as: "tens-part", answer: String((partsAnswers ?? [Math.floor(value / 10) * 10, value % 10])[0]), label: label ?? "the tens are worth" } }, { text: "+" }, { blank: { as: "ones-part", answer: String((partsAnswers ?? [Math.floor(value / 10) * 10, value % 10])[1]), label: label ? "the ones" : "the ones are worth" } }] },
          hints: ["What are the tens worth?"] },
      ],
    },
    steps: [{ key: "watch", purpose: "Watch a trade", beats: [
      { key: "pile", say: "Here is the pile.", actions: built.actions },
      ...(demo.length ? [{ key: "trade", say: "Ten ones make a ten.", actions: demo }] : []),
    ] }],
    close: { summary: "Ten ones make a ten.", focus: ["mat"] },
  };
}
const item = (pile) => ({ id: "x", expect: { lesson_pile: pile } });
const failed = (verdict) => verdict.checks.filter((check) => !check.pass).map((check) => check.check);

test("a good trading lesson passes every check", () => {
  const verdict = judgeTradingMat(item([0, 3, 14]), tradingLesson());
  assert.deepEqual(failed(verdict), []);
  assert.equal(verdict.pass, true);
});

test("each break is caught", () => {
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 15]), tradingLesson())), ["the lesson pile is the question's"]);
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 14]), tradingLesson({ demoTrades: 0 }))),
    ["the demonstration ends with no trade left", "the demonstration trades when the pile needs it"]);
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 14]), tradingLesson({ practice: [0, 3, 14] }))), ["the practice pile differs from the lesson's"]);
  // A one-digit practice pile for a two-digit lesson (its two-blank rows are then wrong too).
  assert.ok(failed(judgeTradingMat(item([0, 3, 14]), tradingLesson({ practice: [0, 0, 5] }))).includes("the practice pile has as many places as the lesson's"));
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 14]), tradingLesson({ numberAnswer: 36 }))), ["the number question answers the practice pile"]);
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 14]), tradingLesson({ countsAnswers: [2, 17] }))), ["a counts row answers the practice pile"]);
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 14]), tradingLesson({ partsAnswers: [3, 7] }))), ["a parts row answers the practice pile"]);
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 14]), tradingLesson({ partsPrompt: "Write 37 by places.", label: "the tens" }))), ["the parts row asks what each place is worth"]);
});

test("a near miss passes only without a mat", () => {
  assert.equal(judgeTradingMat({ id: "n", expect: { forbid: ["base_ten_trade"] } }, tradingLesson()).pass, false);
  assert.equal(judgeTradingMat({ id: "n", expect: { forbid: ["base_ten_trade"] } }, { lesson: { tasks: [] }, steps: [] }).pass, true);
});

test("every development case names a pile the mat can start with, or is a near miss", async () => {
  const { cases } = JSON.parse(await readFile(new URL("../testsuite/base-ten-dev-cases.json", import.meta.url), "utf8"));
  assert.equal(cases.length, 20);
  for (const each of cases) {
    if (each.expect.forbid) continue;
    const [h, t, o] = each.expect.lesson_pile;
    assert.ok(h <= 9 && t <= 19 && o <= 59 && h * 100 + t * 10 + o <= 999, `${each.id} ${each.expect.lesson_pile}`);
  }
});
