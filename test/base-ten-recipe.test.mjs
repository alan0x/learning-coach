// The trading mat recipe (OLL decision 0023), rebuilt on the earlier components' pattern (owner, 2026-11-23).
// A trial: offered only when LEARNING_COACH_TRIAL_RECIPES names it, so requests and recorded lessons are
// unchanged without it. The pile is lesson numbers (loose ones, tens, and hundreds when the lesson has
// them). The model moves them in its own moments and writes the practice; the mat plays each change as
// trades by the card's own rules, and turns "bring the ones to n" into the learner's own trading. Every
// development case's ideal lesson compiles and passes the judge in both languages; each refusal names its
// reason; the judge catches each kind of break.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const { judgeTradingMat } = await import(new URL("../scripts/base-ten-judge.mjs", import.meta.url));
const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);
const CASES = JSON.parse(readFileSync(new URL("../testsuite/base-ten-dev-cases.json", import.meta.url), "utf8")).cases;

test("base_ten_trade is a trial recipe on lesson numbers: not offered by default, no fields of its own", () => {
  assert.ok(api.TRIAL_RECIPES.includes("base_ten_trade"));
  assert.equal(api.OFFERED_RECIPES.includes("base_ten_trade"), false);
  assert.equal(api.LESSON_PLAN_CAPABILITY_NAMES.includes("base_ten_trade"), false);
  assert.equal(api.RECIPE_PLUGIN.base_ten_trade, "math");
  // No field for the model to fill: the six numbers of probe 1 are gone.
  assert.equal(api.RECIPE_SCHEMA_PROPERTIES.base_ten_trade, undefined);
  const moves = api.RECIPE_HOOKS.base_ten_trade.number_moves;
  // Ones go down by tens and the tens follow; a pile of tens and ones that makes a hundred has a hundreds column.
  assert.deepEqual(moves.state([26, 9]), [26, 9, 0]);
  assert.deepEqual(moves.state([13, 0]), [13, 0]);
  assert.deepEqual(moves.moves([26, 9, 0], [{ position: 0, to: 6 }]).steps.at(-1).to, [6, 11, 0]);
  // Written in either order, one moment's moves apply lowest place first.
  assert.deepEqual(moves.moves([26, 9, 0], [{ position: 1, to: 1 }, { position: 0, to: 6 }]).steps.at(-1).to, [6, 1, 1]);
  // A move to the value already there changes nothing.
  assert.deepEqual(moves.moves([13, 0], [{ position: 1, to: 0 }]).steps.at(-1).to, [13, 0]);
  assert.match(moves.moves([26, 9, 0], [{ position: 0, to: 5 }]).refused.reason, /from 26 they can be 16 or 6/);
  assert.match(moves.moves([26, 9, 0], [{ position: 1, to: 11 }]).refused.reason, /tens rise by themselves/);
});

/** Runs a script with the trial switched on (the switch is read once, when the module loads). */
function withTrial(script) {
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "base_ten_trade" },
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  }));
}

const valueOf = ([h, t, o]) => h * 100 + t * 10 + o;
/** A case's pile [hundreds, tens, ones] as lesson numbers [ones, tens] or [ones, tens, hundreds]. */
const numbersOf = ([h, t, o]) => (h > 0 ? [o, t, h] : [o, t]);
/** The moments an ideal lesson writes: the ones to their traded value, then the tens. */
function idealMoves(pile) {
  const [, t, o] = pile;
  const moves = [];
  if (o >= 10) moves.push([[1, o % 10]]);
  const tens = t + Math.floor(o / 10);
  if (tens >= 10 && valueOf(pile) >= 100) moves.push([[2, tens % 10]]);
  return moves;
}
const typed = (answer) => ({ kind: "numeric_answer", prompt: "Four tens and thirteen ones: what number is that?", answer: String(answer), check: String(answer), reference: { source: "reusable", section: 1, item: 1 }, hints: ["Trade ten ones for a ten first."] });
const trading = (value) => ({ kind: "number_target", prompt: "Your turn: trade until you cannot.", number_controls: [{ number: 1, controls: ["slider"] }], value, tolerance: 0.02, hints: ["Ten ones make a ten."] });

