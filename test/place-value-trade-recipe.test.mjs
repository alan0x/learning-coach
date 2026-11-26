// The place-value trade recipe (OLL decision 0026, need 35P-07): adding and subtracting on the place-value chart,
// drawn as the written column method. A trial, off by default. The model writes the operation and five lesson
// numbers: the question's pair, a practice pair of the same columns and "columns finished, counting from the
// right", which its demonstration animates. The program binds the card's own variables, plays each value of columns
// finished (the card plays that column's bring-down, trades and breaks), makes the learner's task on the practice
// pair and asks for the answer read off the finished chart. Every development case's ideal lesson compiles and
// passes the judge in both languages; each refusal names its reason and the picture it can cost, never the lesson.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);
const CASES = JSON.parse(readFileSync(new URL("../testsuite/place-value-trade-dev-cases.json", import.meta.url), "utf8")).cases;

/** Runs a script in its own process with the trial on. */
function withTrial(script, trial = "place_value_trade") {
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: trial },
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  }));
}

test("place_value_trade is a trial, off by default: built, not offered, one field of its own", () => {
  assert.ok(api.TRIAL_RECIPES.includes("place_value_trade"));
  assert.equal(api.RECIPE_CATALOG_ORDER.includes("place_value_trade"), false);
  assert.equal(api.OFFERED_RECIPES.includes("place_value_trade"), false);
  assert.equal(api.LESSON_PLAN_CAPABILITY_NAMES.includes("place_value_trade"), false);
  assert.equal(api.RECIPE_PLUGIN.place_value_trade, "math");
  assert.deepEqual(api.RECIPE_SCHEMA_PROPERTIES.place_value_trade, { operation: { enum: ["add", "subtract"] } });
  // Last in the provider's property order, so requests without the trial keep theirs.
  assert.equal(api.SCHEMA_PROPERTY_ORDER.at(-1), "operation");
  const offered = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    console.log(JSON.stringify({ offered: api.OFFERED_RECIPES, names: api.LESSON_PLAN_CAPABILITY_NAMES }));
  `);
  assert.equal(offered.offered.at(-1), "place_value_trade");
  assert.ok(offered.names.includes("place_value_trade"));
});

test("columns finished moves forward a whole column at a time; the numbers never move", () => {
  const moves = api.RECIPE_HOOKS.place_value_trade.number_moves;
  const add = { parameters: { operation: "add" } }, subtract = { parameters: { operation: "subtract" } };
  const to = (state, ...values) => moves.moves(state, values.map((value) => ({ position: 4, to: value })));
  // The card's state when drawn: the four numbers as written, columns finished 0 (whatever the model declared),
  // then the operation, which no step changes.
  const start = moves.state([3486, 2739, 4658, 1573, 3], add);
  assert.deepEqual(start, [3486, 2739, 4658, 1573, 0, 0]);
  assert.deepEqual(moves.state([50003, 2476, 40002, 3585, 0], subtract).at(-1), 1);
  assert.deepEqual(to(start, 1, 2, 4).steps.map((step) => step.to[4]), [1, 2, 4]);
  // The same value again changes nothing.
  assert.deepEqual(to(start, 2, 2).steps.map((step) => step.to[4]), [2, 2]);
  // Back, past the columns, or a fraction: refused with what the next value does.
  assert.match(to(start, 3, 1).refused.reason, /goes forward.*from 3 it can be 3 to 4; the next value, 4, finishes the thousands/);
  assert.match(to(start, 5).refused.reason, /a whole number from 0 to 4, not 5; from 0, the next value, 1, finishes the ones/);
  assert.match(to(start, 1.5).refused.reason, /a whole number from 0 to 4, not 1.5/);
  assert.deepEqual(to(start, 4, 4).steps.map((step) => step.to[4]), [4, 4]);
  // The pair and the practice pair stay as written: animating one to its own value is no change, else refused.
  assert.deepEqual(moves.moves(start, [{ position: 0, to: 3486 }]).steps.at(-1).to, start);
  assert.match(moves.moves(start, [{ position: 0, to: 6225 }]).refused.reason, /stay as written: the demonstration moves only columns finished.* from 0 up to 4/);
  assert.match(moves.moves(start, [{ position: 3, to: 0 }]).refused.reason, /stay as written/);
});

// One lesson per entry: [id, placeValueTradePlan options, language, judge case or null]. Each compiles through
// the full OLL validation; the result keeps the lesson, the program's adjustments and the judge's verdict.
const compileScript = (entries) => `
  const api = await import(${here("../lesson-plan.js")});
  const { placeValueTradePlan } = await import(${here("./sample-plans.mjs")});
  const { judgePlaceValueTrade } = await import(${here("../scripts/place-value-trade-judge.mjs")});
  const out = {};
  for (const [id, options, language, item] of ${JSON.stringify(entries)}) {
    try {
      const compiled = api.compileAndValidateLessonPlan(placeValueTradePlan(options), { language });
      out[id] = { lesson: compiled.lesson, adjustments: compiled.program_adjustments, verdict: item ? judgePlaceValueTrade(item, compiled.lesson) : undefined };
    } catch (error) {
      out[id] = { error: error.code, path: error.path, message: error.message, capability: error.capability };
    }
  }
  console.log(JSON.stringify(out));
`;

// A practice pair per development case: another pair of the same columns that also trades, never the question's.
const PRACTICE = {
  "PT-01": [4658, 1573], "PT-02": [3876, 2459], "PT-03": [3870, 4136], "PT-04": [57846, 32175], "PT-05": [3998, 2002],
  "PT-06": [8461, 3729], "PT-07": [9361, 4582], "PT-08": [7104, 2968], "PT-09": [40002, 3585], "PT-10": [5000, 2376],
  "PT-11": [7003, 4865], "PT-12": [3.86, 2.57], "PT-13": [2.79, 5.64], "PT-14": [7, 2.48], "PT-15": [9.3, 4.68],
};
const optionsOf = (item) => ({ operation: item.expect.operation, numbers: item.expect.numbers.map(Number), practice: PRACTICE[item.id] });

test("every development case's ideal lesson compiles and passes the judge, in English and in Chinese", () => {
  const served = CASES.filter((item) => !item.expect.forbid);
  assert.equal(served.length, 15);
  const entries = served.flatMap((item) => ["en-US", "zh-CN"].map((language) => [`${item.id} ${language}`, optionsOf(item), language, item]));
  const result = withTrial(compileScript(entries));
  for (const [id, , language, item] of entries) {
    assert.ok(!result[id].error, `${id}: ${result[id].message}`);
    assert.deepEqual(result[id].verdict.checks.filter((check) => !check.pass), [], id);
    // The ideal lesson finishes its demonstration, leaves the learner a task on the card and asks for the answer.
    assert.deepEqual(result[id].verdict.notes.filter((note) => !note.pass), [], id);
    assert.deepEqual(result[id].adjustments, [], id);
    const variables = result[id].lesson.lesson.variables;
    // The card's lesson numbers are read, not bound: only its own variables are declared (3 + columns), none
    // with a control.
    assert.deepEqual(variables.filter((variable) => /^number_\d+$/u.test(variable.as)), [], id);
    assert.deepEqual(variables.filter((variable) => variable.control), [], id);
    const write = result[id].lesson.steps[0].beats[0].actions[0];
    assert.equal(variables.length, 3 + write.content.places.length, id);
    assert.equal(write.content.language, language === "zh-CN" ? "zh-CN" : undefined, id);
    assert.equal(write.content.operation, item.expect.operation, id);
  }
});

test("the demonstration plays in the model's own moments: each value of columns finished, forward; a lesson may stop partway", () => {
  const result = withTrial(compileScript([
    ["every", { operation: "add", numbers: [3486, 2739], practice: [4658, 1573] }, "en-US"],
    ["at-once", { operation: "subtract", numbers: [50003, 2476], practice: [40002, 3585], steps: [5] }, "zh-CN"],
    // The same value again changes nothing: the moment looks at the card.
    ["still", { operation: "add", numbers: [2.75, 1.48], practice: [3.86, 2.57], steps: [1, 1, 2] }, "en-US"],
    // Two columns of four: the owner judges whether that teaches enough (2026-11-25).
    ["partway", { operation: "subtract", numbers: [7352, 2618], practice: [8461, 3729], steps: [1, 2] }, "en-US"],
  ]));
  const played = (id) => result[id].lesson.steps[0].beats.map((beat) => beat.actions.map((action) => (action.do === "animate" ? `${action.variable.replace(/^section_01_moment_01_item_01_/u, "")}=${action.value}` : action.do)));
  assert.deepEqual(played("every"), [["write", "focus"], ["finished=1"], ["finished=2"], ["finished=3"], ["finished=4"]]);
  assert.deepEqual(played("at-once"), [["write", "focus"], ["finished=5"]]);
  assert.deepEqual(played("still"), [["write", "focus"], ["finished=1"], ["focus"], ["finished=2"]]);
  assert.deepEqual(played("partway"), [["write", "focus"], ["finished=1"], ["finished=2"]]);
  assert.deepEqual(result.partway.adjustments, []);
  // The card is the program's: columns, the pair in thousandths, every binding its own variable.
  const write = result["at-once"].lesson.steps[0].beats[0].actions[0];
  assert.deepEqual([write.kind, write.content.language, write.content.operation, write.content.a, write.content.b, write.content.finished], ["place_value_trade", "zh-CN", "subtract", 50003000, 2476000, 0]);
  assert.deepEqual(write.content.places.map((place) => place.as), ["ten-thousands", "thousands", "hundreds", "tens", "ones"]);
  assert.deepEqual(write.content.bindings.map((binding) => binding.target).slice(0, 3), ["a", "b", "finished"]);
  // A decimal pair below the ones: its columns run to the hundredths.
  assert.deepEqual(result.still.lesson.steps[0].beats[0].actions[0].content.places.map((place) => place.place), [0, -1, -2]);
});

test("a practice pair that keeps one number compiles: that variable's range widens by a unit the card's columns hold", () => {
  const result = withTrial(compileScript([
    ["first-kept", { operation: "add", numbers: [3486, 2739], practice: [3486, 2738] }, "en-US"],
    ["second-kept", { operation: "add", numbers: [3486, 2739], practice: [4658, 2739] }, "en-US"],
    // A decimal pair widens by a hundredth, its lowest column.
    ["decimal-kept", { operation: "subtract", numbers: [8.2, 3.75], practice: [8.2, 4.68] }, "zh-CN"],
  ]));
  const range = (id, field) => {
    const variable = result[id].lesson.lesson.variables.find((each) => each.as.endsWith(`_${field}`));
    return [variable.min, variable.max];
  };
  for (const id of ["first-kept", "second-kept", "decimal-kept"]) assert.ok(!result[id].error, `${id}: ${result[id].message}`);
  assert.deepEqual(range("first-kept", "a"), [3486000, 3487000]);
  assert.deepEqual(range("second-kept", "b"), [2739000, 2740000]);
  assert.deepEqual(range("decimal-kept", "a"), [8200, 8210]);
  // (A number at the top of its columns, such as 9,999, would widen down; no pair the card takes keeps one there:
  // subtracting from it borrows nothing, and adding to it gains a column.)
  // Every field is bound to one plain variable of its own (OLL #116's review).
  for (const id of Object.keys(result)) {
    const bindings = result[id].lesson.steps[0].beats[0].actions[0].content.bindings;
    assert.ok(bindings.every((binding) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(binding.expression)), id);
    assert.equal(new Set(bindings.map((binding) => binding.expression)).size, bindings.length, id);
  }
});

test("a moment that animates the pair is refused with the card's tag, never at OLL", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { placeValueTradePlan } = await import(${here("./sample-plans.mjs")});
    const out = {};
    for (const number of [1, 3]) {
      const plan = placeValueTradePlan({ operation: "add", numbers: [3486, 2739], practice: [4658, 1573] });
      plan.sections[0].moments.push({ narration: "Now another pair.", actions: [{ action: "animate", number, end_value: 5000, duration_intent: "brief", timing: "during_speech" }] });
      try { api.compileAndValidateLessonPlan(plan, { language: "en-US" }); out[number] = { compiled: true }; }
      catch (error) { out[number] = { code: error.code, capability: error.capability, message: error.message }; }
    }
    console.log(JSON.stringify(out));
  `);
  for (const number of ["1", "3"]) {
    assert.equal(result[number].capability, "place_value_trade", number);
    assert.notEqual(result[number].code, "LESSON_PLAN_OLL_SEMANTIC", number);
    assert.match(result[number].message, /stay as written: the demonstration moves only columns finished/, number);
  }
});

