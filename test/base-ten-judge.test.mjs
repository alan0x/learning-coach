// The trading mat judge (OLL decision 0023): good lessons pass, on two and three columns and with a zero
// place, and each kind of break is caught by the check meant for it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildBaseTenTrade } from "octos-lesson-language/plugin-math";
import { judgeTradingMat } from "../scripts/base-ten-judge.mjs";

const PLACES = ["ones", "tens", "hundreds"];
const v = (as, initial, max) => ({ as, initial, min: 0, max, label: as });
const tap = (kind, at) => ({ do: "tap", target: "mat", tap: kind, at });
const valueOf = ([h, t, o]) => h * 100 + t * 10 + o;

/** The demonstration's taps for a pile: every ones trade, then every tens trade (on three columns). */
function demonstration([h, t, o], columns) {
  const taps = [];
  let ones = o, tens = t;
  while (ones >= 10) { taps.push(...Array.from({ length: 10 }, () => tap("gather", "ones")), tap("make", "ones")); ones -= 10; tens += 1; }
  while (columns === 3 && tens >= 10) { taps.push(...Array.from({ length: 10 }, () => tap("gather", "tens")), tap("make", "tens")); tens -= 10; }
  return taps;
}

/**
 * A lesson as the recipe will write it, with overrides to break one thing at a time. `rows` edits the
 * program's rows: counts (words and answers) and parts (lead text, answers, labels).
 */
function tradingLesson({ lesson = [0, 3, 14], practice = [0, 2, 17], columns, demo = true, cardTask = {}, number, counts = {}, parts = {}, extraMat = false, anchor = "mat", zh = false, matLanguage, hint = "Look at the mat." } = {}) {
  const cols = columns ?? (valueOf(lesson) >= 100 || lesson[0] > 0 ? 3 : 2);
  const places = Array.from({ length: cols }, (_, p) => p);
  const name = (p, field) => (field === "count" ? PLACES[p] : `tray_${PLACES[p]}`);
  const max = [59, cols === 2 ? 9 : 34, 9];
  const language = matLanguage === undefined ? (zh ? "zh-CN" : undefined) : matLanguage;
  const built = buildBaseTenTrade({ as: "mat", role: "Tens and ones", place: { relation: "new_region" }, columns: cols, ...(language ? { language } : {}),
    places: places.map((p) => ({ count: { expression: name(p, "count"), initial: lesson[2 - p] }, ...(p < cols - 1 ? { tray: { expression: name(p, "tray"), initial: 0 } } : {}) })) });
  const variables = places.flatMap((p) => [v(name(p, "count"), lesson[2 - p], max[p]), ...(p < cols - 1 ? [v(name(p, "tray"), 0, 10)] : [])]);
  const value = valueOf(practice);
  const digits = value >= 100 ? 3 : value >= 10 ? 2 : 1;
  const high = Array.from({ length: digits }, (_, i) => digits - 1 - i);
  const countAnswers = counts.answers ?? high.map((p) => Math.floor(value / 10 ** p) % 10);
  const countWords = counts.words ?? high.map((p) => (zh ? ["个一", "个十", "个百"] : PLACES)[p]);
  const partAnswers = parts.answers ?? high.map((p) => (Math.floor(value / 10 ** p) % 10) * 10 ** p);
  const partLabels = parts.labels ?? high.map((p) => (zh ? ["个位表示", "十位表示", "百位表示"][p] : `the ${PLACES[p]} are worth`));
  const task = (as, prompt, completion, ops = [{ kind: "row_entry" }]) => ({ as, anchor, prompt, availability: { kind: "after_lesson" }, allowed_operations: ops, completion, hints: [hint] });
  return {
    dsl: "octos.lesson", version: "0.1", profile: "authoring",
    lesson: {
      mode: "explain", language: zh ? "zh-CN" : "en-US", title: "Tens and ones", goals: ["Ten ones make a ten"],
      variables,
      tasks: [
        { as: "trade", start: { kind: "practice", variables: variables.map((each) => each.as), values: Object.fromEntries(places.map((p) => [name(p, "count"), practice[2 - p]])) },
          prompt: "Your turn. Make tens until you can't, then tap I'm done.", availability: { kind: "after_lesson" },
          allowed_operations: [{ kind: "card_tap", node: "mat" }, { kind: "card_submit" }],
          completion: { kind: "card_fact", node: "mat", fact: "no_trade_left", ...cardTask }, hints: ["Put ones in the tray."] },
        task("number", "How many are there?", { kind: "numeric_answer", answer: String(number ?? value) }, [{ kind: "answer_entry" }]),
        task("counts", "How many of each are on the mat?", { kind: "numeric_row", parts: countAnswers.flatMap((answer, i) => [{ blank: { as: `c${i}`, answer: String(answer) } }, { text: countWords[i] }]) }),
        task("parts", parts.prompt ?? (zh ? "每一位表示多少？" : "What is each place worth?"), { kind: "numeric_row", parts: [{ text: `${parts.lead ?? value} =` }, ...partAnswers.flatMap((answer, i) => [...(i ? [{ text: "+" }] : []), { blank: { as: `p${i}`, answer: String(answer), label: partLabels[i] } }])] }),
      ],
    },
    steps: [{ key: "watch", purpose: "Watch a trade", beats: [
      { key: "pile", say: "Here is the pile.", actions: [...built.actions, ...(extraMat ? buildBaseTenTrade({ as: "mat2", role: "Again", place: { relation: "new_region" }, columns: 2, places: [{ count: 3 }, { count: 1 }] }).actions : [])] },
      ...(demo && demonstration(lesson, cols).length ? [{ key: "trade", say: "Ten make one of the next place.", actions: demonstration(lesson, cols) }] : []),
    ] }],
    close: { summary: "Ten ones make a ten.", focus: ["mat"] },
  };
}
const item = (pile) => ({ id: "x", expect: { lesson_pile: pile } });
const failed = (verdict) => verdict.checks.filter((check) => !check.pass).map((check) => check.check);