// One plan per entry: [id, numbers, moves (per moment, [number, end value] pairs), language, activities, expected pile].
const compileScript = (entries) => `
  const api = await import(${here("../lesson-plan.js")});
  const { samplePlan } = await import(${here("./sample-plans.mjs")});
  const { judgeTradingMat } = await import(${here("../scripts/base-ten-judge.mjs")});
  const out = {};
  for (const [id, numbers, moves, language, activities, expectPile] of ${JSON.stringify(entries)}) {
    const plan = samplePlan("rectangle_unit_square_array");
    plan.numbers = numbers.map((initial, index) => ({ initial, min: 0, max: Math.max(initial, 1), label: ["loose ones", "tens", "hundreds"][index] ?? "more", student_control: { kind: "slider", step: 1 } }));
    const first = plan.sections[0].moments[0];
    first.actions = first.actions.filter((action) => action.action !== "animate");
    first.actions[0].content = { capability: "base_ten_trade", parameters: {}, numbers: numbers.map((_, index) => index + 1) };
    plan.sections[0].reusable_items[0].capability = "base_ten_trade";
    plan.sections[0].moments.push(...moves.map((animations, step) => ({ narration: "Trade step " + (step + 1) + ".", actions: animations.map(([number, end_value]) => ({ action: "animate", number, end_value, duration_intent: "brief", timing: "during_speech" })) })));
    delete plan.sections[0].student_activities;
    if (activities?.length) plan.sections[1].student_activities = activities;
    try {
      const compiled = api.compileAndValidateLessonPlan(plan, { language });
      out[id] = { lesson: compiled.lesson, adjustments: compiled.program_adjustments, verdict: expectPile ? judgeTradingMat({ id, expect: { lesson_pile: expectPile } }, compiled.lesson) : undefined };
    } catch (error) {
      out[id] = { error: error.code, path: error.path, message: error.message };
    }
  }
  console.log(JSON.stringify(out));
`;

test("every development case's ideal lesson compiles and passes the judge, in English and in Chinese", () => {
  const piles = CASES.filter((item) => item.expect.lesson_pile).map((item) => [item.id, item.expect.lesson_pile]);
  const entries = piles.flatMap(([id, pile]) => ["en-US", "zh-CN"].map((language) => {
    const needsTrade = pile[2] >= 10 || pile[1] >= 10;
    // The ideal task makes the ones the traded count; a pile whose ones need no trade, the tens.
    const task = pile[2] >= 10 ? trading(pile[2] % 10) : { ...trading(pile[1] % 10), number_controls: [{ number: 2, controls: ["slider"] }] };
    return [`${id} ${language}`, numbersOf(pile), idealMoves(pile), language, [...(needsTrade ? [task] : []), typed(53)], pile];
  }));
  const result = withTrial(compileScript(entries));
  for (const [id] of entries) {
    assert.ok(!result[id].error, `${id}: ${result[id].message}`);
    assert.deepEqual(result[id].verdict.checks.filter((check) => !check.pass), [], id);
    // The mat's counts have no control: the learner works the mat by its own taps (OLL 0023 amendment 5;
    // owner, 2026-11-24: the model never names a control).
    assert.deepEqual(result[id].lesson.lesson.variables.filter((variable) => variable.control).map((variable) => variable.as), [], id);
    // The counts are named by their values, whatever the model called them (owner, 2026-11-25).
    const names = id.endsWith("zh-CN") ? ["一的个数", "十的个数", "百的个数"] : ["ones", "tens", "hundreds"];
    const counts = result[id].lesson.lesson.variables.filter((variable) => /^number_\d+$/u.test(variable.as));
    assert.deepEqual(counts.map((variable) => variable.label), names.slice(0, counts.length), id);
    assert.ok(counts.every((variable) => variable.unit === undefined), id);
  }
});

test("a trade plays in the model's own moment: the first tap by tap, later ones quickly", () => {
  const result = withTrial(compileScript([
    ["two", [47, 2], [[[1, 7]]], "en-US"],
    ["both-zh", [16, 9, 6], [[[2, 0], [1, 6]]], "zh-CN"],
    ["apart", [26, 9], [[[1, 6]], [[2, 1]]], "en-US"],
    ["beside", [13, 0], [[[1, 3], [2, 1]]], "en-US"],
    ["none", [5, 4, 3], [], "en-US"],
  ]));
  const played = (id) => result[id].lesson.steps[0].beats.map((beat) => [beat.key, beat.actions.map((action) => (action.do === "tap" ? `${action.tap}:${action.at}` : action.do === "animate" ? `${action.variable}=${action.value}` : action.do))]);
  // 47 ones to 7: ten taps and the make, then three more trades, each a brief tray fill and a make. All in
  // the moment that says so; the program adds no beat and no sentence.
  assert.deepEqual(played("two"), [
    ["moment-01", ["write", "focus"]],
    ["moment-02", [...Array(10).fill("gather:ones"), "make:ones", ...Array(3).fill(["section_01_moment_01_item_01_tray_ones=10", "make:ones"]).flat()]],
  ]);
  assert.deepEqual(result.two.lesson.steps[0].beats.map((beat) => beat.say), ["Here is the rectangle_unit_square_array visual.", "Trade step 1."]);
  // 6 hundreds, 9 tens, 16 ones, the tens written before the ones in one moment: the ones trade first. Both
  // tapped out fit a beat's 24 actions (22).
  assert.deepEqual(played("both-zh")[1][1], [...Array(10).fill("gather:ones"), "make:ones", ...Array(10).fill("gather:tens"), "make:tens"]);
  assert.equal(result["both-zh"].lesson.steps[0].beats[0].actions[0].content.title, "百、十和一");
  assert.equal(result["both-zh"].lesson.steps[0].beats[0].actions[0].content.language, "zh-CN");
  // 9 tens and 26 ones make 116: a hundreds column of the mat's own, and the tens trade in a later moment.
  assert.deepEqual(played("apart").slice(1).map(([, actions]) => actions.at(-1)), ["make:ones", "make:tens"]);
  assert.ok(result.apart.lesson.lesson.variables.some((variable) => variable.as.endsWith("_hundreds") && variable.initial === 0));
  // "Tens to 1" beside "ones to 3" is the same step: the tens are already there, and nothing more plays.
  assert.deepEqual(played("beside")[1][1], [...Array(10).fill("gather:ones"), "make:ones"]);
  assert.equal(played("none").length, 1);
});

