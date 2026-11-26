// The place-value chart recipe (OLL decision 0025, need 35P-05), on the trading mat's pattern. A trial: offered
// only when LEARNING_COACH_TRIAL_RECIPES names it, so requests and recorded lessons are unchanged without it
// (test/request-hashes.test.mjs runs without it). The question's number and a different practice number are
// lesson numbers; the model writes what the card gives, the demonstration as targets on the number (what is
// still to do, cleared a place at a time) and the practice; the program writes every number text, plays the
// steps by the card's own rules and makes the learner's task (and, pulled apart, the row of parts). Every
// development case's ideal lesson compiles and passes the judge in both languages; each refusal names its
// reason and the picture it can cost.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);
const CASES = JSON.parse(readFileSync(new URL("../testsuite/place-value-dev-cases.json", import.meta.url), "utf8")).cases;

test("place_value_chart is a trial recipe on lesson numbers: not offered by default, one field of its own", () => {
  assert.ok(api.TRIAL_RECIPES.includes("place_value_chart"));
  assert.equal(api.OFFERED_RECIPES.includes("place_value_chart"), false);
  assert.equal(api.LESSON_PLAN_CAPABILITY_NAMES.includes("place_value_chart"), false);
  assert.equal(api.RECIPE_PLUGIN.place_value_chart, "math");
  assert.deepEqual(api.RECIPE_SCHEMA_PROPERTIES.place_value_chart, { given: { enum: ["name", "expanded", "expanded_factors", "place_counts", "numeral"] } });
  // Last in the provider's property order, so requests without the trial keep their order.
  assert.equal(api.SCHEMA_PROPERTY_ORDER.at(-1), "given");
  const moves = api.RECIPE_HOOKS.place_value_chart.number_moves;
  // The chart's number is what is still to do: it starts at the number and each step clears whole places.
  assert.deepEqual(moves.state([60408, 30705]), [60408, 30705]);
  assert.deepEqual(moves.moves([60408, 30705], [{ position: 0, to: 408 }]).steps.at(-1).to, [408, 30705]);
  assert.deepEqual(moves.moves([60408, 30705], [{ position: 0, to: 408 }, { position: 0, to: 0 }]).steps.at(-1).to, [0, 30705]);
  // Any places may go, not only the highest; decimals are exact (26.075 -> 0.075).
  assert.deepEqual(moves.moves([60408, 30705], [{ position: 0, to: 60000 }]).steps.at(-1).to, [60000, 30705]);
  assert.deepEqual(moves.moves([26.075, 18.064], [{ position: 0, to: 0.075 }]).steps.at(-1).to, [0.075, 18.064]);
  // A move to the value already there changes nothing.
  assert.deepEqual(moves.moves([408, 30705], [{ position: 0, to: 408 }]).steps.at(-1).to, [408, 30705]);
  assert.match(moves.moves([60408, 30705], [{ position: 0, to: 409 }]).refused.reason, /from 60408 it can be 408, 8, 0/);
  assert.match(moves.moves([408, 30705], [{ position: 0, to: 60408 }]).refused.reason, /clears whole places/);
  assert.match(moves.moves([60408, 30705], [{ position: 1, to: 0 }]).refused.reason, /practice number is the learner's/);
});

/** Runs a script with the trial switched on (the switch is read once, when the module loads). */
function withTrial(script) {
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "place_value_chart" },
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  }));
}

// One lesson per entry: [id, placeValuePlan options, language, judge case or null]. Each compiles through the
// full OLL validation; the result keeps the lesson, the program's adjustments and the judge's verdict.
const compileScript = (entries) => `
  const api = await import(${here("../lesson-plan.js")});
  const { placeValuePlan } = await import(${here("./sample-plans.mjs")});
  const { judgePlaceValueChart } = await import(${here("../scripts/place-value-judge.mjs")});
  const out = {};
  for (const [id, options, language, item] of ${JSON.stringify(entries)}) {
    try {
      const compiled = api.compileAndValidateLessonPlan(placeValuePlan(options), { language });
      out[id] = { lesson: compiled.lesson, adjustments: compiled.program_adjustments, verdict: item ? judgePlaceValueChart(item, compiled.lesson) : undefined };
    } catch (error) {
      out[id] = { error: error.code, path: error.path, message: error.message, capability: error.capability };
    }
  }
  console.log(JSON.stringify(out));
`;