test("a replay lays the chart fresh again: its own variables only, the pair as the lesson's, columns finished 0", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { placeValueTradePlan } = await import(${here("./sample-plans.mjs")});
    const plan = placeValueTradePlan({ operation: "add", numbers: [5960, 2047], practice: [3870, 4136] });
    plan.sections[0].moments.push({ narration: "Once more from the start.", restart_numbers: [5], actions: [{ action: "animate", number: 5, end_value: 4, duration_intent: "brief", timing: "during_speech" }] });
    const compiled = api.compileAndValidateLessonPlan(plan, { language: "en-US" });
    console.log(JSON.stringify({ variables: compiled.lesson.lesson.variables.map((variable) => variable.as), beat: compiled.lesson.steps[0].beats.at(-1) }));
  `);
  assert.deepEqual(result.beat.start.variables.filter((name) => !result.variables.includes(name)), []);
  assert.equal(result.beat.start.variables.length, 7);
  assert.deepEqual(result.beat.actions.map((action) => [action.do, action.value]), [["animate", 4]]);
});

test("the practice is the learner's own pair, worked by taps; the program asks for the answer the finished chart shows", () => {
  const result = withTrial(compileScript([
    ["add", { operation: "add", numbers: [3486, 2739], practice: [4658, 1573] }, "en-US"],
    ["subtract", { operation: "subtract", numbers: [8.2, 3.75], practice: [9.3, 4.68] }, "zh-CN"],
    // Words that write the practice's answer give it away: the task is dropped and recorded, the lesson kept.
    ["leak", { operation: "add", numbers: [3486, 2739], practice: [4658, 1573], prompt: "Add 4,658 + 1,573 = 6,231 on the chart." }, "en-US"],
    ["leak-hint", { operation: "subtract", numbers: [8.2, 3.75], practice: [9.3, 4.68], hints: ["答案是４．６２。"] }, "zh-CN"],
    // Writing the pair itself is fine: the card shows it anyway.
    ["pair-words", { operation: "add", numbers: [3486, 2739], practice: [4658, 1573], prompt: "Now add 4,658 + 1,573." }, "en-US"],
    // 1,000 − 500 = 500: writing the pair writes the answer's digits too, and is fine; stating it as the answer is not.
    ["half", { operation: "subtract", numbers: [3000, 1468], practice: [1000, 500], prompt: "Now subtract 1,000 − 500." }, "en-US"],
    ["half-stated", { operation: "subtract", numbers: [3000, 1468], practice: [1000, 500], prompt: "Now subtract 1,000 − 500 = 500." }, "en-US"],
    ["half-zh", { operation: "subtract", numbers: [3000, 1468], practice: [1000, 500], hints: ["1000 − 500 的得数是 500。"] }, "zh-CN"],
    // A model's typed question by the card stays as written.
    ["typed", { operation: "add", numbers: [3486, 2739], practice: [4658, 1573], typed: true }, "en-US"],
  ]));
  const [task, answer] = result.add.lesson.lesson.tasks;
  const card = task.completion.node;
  // No "done": the tap that completes the chart ends the task (0026 §3).
  assert.deepEqual(task.allowed_operations, [{ kind: "card_tap", node: card }]);
  assert.deepEqual(task.completion, { kind: "card_fact", node: card, fact: "complete" });
  // The practice starts fresh on its own pair, in thousandths: nothing demonstrated, no column worked.
  const values = Object.entries(task.start.values).map(([name, value]) => [name.replace(/^section_01_moment_01_item_01_/u, ""), value]);
  assert.deepEqual(values, [["a", 4658000], ["b", 1573000], ["finished", 0], ...["thousands", "hundreds", "tens", "ones"].map((place) => [`${place}_status`, 0])]);
  assert.deepEqual(task.start.variables, Object.keys(task.start.values));
  // Then the answer, typed by the finished chart: the card's own question, the program's answer.
  assert.equal(answer.as, `${task.as}-2`);
  assert.deepEqual([answer.prompt, answer.anchor, answer.completion], ["What is the total?", card, { kind: "numeric_answer", answer: "6231" }]);
  assert.deepEqual(answer.allowed_operations, [{ kind: "answer_entry" }]);
  assert.equal(answer.hints[0], "Read how many disks each column has below the line, from left to right.");
  const [, difference] = result.subtract.lesson.lesson.tasks;
  assert.deepEqual([difference.prompt, difference.completion.answer, difference.hints[0]], ["还剩多少？", "4.62", "从左到右读横线下面每一列的圆片个数。"]);
  assert.deepEqual(result.half.lesson.lesson.tasks.map((each) => [each.completion.kind, each.completion.answer]), [["card_fact", undefined], ["numeric_answer", "500"]]);
  assert.deepEqual(result.half.adjustments, []);
  for (const id of ["leak", "leak-hint", "half-stated", "half-zh"]) {
    assert.deepEqual(result[id].lesson.lesson.tasks, undefined, id);
    assert.deepEqual(result[id].adjustments.map((adjustment) => [adjustment.kind, adjustment.reason]), [["activity_removed", "practice_answer_in_words"]], id);
  }
  assert.deepEqual(result["pair-words"].lesson.lesson.tasks.map((each) => each.completion.kind), ["card_fact", "numeric_answer"]);
  assert.deepEqual(result.typed.lesson.lesson.tasks.map((each) => [each.completion.kind, each.completion.answer]), [["card_fact", undefined], ["numeric_answer", "6231"], ["numeric_answer", "6225"]]);
});

test("refusals name their reason and the card, so only the picture can be lost; none reaches OLL", () => {
  const result = withTrial(compileScript([
    ["no-trade", { operation: "add", numbers: [1234, 4321], practice: [2345, 3412] }, "en-US"],
    ["no-borrow", { operation: "subtract", numbers: [8765, 4321], practice: [9876, 5432] }, "en-US"],
    ["negative", { operation: "subtract", numbers: [2476, 50003], practice: [3585, 40002] }, "en-US"],
    ["too-wide", { operation: "add", numbers: [389457, 947568], practice: [456789, 278436] }, "en-US"],
    ["too-wide-decimals", { operation: "add", numbers: [12345, 0.05], practice: [23456, 0.07] }, "en-US"],
    ["decimals", { operation: "add", numbers: [3.486, 2.739], practice: [4.658, 1.573] }, "en-US"],
    ["practice-no-trade", { operation: "add", numbers: [3486, 2739], practice: [1234, 4321] }, "en-US"],
    ["practice-same", { operation: "add", numbers: [3486, 2739], practice: [3486, 2739] }, "en-US"],
    ["practice-columns", { operation: "add", numbers: [3486, 2739], practice: [6500, 4700] }, "en-US"],
    ["practice-decimal-columns", { operation: "add", numbers: [3486, 2739], practice: [465.8, 157.3] }, "en-US"],
    ["bad-operation", { operation: "multiply", numbers: [3486, 2739], practice: [4658, 1573] }, "en-US"],
    ["back", { operation: "add", numbers: [3486, 2739], practice: [4658, 1573], steps: [2, 1] }, "en-US"],
    ["past", { operation: "add", numbers: [3486, 2739], practice: [4658, 1573], steps: [5] }, "en-US"],
  ]));
  const expect = {
    "no-trade": /question's pair: 1,234 \+ 4,321 has no column that carries.*\(no_trade\)/,
    "no-borrow": /no column that borrows.*\(no_trade\)/,
    negative: /2,476 − 50,003 is below zero: the first number is the larger \(negative\)/,
    "too-wide": /needs 7 columns; the card draws at most 6.*\(too_wide\)/,
    "too-wide-decimals": /\(too_wide\)/,
    decimals: /first number is a number from 0 to 999,999.99 with at most two decimal places/,
    "practice-no-trade": /practice pair: 1,234 \+ 4,321 has no column that carries/,
    "practice-same": /another pair than the question's/,
    "practice-columns": /practice pair needs the columns from ten thousands to ones and the question's pair from thousands to ones/,
    "practice-decimal-columns": /practice pair needs the columns from hundreds to tenths/,
    "bad-operation": /operation is one of add, subtract/,
    back: /goes forward.*from 2 it can be 2 to 4; the next value, 3, finishes the hundreds/,
    past: /a whole number from 0 to 4, not 5/,
  };
  for (const [id, pattern] of Object.entries(expect)) {
    assert.match(result[id].message ?? "", pattern, id);
    assert.notEqual(result[id].error, "LESSON_PLAN_OLL_SEMANTIC", id);
    // Each fault names the card, so a section whose repairs are spent on it loses the picture, not the lesson.
    assert.equal(result[id].capability, "place_value_trade", id);
  }
});

test("too many lesson variables cost the card, not the lesson (binds_many_variables)", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { placeValueTradePlan } = await import(${here("./sample-plans.mjs")});
    // Six columns bind nine variables; eight more lesson numbers make seventeen.
    const plan = placeValueTradePlan({ operation: "subtract", numbers: [9000, 2345.67], practice: [8000, 3456.78] });
    for (let i = 0; i < 8; i += 1) plan.numbers.push({ initial: i, min: 0, max: 10, label: "extra " + i });
    try { api.compileAndValidateLessonPlan(plan, { language: "en-US" }); console.log(JSON.stringify({ compiled: true })); }
    catch (error) { console.log(JSON.stringify({ code: error.code, capability: error.capability, path: error.path })); }
  `);
  assert.deepEqual(result, { code: "LESSON_PLAN_OLL_SCHEMA", capability: "place_value_trade", path: "/lesson/variables" });
});

