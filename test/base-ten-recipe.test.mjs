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
    return [`${id} ${language}`, numbersOf(pile), idealMoves(pile), language, [...(needsTrade ? [trading(pile[2] % 10)] : []), typed(53)], pile];
  }));
  const result = withTrial(compileScript(entries));
  for (const [id] of entries) {
    assert.ok(!result[id].error, `${id}: ${result[id].message}`);
    assert.deepEqual(result[id].verdict.checks.filter((check) => !check.pass), [], id);
    // The mat's counts have no slider: they change only by trades.
    assert.ok(result[id].lesson.lesson.variables.every((variable) => variable.control === undefined), id);
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
  // 6 hundreds, 9 tens, 16 ones, the tens written before the ones in one moment: the ones trade first.
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

test("the practice is the model's: its trading task becomes taps on the mat, and its typed question stays", () => {
  const result = withTrial(compileScript([
    ["en", [14, 3], [[[1, 4]]], "en-US", [trading(4), typed(53)]],
    ["no-trade", [5, 4, 3], [], "en-US", [trading(5), typed(53)]],
  ]));
  const tasks = result.en.lesson.lesson.tasks;
  assert.deepEqual(tasks.map((task) => [task.prompt, task.completion.kind]), [
    ["Your turn: trade until you cannot.", "card_fact"],
    ["Four tens and thirteen ones: what number is that?", "numeric_answer"],
  ]);
  // The learner's trading starts again from the lesson's pile, trays empty, and ends when no trade is left.
  assert.deepEqual(tasks[0].start.values, { number_01: 14, number_02: 3, section_01_moment_01_item_01_tray_ones: 0 });
  assert.deepEqual(tasks[0].allowed_operations.map((operation) => operation.kind), ["card_tap", "card_submit"]);
  assert.equal(tasks[0].completion.fact, "no_trade_left");
  assert.deepEqual(result.en.adjustments, []);
  // A pile with nothing to trade has no trading task; the typed question stays.
  assert.deepEqual(result["no-trade"].lesson.lesson.tasks.map((task) => task.completion.kind), ["numeric_answer"]);
  assert.deepEqual(result["no-trade"].adjustments.map((adjustment) => [adjustment.kind, adjustment.reason]), [["activity_removed", "nothing_to_do_on_card"]]);
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
    ["target", [26, 9], [[[1, 6]]], "en-US", [trading(16)]],
  ]));
  assert.match(result["off-tens"].message, /from 26 they can be 16 or 6/);
  assert.match(result["off-tens"].path, /moments\[1\]\.actions\[0\]\.end_value$/);
  assert.match(result.up.message, /only go down, ten at a time/);
  assert.match(result["tens-first"].message, /tens rise by themselves/);
  assert.match(result["two-columns"].message, /tens and ones only/);
  assert.match(result["too-many"].message, /at most 59 loose ones/);
  assert.match(result.small.message, /a pile of 7 has no ten to make/);
  assert.match(result["one-number"].message, /two or three lesson numbers/);
  assert.match(result.target.message, /when every trade is made the ones are 6/);
});

test("the judge catches each kind of break", () => {
  const result = withTrial(compileScript([
    ["good", [14, 3], [[[1, 4]]], "en-US", [trading(4), typed(53)], [0, 3, 14]],
    ["not-traded", [14, 3], [], "en-US", [trading(4), typed(53)], [0, 3, 14]],
    ["no-practice", [14, 3], [[[1, 4]]], "en-US", [], [0, 3, 14]],
    ["zh", [14, 3], [[[1, 4]]], "zh-CN", [trading(4), typed(53)], [0, 3, 14]],
  ]));
  const failed = (verdict) => verdict.checks.filter((check) => !check.pass).map((check) => check.check);
  assert.deepEqual(failed(result.good.verdict), []);
  assert.deepEqual(failed(result.zh.verdict), []);
  // The lesson never makes the trade it is about.
  assert.deepEqual(failed(result["not-traded"].verdict), ["the demonstration ends with no trade left", "the demonstration trades when the pile needs it"]);
  assert.deepEqual(failed(result["no-practice"].verdict), ["the learner trades the lesson's pile on the mat", "the card task asks whether no trade is left, on the mat", "the card task starts from the lesson's pile, trays empty", "a typed question follows"]);
  const item = (pile) => ({ id: "x", expect: { lesson_pile: pile } });
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 15]), result.good.lesson)), ["the lesson pile is the question's"]);
  // The task starts from another pile.
  const moved = structuredClone(result.good.lesson);
  moved.lesson.tasks[0].start.values.number_01 = 24;
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 14]), moved)), ["the card task starts from the lesson's pile, trays empty"]);
  // The mat speaks another language than the lesson.
  const mixed = structuredClone(result.good.lesson);
  mixed.lesson.language = "zh-CN";
  assert.deepEqual(failed(judgeTradingMat(item([0, 3, 14]), mixed)), ["the mat speaks the lesson's language"]);
  // A near miss passes only without a mat, and only if the lesson plays.
  const near = { id: "n", expect: { forbid: ["base_ten_trade"] } };
  assert.deepEqual(failed(judgeTradingMat(near, result.good.lesson)), ["no trading mat for this question"]);
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