test("good lessons pass: two columns, and three columns with a zero place", () => {
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 14]), tradingLesson())), []);
  // 6 hundreds, 9 tens, 16 ones (706) demonstrated; practice 4 hundreds, 9 tens, 12 ones (502): three blanks, a zero ten.
  const three = tradingLesson({ lesson: [6, 9, 16], practice: [4, 9, 12] });
  assert.deepEqual(failed(judgeTradingMat(item([6, 9, 16]), three)), []);
  // The same lessons in Chinese (owner, 2026-11-22: English and Chinese both).
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 14]), tradingLesson({ zh: true }))), []);
  assert.deepEqual(failed(judgeTradingMat(item([6, 9, 16]), tradingLesson({ zh: true, lesson: [6, 9, 16], practice: [4, 9, 12] }))), []);
  // A pile with nothing to trade (345) needs no demonstration taps.
  assert.deepEqual(failed(judgeTradingMat(item([3, 4, 5]), tradingLesson({ lesson: [3, 4, 5], practice: [2, 6, 8] }))), []);
});

test("each break is caught by its own check", () => {
  const only = (pile, lesson, expected) => assert.deepEqual(failed(judgeTradingMat(item(pile), lesson)), expected);
  only([0, 3, 15], tradingLesson(), ["the lesson pile is the question's"]);
  only([0, 3, 14], tradingLesson({ demo: false }), ["the demonstration ends with no trade left", "the demonstration trades when the pile needs it"]);
  // Same number as the lesson's (44), though the pile differs (review of #155).
  only([0, 3, 14], tradingLesson({ practice: [0, 4, 4] }), ["the practice pile's number differs from the lesson's"]);
  only([0, 3, 14], tradingLesson({ number: 36 }), ["the number question answers the practice pile"]);
  // A one-digit practice pile for a two-digit lesson (review of #155, round 2).
  only([0, 3, 14], tradingLesson({ practice: [0, 0, 5] }), ["the practice pile has as many places as the lesson's"]);
  // A practice pile that is no starting pile (149 on two columns): OLL already refuses the lesson.
  only([0, 3, 14], tradingLesson({ practice: [0, 9, 59] }), ["the lesson plays"]);
  only([0, 3, 14], tradingLesson({ counts: { answers: [2, 17] } }), ["a counts row answers the practice pile"]);
  // Place words swapped: the answers are right only for the wrong words (review of #155).
  only([0, 3, 14], tradingLesson({ counts: { answers: [7, 3], words: ["ones", "tens"] } }), ["a counts row answers the practice pile"]);
  only([0, 3, 14], tradingLesson({ parts: { answers: [3, 7] } }), ["a parts row answers the practice pile"]);
  // The row writes another number than the practice pile's (review of #155).
  only([0, 3, 14], tradingLesson({ parts: { lead: 54 } }), ["a parts row answers the practice pile"]);
  // An empty answer on a zero place is not 0 (review of #155): OLL already refuses such a lesson, and the
  // judge reads it as not playing.
  only([6, 9, 16], tradingLesson({ lesson: [6, 9, 16], practice: [4, 9, 12], parts: { answers: [500, "", 2] } }), ["the lesson plays"]);
  only([0, 3, 14], tradingLesson({ parts: { prompt: "Write by places.", labels: ["the tens", "the ones"] } }), ["the parts row asks what each place is worth"]);
  // A locked question shows its prompt, so a number in it gives the answer away (Chinese first-use test).
  only([0, 3, 14], tradingLesson({ parts: { prompt: "What is each place worth? Write 37 by places." } }), ["no question's prompt or hint shows a number"]);
  only([0, 3, 14], tradingLesson({ hint: "What are 3 tens worth?" }), ["no question's prompt or hint shows a number"]);
  // The mat speaks the lesson's language (0023 amendment 3).
  only([0, 3, 14], tradingLesson({ zh: true, matLanguage: null }), ["the mat speaks the lesson's language"]);
  only([0, 3, 14], tradingLesson({ matLanguage: "zh-CN" }), ["the mat speaks the lesson's language"]);
  // A Chinese lesson's rows are read in Chinese: English place words are not its counts row.
  only([0, 3, 14], tradingLesson({ zh: true, counts: { words: ["tens", "ones"] } }), ["a counts row answers the practice pile"]);
  // A label with a number: OLL already refuses it (a blank's label is words only), so the lesson does not play.
  only([0, 3, 14], tradingLesson({ parts: { labels: ["30 here", "the ones are worth"] } }), ["the lesson plays"]);
  only([0, 3, 14], tradingLesson({ anchor: "elsewhere-card" }), ["the lesson plays"]);
  only([0, 3, 14], tradingLesson({ extraMat: true }), ["one trading mat"]);
  // A trade written as two animations shows a wrong amount between them (Learn playback, 2026-11-22).
  const animated = tradingLesson({ demo: false });
  animated.steps[0].beats.push({ key: "rest", say: "The other ones trade the same way.", actions: [{ do: "animate", variable: "ones", value: 4 }, { do: "animate", variable: "tens", value: 4 }] });
  only([0, 3, 14], animated, ["every demonstration step keeps the value", "the demonstration trades when the pile needs it"]);
  only([0, 3, 14], tradingLesson({ cardTask: { node: "mat2" } }), ["the lesson plays"]);
});

