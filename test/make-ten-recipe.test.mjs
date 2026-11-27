// The make-ten recipe (OLL decision 0027, need K2N-19): making ten to add on two ten frames. A trial, off by
// default. The model writes four lesson numbers, the question's pair and a practice pair; the program supplies two
// more (the count in the bigger number's frame, starting at the bigger number, and the count moved, 0), binds the
// card's own variables, plays each value of the count (the card moves one counter at a time), makes the learner's
// task on the practice pair and the row of four blanks after it. Every development case's ideal lesson compiles and
// passes the judge in both languages; each refusal names its reason and the picture it can cost, never the lesson.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);
const CASES = JSON.parse(readFileSync(new URL("../testsuite/make-ten-dev-cases.json", import.meta.url), "utf8")).cases;

/** Runs a script in its own process with the trial on. */
function withTrial(script, trial = "make_ten") {
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: trial },
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  }));
}

test("make_ten is a trial, off by default: built, not offered; its guidance and the two numbers it supplies", () => {
  assert.ok(api.TRIAL_RECIPES.includes("make_ten"));
  assert.equal(api.RECIPE_CATALOG_ORDER.includes("make_ten"), false);
  assert.equal(api.OFFERED_RECIPES.includes("make_ten"), false);
  assert.equal(api.LESSON_PLAN_CAPABILITY_NAMES.includes("make_ten"), false);
  assert.equal(api.RECIPE_PLUGIN.make_ten, "math");
  const offered = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const entry = api.LESSON_PLAN_CAPABILITY_REGISTRY.make_ten;
    const [filled, moved] = entry.program_number_inputs;
    console.log(JSON.stringify({ offered: api.OFFERED_RECIPES, names: api.LESSON_PLAN_CAPABILITY_NAMES, guidance: entry.model_guidance, min: entry.min_lesson_numbers,
      starts: [[8, 6], [3, 8], [7, 7]].map((pair) => typeof filled.initial === "function" ? filled.initial(pair) : filled.initial),
      ranges: [[filled.min, filled.max], [moved.initial, moved.min, moved.max]], many: entry.binds_many_variables, controls: entry.student_controls }));
  `);
  assert.equal(offered.offered.at(-1), "make_ten");
  assert.ok(offered.names.includes("make_ten"));
  // The count in the bigger frame starts at the bigger number, taken from the pair; the count moved at 0.
  assert.deepEqual(offered.starts, [8, 8, 7]);
  assert.deepEqual(offered.ranges, [[0, 10], [0, 0, 4]]);
  assert.deepEqual([offered.min, offered.many, offered.controls], [6, true, []]);
  // Short guidance (tracked, not capped): the pair, the practice pair, the target 10 (or 9); no control named.
  assert.equal(Buffer.byteLength(offered.guidance), 796);
  assert.ok(!/滑块|slider|拖|按钮/u.test(offered.guidance), "the guidance names no control");
});

test("the count in the bigger frame moves forward from the bigger number to 10; nothing else moves", () => {
  const moves = api.RECIPE_HOOKS.make_ten.number_moves;
  const to = (state, ...values) => moves.moves(state, values.map((value) => ({ position: 4, to: value })));
  // The card's state when drawn: the four numbers as written, the count fresh (the bigger number), nothing moved.
  const start = moves.state([8, 6, 7, 5, 0, 3]);
  assert.deepEqual(start, [8, 6, 7, 5, 8, 0]);
  assert.deepEqual(moves.state([3, 8, 9, 4, 8, 0]), [3, 8, 9, 4, 8, 0]);
  assert.deepEqual(to(start, 9, 10).steps.map((step) => step.to[4]), [9, 10]);
  assert.deepEqual(to(start, 9, 9).steps.map((step) => step.to[4]), [9, 9], "the same value again changes nothing");
  assert.match(to(start, 10, 9).refused.reason, /goes forward, never back: from 10 it can be 10 to 10; the 8's frame holds ten at 10/);
  assert.match(to(start, 11).refused.reason, /a whole number from 8 to 10, not 11; from 8, the next value, 9, moves one of the 6 into the 8's frame/);
  assert.match(to(start, 9.5).refused.reason, /not 9.5/);
  assert.match(to(start, 7).refused.reason, /from 8 to 10, not 7/);
  assert.match(moves.moves(start, [{ position: 0, to: 9 }]).refused.reason, /stay as written: the demonstration moves only the count in the bigger number's frame/);
  assert.match(moves.moves(start, [{ position: 5, to: 2 }]).refused.reason, /the count moved changes only by the learner's taps/);
  assert.deepEqual(moves.moves(start, [{ position: 1, to: 6 }]).steps.at(-1).to, start, "a number animated to its own value is no change");
});

// One lesson per entry: [id, makeTenPlan options, language, judge case or null]. Each compiles through the full OLL
// validation; the result keeps the lesson, the program's adjustments and the judge's verdict.
const compileScript = (entries) => `
  const api = await import(${here("../lesson-plan.js")});
  const { makeTenPlan } = await import(${here("./sample-plans.mjs")});
  const { judgeMakeTen } = await import(${here("../scripts/make-ten-judge.mjs")});
  const out = {};
  for (const [id, options, language, item] of ${JSON.stringify(entries)}) {
    try {
      const compiled = api.compileAndValidateLessonPlan(makeTenPlan(options), { language });
      out[id] = { lesson: compiled.lesson, adjustments: compiled.program_adjustments, verdict: item ? judgeMakeTen(item, compiled.lesson) : undefined };
    } catch (error) {
      out[id] = { error: error.code, path: error.path, message: error.message, capability: error.capability };
    }
  }
  console.log(JSON.stringify(out));
`;

// A practice pair per development case: another pair the card takes, never the question's (in either order).
const PRACTICE = {
  "MT-01": [7, 5], "MT-02": [8, 6], "MT-03": [9, 6], "MT-04": [9, 7], "MT-05": [9, 6], "MT-06": [4, 9], "MT-07": [3, 8],
  "MT-08": [5, 7], "MT-09": [8, 8], "MT-10": [7, 6], "MT-11": [5, 8], "MT-12": [7, 5], "MT-13": [9, 4], "MT-14": [9, 8], "MT-15": [6, 9],
};
const optionsOf = (item) => ({ numbers: item.expect.numbers.map(Number), practice: PRACTICE[item.id] });

test("every development case's ideal lesson compiles and passes the judge, in English and in Chinese", () => {
  const served = CASES.filter((item) => !item.expect.forbid);
  assert.equal(served.length, 15);
  const entries = served.flatMap((item) => ["en-US", "zh-CN"].map((language) => [`${item.id} ${language}`, optionsOf(item), language, item]));
  const result = withTrial(compileScript(entries));
  for (const [id, , language] of entries) {
    assert.ok(!result[id].error, `${id}: ${result[id].message}`);
    assert.deepEqual(result[id].verdict.checks.filter((check) => !check.pass), [], id);
    // The ideal lesson fills the frame, leaves the learner a task on the card and asks the row after it.
    assert.deepEqual(result[id].verdict.notes.filter((note) => !note.pass), [], id);
    assert.deepEqual(result[id].adjustments, [], id);
    const variables = result[id].lesson.lesson.variables;
    // The card's lesson numbers are read, not bound: only its own four variables are declared, none with a control.
    assert.deepEqual(variables.filter((variable) => /^number_\d+$/u.test(variable.as)), [], id);
    assert.deepEqual(variables.filter((variable) => variable.control), [], id);
    assert.equal(variables.length, 4, id);
    const write = result[id].lesson.steps[0].beats[0].actions[0];
    assert.equal(write.kind, "make_ten", id);
    assert.equal(write.content.language, language === "zh-CN" ? "zh-CN" : undefined, id);
  }
});

test("the demonstration plays in the model's own moments: each value of the count, forward; a lesson may stop at 9", () => {
  const result = withTrial(compileScript([
    ["ten", { numbers: [8, 6], practice: [7, 5] }, "en-US"],
    ["one-by-one", { numbers: [6, 5], practice: [5, 7], steps: [7, 8, 9, 10] }, "zh-CN"],
    ["still", { numbers: [8, 6], practice: [7, 5], steps: [9, 9, 10] }, "en-US"],
    ["partway", { numbers: [8, 6], practice: [7, 5], steps: [9] }, "en-US"],
    ["second-bigger", { numbers: [3, 8], practice: [4, 9], steps: [10] }, "en-US"],
  ]));
  const played = (id) => result[id].lesson.steps[0].beats.map((beat) => beat.actions.map((action) => (action.do === "animate" ? `${action.variable.replace(/^section_01_moment_01_item_01_/u, "")}=${action.value}` : action.do)));
  assert.deepEqual(played("ten"), [["write", "focus"], ["filled=10"]]);
  assert.deepEqual(played("one-by-one"), [["write", "focus"], ["filled=7"], ["filled=8"], ["filled=9"], ["filled=10"]]);
  assert.deepEqual(played("still"), [["write", "focus"], ["filled=9"], ["focus"], ["filled=10"]]);
  assert.deepEqual(played("partway"), [["write", "focus"], ["filled=9"]]);
  assert.deepEqual(result.partway.adjustments, []);
  // The card is the program's: the pair, the count fresh at the bigger number, every binding its own variable.
  const write = result["second-bigger"].lesson.steps[0].beats[0].actions[0];
  assert.deepEqual([write.content.a, write.content.b, write.content.filled, write.content.moved], [3, 8, 8, 0]);
  assert.deepEqual(write.content.bindings.map((binding) => binding.target), ["a", "b", "filled", "moved"]);
  assert.ok(write.content.bindings.every((binding) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(binding.expression)));
  const ranges = Object.fromEntries(result["second-bigger"].lesson.lesson.variables.map((variable) => [variable.as.replace(/^section_01_moment_01_item_01_/u, ""), [variable.initial, variable.min, variable.max]]));
  assert.deepEqual(ranges, { a: [3, 1, 9], b: [8, 1, 9], filled: [8, 0, 10], moved: [0, 0, 4] });
});

test("a demonstration in the card's own moment plays no earlier than the card is written (review of #184)", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { makeTenPlan, placeValueTradePlan } = await import(${here("./sample-plans.mjs")});
    const { judgeMakeTen } = await import(${here("../scripts/make-ten-judge.mjs")});
    const out = {};
    const item = { id: "MT-01", expect: { need: "K2N-19", numbers: ["8", "6"] } };
    // [name, the create's timing, the animate's timing, restart_numbers in the create's moment]
    for (const [name, create, animate, restart] of [["after-during", "after_speech", "during_speech"], ["none-before", undefined, "before_speech"],
      ["same", undefined, "during_speech"], ["restart", undefined, "during_speech", [5]]]) {
      const plan = makeTenPlan({ numbers: [8, 6], practice: [7, 5], steps: [] });
      const moment = plan.sections[0].moments[0];
      if (create) moment.actions[0].timing = create; else delete moment.actions[0].timing;
      moment.actions.push({ action: "animate", number: 5, end_value: 10, duration_intent: "brief", timing: animate });
      if (restart) moment.restart_numbers = restart;
      try {
        const compiled = api.compileAndValidateLessonPlan(plan, { language: "en-US" });
        const beat = compiled.lesson.steps[0].beats[0];
        out[name] = { beat: beat.actions.map((action) => action.do + "@" + (action.when ?? "during_speech")), start: beat.start ?? null, pass: judgeMakeTen(item, compiled.lesson).pass };
      } catch (error) { out[name] = { code: error.code, capability: error.capability, message: error.message }; }
    }
    // The trade card's create moment with a replayed number (it predates make_ten): ignored, the card opens fresh.
    const trade = placeValueTradePlan({ operation: "add", numbers: [3486, 2739], practice: [4658, 1573] });
    trade.sections[0].moments[0].restart_numbers = [5];
    try { out.trade = { start: api.compileAndValidateLessonPlan(trade, { language: "en-US" }).lesson.steps[0].beats[0].start ?? null }; }
    catch (error) { out.trade = { code: error.code, capability: error.capability, message: error.message }; }
    console.log(JSON.stringify(out));
  `, "make_ten,place_value_trade");
  assert.deepEqual(result["after-during"], { beat: ["write@after_speech", "focus@after_speech", "animate@after_speech"], start: null, pass: true });
  assert.deepEqual(result["none-before"], { beat: ["write@during_speech", "focus@after_speech", "animate@during_speech"], start: null, pass: true });
  assert.deepEqual(result.same.pass, true);
  // A replay of the card's own number in the moment that draws it: nothing to restart, the card opens fresh.
  assert.deepEqual(result.restart, { beat: ["write@during_speech", "focus@after_speech", "animate@during_speech"], start: null, pass: true });
  assert.deepEqual(result.trade, { start: null });
});