test("the practice is the model's: its target is a count the learner makes by tapping the mat, and its typed question stays", () => {
  const result = withTrial(compileScript([
    ["en", [14, 3], [[[1, 4]]], "en-US", [trading(4), typed(53)]],
    ["no-trade", [5, 4, 3], [], "en-US", [trading(5), typed(53)]],
    // Not only the fully traded count: one trade of two is a target too.
    ["part", [26, 3], [[[1, 6]]], "en-US", [trading(16)]],
    // Two columns: "bring the tens to 5" is a count of the tens, made by trading ones.
    ["tens", [26, 3], [[[1, 6]]], "en-US", [{ ...trading(5), number_controls: [{ number: 2, controls: ["slider"] }] }]],
    // 116: the tens to 1 needs the ones traded first; the learner taps both trades from the lesson's pile.
    ["chain", [26, 9], [[[1, 6]], [[2, 1]]], "en-US", [{ ...trading(1), number_controls: [{ number: 2, controls: ["slider"] }] }]],
    // Review of #163: the hundreds of 116 reach 1 once the ones and then the tens are traded (B1); the tens
    // of 116 reach 11 by trading ones (B3).
    ["hundreds", [26, 9, 0], [[[1, 6]], [[2, 1]]], "en-US", [{ ...trading(1), number_controls: [{ number: 3, controls: ["slider"] }] }]],
    ["tens-up", [26, 9], [[[1, 6]], [[2, 1]]], "en-US", [{ ...trading(11), number_controls: [{ number: 2, controls: ["slider"] }] }]],
    // 26 ones and 18 tens: the tens reach 0 by trading ones and then tens (taps go through 20 tens, which the mat draws).
    ["too-many-tens", [26, 18], [], "en-US", [{ ...trading(0), number_controls: [{ number: 2, controls: ["slider"] }] }]],
    // "Move the tens back to 11" after the lesson made a hundred of them (BT-27): the lesson's pile already
    // shows 11, so the task starts from the pile the lesson ends with and a hundred is broken (owner, 2026-11-24).
    ["back", [7, 11, 3], [[[2, 1]]], "en-US", [{ ...trading(11), number_controls: [{ number: 2, controls: ["slider"] }] }]],
  ]));
  const tasks = result.en.lesson.lesson.tasks;
  assert.deepEqual(tasks.map((task) => [task.prompt, task.completion.kind]), [
    ["Your turn: trade until you cannot.", "card_fact"],
    ["Four tens and thirteen ones: what number is that?", "numeric_answer"],
  ]);
  // The learner's mat starts again from the lesson's pile, trays empty; they tap it and say done.
  assert.deepEqual(tasks[0].start.values, { number_01: 14, number_02: 3, section_01_moment_01_item_01_tray_ones: 0 });
  const mat = tasks[0].completion.node;
  assert.deepEqual(tasks[0].allowed_operations, [{ kind: "card_tap", node: mat }, { kind: "card_submit" }]);
  assert.deepEqual(tasks[0].completion, { kind: "card_fact", node: mat, fact: "count", at: "ones", value: 4 });
  assert.deepEqual(result.en.adjustments, []);
  const only = (id) => { const [task] = result[id].lesson.lesson.tasks; return [task.completion.at, task.completion.value, task.start.values]; };
  assert.deepEqual(only("part"), ["ones", 16, { number_01: 26, number_02: 3, section_01_moment_01_item_01_tray_ones: 0 }]);
  assert.deepEqual(only("tens"), ["tens", 5, { number_01: 26, number_02: 3, section_01_moment_01_item_01_tray_ones: 0 }]);
  const lessonPile116 = { number_01: 26, number_02: 9, section_01_moment_01_item_01_hundreds: 0, section_01_moment_01_item_01_tray_ones: 0, section_01_moment_01_item_01_tray_tens: 0 };
  assert.deepEqual(only("chain"), ["tens", 1, lessonPile116]);
  assert.deepEqual(only("hundreds"), ["hundreds", 1, { number_01: 26, number_02: 9, number_03: 0, section_01_moment_01_item_01_tray_ones: 0, section_01_moment_01_item_01_tray_tens: 0 }]);
  assert.deepEqual(only("tens-up"), ["tens", 11, lessonPile116]);
  assert.deepEqual(only("too-many-tens"), ["tens", 0, { number_01: 26, number_02: 18, section_01_moment_01_item_01_hundreds: 0, section_01_moment_01_item_01_tray_ones: 0, section_01_moment_01_item_01_tray_tens: 0 }]);
  assert.deepEqual(only("back"), ["tens", 11, { number_01: 7, number_02: 1, number_03: 4, section_01_moment_01_item_01_tray_ones: 0, section_01_moment_01_item_01_tray_tens: 0 }]);
  assert.deepEqual(result.back.adjustments, []);
  // A pile with nothing to trade, where the lesson made no trade: the task starts one trade away (15 ones),
  // so the learner has the one trade to make; the typed question stays.
  assert.deepEqual(result["no-trade"].lesson.lesson.tasks.map((task) => task.completion.kind), ["card_fact", "numeric_answer"]);
  assert.deepEqual(only("no-trade"), ["ones", 5, { number_01: 15, number_02: 3, number_03: 3, section_01_moment_01_item_01_tray_ones: 0, section_01_moment_01_item_01_tray_tens: 0 }]);
  assert.deepEqual(result["no-trade"].adjustments, []);
});

