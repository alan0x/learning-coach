// The place-value chart recipe (OLL decision 0025, need 35P-05), on the trading mat's pattern. Offered by
// default since 2026-11-26 (owner), after objective check 1; a trial before. The question's number and a different practice number are
// lesson numbers; the model writes what the card gives, the demonstration as targets on the number (the value
// on the chart: built up from 0, or what is still on it as it is pulled apart) and the practice; the program writes every number text, plays the
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

test("place_value_chart is offered by default, last in the catalog (owner, 2026-11-26), on lesson numbers, one field of its own", () => {
  assert.equal(api.TRIAL_RECIPES.includes("place_value_chart"), false);
  assert.equal(api.RECIPE_CATALOG_ORDER.at(-1), "place_value_chart");
  assert.ok(api.OFFERED_RECIPES.includes("place_value_chart"));
  assert.ok(api.LESSON_PLAN_CAPABILITY_NAMES.includes("place_value_chart"));
  assert.equal(api.RECIPE_PLUGIN.place_value_chart, "math");
  assert.deepEqual(api.RECIPE_SCHEMA_PROPERTIES.place_value_chart, { given: { enum: ["name", "expanded", "expanded_factors", "place_counts", "numeral"] } });
  // In the provider's property order where the trial put it, before the trade trial's operation (OLL 0026).
  assert.deepEqual(api.SCHEMA_PROPERTY_ORDER.slice(-2), ["given", "operation"]);
  const moves = api.RECIPE_HOOKS.place_value_chart.number_moves;
  const build = { parameters: { given: "name" } }, apart = { parameters: { given: "numeral" } };
  const to = (state, ...values) => moves.moves(state, values.map((value) => ({ position: 0, to: value })));
  // Building, the chart's number is the value on the chart: 0 when the chart is drawn, whatever number it
  // shows; then the practice number, the question's number and that the chart builds, which no step changes.
  const built = moves.state([60408, 30705], build);
  assert.deepEqual(built, [0, 30705, 60408, 1]);
  assert.deepEqual(to(built, 60000, 60400, 60408).steps.map((step) => step.to[0]), [60000, 60400, 60408]);
  assert.deepEqual(to(built, 60408).steps.at(-1).to, [60408, 30705, 60408, 1]);
  // Any places may come, not only the highest; decimals are exact.
  assert.deepEqual(to(built, 408, 60408).steps.map((step) => step.to[0]), [408, 60408]);
  assert.deepEqual(to(moves.state([26.075, 18.064], build), 20, 26.075).steps.at(-1).to[0], 26.075);
  // The number written again, in a later section, to show it on the chart: no change (PV-02, PV-05).
  assert.deepEqual(to([7009, 5006, 7009, 1], 7009).steps.at(-1).to, [7009, 5006, 7009, 1]);
  // A step that takes places off, or writes a digit the number does not have, is refused with what can come next.
  assert.match(to([60400, 30705, 60408, 1], 400).refused.reason, /from 60400 it can be 60408/);
  assert.match(to(built, 60409).refused.reason, /value on the chart: it starts at 0 .* from 0 it can be 60000, 60400, 60408/);
  // The old reading (the number still to do, down to 0) is refused once it goes down.
  assert.match(to(built, 408, 8).refused.reason, /places already on stay, so from 408 it can be 60408/);
  // Pulling apart, the chart's number is what is still on the chart: the number, then whole places out.
  const whole = moves.state([60408, 30705], apart);
  assert.deepEqual(whole, [60408, 30705, 60408, 0]);
  assert.deepEqual(to(whole, 408, 0).steps.map((step) => step.to[0]), [408, 0]);
  assert.deepEqual(to(moves.state([26.075, 18.064], apart), 0.075).steps.at(-1).to[0], 0.075);
  assert.match(to(whole, 409).refused.reason, /what is still on the chart.* from 60408 it can be 408, 8, 0/);
  assert.match(to([408, 30705, 60408, 0], 60408).refused.reason, /takes whole places out/);
  assert.match(moves.moves(built, [{ position: 1, to: 0 }]).refused.reason, /practice number is the learner's/);
});

/** Runs a script in its own process. (It named the trial when the chart was one; the chart is offered since 2026-11-26.) */
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
    ["build-at-once", { number: 60408, practice: 30705, given: "name", steps: [60408] }, "en-US"],
    ["apart", { number: 347.392, practice: 26.075, given: "numeral", steps: [47.392, 0] }, "en-US"],
    // A step to the value already there changes nothing: the moment looks at the chart.
    ["still", { number: 8063, practice: 6072, given: "place_counts", steps: [8000, 8000, 8063] }, "zh-CN"],
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
    ["bad-step", { number: 60408, practice: 30705, given: "name", steps: [60409] }, "en-US"],
    ["old-steps", { number: 60408, practice: 30705, given: "name", steps: [408, 8, 0] }, "en-US"],
    ["apart-up", { number: 60408, practice: 30705, given: "numeral", steps: [408, 60408] }, "en-US"],
  ]));
  const expect = {
    "one-place": /one non-zero place/, "one-place-apart": /pulling it apart shows the answer/, "one-place-practice": /practice number 1000 has one non-zero place/,
    same: /a different number from the question's/, "row-too-long": /at most 6 non-zero places/, "four-places": /at most three decimal places/,
    "too-big": /at most 9,999,999.999/, "four-places-large": /at most three decimal places/, "too-many-columns": /need 9 columns and the chart holds at most 7/, "bad-given": /given is one of/,
    "bad-step": /value on the chart: it starts at 0 .* from 0 it can be 60000, 60400, 60408/,
    // The old reading (the number still to do, going down) is refused once it goes down.
    "old-steps": /places already on stay, so from 408 it can be 60408/,
    "apart-up": /takes whole places out, highest first, so from 408 it can be 8, 0/,
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
    still_on_chart: 0.075, taken_out: 26,
    // Where the demonstration can go next, as facts: the places still on, and the values left as the highest come out.
    places_still_on_chart: ["Hundredths", "Thousandths"], next_values: [0.005, 0],
    practice_number: 18.064,
  });
  // A later section of a whole number half pulled apart (objective check 1, PV-07's shape: 62017 at 17) is told
  // the tens and ones are still on, and that 7 or 0 come next; once all is out, nothing is left and no next value.
  const whole = [{ initial: 62017, min: 62017, max: 62017 }, { initial: 30405, min: 10000, max: 99999 }];
  const half = facts({ section: 2, mode: "reuse", established, numbers: whole, state: new Map([[1, 17]]), language: "zh-CN" }).facts;
  assert.deepEqual([half.still_on_chart, half.places_still_on_chart, half.next_values], [17, ["十位", "个位"], [7, 0]]);
  const out = facts({ section: 2, mode: "reuse", established, numbers: whole, state: new Map([[1, 0]]), language: "zh-CN" }).facts;
  assert.deepEqual([out.still_on_chart, out.places_still_on_chart, "next_values" in out], [0, [], false]);
  // Building, in the guidance's terms: the value on the chart now (0 when it is drawn) and what is still to place.
  const toBuild = { ...established, parameters: { given: "place_counts" } };
  assert.deepEqual(facts({ section: 2, mode: "reuse", established: toBuild, numbers, state: new Map([[1, 20]]), language: "en-US" }).facts.on_chart_now, 20);
  assert.deepEqual(facts({ section: 2, mode: "reuse", established: toBuild, numbers, state: new Map([[1, 20]]), language: "en-US" }).facts.still_to_place, 6.075);
  const empty = facts({ section: 2, mode: "reuse", established: toBuild, numbers, state: new Map(), language: "en-US" }).facts;
  assert.deepEqual([empty.on_chart_now, empty.still_to_place, empty.still_on_chart], [0, 26.075, undefined]);
  // Chinese groups its columns by four.
  assert.deepEqual(facts({ section: 2, mode: "reuse", established, numbers, state: new Map(), language: "zh-CN" }).facts.columns,
    ["千位", "百位", "十位", "个位", "十分位", "百分位", "千分位"]);
});