test("a lesson without its card task fails, and so does one that does not play", () => {
  const lesson = tradingLesson();
  lesson.lesson.tasks = lesson.lesson.tasks.filter((task) => task.completion.kind !== "card_fact");
  assert.ok(failed(judgeTradingMat(item([0, 3, 14]), lesson)).includes("a card task with a practice pile"));
  // Eleven ones in the tray: the card refuses the tap, so OLL refuses the lesson.
  const unplayable = tradingLesson();
  unplayable.steps[0].beats.push({ key: "more", say: "More.", actions: Array.from({ length: 11 }, () => tap("gather", "ones")) });
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 14]), unplayable)), ["the lesson plays"]);
});

test("a near miss passes only without a mat, and only if the lesson plays", () => {
  const near = { id: "n", expect: { forbid: ["base_ten_trade"] } };
  assert.equal(judgeTradingMat(near, tradingLesson()).pass, false);
  const plain = { dsl: "octos.lesson", version: "0.1", profile: "authoring", lesson: { mode: "explain", language: "en-US", title: "Compare", goals: ["Compare"] },
    steps: [{ key: "s", purpose: "p", beats: [{ key: "b", say: "354 is more.", actions: [{ do: "write", as: "t", kind: "text", role: "note", content: { text: "354 > 345" }, place: { relation: "new_region" } }] }] }], close: { summary: "Done.", focus: ["t"] } };
  assert.equal(judgeTradingMat(near, plain).pass, true);
  assert.deepEqual(failed(judgeTradingMat(near, {})), ["the lesson plays"]);
});

test("every development case names a pile the mat can start with, or is a near miss", async () => {
  const { cases } = JSON.parse(await readFile(new URL("../testsuite/base-ten-dev-cases.json", import.meta.url), "utf8"));
  // 20 English (BT-01–20) and 13 Chinese (BT-21–33), each language with its own near misses.
  assert.equal(cases.length, 33);
  assert.equal(cases.filter((each) => each.language === "zh-CN").length, 13);
  assert.equal(cases.filter((each) => each.language === "zh-CN" && each.expect.forbid).length, 3);
  for (const each of cases) {
    if (each.expect.forbid) continue;
    const [h, t, o] = each.expect.lesson_pile;
    assert.ok(h <= 9 && t <= 19 && o <= 59 && valueOf([h, t, o]) <= 999, `${each.id} ${each.expect.lesson_pile}`);
  }
});