test("refusals name their reason", () => {
  const result = withTrial(compileScript([
    ["off-tens", [26, 9], [[[1, 5]]], "en-US"],
    ["up", [26, 9], [[[1, 30]]], "en-US"],
    ["tens-first", [26, 9], [[[2, 11]]], "en-US"],
    ["two-columns", [13, 2], [[[2, 0]]], "en-US"],
    ["too-many", [60, 3], [], "en-US"],
    ["small", [7, 0], [], "en-US"],
    ["one-number", [26], [], "en-US"],
    ["target", [26, 9], [[[1, 6]]], "en-US", [trading(5)]],
  ]));
  assert.match(result["off-tens"].message, /from 26 they can be 16 or 6/);
  assert.match(result["off-tens"].path, /moments\[1\]\.actions\[0\]\.end_value$/);
  assert.match(result.up.message, /only go down, ten at a time/);
  assert.match(result["tens-first"].message, /tens rise by themselves/);
  assert.match(result["two-columns"].message, /tens and ones only/);
  assert.match(result["too-many"].message, /at most 59 loose ones/);
  assert.match(result.small.message, /a pile of 7 has no ten to make/);
  assert.match(result["one-number"].message, /two or three lesson numbers/);
  // A practice target the mat cannot reach drops that task, recorded, and the lesson stays (owner, 2026-11-24:
  // an LLM's goal can miss; tolerate it).
  assert.ok(!result.target.error, result.target.message);
  assert.deepEqual(result.target.adjustments.map((each) => [each.kind, each.reason]), [["activity_removed", "target_not_reachable_on_card"]]);
  assert.match(result.target.adjustments[0].detail, /trading on this pile makes the loose ones 6 or 16 or 36 or 46 or 56, never 5/);
  assert.deepEqual(result.target.lesson.lesson.tasks ?? [], []);
});

test("an unreachable practice target drops only that task; the typed question stays", () => {
  const result = withTrial(compileScript([["drop", [29, 0], [[[1, 9]]], "zh-CN", [trading(10), typed(29)]]]));
  assert.ok(!result.drop.error, result.drop.message);
  assert.deepEqual(result.drop.lesson.lesson.tasks.map((task) => task.completion.kind), ["numeric_answer"]);
  assert.deepEqual(result.drop.adjustments.map((each) => each.reason), ["target_not_reachable_on_card"]);
});

test("section facts state the mat in its own terms: where practice starts, the amount, each place as traded, the pile now", async () => {
  const api = await import(new URL("../lesson-plan.js", import.meta.url));
  const facts = api.SECTION_FACTS.base_ten_trade;
  const numbers = [{ initial: 26, min: 0, max: 59, label: "ones" }, { initial: 9, min: 0, max: 34, label: "tens" }];
  assert.deepEqual(facts({ section: 2, mode: "reuse", established: { capability: "base_ten_trade", numbers: [1, 2] }, numbers, state: new Map([[1, 6], [2, 11]]) }).facts, {
    numbers: [1, 2], practice_starts_from: { loose_ones: 26, tens: 9, hundreds: 0 }, amount: 116, amount_never_changes: true,
    loose_ones_as_traded: [26, 16, 6], tens_as_traded: [11, 1], fully_traded: { loose_ones: 6, tens: 1, hundreds: 1 },
    pile_now: { loose_ones: 6, tens: 11, hundreds: 0 },
  });
  // Review of #169: the tens traded too. The pile now keeps the mat's own hundreds, which no lesson number follows.
  assert.deepEqual(facts({ section: 2, mode: "reuse", established: { capability: "base_ten_trade", numbers: [1, 2] }, numbers, state: new Map([[1, 6], [2, 1]]) }).facts.pile_now,
    { loose_ones: 6, tens: 1, hundreds: 1 });
  // Nothing moved on a mat with a hundreds number of 0 under a hundred: no pile_now.
  const small = [{ initial: 13 }, { initial: 0 }, { initial: 0 }];
  assert.equal(facts({ section: 2, mode: "reuse", established: { capability: "base_ten_trade", numbers: [1, 2, 3] }, numbers: small, state: new Map([[1, 13], [2, 0], [3, 0]]) }).facts.pile_now, undefined);
  // A section that draws the mat: which numbers it shows is the section's own choice, so no pile facts (review of #169).
  assert.deepEqual(facts({ section: 1, mode: "create", numbers: [{ initial: 26 }, { initial: 9 }, { initial: 2 }], state: new Map() }), {});
});