test("section facts: the card in its own terms, once it is drawn, in the lesson's units", () => {
  const facts = api.SECTION_FACTS.place_value_trade;
  const numbers = [3486, 2739, 4658, 1573, 0].map((initial) => ({ initial, min: 0, max: initial }));
  // Before the card is drawn, which numbers it shows is the section's own choice.
  assert.deepEqual(facts({ section: 1, mode: "create", numbers, state: new Map() }), {});
  const established = { capability: "place_value_trade", parameters: { operation: "add" }, numbers: [1, 2, 3, 4, 5] };
  const two = facts({ section: 2, mode: "reuse", established, numbers, state: new Map([[5, 2]]), language: "en-US" }).facts;
  assert.deepEqual(two, {
    numbers: [1, 2, 3, 4, 5], operation: "add", pair: [3486, 2739], answer: 6225,
    columns: ["Thousands", "Hundreds", "Tens", "Ones"],
    columns_finished: 2,
    // 6 + 9 = 15 ones: 5 stay, a ten carried; 8 + 3 + 1 = 12 tens: 2 stay, a hundred waits above the hundreds.
    chart_now: [
      { column: "Thousands", row_1: 3, row_2: 2 },
      { column: "Hundreds", row_1: 4, row_2: 7, carried_in: 1 },
      { column: "Tens", below_line: 2 },
      { column: "Ones", below_line: 5 },
    ],
    next: { value: 3, finishes: "Hundreds", does: ["Hundreds: put both rows together, with the carried 100.", "Ten 100s make one 1,000. It goes above the thousands."] },
    practice_pair: [4658, 1573],
  });
  // Read as the card reads its field: whole columns, within the card's.
  assert.deepEqual([2.5, 9, -1].map((value) => facts({ section: 2, mode: "reuse", established, numbers, state: new Map([[5, value]]), language: "en-US" }).facts.columns_finished), [2, 4, 0]);
  // Every column finished: no next value. Chinese names its columns in Chinese; decimals stay decimals.
  const decimals = [8.2, 3.75, 9.3, 4.68, 0].map((initial) => ({ initial, min: 0, max: initial }));
  const sub = { ...established, parameters: { operation: "subtract" } };
  const done = facts({ section: 3, mode: "reuse", established: sub, numbers: decimals, state: new Map([[5, 3]]), language: "zh-CN" }).facts;
  assert.deepEqual([done.pair, done.answer, done.columns, done.every_column_finished, "next" in done, done.practice_pair], [[8.2, 3.75], 4.45, ["个位", "十分位", "百分位"], true, false, [9.3, 4.68]]);
  // Nothing done yet: the next value finishes the hundredths, borrowing from the tenths.
  const fresh = facts({ section: 2, mode: "reuse", established: sub, numbers: decimals, state: new Map(), language: "en-US" }).facts;
  assert.deepEqual(fresh.chart_now, [{ column: "Ones", row_1: 8, take_away: 3 }, { column: "Tenths", row_1: 2, take_away: 7 }, { column: "Hundredths", row_1: 0, take_away: 5 }]);
  assert.equal(fresh.next.finishes, "Hundredths");
  // A pair the card refuses: no facts.
  assert.deepEqual(facts({ section: 2, mode: "reuse", established, numbers: [1234, 4321, 2345, 3412, 0].map((initial) => ({ initial, min: 0, max: initial })), state: new Map(), language: "en-US" }), {});
});