test("the practice is the learner's own pair, made ten by taps; then the row of four blanks the card's pair gives", () => {
  const result = withTrial(compileScript([
    ["en", { numbers: [8, 6], practice: [7, 5] }, "en-US"],
    ["zh", { numbers: [4, 9], practice: [3, 8] }, "zh-CN"],
    // Words that write the practice's sum give it away: the task is dropped and recorded, the lesson kept.
    ["leak", { numbers: [8, 6], practice: [7, 5], prompt: "Make a ten: 7 + 5 = 12." }, "en-US"],
    ["leak-hint", { numbers: [4, 9], practice: [3, 8], hints: ["和是１１。"] }, "zh-CN"],
    // Writing the pair, or ten, is fine.
    ["pair-words", { numbers: [8, 6], practice: [7, 5], prompt: "Now make a ten with 7 + 5: fill the 7's frame to 10." }, "en-US"],
    // A model's typed question by the card stays as written.
    ["typed", { numbers: [8, 6], practice: [7, 5], typed: true }, "en-US"],
  ]));
  const [task, row] = result.en.lesson.lesson.tasks;
  const card = task.completion.node;
  assert.deepEqual(task.allowed_operations, [{ kind: "card_tap", node: card }]);
  assert.deepEqual(task.completion, { kind: "card_fact", node: card, fact: "complete" });
  // The practice starts fresh on its own pair: the count at its bigger number, nothing moved.
  const values = Object.entries(task.start.values).map(([name, value]) => [name.replace(/^section_01_moment_01_item_01_/u, ""), value]);
  assert.deepEqual([task.start.kind, values], ["practice", [["a", 7], ["b", 5], ["filled", 7], ["moved", 0]]]);
  // Then the row, anchored on the card, written by OLL's makeTenRow: the part beside the 7 makes ten.
  assert.equal(row.as, `${task.as}-2`);
  assert.deepEqual([row.prompt, row.anchor, row.allowed_operations, row.success_message], ["Write it as a number sentence.", card, [{ kind: "row_entry" }], "7 + 5 = 7 + 3 + 2 = 10 + 2 = 12"]);
  assert.deepEqual(row.completion.parts, [
    { text: "7 + 5 = 7 +" }, { blank: { as: "to-ten", answer: "3", label: "to make ten" } }, { text: "+" }, { blank: { as: "rest", answer: "2" } },
    { text: "= 10 +" }, { blank: { as: "ones", answer: "2" } }, { text: "=" }, { blank: { as: "total", answer: "12" } },
  ]);
  assert.deepEqual(row.hints, ["Read the full frame first, then the other one."]);
  const [, zhRow] = result.zh.lesson.lesson.tasks;
  assert.deepEqual([zhRow.prompt, zhRow.completion.parts.filter((part) => part.blank).map((part) => part.blank.answer), zhRow.completion.parts[3].blank.label], ["写成算式。", ["1", "2", "1", "11"], "凑成十"]);
  // The hint follows the row's order: with the bigger number second (3 + 8 = 1 + 2 + 8), the ones left come first.
  assert.deepEqual(zhRow.hints, ["先读另一框剩下的，再读满十的那一框。"]);
  for (const id of ["leak", "leak-hint"]) {
    assert.deepEqual(result[id].lesson.lesson.tasks, undefined, id);
    assert.deepEqual(result[id].adjustments.map((adjustment) => [adjustment.kind, adjustment.reason]), [["activity_removed", "practice_answer_in_words"]], id);
  }
  assert.deepEqual(result["pair-words"].lesson.lesson.tasks.map((each) => each.completion.kind), ["card_fact", "numeric_row"]);
  assert.deepEqual(result.typed.lesson.lesson.tasks.map((each) => [each.completion.kind, each.completion.answer]), [["card_fact", undefined], ["numeric_row", undefined], ["numeric_answer", "14"]]);
});