test("the judge catches each kind of break", () => {
  const result = withTrial(compileScript([
    ["good", [14, 3], [[[1, 4]]], "en-US", [trading(4), typed(53)], [0, 3, 14]],
    ["not-traded", [14, 3], [], "en-US", [trading(4), typed(53)], [0, 3, 14]],
    ["no-practice", [14, 3], [[[1, 4]]], "en-US", [], [0, 3, 14]],
    ["zh", [14, 3], [[[1, 4]]], "zh-CN", [trading(4), typed(53)], [0, 3, 14]],
  ]));
  const failed = (verdict) => verdict.checks.filter((check) => !check.pass).map((check) => check.check);
  const noted = (verdict) => verdict.notes.filter((check) => !check.pass).map((check) => check.check);
  assert.deepEqual(failed(result.good.verdict), []);
  assert.deepEqual(noted(result.good.verdict), []);
  assert.deepEqual(failed(result.zh.verdict), []);
  // What the lesson chose to teach is a note, not a failure (owner, 2026-11-24): the lesson never makes the
  // trade it is about; a lesson with no task on the mat and no typed question.
  assert.deepEqual(failed(result["not-traded"].verdict), []);
  assert.deepEqual(noted(result["not-traded"].verdict), ["the demonstration trades when the pile needs it", "the demonstration ends with no trade left"]);
  assert.deepEqual(failed(result["no-practice"].verdict), []);
  assert.deepEqual(noted(result["no-practice"].verdict), ["the learner has a task on the mat", "a typed question follows"]);
  const item = (pile) => ({ id: "x", expect: { lesson_pile: pile } });
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 15]), result.good.lesson)), ["the lesson pile is the question's"]);
  // The task starts from another amount.
  const moved = structuredClone(result.good.lesson);
  moved.lesson.tasks[0].start.values.number_01 = 24;
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 14]), moved)), ["the task starts from the lesson's amount, trays empty"]);
  // A slider's target no whole number of trades reaches: OLL refuses the lesson, so it does not play.
  const off = structuredClone(result.good.lesson);
  off.lesson.tasks[0].completion.value = 5;
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 14]), off)), ["the lesson plays"]);
  // The mat speaks another language than the lesson.
  const mixed = structuredClone(result.good.lesson);
  mixed.lesson.language = "zh-CN";
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 14]), mixed)), ["the mat speaks the lesson's language"]);
  // A near miss that drew the mat is a note; it fails only if the lesson does not play.
  const near = { id: "n", expect: { forbid: ["base_ten_trade"] } };
  assert.deepEqual(failed(judgeTradingMat(near, result.good.lesson)), []);
  assert.deepEqual(noted(judgeTradingMat(near, result.good.lesson)), ["no trading mat for this question"]);
  assert.deepEqual(failed(judgeTradingMat(near, {})), ["the lesson plays"]);
});