test("with the trial on, the model's first request describes the card; without it, nothing changes", () => {
  const capture = `
    const api = await import(${here("../lesson-plan.js")});
    let request;
    await api.generateLessonPlanWithModel(async (next) => { request = next; throw new Error("capture"); },
      { turn_id: "place-value-trade", learner_request: "How do I add 3,486 + 2,739? I keep forgetting to carry.", language: "en-US" }, { max_attempts_per_part: 1 }).catch(() => {});
    console.log(JSON.stringify({ text: JSON.stringify(request) }));
  `;
  const on = withTrial(capture), off = withTrial(capture, "");
  assert.ok(on.text.includes("column_add_subtract_trades"));
  assert.ok(on.text.includes("数位表加减"));
  assert.ok(on.text.includes('"operation":{"enum":["add","subtract"]}'));
  assert.equal(off.text.includes("place_value_trade"), false);
  assert.equal(off.text.includes("column_add_subtract_trades"), false);
});

test("a stubbed generation run: the card, its steps and the practice reach the lesson; the next section is told the card's facts", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { placeValueTradePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { judgePlaceValueTrade } = await import(${here("../scripts/place-value-trade-judge.mjs")});
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    // The demonstration stops after two columns; the practice target is every column.
    const plan = makeSamplePlanModelCompatible(placeValueTradePlan({ operation: "subtract", numbers: [7352, 2618], practice: [8461, 3729], steps: [1, 2] }));
    const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
    const outline = stagedOutline(plan, drafts);
    const prompts = [];
    const generated = await api.generateLessonPlanWithModel(async (request) => {
      prompts.push(request.prompt);
      if (prompts.length > 6) throw new Error("unexpected extra model request");
      if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
      return JSON.stringify(drafts[request.section - 1]);
    }, { turn_id: "place-value-trade", learner_request: "Can you show me 7,352 − 2,618? I don't get borrowing.", language: "en-US" }, { max_attempts_per_part: 1 });
    const beats = generated.lesson.steps[0].beats.map((beat) => beat.actions.map((action) => action.do === "animate" ? action.value : action.do));
    const item = { id: "PT-06", expect: { need: "35P-07", operation: "subtract", numbers: ["7352", "2618"], result: "4734" } };
    console.log(JSON.stringify({ beats, tasks: generated.lesson.lesson.tasks, later: JSON.parse(prompts[1]), plugins: generated.plugins, verdict: judgePlaceValueTrade(item, generated.lesson), adjustments: generated.program_adjustments }));
  `);
  assert.deepEqual(result.beats, [["write", "focus"], [1], [2]]);
  assert.deepEqual(result.tasks.map((task) => [task.completion.kind, task.completion.fact ?? task.completion.answer]), [["card_fact", "complete"], ["numeric_answer", "4732"]]);
  assert.deepEqual(result.plugins, { math: "0.9.0", shared: "0.1.0" });
  assert.deepEqual(result.verdict.checks.filter((check) => !check.pass), []);
  assert.deepEqual(result.verdict.notes.filter((note) => !note.pass).map((note) => note.check), ["the demonstration finishes every column"]);
  assert.deepEqual(result.adjustments, []);
  // Section 2 is told where the demonstration stands and what the next value does.
  const facts = JSON.stringify(result.later);
  for (const fact of ['"columns_finished":2', '"answer":4734', '"finishes":"Hundreds"', '"practice_pair":[8461,3729]', '"take_away":6']) assert.ok(facts.includes(fact), fact);
});

test("the fixed sample (used for request hashes with the trial on) compiles through the full OLL validation", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { samplePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
    const compiled = api.compileAndValidateLessonPlan(makeSamplePlanModelCompatible(samplePlan("place_value_trade")), { language: "en-US" });
    console.log(JSON.stringify({ kinds: compiled.lesson.lesson.tasks.map((task) => task.completion.kind), adjustments: compiled.program_adjustments }));
  `);
  assert.deepEqual(result, { kinds: ["card_fact", "numeric_answer"], adjustments: [] });
});