test("refusals name their reason and the card, so only the picture can be lost; none reaches OLL", () => {
  const result = withTrial(compileScript([
    ["under", { numbers: [6, 3], practice: [7, 5] }, "en-US"],
    ["exactly", { numbers: [7, 3], practice: [7, 5] }, "en-US"],
    ["practice-under", { numbers: [8, 6], practice: [5, 4] }, "en-US"],
    ["practice-same", { numbers: [8, 6], practice: [8, 6] }, "en-US"],
    ["practice-swapped", { numbers: [8, 6], practice: [6, 8] }, "en-US"],
    ["back", { numbers: [8, 6], practice: [7, 5], steps: [10, 9] }, "en-US"],
    ["past", { numbers: [8, 6], practice: [7, 5], steps: [11] }, "en-US"],
  ]));
  const expect = {
    under: /question's pair: 6 \+ 3 is less than ten: there is no ten to make \(under_ten\)/,
    exactly: /7 \+ 3 is exactly ten.*\(exactly_ten\)/,
    "practice-under": /practice pair: 5 \+ 4 is less than ten/,
    "practice-same": /another pair than the question's/,
    "practice-swapped": /the same two numbers in the other order are the same pair/,
    back: /goes forward, never back: from 10/,
    past: /a whole number from 8 to 10, not 11/,
  };
  for (const [id, pattern] of Object.entries(expect)) {
    assert.match(result[id].message ?? "", pattern, id);
    assert.notEqual(result[id].error, "LESSON_PLAN_OLL_SEMANTIC", id);
    assert.equal(result[id].capability, "make_ten", id);
  }
  // A count the model declared otherwise is read over, never refused: the card opens fresh (review of #184).
  const declared = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { makeTenPlan } = await import(${here("./sample-plans.mjs")});
    const out = {};
    for (const [position, value] of [[4, 0], [4, 10], [5, 2]]) {
      const plan = makeTenPlan({ numbers: [8, 6], practice: [7, 5] });
      plan.numbers[position].initial = value;
      plan.numbers[position].max = Math.max(plan.numbers[position].max, value);
      try {
        const compiled = api.compileAndValidateLessonPlan(plan, { language: "en-US" });
        const card = compiled.lesson.steps[0].beats[0].actions[0].content;
        out[position + ":" + value] = { card: [card.filled, card.moved], beats: compiled.lesson.steps[0].beats.map((beat) => beat.actions.map((action) => action.do === "animate" ? action.value : action.do)) };
      } catch (error) { out[position + ":" + value] = { code: error.code, capability: error.capability, message: error.message }; }
    }
    console.log(JSON.stringify(out));
  `);
  for (const [id, each] of Object.entries(declared)) assert.deepEqual(each, { card: [8, 0], beats: [["write", "focus"], [10]] }, id);
});

test("a moment that animates the pair or the count moved is refused with the card's tag, never at OLL", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { makeTenPlan } = await import(${here("./sample-plans.mjs")});
    const out = {};
    for (const [number, value] of [[1, 9], [3, 6], [6, 2]]) {
      const plan = makeTenPlan({ numbers: [8, 6], practice: [7, 5] });
      plan.sections[0].moments.push({ narration: "Now another.", actions: [{ action: "animate", number, end_value: value, duration_intent: "brief", timing: "during_speech" }] });
      try { api.compileAndValidateLessonPlan(plan, { language: "en-US" }); out[number] = { compiled: true }; }
      catch (error) { out[number] = { code: error.code, capability: error.capability, message: error.message }; }
    }
    console.log(JSON.stringify(out));
  `);
  for (const number of ["1", "3", "6"]) {
    assert.equal(result[number].capability, "make_ten", number);
    assert.notEqual(result[number].code, "LESSON_PLAN_OLL_SEMANTIC", number);
  }
  assert.match(result["1"].message, /stay as written/);
  assert.match(result["6"].message, /only by the learner's taps/);
});