test("a second mat on other numbers is refused where it is written", () => {
  const second = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { samplePlan } = await import(${here("./sample-plans.mjs")});
    const plan = samplePlan("rectangle_unit_square_array");
    plan.numbers = [14, 3, 12, 4].map((initial, index) => ({ initial, min: 0, max: 59, label: "n" + index }));
    const first = plan.sections[0].moments[0];
    first.actions = first.actions.filter((action) => action.action !== "animate");
    first.actions[0].content = { capability: "base_ten_trade", parameters: {}, numbers: [1, 2] };
    plan.sections[0].reusable_items[0].capability = "base_ten_trade";
    delete plan.sections[0].student_activities;
    plan.sections[1].moments[0].actions.push({ action: "create", kind: "visual", role: "main_visual", placement: { relation: "new_region" },
      content: { capability: "base_ten_trade", parameters: {}, numbers: [3, 4] } });
    try { api.compileAndValidateLessonPlan(plan, { language: "en-US" }); console.log(JSON.stringify({})); }
    catch (error) { console.log(JSON.stringify({ code: error.code, message: error.message, path: error.path })); }
  `);
  assert.match(second.message ?? "", /one trading mat/);
  assert.match(second.path ?? "", /^\$lessonPlan\.sections\[1\]/);
});

test("review of #160: a pile with a hundreds number of 0 draws two columns; the mat's numbers are its own; no move before the mat is drawn", () => {
  const result = withTrial(compileScript([["zero-hundreds", [13, 0, 0], [[[1, 3]]], "en-US", [trading(3), typed(53)], [0, 0, 13]]]));
  assert.deepEqual(result["zero-hundreds"].verdict.checks.filter((check) => !check.pass), []);
  assert.equal(result["zero-hundreds"].lesson.steps[0].beats[0].actions[0].content.columns, 2);
  const faults = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { samplePlan } = await import(${here("./sample-plans.mjs")});
    const { judgeTradingMat } = await import(${here("../scripts/base-ten-judge.mjs")});
    const mat = (change) => {
      const plan = samplePlan("rectangle_unit_square_array");
      plan.numbers = [26, 9].map((initial, index) => ({ initial, min: 0, max: 59, label: "n" + index, student_control: { kind: "slider", step: 1 } }));
      const first = plan.sections[0].moments[0];
      first.actions = first.actions.filter((action) => action.action !== "animate");
      first.actions[0].content = { capability: "base_ten_trade", parameters: {}, numbers: [1, 2] };
      plan.sections[0].reusable_items[0].capability = "base_ten_trade";
      delete plan.sections[0].student_activities;
      change(plan);
      try { return { lesson: api.compileAndValidateLessonPlan(plan, { language: "en-US" }).lesson }; }
      catch (error) { return { code: error.code, message: error.message, path: error.path }; }
    };
    const animate = (number, end_value) => ({ action: "animate", number, end_value, duration_intent: "brief", timing: "during_speech" });
    const out = {
      // The ones animated in the mat's own moment, before its create: refused, never drawn as 9 tens and 6 ones.
      early: mat((plan) => { plan.sections[0].moments[0].actions.unshift(animate(1, 6)); }),
      // Another visual on the mat's numbers, in a later section: refused where the mat is, not rewritten.
      shared: mat((plan) => { plan.sections[1].moments[0].actions.push({ action: "create", kind: "visual", role: "main_visual", placement: { relation: "new_region" }, content: { capability: "number_line_compare", parameters: {}, numbers: [1, 2] } }); }),
    };
    // The judge on a lesson whose pile is changed before the mat is drawn (made by hand: the compiler refuses it).
    const good = mat((plan) => { plan.sections[0].moments.push({ narration: "Trade.", actions: [animate(1, 6), animate(2, 1)] }); }).lesson;
    const failed = (lesson) => judgeTradingMat({ id: "x", expect: { lesson_pile: [0, 9, 26] } }, lesson).checks.filter((check) => !check.pass).map((check) => check.check);
    const before = failed(good);
    good.steps[0].beats.unshift({ key: "moment-00", say: "First.", actions: [{ do: "animate", variable: "number_02", value: 9 }] });
    out.judged = failed(good).filter((check) => !before.includes(check));
    console.log(JSON.stringify(out));
  `);
  assert.match(faults.early.message ?? "", /belongs to a card that is drawn later/);
  assert.match(faults.shared.message ?? "", /lesson numbers of its own/);
  assert.match(faults.shared.path ?? "", /^\$lessonPlan\.sections\[0\]\.moments\[0\]/);
  assert.deepEqual(faults.judged, ["nothing changes the pile before the mat is drawn"]);
});