// Run 35P-07 objective-1: three outlines of fifteen left out columns finished (PT-04 and PT-13 declared no
// numbers, PT-14 the four others). A section cannot add an outline number, so each section was retried three
// times on a fault it could never fix, then lost the card. Columns finished always starts at 0, so the program
// supplies it; a card the outline still gives too few numbers goes at once.
const stubbedRun = (setup, { language = "en-US" } = {}) => withTrial(`
  const api = await import(${here("../lesson-plan.js")});
  const { placeValueTradePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
  const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
  const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
  const plan = makeSamplePlanModelCompatible(placeValueTradePlan({ operation: "subtract", numbers: [7352, 2618], practice: [8461, 3729], steps: [1, 2] }));
  const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
  const outline = stagedOutline(plan, drafts);
  let first = bootstrapSectionFromExact(outline, drafts[0]);
  let reply = (request) => JSON.stringify(drafts[request.section - 1]);
  ${setup}
  const requests = [], adjustments = [], rejected = [];
  let generated, error;
  try {
    generated = await api.generateLessonPlanWithModel(async (request) => {
      requests.push(request);
      if (requests.length > 6) throw new Error("unexpected extra model request");
      if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, first);
      if (request.label === "lesson-plan-outline") throw new Error("replacement outline asked");
      return reply(request);
    }, { turn_id: "place-value-trade", learner_request: "Can you show me 7,352 − 2,618? I don't get borrowing.", language: ${JSON.stringify(language)} }, {
      max_attempts_per_part: 3,
      on_program_adjustment: (adjustment) => adjustments.push(adjustment),
      on_rejected_part: (part) => rejected.push(part.error.code),
    });
  } catch (caught) { error = caught.message; }
  console.log(JSON.stringify({
    error, rejected, adjustments: adjustments.map(({ kind, section, capability, reason }) => ({ kind, section, capability, reason })),
    requests: requests.map((request) => ({ label: request.label, section: request.section, prompt: JSON.parse(request.prompt), schema: JSON.stringify(request.response_schema) })),
    numbers: generated?.outline.numbers?.map(({ initial, min, max, label }) => ({ initial, min, max, label })),
    lesson: generated && JSON.stringify(generated.lesson),
  }));
`);