// A practice number per development case: another number of the same shape (as many places, its zeros
// elsewhere), never the question's.
const PRACTICE = {
  "PV-01": 30705, "PV-02": 5006, "PV-03": 40306, "PV-04": 6072, "PV-05": 702038, "PV-06": 6204, "PV-07": 41028,
  "PV-08": 200500, "PV-09": 340605, "PV-10": 0.207, "PV-11": 3.106, "PV-12": 18.064, "PV-13": 4.032, "PV-14": 461270, "PV-15": 3.615,
};
const optionsOf = (item) => ({ number: Number(item.expect.number), practice: PRACTICE[item.id], given: item.expect.given });

test("every development case's ideal lesson compiles and passes the judge, in English and in Chinese", () => {
  const served = CASES.filter((item) => !item.expect.forbid);
  assert.equal(served.length, 15);
  const entries = served.flatMap((item) => ["en-US", "zh-CN"].map((language) => [`${item.id} ${language}`, optionsOf(item), language, item]));
  const result = withTrial(compileScript(entries));
  for (const [id, , language, item] of entries) {
    assert.ok(!result[id].error, `${id}: ${result[id].message}`);
    assert.deepEqual(result[id].verdict.checks.filter((check) => !check.pass), [], id);
    // The ideal lesson finishes its demonstration and leaves the learner a task on the chart.
    const notes = Object.fromEntries(result[id].verdict.notes.map((note) => [note.check, note.pass]));
    assert.ok(notes["the demonstration finishes"] && notes["the learner has a task on the chart"] && notes["a typed question follows"], id);
    assert.deepEqual(result[id].adjustments, [], id);
    const variables = result[id].lesson.lesson.variables;
    // The chart's lesson numbers are read, not bound: only the chart's own variables are declared, none with a control.
    assert.deepEqual(variables.filter((variable) => /^number_\d+$/u.test(variable.as)), [], id);
    assert.deepEqual(variables.filter((variable) => variable.control), [], id);
    assert.ok(variables.length <= 16, id);
    const write = result[id].lesson.steps[0].beats[0].actions[0];
    assert.equal(write.content.language, language === "zh-CN" ? "zh-CN" : undefined, id);
    assert.equal(write.content.mode, item.expect.direction === "pull_apart" ? "apart" : "build", id);
  }
});

test("the demonstration plays in the model's own moments: a build animates each place's disks, a pull apart taps each place out", () => {
  const result = withTrial(compileScript([
    ["build", { number: 60408, practice: 30705, given: "name" }, "en-US"],
    ["build-at-once", { number: 60408, practice: 30705, given: "name", steps: [0] }, "en-US"],
    ["apart", { number: 347.392, practice: 26.075, given: "numeral", steps: [47.392, 0] }, "en-US"],
    // A step to the value already there changes nothing: the moment looks at the chart.
    ["still", { number: 8063, practice: 6072, given: "place_counts", steps: [63, 63, 0] }, "zh-CN"],
  ]));
  const played = (id) => result[id].lesson.steps[0].beats.map((beat) => beat.actions.map((action) => (action.do === "tap" ? `${action.tap}:${action.at}` : action.do === "animate" ? `${action.variable.replace(/^section_01_moment_01_item_01_/u, "")}=${action.value}` : action.do)));
  assert.deepEqual(played("build"), [["write", "focus"], ["ten_thousands_count=6"], ["hundreds_count=4"], ["ones_count=8"]]);
  assert.deepEqual(played("build-at-once"), [["write", "focus"], ["ten_thousands_count=6", "hundreds_count=4", "ones_count=8"]]);
  assert.deepEqual(played("apart"), [["write", "focus"], ["take_out:hundreds"], ["take_out:tens", "take_out:ones", "take_out:tenths", "take_out:hundredths", "take_out:thousandths"]]);
  assert.deepEqual(played("still"), [["write", "focus"], ["thousands_count=8"], ["focus"], ["tens_count=6", "ones_count=3"]]);
  // The card's own words: Chinese for a Chinese lesson; the given text and the columns are the card's.
  const write = result.still.lesson.steps[0].beats[0].actions[0];
  assert.equal(write.content.language, "zh-CN");
  assert.equal(write.content.given, "place_counts");
  assert.equal(write.content.target, 8063000);
  assert.deepEqual(write.content.places.map((place) => place.as), ["thousands", "hundreds", "tens", "ones"]);
});