test("review of #160, round 2: a beat's 24 actions, a hundreds target with no column, a trade written a section too early", () => {
  const result = withTrial(compileScript([
    // 7 tens and 36 ones, both places traded in one moment: three trades of ones and one of tens. Tapped out
    // that is 26 actions, so the ones are tapped out and the tens trade quickly (17).
    ["crowded", [36, 7], [[[1, 6], [2, 0]]], "en-US", [], [0, 7, 36]],
    ["zero-hundreds-target", [13, 0, 0], [[[1, 3], [3, 0]]], "en-US", [{ ...trading(5), number_controls: [{ number: 3, controls: ["slider"] }] }]],
  ]));
  const actions = result.crowded.lesson.steps[0].beats[1].actions.map((action) => (action.do === "tap" ? `${action.tap}:${action.at}` : "fill"));
  assert.deepEqual(actions, [...Array(10).fill("gather:ones"), "make:ones", "fill", "make:ones", "fill", "make:ones", "fill", "make:tens"]);
  assert.deepEqual(result.crowded.verdict.checks.filter((check) => !check.pass && !/learner|task|typed/.test(check.check)), []);
  // A hundreds number of 0 has no column: animating it to 0 changes nothing, and a target other than 0 drops
  // that task, recorded, and keeps the lesson (owner, 2026-11-24).
  assert.deepEqual(result["zero-hundreds-target"].adjustments.map((each) => [each.kind, each.reason]), [["activity_removed", "target_not_reachable_on_card"]]);
  assert.match(result["zero-hundreds-target"].adjustments[0].detail, /its hundreds stay 0/);
  // That no-change step does not stop the ones' first trade being tapped out (review, round 3).
  const beside = withTrial(compileScript([["beside-zero", [13, 0, 0], [[[1, 3], [3, 0]]], "en-US"]]));
  assert.equal(beside["beside-zero"].lesson.steps[0].beats[1].actions.filter((action) => action.do === "tap" && action.tap === "gather").length, 10);
  const early = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { samplePlan } = await import(${here("./sample-plans.mjs")});
    const plan = samplePlan("rectangle_unit_square_array");
    plan.numbers = [26, 9].map((initial, index) => ({ initial, min: 0, max: 59, label: "n" + index }));
    const animate = (number, end_value) => ({ action: "animate", number, end_value, duration_intent: "brief", timing: "during_speech" });
    // Section 1 writes a note and animates the ones; the mat is only drawn in section 2.
    plan.sections[0].reusable_items = [{ kind: "board_item", board_kind: "note" }];
    plan.sections[0].moments[0].actions = [{ action: "create", kind: "note", role: "explanation", content: { title: "Trading", items: ["Ten ones make one ten."] }, placement: { relation: "new_region" }, reusable_item: 1 }, animate(1, 6)];
    // A moment that is only the early trade keeps its sentence, with a neutral expression (round 3).
    plan.sections[0].moments.push({ narration: "Now six ones.", actions: [animate(1, 6)] });
    delete plan.sections[0].student_activities;
    plan.sections[1].moments[0].actions = [{ action: "create", kind: "visual", role: "main_visual", placement: { relation: "new_region" }, content: { capability: "base_ten_trade", parameters: {}, numbers: [1, 2] } }, animate(1, 6)];
    plan.close.focus = [{ source: "reusable", section: 1, item: 1 }];
    try {
      const compiled = api.compileAndValidateLessonPlan(plan, { language: "en-US" });
      console.log(JSON.stringify({ first: compiled.lesson.steps[0].beats[0].actions.map((action) => action.do), alone: compiled.lesson.steps[0].beats[1].actions.map((action) => action.do + ":" + action.expression), second: compiled.lesson.steps[1].beats[0].actions.filter((action) => action.do === "tap").length, adjustments: compiled.view_adjustments.map((each) => each.reason) }));
    } catch (error) { console.log(JSON.stringify({ code: error.code, message: error.message, path: error.path })); }
  `);
  // Left out and recorded where it stands; the mat then starts from its lesson numbers and makes both trades in
  // section 2 (ten taps and a make, then a quick fill and a make: 12 taps).
  assert.deepEqual(early, { first: ["write"], alone: ["expression:neutral"], second: 12, adjustments: ["animation_before_card", "animation_before_card"] }, JSON.stringify(early));
});

test("a generated lesson: the trades in section 1, the learner's trading and a typed question in section 2, whatever range the model gave the numbers", () => {
  // Review of #160: with the ones declared 0 to 26 the target 6 was snapped to a slider step (5.98) in a later
  // section and then refused as "the ones are 6", which no retry could repair.
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { samplePlan } = await import(${here("./sample-plans.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { judgeTradingMat } = await import(${here("../scripts/base-ten-judge.mjs")});
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    const out = {};
    for (const [id, onesMax, tensMax] of [["tight", 26, 9], ["odd", 36, 12], ["wide", 59, 34]]) {
      const plan = samplePlan("rectangle_unit_square_array");
      plan.numbers = [{ initial: 26, min: 0, max: onesMax, label: "loose ones" }, { initial: 9, min: 0, max: tensMax, label: "tens" }];
      const first = plan.sections[0].moments[0];
      first.actions = first.actions.filter((action) => action.action !== "animate");
      first.actions[0].content = { capability: "base_ten_trade", parameters: {}, numbers: [1, 2] };
      plan.sections[0].reusable_items[0].capability = "base_ten_trade";
      delete plan.sections[0].student_activities;
      const animate = (number, end_value) => ({ action: "animate", number, end_value, duration_intent: "brief", timing: "during_speech" });
      plan.sections[0].moments.push({ narration: "Ten ones make a ten: now 6 ones.", actions: [animate(1, 6)] }, { narration: "Ten tens make a hundred.", actions: [animate(2, 1)] });
      plan.sections[1].moments[0].actions = [
        { action: "create", kind: "note", role: "explanation", content: { title: "Trading", items: ["Ten ones make one ten."] }, placement: { relation: "new_region" } },
        { action: "focus", references: [{ source: "reusable", section: 1, item: 1 }], intent: "look at the mat again" }];
      plan.sections[1].student_activities = [{ kind: "number_target", prompt: "Your turn: trade until you cannot.", number_controls: [{ number: 1, controls: ["slider"] }], value: 6, tolerance: 0.02, hints: ["Ten ones make a ten."] }];
      const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
      drafts[1].answer_activities = [{ prompt: "Four tens and thirteen ones: what number is that?", answer: "53", check: "53", hints: ["Trade ten ones for a ten first."] }];
      const outline = stagedOutline(plan, drafts);
      const rejected = [];
      try {
        const generated = await api.generateLessonPlanWithModel(async (request) => {
          if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
          return JSON.stringify(drafts[request.section - 1]);
        }, { turn_id: "t", learner_request: "I have 9 tens and 26 ones. What number is that?", language: "en-US" },
        { max_attempts_per_part: 1, on_rejected_part: (part) => rejected.push(part.error?.message) });
        out[id] = { rejected, tasks: generated.lesson.lesson.tasks.map((task) => task.completion.kind),
          failed: judgeTradingMat({ id, expect: { lesson_pile: [0, 9, 26] } }, generated.lesson).checks.filter((check) => !check.pass).map((check) => check.check) };
      } catch (error) { out[id] = { error: error.message, rejected }; }
    }
    console.log(JSON.stringify(out));
  `);
  for (const id of ["tight", "odd", "wide"]) {
    assert.deepEqual(result[id], { rejected: [], tasks: ["card_fact", "numeric_answer"], failed: [] }, `${id}: ${JSON.stringify(result[id])}`);
  }
});