test("an outline that leaves out columns finished gets it from the program: a create naming four or five numbers draws the same card", () => {
  const full = stubbedRun("");
  assert.equal(full.error, undefined);
  for (const refs of [[1, 2, 3, 4], [1, 2, 3, 4, 5]]) {
    // PT-14's shape: the outline declares the question's pair and the practice pair, not columns finished.
    const result = stubbedRun(`
      outline.numbers = outline.numbers.slice(0, 4);
      for (const moment of first.moments) for (const create of moment.visual_creates ?? []) create.content.numbers = ${JSON.stringify(refs)};
    `);
    assert.equal(result.error, undefined, String(refs));
    assert.deepEqual([result.rejected, result.adjustments], [[], []], String(refs));
    // Bootstrap and section 2 only, as for the outline that declared all five; the same lesson.
    assert.deepEqual(result.requests.map((request) => request.label), ["lesson-plan-bootstrap", "lesson-plan-section"]);
    assert.equal(result.lesson, full.lesson, String(refs));
    // From 0 to the card's most columns (the card's own fit narrows it to its columns when it is drawn).
    assert.deepEqual(result.numbers.at(-1), { initial: 0, min: 0, max: 6, label: "columns finished" });
    // Section 2's request is the one the five-number outline gets: it is told the fifth number and where the
    // demonstration stands.
    assert.equal(result.requests[1].schema, full.requests[1].schema);
    assert.deepEqual(result.requests[1].prompt, full.requests[1].prompt);
    assert.ok(JSON.stringify(result.requests[1].prompt).includes('"columns_finished":2'));
  }
  // In a Chinese lesson the program's label is the card's own.
  const zh = stubbedRun("outline.numbers = outline.numbers.slice(0, 4);", { language: "zh-CN" });
  assert.equal(zh.error, undefined);
  assert.equal(zh.numbers.at(-1).label, "做完了几列");
});