test("the practice is the learner's own number: built from the card, or pulled apart and written in a row", () => {
  const result = withTrial(compileScript([
    ["build", { number: 60408, practice: 30705, given: "name" }, "en-US"],
    ["apart", { number: 347.392, practice: 26.075, given: "numeral" }, "zh-CN"],
    // A build task whose words write the practice number gives the answer away: dropped and recorded, the
    // typed question and the lesson kept. Full-width digits and grouping are read too.
    ["leak", { number: 60408, practice: 30705, given: "name", prompt: "Build 30,705 on the chart." }, "en-US"],
    ["leak-hint", { number: 7009, practice: 5006, given: "name", hints: ["五千零六写成５００６。"] }, "zh-CN"],
    // Pulling apart shows the numeral anyway: its words may write it.
    ["apart-words", { number: 8305, practice: 6204, given: "numeral", prompt: "Pull 6,204 apart." }, "en-US"],
    // No practice number: the task is dropped and recorded; the chart and the demonstration stay.
    ["alone", { number: 60408, given: "name" }, "en-US"],
  ]));
  const [build] = result.build.lesson.lesson.tasks;
  const chart = build.completion.node;
  assert.deepEqual(build.allowed_operations, [{ kind: "card_tap", node: chart }, { kind: "card_submit" }]);
  assert.deepEqual(build.completion, { kind: "card_fact", node: chart, fact: "built" });
  // The practice start sets the number (in thousandths) and every count to empty.
  const values = Object.entries(build.start.values).map(([name, value]) => [name.replace(/^section_01_moment_01_item_01_/u, ""), value]);
  assert.deepEqual(values, [["number", 30705000], ...["hundred_thousands", "ten_thousands", "thousands", "hundreds", "tens", "ones"].map((place) => [`${place}_count`, 0])]);
  assert.deepEqual(build.start.variables, Object.keys(build.start.values));
  assert.equal(result.build.lesson.lesson.tasks[1].completion.kind, "numeric_answer");

  const [pull, row] = result.apart.lesson.lesson.tasks;
  assert.deepEqual(pull.completion.fact, "pulled_all");
  // Pulling apart starts whole: each place holds the practice number's digit, nothing pulled out.
  const start = (place) => [pull.start.values[`section_01_moment_01_item_01_${place}_count`], pull.start.values[`section_01_moment_01_item_01_${place}_pulled`]];
  assert.deepEqual(["thousands", "hundreds", "tens", "ones", "tenths", "hundredths", "thousandths"].map(start), [[0, 0], [0, 0], [2, 0], [6, 0], [0, 0], [7, 0], [5, 0]]);
  assert.equal(row.as, `${pull.as}-2`);
  assert.equal(row.prompt, "写出每一部分是多少。");
  assert.equal(row.anchor, pull.completion.node);
  assert.equal(row.start, undefined);
  assert.deepEqual(row.completion.parts, [
    { text: "26.075 =" },
    { blank: { as: "tens", answer: "20", label: "十位" } }, { text: "+" },
    { blank: { as: "ones", answer: "6", label: "个位" } }, { text: "+" },
    { blank: { as: "hundredths", answer: "0.07", label: "百分位" } }, { text: "+" },
    { blank: { as: "thousandths", answer: "0.005", label: "千分位" } },
  ]);

  for (const id of ["leak", "leak-hint"]) {
    assert.deepEqual(result[id].lesson.lesson.tasks.map((task) => task.completion.kind), ["numeric_answer"], id);
    assert.deepEqual(result[id].adjustments.map((adjustment) => [adjustment.kind, adjustment.reason]), [["activity_removed", "practice_number_in_words"]], id);
  }
  assert.deepEqual(result["apart-words"].lesson.lesson.tasks.map((task) => task.completion.kind), ["card_fact", "numeric_row"]);
  assert.equal(result["apart-words"].lesson.lesson.tasks[1].prompt, "Write what each part is worth.");
  assert.deepEqual(result.alone.adjustments.map((adjustment) => adjustment.reason), ["no_practice_number"]);
  assert.ok(result.alone.lesson.steps[0].beats.length > 1);
});