test("a later section that draws no card keeps its typed and thinking questions beside the latest earlier card", () => {
  // Owner, 2026-11-24 (BT-27): a section that only moves the mat drew no card, so its questions were dropped
  // without a record. They now sit beside the latest card an earlier section kept on the board, also when
  // that card is a visual the program removes afterwards (review of #167: a process diagram whose step is
  // too long): they move to the latest card still kept, the mat.
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { samplePlan } = await import(${here("./sample-plans.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    const out = {};
    for (const variant of ["mat", "removed-diagram"]) {
      const plan = samplePlan("rectangle_unit_square_array");
      plan.numbers = [{ initial: 26, min: 0, max: 59, label: "loose ones" }, { initial: 9, min: 0, max: 34, label: "tens" }];
      const first = plan.sections[0].moments[0];
      first.actions = first.actions.filter((action) => action.action !== "animate");
      first.actions[0].content = { capability: "base_ten_trade", parameters: {}, numbers: [1, 2] };
      plan.sections[0].reusable_items[0].capability = "base_ten_trade";
      if (variant === "removed-diagram") {
        first.actions.splice(1, 0, { action: "create", kind: "visual", role: "supporting_visual", content: { capability: "process_diagram", parameters: { title: "Trading", steps: ["x".repeat(400)] } }, placement: { relation: "new_region" }, reusable_item: 2 });
        plan.sections[0].reusable_items.push({ kind: "board_item", board_kind: "visual", capability: "process_diagram" });
      }
      delete plan.sections[0].student_activities;
      const animate = (number, end_value) => ({ action: "animate", number, end_value, duration_intent: "brief", timing: "during_speech" });
      plan.sections[1].moments = [{ narration: "Ten ones make a ten: now 6 ones.", actions: [animate(1, 6)] }];
      delete plan.sections[1].student_activities;
      const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
      drafts[1].answer_activities = [{ prompt: "Four tens and thirteen ones: what number is that?", answer: "53", check: "53", hints: ["Trade ten ones for a ten first."] }];
      drafts[1].reflection_activities = [{ prompt: "Why does the amount stay the same after a trade?", answer: "Ten ones are worth one ten." }];
      const outline = stagedOutline(plan, drafts);
      const adjustments = [];
      const generated = await api.generateLessonPlanWithModel(async (request) => {
        if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
        return JSON.stringify(drafts[request.section - 1]);
      }, { turn_id: "t", learner_request: "I have 9 tens and 26 ones. What number is that?", language: "en-US" },
      { max_attempts_per_part: 1, on_program_adjustment: (adjustment) => adjustments.push(adjustment.kind + ":" + adjustment.reason) });
      const lesson = generated.lesson.lesson;
      const cards = new Set(generated.lesson.steps[0].beats.flatMap((beat) => beat.actions).flatMap((action) => action.do === "write" ? [action.as] : []));
      out[variant] = {
        typed: lesson.tasks.filter((task) => task.completion.kind === "numeric_answer").map((task) => cards.has(task.anchor)),
        thinking: (lesson.reflections ?? []).map((reflection) => cards.has(reflection.anchor)),
        removed: adjustments.filter((each) => each.startsWith("answer_activity_removed")),
      };
    }
    console.log(JSON.stringify(out));
  `);
  for (const variant of ["mat", "removed-diagram"]) {
    assert.deepEqual(result[variant], { typed: [true], thinking: [true], removed: [] }, `${variant}: ${JSON.stringify(result)}`);
  }
});