test("the catalog offers the chart last and the model's first request describes it", () => {
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
  assert.deepEqual(result.plugins, { math: "0.11.0", shared: "0.1.0" });
  // Section 2 is told the chart in its own terms, with what the demonstration left to do.
  const facts = JSON.stringify(result.later);
  for (const fact of ['"number":60408', '"given":"name"', '"on_chart_now":60408', '"still_to_place":0', '"practice_number":30705', '"Ten thousands"']) assert.ok(facts.includes(fact), fact);
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
    // A replay empties the chart again (the value on it is 0), so building to the number plays every place again.
    chart.moments.push({ narration: "Once more from the start.", restart_numbers: [1], actions: [{ action: "animate", number: 1, end_value: 60408, duration_intent: "brief", timing: "during_speech" }] });
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

test("review of #174: too many variables costs the chart, not the lesson; a pull-apart task that writes a part is dropped", () => {
  const out = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { placeValuePlan } = await import(${here("./sample-plans.mjs")});
    const out = {};
    // A Chinese pull apart with decimals binds 15 variables; two more lesson numbers make 17.
    const crowded = placeValuePlan({ number: 26.075, practice: 18.064, given: "numeral" });
    // Each extra number is shown on a number line of its own: a lesson number no picture uses is not declared.
    for (let i = 0; i < 2; i += 1) crowded.numbers.push({ initial: 5 + i, min: 0, max: 10, label: "extra" + i });
    crowded.sections[0].moments.push({ narration: "Two more numbers.", actions: [3, 4].map((number) => ({ action: "create", kind: "visual", role: "supporting_visual", content: { capability: "number_line", parameters: {}, numbers: [number] }, placement: { relation: "new_region" } })) });
    try { api.compileAndValidateLessonPlan(crowded, { language: "zh-CN" }); out.crowded = { compiled: true }; }
    catch (error) { out.crowded = { code: error.code, capability: error.capability }; }
    // Hints that write the practice number's parts give the row away.
    const told = api.compileAndValidateLessonPlan(placeValuePlan({ number: 347.392, practice: 215.638, given: "numeral", hints: ["215.638 = 200 + 10 + 5 + 0.6 + 0.03 + 0.008"] }), { language: "en-US" });
    out.told = { tasks: (told.lesson.lesson.tasks ?? []).map((task) => task.completion.kind), adjustments: told.program_adjustments.map((each) => each.reason) };
    // Honest hints keep the task; the row has its own hint, never the model's.
    const fair = api.compileAndValidateLessonPlan(placeValuePlan({ number: 347.392, practice: 215.638, given: "numeral", hints: ["Take out each place that has disks."] }), { language: "en-US" });
    out.fair = (fair.lesson.lesson.tasks ?? []).map((task) => [task.completion.kind, task.hints]);
    console.log(JSON.stringify(out));
  `);
  assert.deepEqual(out.crowded, { code: "LESSON_PLAN_OLL_SCHEMA", capability: "place_value_chart" });
  assert.ok(!out.told.tasks.includes("card_fact") && !out.told.tasks.includes("numeric_row"), JSON.stringify(out.told));
  assert.ok(out.told.adjustments.includes("practice_part_in_words"), JSON.stringify(out.told));
  assert.deepEqual(out.fair, [
    ["card_fact", ["Take out each place that has disks."]],
    ["numeric_row", ["Each part is the number of disks in that place times the value of the place."]],
  ]);
});

test("objective check 1 (PV-02, PV-05): a section that writes the full number again after the chart is built changes nothing, and the lesson is kept", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { placeValuePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    const out = {};
    for (const [id, number, practice, again] of [["PV-02", 7009, 5006, 7009], ["PV-05", 904026, 702038, 904026], ["down", 7009, 5006, 9]]) {
      const plan = placeValuePlan({ number, practice, given: id === "PV-05" ? "expanded" : "name", typed: false });
      // Section 2 writes the number again, as the model did in check 1 to mean "show the number on the chart".
      plan.sections[1].moments.push({ narration: "Here is the number on the chart.", actions: [{ action: "animate", number: 1, end_value: again, duration_intent: "brief", timing: "during_speech" }] });
      makeSamplePlanModelCompatible(plan);
      const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
      const outline = stagedOutline(plan, drafts);
      const prompts = [];
      out[id] = {};
      try {
        const generated = await api.generateLessonPlanWithModel(async (request) => {
          prompts.push(request.prompt);
          if (prompts.length > 6) throw new Error("unexpected extra model request");
          if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
          return JSON.stringify(drafts[request.section - 1]);
        }, { turn_id: id, learner_request: "How do I write this number?", language: "zh-CN" }, { max_attempts_per_part: 1 });
        out[id] = { calls: prompts.length, kept: Boolean(generated.lesson), last: generated.lesson?.steps.at(-1).beats.at(-1).actions.map((action) => action.do), facts: prompts[1] ? JSON.parse(prompts[1]) : null, tasks: generated.lesson?.lesson.tasks?.map((task) => task.completion.fact) };
      } catch (error) {
        out[id] = { error: error.code, capability: error.capability, message: error.message };
      }
      // The same plan compiled whole: a downward step is refused with the chart's capability.
      try { api.compileAndValidateLessonPlan(plan, { language: "zh-CN" }); out[id].compiled = true; }
      catch (error) { out[id].compiled = { code: error.code, capability: error.capability, message: error.message }; }
    }
    console.log(JSON.stringify(out));
  `);
  for (const id of ["PV-02", "PV-05"]) {
    assert.equal(result[id].error, undefined, `${id}: ${result[id].message}`);
    assert.ok(result[id].kept, id);
    // Bootstrap and section 2 only: no repair was needed.
    assert.equal(result[id].calls, 2, id);
    // The moment that wrote the number again only looks at the chart.
    assert.deepEqual(result[id].last, ["focus"], id);
    assert.deepEqual(result[id].tasks, ["built"], id);
    assert.equal(result[id].compiled, true, id);
  }
  // Section 2 was told the chart is built: the number on it, nothing left to place.
  const told = JSON.stringify(result["PV-02"].facts);
  for (const fact of ['"on_chart_now":7009', '"still_to_place":0']) assert.ok(told.includes(fact), fact);
  // Going down (the old reading) is refused, naming the chart, so the chart can go rather than the lesson.
  assert.deepEqual([result.down.compiled.code, result.down.compiled.capability], ["LESSON_PLAN_NUMBER_NOT_DRAWABLE", "place_value_chart"]);
  assert.match(result.down.compiled.message, /places already on stay, so from 7009 it can be only 7009: the number is built/);
});

test("objective check 1 (PV-10, PV-13): a question's number declared as 0 is refused with what to write instead", () => {
  const out = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { placeValuePlan } = await import(${here("./sample-plans.mjs")});
    const plan = placeValuePlan({ number: 0.309, practice: 0.504, given: "place_counts" });
    plan.numbers[0].initial = 0;
    try { api.compileAndValidateLessonPlan(plan, { language: "zh-CN" }); console.log(JSON.stringify({ compiled: true })); }
    catch (error) { console.log(JSON.stringify({ capability: error.capability, message: error.message })); }
  `);
  assert.equal(out.capability, "place_value_chart");
  assert.match(out.message, /Write the number itself as its value \(for example 0\.309\), not 0: the chart starts empty by itself/);
});