test("refusals name their reason and the picture they can cost", () => {
  const result = withTrial(compileScript([
    // A number with one non-zero place, given as a sum of values or pulled apart, shows its own answer.
    ["one-place", { number: 4000, practice: 3020, given: "expanded" }, "en-US"],
    ["one-place-apart", { number: 0.05, practice: 0.37, given: "numeral" }, "en-US"],
    ["one-place-practice", { number: 4050, practice: 1000, given: "expanded_factors", steps: [] }, "en-US"],
    ["same", { number: 4050, practice: 4050, given: "name" }, "en-US"],
    ["row-too-long", { number: 8305, practice: 1234567, given: "numeral" }, "en-US"],
    ["four-places", { number: 1.2345, practice: 2.5, given: "name", steps: [] }, "en-US"],
    ["too-big", { number: 12000000, practice: 3050, given: "name", steps: [] }, "en-US"],
    // Exact at every size: a ten-thousandth on a large number is refused, never rounded away.
    ["four-places-large", { number: 600000.1234, practice: 2.5, given: "name", steps: [] }, "en-US"],
    ["too-many-columns", { number: 1234.5, practice: 2001.7, given: "numeral", steps: [] }, "en-US"],
    ["bad-given", { number: 4050, practice: 3207, given: "roman", steps: [] }, "en-US"],
    ["bad-step", { number: 60408, practice: 30705, given: "name", steps: [409] }, "en-US"],
  ]));
  const expect = {
    "one-place": /one non-zero place/, "one-place-apart": /pulling it apart shows the answer/, "one-place-practice": /practice number 1000 has one non-zero place/,
    same: /a different number from the question's/, "row-too-long": /at most 6 non-zero places/, "four-places": /at most three decimal places/,
    "too-big": /at most 9,999,999.999/, "four-places-large": /at most three decimal places/, "too-many-columns": /need 9 columns and the chart holds at most 7/, "bad-given": /given is one of/,
    "bad-step": /from 60408 it can be 408, 8, 0/,
  };
  for (const [id, pattern] of Object.entries(expect)) {
    assert.match(result[id].message ?? "", pattern, id);
    // Each fault names the chart, so a section whose repairs are spent on it loses the picture, not the lesson.
    assert.equal(result[id].capability, "place_value_chart", id);
  }
});

test("section facts: the chart in its own terms, once it is drawn", () => {
  const facts = api.SECTION_FACTS.place_value_chart;
  const numbers = [{ initial: 26.075, min: 0, max: 26.075 }, { initial: 18.064, min: 0, max: 18.064 }];
  // Before the chart is drawn, which numbers it shows is the section's own choice.
  assert.deepEqual(facts({ section: 1, mode: "create", numbers, state: new Map() }), {});
  const established = { capability: "place_value_chart", parameters: { given: "numeral" }, numbers: [1, 2] };
  assert.deepEqual(facts({ section: 2, mode: "reuse", established, numbers, state: new Map([[1, 0.075]]), language: "en-US" }).facts, {
    numbers: [1, 2], number: 26.075, task: "pull_apart", given: "numeral",
    columns: ["Hundreds", "Tens", "Ones", "Tenths", "Hundredths", "Thousandths"],
    parts: [{ place: "Tens", digit: 2, value: 20 }, { place: "Ones", digit: 6, value: 6 }, { place: "Hundredths", digit: 7, value: 0.07 }, { place: "Thousandths", digit: 5, value: 0.005 }],
    still_to_do: 0.075, practice_number: 18.064,
  });
  // Chinese groups its columns by four.
  assert.deepEqual(facts({ section: 2, mode: "reuse", established, numbers, state: new Map(), language: "zh-CN" }).facts.columns,
    ["千位", "百位", "十位", "个位", "十分位", "百分位", "千分位"]);
});

test("with the trial on, the catalog offers the chart last and the model's first request describes it", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    let request;
    await api.generateLessonPlanWithModel(async (next) => { request = next; throw new Error("capture"); },
      { turn_id: "place-value", learner_request: "How do I write 8,305 in expanded form?", language: "en-US" }, { max_attempts_per_part: 1 }).catch(() => {});
    console.log(JSON.stringify({ offered: api.OFFERED_RECIPES, names: api.LESSON_PLAN_CAPABILITY_NAMES, text: JSON.stringify(request) }));
  `);
  assert.equal(result.offered.at(-1), "place_value_chart");
  assert.ok(result.names.includes("place_value_chart"));
  assert.ok(result.text.includes("place_value_parts"));
  assert.ok(result.text.includes("数位表"));
  // The provider writes what the card gives as a choice.
  assert.ok(result.text.includes('"given":{"enum":["name","expanded","expanded_factors","place_counts","numeral"]}'));
});

test("a stubbed generation run: the chart, its steps and the practice reach the lesson; the next section is told the chart's facts", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { placeValuePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    const plan = makeSamplePlanModelCompatible(placeValuePlan({ number: 60408, practice: 30705, given: "name", typed: false }));
    const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
    const outline = stagedOutline(plan, drafts);
    const prompts = [];
    const generated = await api.generateLessonPlanWithModel(async (request) => {
      prompts.push(request.prompt);
      if (prompts.length > 6) throw new Error("unexpected extra model request");
      if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
      return JSON.stringify(drafts[request.section - 1]);
    }, { turn_id: "place-value", learner_request: "Sixty thousand four hundred eight: how do I write it?", language: "en-US" }, { max_attempts_per_part: 1 });
    const beats = generated.lesson.steps[0].beats.map((beat) => beat.actions.map((action) => action.do));
    console.log(JSON.stringify({ beats, tasks: generated.lesson.lesson.tasks, later: JSON.parse(prompts[1]), plugins: generated.plugins }));
  `);
  assert.deepEqual(result.beats, [["write", "focus"], ["animate"], ["animate"], ["animate"]]);
  assert.deepEqual(result.tasks.map((task) => [task.completion.kind, task.completion.fact, task.start.values.section_01_moment_01_item_01_number]), [["card_fact", "built", 30705000]]);
  assert.deepEqual(result.plugins, { math: "0.8.0", shared: "0.1.0" });
  // Section 2 is told the chart in its own terms, with what the demonstration left to do.
  const facts = JSON.stringify(result.later);
  for (const fact of ['"number":60408', '"given":"name"', '"still_to_do":0', '"practice_number":30705', '"Ten thousands"']) assert.ok(facts.includes(fact), fact);
});