test("the model's own fifth number is kept, and an outline of another count is not added to", () => {
  const own = stubbedRun(`outline.numbers[4].label = "done so far";`);
  assert.equal(own.error, undefined);
  assert.deepEqual(own.numbers.map((number) => number.label), ["first number", "second number", "practice first", "practice second", "done so far"]);
  // Three numbers: nothing is supplied (the program does not guess which number is missing); the card goes at once.
  const three = stubbedRun(`
    outline.numbers = outline.numbers.slice(0, 3);
    for (const moment of first.moments) for (const create of moment.visual_creates ?? []) create.content.numbers = [1, 2, 3];
  `);
  assert.deepEqual(three.requests.map((request) => request.label), ["lesson-plan-bootstrap", "lesson-plan-outline"]);
  assert.deepEqual(three.adjustments, [{ kind: "visual_removed", section: 1, capability: "place_value_trade", reason: "outline_numbers_missing" }]);
});

test("PT-04's shape: an outline with no numbers loses the card at once, with no section written or retried for it", () => {
  // The combined reply's outline declares no numbers; its first section creates the card on numbers 1 to 5.
  const result = stubbedRun("delete outline.numbers;");
  // No section request: the next request is the outline, asked again without the card.
  assert.deepEqual(result.requests.map((request) => request.label), ["lesson-plan-bootstrap", "lesson-plan-outline"]);
  assert.equal(result.error, "replacement outline asked");
  assert.doesNotMatch(result.requests[1].schema, /column_add_subtract_trades/u);
  assert.deepEqual(result.adjustments, [{ kind: "visual_removed", section: 1, capability: "place_value_trade", reason: "outline_numbers_missing" }]);
  assert.ok(result.rejected.includes("LESSON_PLAN_OUTLINE_NUMBERS_MISSING"));
  assert.equal(result.rejected.includes("LESSON_PLAN_CAPABILITY_PARAMETER"), false);
});