test("a replay lays the card fresh again: its own variables only, the count back at the bigger number", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { makeTenPlan } = await import(${here("./sample-plans.mjs")});
    const plan = makeTenPlan({ numbers: [8, 6], practice: [7, 5] });
    plan.sections[0].moments.push({ narration: "Once more from the start.", restart_numbers: [5], actions: [{ action: "animate", number: 5, end_value: 10, duration_intent: "brief", timing: "during_speech" }] });
    const compiled = api.compileAndValidateLessonPlan(plan, { language: "en-US" });
    console.log(JSON.stringify({ variables: compiled.lesson.lesson.variables, beat: compiled.lesson.steps[0].beats.at(-1) }));
  `);
  // The replay restarts every variable of the card at its start: the count at the bigger number, nothing moved.
  const names = result.variables.map((variable) => variable.as);
  assert.deepEqual(result.beat.start.variables, names);
  assert.deepEqual(result.variables.map((variable) => [variable.as.replace(/^section_01_moment_01_item_01_/u, ""), variable.initial]), [["a", 8], ["b", 6], ["filled", 8], ["moved", 0]]);
  assert.deepEqual(result.beat.actions.map((action) => [action.do, action.value]), [["animate", 10]]);
});

test("section facts: the card in its own terms, once it is drawn", () => {
  const facts = api.SECTION_FACTS.make_ten;
  const numbers = [8, 6, 7, 5, 8, 0].map((initial) => ({ initial, min: 0, max: Math.max(initial, 10) }));
  assert.deepEqual(facts({ section: 1, mode: "create", numbers, state: new Map() }), {});
  const established = { capability: "make_ten", parameters: {}, numbers: [1, 2, 3, 4, 5, 6] };
  const nine = facts({ section: 2, mode: "reuse", established, numbers, state: new Map([[5, 9]]), language: "en-US" }).facts;
  assert.deepEqual(nine, {
    numbers: [1, 2, 3, 4, 5, 6], pair: [8, 6], sum: 14, fills: { number: 8, frame: "first" }, gives: 6, to_make_ten: 2, ones_left: 4,
    in_bigger_frame_now: 9, frames_now: [9, 5],
    next: { value: 10, does: "the next value, 10, moves one of the 6 into the 8's frame", says: ["Move one of the 6 across.", "A full frame is ten, and 4 are left: 10 + 4."] },
    practice_pair: [7, 5],
  });
  const zh = facts({ section: 3, mode: "reuse", established, numbers: [4, 9, 3, 8, 9, 0].map((initial) => ({ initial, min: 0, max: 10 })), state: new Map([[5, 10]]), language: "zh-CN" }).facts;
  assert.deepEqual([zh.fills, zh.gives, zh.frames_now, zh.ten_made, "next" in zh], [{ number: 9, frame: "second" }, 4, [3, 10], true, false]);
  // Read as the card reads its field: whole, from the bigger number to 10.
  assert.deepEqual([9.5, 12, 3].map((value) => facts({ section: 2, mode: "reuse", established, numbers, state: new Map([[5, value]]), language: "en-US" }).facts.in_bigger_frame_now), [9, 10, 8]);
  assert.deepEqual(facts({ section: 2, mode: "reuse", established, numbers: [6, 3, 7, 5, 6, 0].map((initial) => ({ initial, min: 0, max: 10 })), state: new Map(), language: "en-US" }), {});
});

test("with the trial on, the model's first request describes the card; without it, nothing changes", () => {
  const capture = `
    const api = await import(${here("../lesson-plan.js")});
    let request;
    await api.generateLessonPlanWithModel(async (next) => { request = next; throw new Error("capture"); },
      { turn_id: "make-ten", learner_request: "How do I explain 8 + 6 by making a ten?", language: "en-US" }, { max_attempts_per_part: 1 }).catch(() => {});
    console.log(JSON.stringify({ text: JSON.stringify(request), bytes: Buffer.byteLength(request.prompt) }));
  `;
  const on = withTrial(capture), off = withTrial(capture, "");
  assert.ok(on.text.includes("make_ten_to_add"));
  assert.ok(on.text.includes("凑十（两个十格框）"));
  assert.equal(off.text.includes("make_ten"), false);
  console.log(`first request with the trial on: +${on.bytes - off.bytes} B (${off.bytes} -> ${on.bytes})`);
});

// A stubbed generation run, the outline declaring only the card's four numbers: the program supplies the count in
// the bigger frame (the bigger number) and the count moved (0), the section draws the card and fills the frame.
const stubbedRun = ({ outlineNumbers = 4, language = "en-US", steps = [10] } = {}) => withTrial(`
  const api = await import(${here("../lesson-plan.js")});
  const { makeTenPlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
  const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
  const { judgeMakeTen } = await import(${here("../scripts/make-ten-judge.mjs")});
  const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
  const plan = makeSamplePlanModelCompatible(makeTenPlan({ numbers: [3, 8], practice: [4, 9], steps: ${JSON.stringify(steps)} }));
  const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
  const outline = stagedOutline(plan, drafts);
  outline.numbers = outline.numbers.slice(0, ${outlineNumbers});
  const requests = [], adjustments = [];
  let generated, error;
  try {
    generated = await api.generateLessonPlanWithModel(async (request) => {
      requests.push(request);
      if (requests.length > 6) throw new Error("unexpected extra model request");
      if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
      if (request.label === "lesson-plan-outline") throw new Error("replacement outline asked");
      return JSON.stringify(drafts[request.section - 1]);
    }, { turn_id: "make-ten", learner_request: "When the bigger number is second, like 3 + 8, which number do you turn into the ten?", language: ${JSON.stringify(language)} }, {
      max_attempts_per_part: 3, on_program_adjustment: (adjustment) => adjustments.push(adjustment),
    });
  } catch (caught) { error = caught.message; }
  const item = { id: "MT-06", expect: { need: "K2N-19", numbers: ["3", "8"] } };
  console.log(JSON.stringify(generated ? {
    beats: generated.lesson.steps[0].beats.map((beat) => beat.actions.map((action) => action.do === "animate" ? action.value : action.do)),
    card: generated.lesson.steps[0].beats[0].actions[0].content, tasks: generated.lesson.lesson.tasks, plugins: generated.plugins,
    later: requests.slice(1).map((request) => request.prompt).join("\\n"), verdict: judgeMakeTen(item, generated.lesson),
    adjustments: adjustments.map(({ kind, reason }) => ({ kind, reason })),
  } : { error }));
`);

test("a stubbed generation run: the outline's four numbers, the program's two, the card filled to ten, the practice and its row", () => {
  for (const outlineNumbers of [4, 5, 6]) {
    const result = stubbedRun({ outlineNumbers });
    assert.ok(!result.error, `${outlineNumbers}: ${result.error}`);
    assert.deepEqual(result.beats, [["write", "focus"], [10]], `${outlineNumbers}`);
    assert.deepEqual([result.card.a, result.card.b, result.card.filled, result.card.moved], [3, 8, 8, 0], `${outlineNumbers}`);
    assert.deepEqual(result.tasks.map((task) => [task.completion.kind, task.completion.fact]), [["card_fact", "complete"], ["numeric_row", undefined]], `${outlineNumbers}`);
    assert.deepEqual(result.plugins, { math: "0.11.0", shared: "0.1.0" });
    assert.deepEqual(result.verdict.checks.filter((check) => !check.pass), [], `${outlineNumbers}`);
    assert.deepEqual(result.verdict.notes.filter((note) => !note.pass), [], `${outlineNumbers}`);
    // Section 2 is told where the demonstration stands.
    for (const fact of ['"ten_made":true', '"to_make_ten":2', '"practice_pair":[4,9]']) assert.ok(result.later.includes(fact), `${outlineNumbers}: ${fact}`);
  }
});

test("the fixed sample (used for request hashes with the trial on) compiles through the full OLL validation", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { samplePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
    const compiled = api.compileAndValidateLessonPlan(makeSamplePlanModelCompatible(samplePlan("make_ten")), { language: "en-US" });
    console.log(JSON.stringify({ kinds: compiled.lesson.lesson.tasks.map((task) => task.completion.kind), adjustments: compiled.program_adjustments }));
  `);
  assert.deepEqual(result, { kinds: ["card_fact", "numeric_row"], adjustments: [] });
});