test("a chart drawn in section 2, on ranges a model writes: only the chart's own variables are declared, and a replay names only them", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { placeValuePlan, makeSamplePlanModelCompatible, reusable } = await import(${here("./sample-plans.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    const plan = placeValuePlan({ number: 60408, practice: 30705, given: "name", typed: false });
    // Narrow ranges with a slider step, as a model writes them; the chart's hook sets them.
    plan.numbers = [
      { initial: 60408, min: 60000, max: 61000, label: "the number", student_control: { kind: "slider", step: 1 } },
      { initial: 30705, min: 30000, max: 31000, label: "practice number", student_control: { kind: "slider", step: 1 } },
    ];
    const chart = plan.sections[0];
    chart.moments.push({ narration: "Once more from the start.", restart_numbers: [1], actions: [{ action: "animate", number: 1, end_value: 0, duration_intent: "brief", timing: "during_speech" }] });
    plan.sections = [
      { purpose: "Read the number aloud", reusable_items: [{ kind: "board_item", board_kind: "note" }], moments: [{ narration: "Listen: sixty thousand four hundred eight.", actions: [{ action: "create", kind: "text", role: "follow_up_explanation", content: { text: "sixty thousand four hundred eight" }, placement: { relation: "new_region" }, reusable_item: 1 }] }] },
      chart,
    ];
    plan.close.focus = [reusable(2, 1)];
    makeSamplePlanModelCompatible(plan);
    const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
    const outline = stagedOutline(plan, drafts);
    let calls = 0;
    const generated = await api.generateLessonPlanWithModel(async (request) => {
      calls += 1;
      if (calls > 6) throw new Error("unexpected extra model request");
      if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
      return JSON.stringify(drafts[request.section - 1]);
    }, { turn_id: "place-value-2", learner_request: "Sixty thousand four hundred eight: how do I write it?", language: "en-US" }, { max_attempts_per_part: 1 });
    const { normalizeAuthoringLesson } = await import("octos-lesson-language");
    normalizeAuthoringLesson(generated.lesson, { lessonId: "x", boardId: "x", baseRevision: 0, regionIntent: "new_topic" });
    console.log(JSON.stringify({ lesson: generated.lesson, adjustments: generated.program_adjustments }));
  `);
  const declared = result.lesson.lesson.variables.map((variable) => variable.as);
  assert.deepEqual(declared.filter((name) => /^number_\d+$/u.test(name)), []);
  const beats = result.lesson.steps[1].beats;
  // The replay restarts the chart's own variables, every one of them declared.
  assert.deepEqual(beats.at(-1).start.variables.filter((name) => !declared.includes(name)), []);
  assert.equal(beats.at(-1).start.variables.length, 7);
  assert.deepEqual(beats.map((beat) => beat.actions.map((action) => action.do)), [["write", "focus"], ["animate"], ["animate"], ["animate"], ["animate", "animate", "animate"]]);
  assert.deepEqual(result.lesson.lesson.tasks.map((task) => task.completion.fact), ["built"]);
  assert.deepEqual(result.adjustments, []);
});

test("the fixed sample (used for request hashes with the trial on) compiles through the full OLL validation", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { samplePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
    const compiled = api.compileAndValidateLessonPlan(samplePlan("place_value_chart"));
    const model = api.compileAndValidateLessonPlan(makeSamplePlanModelCompatible(samplePlan("place_value_chart")));
    console.log(JSON.stringify({ kinds: compiled.lesson.steps[0].beats[0].actions.map((action) => action.kind ?? action.do), tasks: compiled.lesson.lesson.tasks.length, model: model.lesson.lesson.tasks.length }));
  `);
  assert.deepEqual(result, { kinds: ["place_value_chart", "focus", "animate", "animate"], tasks: 1, model: 1 });
});