test("a later section's card the outline gave too few numbers is withdrawn before that section is written, and it is written once", () => {
  const result = stubbedRun(`
    delete outline.numbers;
    // Section 1 writes the sum; the card is planned for section 2.
    outline.course_visuals = [{ required_features: ["column_add_subtract_trades"], use_sections: [2], relation: "primary" }];
    outline.sections[0].reusable_items = [{ kind: "board_item", board_kind: "math" }];
    first = { moments: [{ narration: "Here is the subtraction.", delivery: "neutral", math_creates: [{ timing: "during_speech", reusable_item: 1, content: { latex: "7352 - 2618" } }] }] };
    reply = () => JSON.stringify({ moments: [{ narration: "Subtract column by column.", delivery: "neutral" }] });
  `);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.requests.map((request) => [request.label, request.section]), [["lesson-plan-bootstrap", undefined], ["lesson-plan-section", 2]]);
  assert.deepEqual(result.adjustments, [{ kind: "visual_removed", section: 2, capability: "place_value_trade", reason: "outline_numbers_missing" }]);
  assert.deepEqual(result.rejected, []);
  const prompt = result.requests[1].prompt;
  assert.deepEqual(prompt.visuals_for_section ?? [], []);
  assert.match(prompt.removed_picture, /column_add_subtract_trades.*do not mention it/u);
  assert.doesNotMatch(result.requests[1].schema, /course_visual_creates/u);
  assert.doesNotMatch(result.lesson, /"kind":"place_value_trade"/u);
});

test("the trial's guidance asks for the card's numbers in the outline (default requests are checked by request-hashes)", () => {
  const guidance = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    console.log(JSON.stringify(api.LESSON_PLAN_CAPABILITY_REGISTRY.place_value_trade.model_guidance));
  `);
  assert.match(guidance, /outline 的 numbers 依次写这五个数（不动的也要写）/u);
});
