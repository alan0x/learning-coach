// The trading mat recipe (OLL decision 0023, step 3). A trial: offered only when LEARNING_COACH_TRIAL_RECIPES
// names it, so requests and recorded lessons are unchanged without it. The model writes the question's pile
// and a practice pile as six whole numbers; the program draws the mat, demonstrates the trades in its own
// words (English or Chinese), and writes the practice. Every development case's ideal output compiles and
// passes the judge in both languages; each refusal names its reason; model questions on the mat are dropped;
// a stubbed generation run carries the piles from the provider's reply to the lesson.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);
const CASES = JSON.parse(readFileSync(new URL("../testsuite/base-ten-dev-cases.json", import.meta.url), "utf8")).cases;

test("base_ten_trade is a trial recipe: not offered by default", () => {
  assert.ok(api.TRIAL_RECIPES.includes("base_ten_trade"));
  assert.equal(api.OFFERED_RECIPES.includes("base_ten_trade"), false);
  assert.equal(api.LESSON_PLAN_CAPABILITY_NAMES.includes("base_ten_trade"), false);
  assert.equal(api.RECIPE_PLUGIN.base_ten_trade, "math");
  // Six required whole numbers, ones first, bounded by the mat's starting limits.
  const properties = api.RECIPE_SCHEMA_PROPERTIES.base_ten_trade;
  assert.deepEqual(Object.keys(properties), ["lesson_ones", "lesson_tens", "lesson_hundreds", "practice_ones", "practice_tens", "practice_hundreds"]);
  assert.ok(Object.values(properties).every((property) => property.type === "integer" && property.minimum === 0));
  assert.deepEqual([properties.lesson_ones.maximum, properties.lesson_tens.maximum, properties.lesson_hundreds.maximum], [59, 19, 9]);
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
const digits = (value) => (value >= 100 ? 3 : value >= 10 ? 2 : 1);
/** A practice pile for a lesson pile: another number with as many places, which still needs a trade. */
function practiceFor([h, t, o]) {
  const candidates = [[h, t, o + 3], [h, t, o - 3], [h, t + 1, o], [h, Math.max(0, t - 1), o + 1]];
  return candidates.find((pile) => pile.every((n) => n >= 0) && pile[2] <= 59 && pile[1] <= 19 && valueOf(pile) !== valueOf([h, t, o])
    && digits(valueOf(pile)) === digits(valueOf([h, t, o])) && (valueOf([h, t, o]) >= 100 || h > 0 || valueOf(pile) < 100));
}
const parametersOf = (lesson, practice) => ({
  lesson_ones: lesson[2], lesson_tens: lesson[1], lesson_hundreds: lesson[0],
  practice_ones: practice[2], practice_tens: practice[1], practice_hundreds: practice[0],
});

// A plan with one base_ten_trade visual; `activities` are the model's practice in section 2.
const compileScript = (entries) => `
  const api = await import(${here("../lesson-plan.js")});
  const { samplePlan } = await import(${here("./sample-plans.mjs")});
  const { judgeTradingMat } = await import(${here("../scripts/base-ten-judge.mjs")});
  const out = {};
  for (const [id, parameters, language, expectPile, activities] of ${JSON.stringify(entries)}) {
    const plan = samplePlan("process_diagram");
    const visual = plan.sections[0].moments[0].actions[0].content;
    visual.capability = "base_ten_trade";
    visual.parameters = parameters;
    plan.sections[0].reusable_items[0].capability = "base_ten_trade";
    if (activities) plan.sections[1].student_activities = activities;
    try {
      const compiled = api.compileAndValidateLessonPlan(plan, { language });
      out[id] = {
        lesson: compiled.lesson,
        adjustments: compiled.program_adjustments,
        practice_by_program: compiled.practice_by_program,
        verdict: expectPile ? judgeTradingMat({ id, expect: { lesson_pile: expectPile } }, compiled.lesson) : undefined,
      };
    } catch (error) {
      out[id] = { error: error.code, path: error.path, message: error.message };
    }
  }
  console.log(JSON.stringify(out));
`;

test("every development case's ideal output compiles and passes the judge, in English and in Chinese", () => {
  const piles = CASES.filter((item) => item.expect.lesson_pile).map((item) => [item.id, item.expect.lesson_pile]);
  const entries = piles.flatMap(([id, pile]) => ["en-US", "zh-CN"].map((language) => [`${id} ${language}`, parametersOf(pile, practiceFor(pile)), language, pile]));
  const result = withTrial(compileScript(entries));
  for (const [id] of entries) {
    assert.ok(!result[id].error, `${id}: ${result[id].message}`);
    assert.deepEqual(result[id].verdict.checks.filter((check) => !check.pass), [], id);
    // The card's counts are the program's: no slider, so only taps and the demonstration change them.
    assert.ok(result[id].lesson.lesson.variables.every((variable) => variable.control === undefined), id);
    assert.equal(result[id].practice_by_program, true, id);
  }
});

test("the demonstration: the first trade tap by tap, the rest at once, in the program's own sentences", () => {
  const result = withTrial(compileScript([
    ["two", parametersOf([0, 2, 47], [0, 3, 25]), "en-US"],
    ["three-zh", parametersOf([6, 9, 16], [4, 9, 12]), "zh-CN"],
    ["none", parametersOf([3, 4, 5], [2, 6, 8]), "en-US"],
  ]));
  const program = (id) => result[id].lesson.steps[0].beats.filter((beat) => beat.key.includes("-program-"));
  // 47 ones: ten into the tray, make, then the other three tens at once.
  assert.deepEqual(program("two").map((beat) => [beat.key, beat.say, beat.actions.map((action) => action.do === "tap" ? `${action.tap}:${action.at}` : `${action.variable}=${action.value}`)]), [
    ["moment-01-program-01", "Ten ones make one ten. Put ones in the tray, one at a time.", Array(10).fill("gather:ones")],
    ["moment-01-program-02", "The tray is full: ten ones. Make a ten!", ["make:ones"]],
    // Each remaining trade fills the tray in one brief animation, then makes: never two animated counts, which
    // would play one after the other and show a wrong amount in between (Learn playback, 2026-11-22).
    ["moment-01-program-03", "The other ones trade the same way: every ten ones make one ten.", Array(3).fill(["section_01_moment_01_item_01_tray_ones=10", "make:ones"]).flat()],
  ]);
  // 6 hundreds, 9 tens, 16 ones: one ones trade makes ten tens, then one tens trade, in Chinese.
  assert.deepEqual(program("three-zh").map((beat) => [beat.say, beat.actions.length]), [
    ["十个一是一个十。先把十个一放进托盘，一次放一个。", 10],
    ["托盘满了：十个一。换成一个十！", 1],
    ["十个十是一个百。先把十个十放进托盘，一次放一个。", 10],
    ["托盘满了：十个十。换成一个百！", 1],
  ]);
  // Nothing to trade: no program beats. The model's own beat keys are unchanged.
  assert.deepEqual(program("none"), []);
  assert.deepEqual(result.two.lesson.steps[0].beats.filter((beat) => !beat.key.includes("-program-")).map((beat) => beat.key), ["moment-01"]);
});

test("the practice: I'm done on the practice pile, then the number and two rows, by the mat, with no number shown", () => {
  const result = withTrial(compileScript([["en", parametersOf([0, 3, 14], [0, 2, 17]), "en-US"], ["zh", parametersOf([0, 3, 14], [0, 2, 17]), "zh-CN"]]));
  const tasks = (id) => result[id].lesson.lesson.tasks;
  assert.deepEqual(tasks("en").map((task) => [task.prompt, task.completion.kind]), [
    ["Your turn. Make tens until you can't, then tap I'm done.", "card_fact"],
    ["How many are on the mat?", "numeric_answer"],
    ["How many of each are on the mat?", "numeric_row"],
    ["What is each place worth?", "numeric_row"],
  ]);
  assert.deepEqual(tasks("zh").map((task) => task.prompt), ["轮到你了。能换就一直换，换不了了就点“我做完了”。", "摆面上一共有多少？", "摆面上各有几个？", "每一位表示多少？"]);
  assert.deepEqual(tasks("zh")[2].completion.parts.filter((part) => "text" in part).map((part) => part.text), ["个十", "个一"]);
  assert.deepEqual(tasks("zh")[3].completion.parts.filter((part) => "blank" in part).map((part) => [part.blank.answer, part.blank.label]), [["30", "十位表示"], ["7", "个位表示"]]);
  assert.equal(tasks("en")[3].completion.parts[0].text, "37 =");
  assert.deepEqual(tasks("en")[0].start.values, { section_01_moment_01_item_01_ones: 17, section_01_moment_01_item_01_tray_ones: 0, section_01_moment_01_item_01_tens: 2 });
  for (const id of ["en", "zh"]) for (const task of tasks(id)) {
    assert.ok([task.prompt, ...task.hints].every((line) => !/[0-9]/.test(line)), `${id} ${task.prompt}`);
  }
});

test("the model's questions and thinking questions on the mat are dropped and recorded; others stay", () => {
  const onMat = { source: "reusable", section: 1, item: 1 };
  const result = withTrial(compileScript([["dropped", parametersOf([0, 3, 14], [0, 2, 17]), "en-US", undefined, [
    { kind: "numeric_answer", prompt: "How many cubes?", answer: "44", check: "44", reference: onMat, hints: ["Count."] },
    { kind: "reflection", prompt: "Why trade?", answer: "Ten ones make a ten.", reference: onMat },
    { kind: "numeric_answer", prompt: "What is 4 + 3?", answer: "7", check: "4 + 3", reference: { source: "local_board_item", moment: 1, item: 1 }, hints: ["Add."] },
  ]]]));
  const compiled = result.dropped;
  assert.ok(!compiled.error, compiled.message);
  assert.deepEqual(compiled.adjustments.map((adjustment) => [adjustment.kind, adjustment.reason, adjustment.task]), [
    ["activity_removed", "practice_by_program", "section-02-task-01"],
    ["activity_removed", "practice_by_program", "section-02-reflection-02"],
  ]);
  assert.deepEqual(compiled.lesson.lesson.tasks.map((task) => task.prompt).slice(4), ["What is 4 + 3?"]);
  assert.equal(compiled.lesson.lesson.reflections, undefined);
});

test("refusals name their reason: equal numbers, other places, a pile out of range, lesson numbers, a second mat", () => {
  const result = withTrial(compileScript([
    // 3 tens 14 ones and 4 tens 4 ones are both 44.
    ["same", parametersOf([0, 3, 14], [0, 4, 4]), "en-US"],
    ["places", parametersOf([1, 2, 3], [0, 4, 5]), "en-US"],
    ["ones", parametersOf([0, 3, 60], [0, 2, 17]), "en-US"],
    ["hundreds-in-two", parametersOf([0, 3, 14], [1, 0, 0]), "en-US"],
    // Under ten there is no ten to make (review of #157).
    ["small", parametersOf([0, 0, 7], [0, 0, 5]), "en-US"],
  ]));
  assert.match(result.small.message, /a pile of 7 has no ten to make/);
  assert.match(result.same.message, /practice pile makes 44 too/);
  assert.match(result.places.message, /practice pile makes 45: write one with as many places as 123/);
  assert.match(result.ones.message, /at most 59 loose ones/);
  assert.match(result["hundreds-in-two"].message, /practice pile makes 100/);
  const second = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { samplePlan } = await import(${here("./sample-plans.mjs")});
    const plan = samplePlan("process_diagram");
    const visual = plan.sections[0].moments[0].actions[0].content;
    visual.capability = "base_ten_trade";
    visual.parameters = ${JSON.stringify(parametersOf([0, 3, 14], [0, 2, 17]))};
    plan.sections[0].reusable_items[0].capability = "base_ten_trade";
    plan.sections[1].moments[0].actions.push({ action: "create", kind: "visual", role: "main_visual", placement: { relation: "new_region" },
      content: { capability: "base_ten_trade", parameters: ${JSON.stringify(parametersOf([0, 4, 12], [0, 2, 17]))} } });
    try { api.compileAndValidateLessonPlan(plan, { language: "en-US" }); console.log(JSON.stringify({})); }
    catch (error) { console.log(JSON.stringify({ code: error.code, message: error.message, path: error.path })); }
  `);
  assert.match(second.message ?? "", /one trading mat/);
  // Refused where the second mat is written, so that section is asked again, not the first (review of #157).
  assert.match(second.path ?? "", /^\$lessonPlan\.sections\[1\]/);
});

test("a one-section lesson with the mat makes no separate practice request", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { samplePlan } = await import(${here("./sample-plans.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    const plan = samplePlan("process_diagram");
    plan.sections = plan.sections.slice(0, 1);
    const visual = plan.sections[0].moments[0].actions[0].content;
    visual.capability = "base_ten_trade";
    visual.parameters = ${JSON.stringify(parametersOf([0, 2, 47], [0, 3, 25]))};
    plan.sections[0].reusable_items[0].capability = "base_ten_trade";
    plan.close.focus = plan.close.focus.slice(0, 1);
    const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
    const outline = stagedOutline(plan, drafts);
    const labels = [];
    const generated = await api.generateLessonPlanWithModel(async (request) => {
      labels.push(request.part ?? request.label);
      if (labels.length > 4) throw new Error("unexpected extra model request");
      if (request.label === "lesson-plan-bootstrap") {
        // Where the six numbers sit in the first combined reply's schema (fraction probe 2: late fields were left out).
        const found = [];
        const walk = (node) => { if (!node || typeof node !== "object") return; if (node.properties?.lesson_ones) found.push(Object.keys(node.properties)); Object.values(node).forEach(walk); };
        walk(request.response_schema);
        globalThis.firstKeys = found.map((keys) => keys.slice(0, 7));
        return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
      }
      return JSON.stringify(drafts[request.section - 1]);
    }, { turn_id: "trading", learner_request: "I have 2 tens and 47 ones. Trade them.", language: "en-US" }, { max_attempts_per_part: 1 });
    const write = generated.lesson.steps.flatMap((step) => step.beats).flatMap((beat) => beat.actions).find((action) => action.kind === "base_ten_trade");
    console.log(JSON.stringify({ labels, places: write?.content.places, tasks: generated.lesson.lesson.tasks?.length, calls: generated.model_calls, firstKeys: globalThis.firstKeys }));
  `);
  assert.ok(!result.labels.includes("practice"), JSON.stringify(result.labels));
  assert.deepEqual(result.places.map((place) => place.count), [47, 2]);
  assert.equal(result.tasks, 4);
  // The first combined reply lists the six numbers first, ones first.
  assert.deepEqual(result.firstKeys, [["lesson_ones", "lesson_tens", "lesson_hundreds", "practice_ones", "practice_tens", "practice_hundreds", "title"]]);
});
