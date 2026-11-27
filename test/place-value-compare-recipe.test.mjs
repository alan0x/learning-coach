// The place-value compare recipe (OLL decision 0029, need 35P-06): comparing two numbers by place, from the largest
// place down. A trial, off by default. The model writes four lesson numbers, the question's pair as written (0.70 keeps
// its zero: the outline number carries the decimals the model wrote) and a practice pair; the program supplies
// "compared" (0), binds the card's own variables, plays each value of compared (the card judges one column at a time,
// then chooses the sign; a value past the end is the end) and makes the learner's task on the practice pair. Every
// development case's ideal lesson compiles and passes the judge in both languages; each refusal names its reason and
// the picture it can cost, never the lesson.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);
const CASES = JSON.parse(readFileSync(new URL("../testsuite/place-value-compare-dev-cases.json", import.meta.url), "utf8")).cases;
const short = (name) => name.replace(/^section_01_moment_01_item_01_/u, "");

/** Runs a script in its own process with the trial on. */
function withTrial(script, trial = "place_value_compare") {
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: trial },
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  }));
}

test("place_value_compare is a trial, off by default: built, not offered; its guidance and the number it supplies", () => {
  assert.ok(api.TRIAL_RECIPES.includes("place_value_compare"));
  assert.equal(api.RECIPE_CATALOG_ORDER.includes("place_value_compare"), false);
  assert.equal(api.OFFERED_RECIPES.includes("place_value_compare"), false);
  assert.equal(api.LESSON_PLAN_CAPABILITY_NAMES.includes("place_value_compare"), false);
  assert.equal(api.RECIPE_PLUGIN.place_value_compare, "math");
  const offered = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const entry = api.LESSON_PLAN_CAPABILITY_REGISTRY.place_value_compare;
    const [compared] = entry.program_number_inputs;
    console.log(JSON.stringify({ offered: api.OFFERED_RECIPES, guidance: entry.model_guidance, min: entry.min_lesson_numbers, compared,
      many: entry.binds_many_variables, controls: entry.student_controls, inputs: entry.number_inputs,
      line: api.recipeGuidance("number_line_compare", api.LESSON_PLAN_CAPABILITY_NAMES) }));
  `);
  assert.equal(offered.offered.at(-1), "place_value_compare");
  assert.deepEqual(offered.inputs, ["first", "second", "practice_first", "practice_second", "compared"]);
  assert.deepEqual([offered.compared.initial, offered.compared.min, offered.compared.max], [0, 0, 8]);
  assert.deepEqual([offered.min, offered.many, offered.controls], [5, true, []]);
  // Guidance (tracked, not capped): the pair as written with its zero, the practice, the demonstration to the sign.
  console.log(`compare guidance: ${Buffer.byteLength(offered.guidance)} B`);
  assert.ok(offered.guidance.includes("0.70 写 mantissa 70、scale 2；0.7 写 7、1，不要补0"), "a written zero kept, never added");
  assert.ok(offered.guidance.includes("演示一直比到选好符号"), "the demonstration reaches the sign (owner, 2026-11-27)");
  assert.ok(offered.guidance.includes("不写 >、<、="), "the practice's answer is never written");
  assert.match(offered.guidance, /练习的数是孩子课后自己做的：课上可以说“课后试试……”，但不讲它怎么做、不写出它的算式、不说它的答案，outline 也不为它安排一节。/u);
  assert.ok(!/滑块|slider|拖|按钮|一样」|不一样」|Same|Different/u.test(offered.guidance), "the guidance names no control");
  // Beside the card the number line does not take comparing by place; alone its text is unchanged.
  assert.ok(offered.line.includes("按数位比大小") && offered.line.includes("不用数轴"));
  assert.equal(api.recipeGuidance("number_line_compare", api.LESSON_PLAN_CAPABILITY_NAMES), "数轴比较两个数：两个数值各画一点（2/3 和 3/5 也能画）");
});

test("compared moves forward from 0 to the sign; a value past the end is the end; nothing else moves", () => {
  const moves = api.RECIPE_HOOKS.place_value_compare.number_moves;
  const to = (state, ...values) => moves.moves(state, values.map((value) => ({ position: 4, to: value })));
  const start = moves.state([4530, 4503, 6281, 6218, 3]);
  assert.deepEqual(start, [4530, 4503, 6281, 6218, 0], "the card opens with nothing compared");
  assert.deepEqual(to(start, 1, 2, 4).steps.map((step) => step.to[4]), [1, 2, 4]);
  assert.deepEqual(to(start, 8).steps.map((step) => step.to[4]), [4], "past the sign is the sign (4,530 and 4,503: three columns, then the sign)");
  assert.match(to(start, 3, 1).refused.reason, /compared goes forward, never back: from 3 it can be 3 to 4/);
  assert.match(to(start, 1.5).refused.reason, /a whole number from 0, not 1\.5/);
  const left = moves.moves(start, [{ position: 0, to: 4000 }, { position: 4, to: 2 }]);
  assert.deepEqual(left.steps.map((step) => step.to[4]), [2]);
  assert.match(left.ignored[0].reason, /stay as written: the demonstration moves only compared/);
  // The outline's numbers carry their written decimals: 0.7 twice is refused as the outline is read; 0.7 and 0.70 are a pair.
  const decimals = (...written) => written.map((written_decimals) => (written_decimals ? { written_decimals } : {}));
  assert.match(api.RECIPE_HOOKS.place_value_compare.outline_fault([0.7, 0.7, 0.4, 0.5, 0], decimals()), /the same numeral, 0\.7/);
  assert.equal(api.RECIPE_HOOKS.place_value_compare.outline_fault([0.7, 0.7, 0.4, 0.4, 0], decimals(0, 2, 2, 0)), undefined);
  // Compared is the program's: an outline that writes 8 there (the guidance's last value) keeps the card (review of #198).
  assert.equal(api.RECIPE_HOOKS.place_value_compare.outline_fault([4530, 4503, 6281, 6218, 8]), undefined);
  // An equal pair's sign is at 4 to 5 (its written decimals are the compiler's): 8 then 4 are both the sign.
  assert.deepEqual(to(moves.state([0.7, 0.7, 0.4, 0.4, 0]), 8, 4).steps.map((step) => step.to[4]), [5, 4]);
  assert.match(to(moves.state([0.7, 0.7, 0.4, 0.4, 0]), 4, 3).refused.reason, /never back/);
  assert.match(api.RECIPE_HOOKS.place_value_compare.outline_fault([4530, 4503, 4503, 4530, 0]), /the same two numbers in the other order are the same pair/);
  assert.match(api.RECIPE_HOOKS.place_value_compare.outline_fault([1234567, 0.5, 1, 2, 0]), /too_wide/);
});

// One lesson per entry: [id, comparePlan options, language, judge case or null]. Each compiles through the full OLL
// validation; the result keeps the lesson, the program's adjustments and the judge's verdict.
const compileScript = (entries) => `
  const api = await import(${here("../lesson-plan.js")});
  const { comparePlan } = await import(${here("./sample-plans.mjs")});
  const { judgePlaceValueCompare } = await import(${here("../scripts/place-value-compare-judge.mjs")});
  const out = {};
  for (const [id, options, language, item] of ${JSON.stringify(entries)}) {
    try {
      const compiled = api.compileAndValidateLessonPlan(comparePlan(options), { language });
      out[id] = { lesson: compiled.lesson, adjustments: compiled.program_adjustments, verdict: item ? judgePlaceValueCompare(item, compiled.lesson) : undefined };
    } catch (error) {
      out[id] = { error: error.code, path: error.path, message: error.message, capability: error.capability };
    }
  }
  console.log(JSON.stringify(out));
`;

// A practice pair per development case: another pair the card takes, never the question's (in either order).
const PRACTICE = {
  "PC-01": ["5602", "5620"], "PC-02": ["52734", "52743"], "PC-03": ["7284", "7248"], "PC-04": ["100050", "99999"], "PC-05": ["100200", "99800"],
  "PC-06": ["345612", "345216"], "PC-07": ["607198", "607912"], "PC-08": ["0.6", "0.58"], "PC-09": ["0.36", "0.306"], "PC-10": ["0.48", "0.5"],
  "PC-11": ["4.07", "4.7"], "PC-12": ["10.5", "8.96"], "PC-13": ["7.08", "7.8"], "PC-14": ["0.40", "0.4"], "PC-15": ["2.50", "2.5"],
};
const optionsOf = (item) => ({ numbers: item.expect.numbers, practice: PRACTICE[item.id] });

test("every development case's ideal lesson compiles and passes the judge, in English and in Chinese", () => {
  const served = CASES.filter((item) => !item.expect.forbid);
  assert.equal(served.length, 15);
  const entries = served.flatMap((item) => ["en-US", "zh-CN"].map((language) => [`${item.id} ${language}`, optionsOf(item), language, item]));
  const result = withTrial(compileScript(entries));
  for (const [id, options, language] of entries) {
    assert.ok(!result[id].error, `${id}: ${result[id].message}`);
    assert.deepEqual(result[id].verdict.checks.filter((check) => !check.pass), [], id);
    // The ideal lesson compares to the sign and leaves the learner a task on the card.
    assert.deepEqual(result[id].verdict.notes.filter((note) => !note.pass), [], id);
    assert.deepEqual(result[id].adjustments, [], id);
    const variables = result[id].lesson.lesson.variables;
    // Only the card's own variables, none with a control: the pair, compared, marked, signed, and the written
    // decimals when a number of the lesson or the practice is written with a trailing zero.
    const zero = [...options.numbers, ...options.practice].some((text) => /\.\d*0$/u.test(text));
    assert.deepEqual(variables.map((variable) => short(variable.as)), ["a", "b", ...(zero ? ["a_decimals", "b_decimals"] : []), "compared", "marked", "signed"], id);
    assert.deepEqual(variables.filter((variable) => variable.control), [], id);
    const write = result[id].lesson.steps[0].beats[0].actions[0];
    assert.equal(write.kind, "place_value_compare", id);
    assert.equal(write.content.language, language === "zh-CN" ? "zh-CN" : undefined, id);
  }
  // 0.7 and 0.70: the written zero reaches the card, and the practice 0.40 and 0.4 sets its own.
  const equal = result["PC-14 en-US"].lesson;
  const card = equal.steps[0].beats[0].actions[0].content;
  assert.deepEqual([card.a, card.b, card.a_decimals, card.b_decimals], [700, 700, 1, 2]);
  const start = equal.lesson.tasks[0].start.values;
  assert.deepEqual(Object.fromEntries(Object.entries(start).map(([key, value]) => [short(key), value])), { a: 400, b: 400, a_decimals: 2, b_decimals: 1, compared: 0, marked: 0, signed: 0 });
});

test("the demonstration plays in the model's own moments: each value of compared, forward, to the sign; a lesson may stop partway", () => {
  const result = withTrial(compileScript([
    ["steps", { numbers: ["4530", "4503"], practice: ["6281", "6218"], steps: [1, 2, 3, 4] }, "en-US", null],
    ["past", { numbers: ["4530", "4503"], practice: ["6281", "6218"], steps: [2, 8] }, "en-US", null],
    ["partway", { numbers: ["4530", "4503"], practice: ["6281", "6218"], steps: [2] }, "en-US", null],
    ["equal", { numbers: ["0.7", "0.70"], practice: ["0.40", "0.4"], steps: [8] }, "zh-CN", null],
  ]));
  const values = (id) => result[id].lesson.steps[0].beats.flatMap((beat) => beat.actions).filter((action) => action.do === "animate").map((action) => action.value);
  assert.deepEqual(values("steps"), [1, 2, 3, 4]);
  assert.deepEqual(values("past"), [2, 4], "a value past the end plays to the sign");
  assert.deepEqual(values("partway"), [2], "no hard rule that the demonstration finishes");
  // 0.7 and 0.70: ones, tenths, hundredths, then the sign: compared to 4.
  assert.deepEqual(values("equal"), [4]);
  for (const id of ["steps", "past", "partway", "equal"]) assert.ok(!result[id].error, `${id}: ${result[id].message}`);
});

test("the practice is the learner's own pair, compared by taps to the true sign; its words never give the answer", () => {
  const result = withTrial(compileScript([
    ["plain", { numbers: ["4530", "4503"], practice: ["6281", "6218"] }, "en-US", null],
    ["gives", { numbers: ["4530", "4503"], practice: ["6281", "6218"], prompt: "Show that 6281 > 6218." }, "en-US", null],
    ["gives-back", { numbers: ["4530", "4503"], practice: ["6281", "6218"], hints: ["6218 < 6281 because of the tens."] }, "en-US", null],
    ["numbers-only", { numbers: ["4530", "4503"], practice: ["6281", "6218"], prompt: "Compare 6,281 and 6,218." }, "en-US", null],
  ]));
  const task = result.plain.lesson.lesson.tasks[0];
  assert.deepEqual(task.allowed_operations, [{ kind: "card_tap", node: "section-01-moment-01-item-01" }]);
  assert.deepEqual(task.completion, { kind: "card_fact", node: "section-01-moment-01-item-01", fact: "complete" });
  assert.deepEqual(Object.fromEntries(Object.entries(task.start.values).map(([key, value]) => [short(key), value])), { a: 6281000, b: 6218000, compared: 0, marked: 0, signed: 0 });
  assert.equal(task.success_message, "✓ 6,281 > 6,218: the tens decide; the places after them don't matter.");
  assert.equal(result.plain.lesson.lesson.tasks.length, 1, "no typed question after the card's task: the sign is the check");
  for (const id of ["gives", "gives-back"]) {
    assert.deepEqual(result[id].lesson.lesson.tasks ?? [], [], id);
    assert.deepEqual(result[id].adjustments.map((each) => each.reason), ["practice_answer_in_words"], id);
  }
  assert.equal(result["numbers-only"].lesson.lesson.tasks.length, 1, "the practice's numbers alone are fine to write");
});

test("refusals name their reason and the card, so only the picture can be lost; none reaches OLL", () => {
  const result = withTrial(compileScript([
    ["same-pair", { numbers: ["4530", "4503"], practice: ["4530", "4503"] }, "en-US", null],
    ["reversed", { numbers: ["4530", "4503"], practice: ["4503", "4530"] }, "en-US", null],
    ["rewritten", { numbers: ["0.7", "0.70"], practice: ["0.7", "0.700"] }, "en-US", null],
    ["same-numeral", { numbers: ["4530", "4530"], practice: ["6281", "6218"] }, "en-US", null],
    ["lost-zero", { numbers: ["0.7", "0.7"], practice: ["0.4", "0.5"] }, "en-US", null],
    ["practice-numeral", { numbers: ["4530", "4503"], practice: ["6281", "6281"] }, "en-US", null],
    ["too-wide", { numbers: ["1234567", "0.5"], practice: ["6281", "6218"] }, "en-US", null],
  ]));
  const refusal = (id) => [result[id].error, result[id].capability, result[id].message];
  for (const id of ["same-pair", "reversed"]) assert.deepEqual(refusal(id).slice(0, 2), ["LESSON_PLAN_CAPABILITY_PARAMETER", "place_value_compare"], id);
  assert.match(result.reversed.message, /the same two numbers in the other order are the same pair/);
  assert.match(result.rewritten.message, /not the same values written another way/);
  assert.match(result["same-numeral"].message, /the same numeral, 4530: there is nothing to compare/);
  assert.match(result["lost-zero"].message, /0\.7 and 0\.70 are a pair: 0\.70 is mantissa 70, scale 2/);
  assert.match(result["practice-numeral"].message, /the practice pair: .*same_numeral/);
  assert.match(result["too-wide"].message, /too_wide/);
  for (const id of Object.keys(result)) assert.equal(result[id].capability, "place_value_compare", id);
});

test("section facts: the card in its own terms, once it is drawn; never the practice's answer", () => {
  const facts = api.SECTION_FACTS.place_value_compare;
  const numbers = [{ initial: 0.7 }, { initial: 0.7, written_decimals: 2 }, { initial: 0.4, written_decimals: 2 }, { initial: 0.4 }, { initial: 0 }].map((number) => ({ min: 0, max: 8, ...number }));
  assert.deepEqual(facts({ section: 1, mode: "create", numbers, state: new Map() }), {});
  const established = { capability: "place_value_compare", parameters: {}, numbers: [1, 2, 3, 4, 5] };
  const two = facts({ section: 2, mode: "reuse", established, numbers, state: new Map([[5, 2]]), language: "en-US" }).facts;
  assert.deepEqual(two, {
    numbers: [1, 2, 3, 4, 5], pair: ["0.7", "0.70"], columns: ["Ones", "Tenths", "Hundredths"], deciding_place: null, relation: "=",
    compared_now: 2,
    chart_now: [
      { column: "Ones", first: 0, second: 0, marked: "=" },
      { column: "Tenths", first: 7, second: 7, marked: "=" },
      { column: "Hundredths", first: 0, second: 0 },
    ],
    next: [
      { value: 3, does: "Hundredths: 0 and 0, the same. Every place is the same." },
      { value: 4, does: "So 0.7 = 0.70." },
    ],
    // Where the demonstration goes: compared to the sign (owner, 2026-11-27; information only).
    demonstration_to: { compared: 4 },
    after_class_practice: ["0.40", "0.4"],
  });
  const whole = facts({ section: 2, mode: "reuse", established, numbers: [4530, 4503, 6281, 6218, 0].map((initial) => ({ initial, min: 0, max: 8000 })), state: new Map([[5, 9]]), language: "zh-CN" }).facts;
  assert.deepEqual([whole.compared_now, whole.sign_chosen, whole.deciding_place, whole.chart_now.map((column) => column.marked)], [4, ">", "十位", ["=", "=", "≠", "doesn't matter"]]);
  assert.equal(JSON.stringify(whole).includes("6281 >"), false, "the practice's answer is never told");
  assert.deepEqual(facts({ section: 2, mode: "reuse", established, numbers: [4530, 4530, 6281, 6218, 0].map((initial) => ({ initial, min: 0, max: 8000 })), state: new Map(), language: "en-US" }), {}, "numbers the card does not take: no facts");
});

test("with the trial on, the model's first request describes the card; without it, nothing changes", () => {
  const capture = `
    const api = await import(${here("../lesson-plan.js")});
    let request;
    await api.generateLessonPlanWithModel(async (next) => { request = next; throw new Error("capture"); },
      { turn_id: "compare", learner_request: "Which is bigger, 0.625 or 0.7?", language: "en-US" }, { max_attempts_per_part: 1 }).catch(() => {});
    console.log(JSON.stringify({ text: JSON.stringify(request), bytes: Buffer.byteLength(request.prompt) }));
  `;
  const on = withTrial(capture), off = withTrial(capture, "");
  assert.ok(on.text.includes("compare_by_place"));
  assert.ok(on.text.includes("按数位比大小"));
  assert.equal(off.text.includes("place_value_compare"), false);
  console.log(`compare trial: first request prompt (UTF-8 bytes) +${on.bytes - off.bytes} B (${off.bytes} -> ${on.bytes})`);
});

// A stubbed generation run: the outline declares the card's four numbers, the second written with its zero (0.70 as
// mantissa 70, scale 2); the program supplies compared, reads the written decimals, the section draws the card.
const stubbedRun = ({ outlineNumbers = 4, trial = "place_value_compare", numbers = ["0.7", "0.70"], practice = ["0.40", "0.4"], steps = [8], modelKey = false } = {}) => withTrial(`
  const api = await import(${here("../lesson-plan.js")});
  const { comparePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
  const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
  const { judgePlaceValueCompare } = await import(${here("../scripts/place-value-compare-judge.mjs")});
  const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
  const written = ${JSON.stringify([...numbers, ...practice])};
  const plan = makeSamplePlanModelCompatible(comparePlan({ numbers: written.slice(0, 2), practice: written.slice(2), steps: ${JSON.stringify(steps)} }));
  const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
  const outline = stagedOutline(plan, drafts);
  outline.numbers = outline.numbers.slice(0, ${outlineNumbers});
  // As the model writes them: each number's mantissa and scale, its written zero kept (0.70: 70 and 2).
  outline.numbers.forEach((number, index) => {
    delete number.written_decimals;
    const text = written[index];
    if (text === undefined) return;
    const frac = text.split(".")[1] ?? "";
    number.initial = { mantissa: Number(text.replace(".", "")), scale: frac.length };
    if (${JSON.stringify(modelKey)}) number.written_decimals = 2;
  });
  const requests = [], adjustments = [];
  let generated, error;
  try {
    generated = await api.generateLessonPlanWithModel(async (request) => {
      requests.push(request);
      if (requests.length > 6) throw new Error("unexpected extra model request");
      if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
      if (request.label === "lesson-plan-outline") throw new Error("replacement outline asked");
      return JSON.stringify(drafts[request.section - 1]);
    }, { turn_id: "compare", learner_request: "Is 0.7 the same as 0.70?", language: "en-US" }, {
      max_attempts_per_part: 3, on_program_adjustment: (adjustment) => adjustments.push(adjustment),
    });
  } catch (caught) { error = caught.message; }
  const item = { id: "PC-14", expect: { need: "35P-06", numbers: ${JSON.stringify(numbers)}, relation: "=", deciding_place: null } };
  console.log(JSON.stringify(generated ? {
    beats: generated.lesson.steps[0].beats.map((beat) => beat.actions.map((action) => action.do === "animate" ? action.value : action.do)),
    card: generated.lesson.steps[0].beats[0].actions[0].content, tasks: generated.lesson.lesson.tasks,
    first: requests[0].prompt, later: requests.slice(1).map((request) => request.prompt).join("\\n"), verdict: judgePlaceValueCompare(item, generated.lesson),
    adjustments: adjustments.map(({ kind, reason }) => ({ kind, reason })),
  } : { error }, (key, value) => key === "first" ? undefined : value));
`, trial);

test("a stubbed generation run: 0.7 and 0.70 as the model writes them, the program's compared, the card to the sign, the practice", () => {
  for (const outlineNumbers of [4, 5]) {
    const result = stubbedRun({ outlineNumbers });
    assert.ok(!result.error, `${outlineNumbers}: ${result.error}`);
    assert.deepEqual(result.beats, [["write", "focus"], [4]], `${outlineNumbers}`);
    // The written zero, read from the model's own mantissa and scale, reaches the card: 0.7 and 0.70.
    assert.deepEqual([result.card.a, result.card.b, result.card.a_decimals, result.card.b_decimals, result.card.compared], [700, 700, 1, 2, 0], `${outlineNumbers}`);
    assert.deepEqual(result.tasks.map((task) => [task.completion.kind, task.completion.fact]), [["card_fact", "complete"]], `${outlineNumbers}`);
    assert.deepEqual(result.verdict.checks.filter((check) => !check.pass), [], `${outlineNumbers}`);
    assert.deepEqual(result.verdict.notes.filter((note) => !note.pass), [], `${outlineNumbers}`);
    assert.deepEqual(result.adjustments, [], `${outlineNumbers}`);
    // Section 2 is told where the demonstration stands; the written decimals are never sent back to the model.
    for (const fact of ['"sign_chosen":"="', '"pair":["0.7","0.70"]', '"after_class_practice":["0.40","0.4"]']) assert.ok(result.later.includes(fact), `${outlineNumbers}: ${fact}`);
    assert.equal(result.later.includes("written_decimals"), false);
  }
  // Whole numbers: nothing written beyond the value, no decimals bound.
  const whole = stubbedRun({ numbers: ["4530", "4503"], practice: ["6281", "6218"] });
  assert.ok(!whole.error, whole.error);
  assert.deepEqual([whole.card.a, whole.card.b, "a_decimals" in whole.card], [4530000, 4503000, false]);
});

test("the fixed sample (used for request hashes with the trial on) compiles through the full OLL validation", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { samplePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
    const compiled = api.compileAndValidateLessonPlan(makeSamplePlanModelCompatible(samplePlan("place_value_compare")), { language: "en-US" });
    console.log(JSON.stringify({ kinds: compiled.lesson.lesson.tasks.map((task) => task.completion.kind), adjustments: compiled.program_adjustments }));
  `);
  assert.deepEqual(result, { kinds: ["card_fact"], adjustments: [] });
});

test("written decimals are read only while a recipe that keeps them is offered: without the trial an outline is as before", () => {
  const off = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    console.log(JSON.stringify(api.LESSON_PLAN_CAPABILITY_NAMES.some((name) => api.LESSON_PLAN_CAPABILITY_REGISTRY[name].keeps_written_decimals === true)));
  `, "");
  assert.equal(off, false);
  const on = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    console.log(JSON.stringify(Object.entries(api.LESSON_PLAN_CAPABILITY_REGISTRY).filter(([, recipe]) => recipe.keeps_written_decimals === true).map(([name]) => name)));
  `);
  assert.deepEqual(on, ["place_value_compare"]);
});

test("a replay lays the card fresh again: compared back to 0, the learner's fields 0, the written decimals as written", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { comparePlan } = await import(${here("./sample-plans.mjs")});
    const { judgePlaceValueCompare } = await import(${here("../scripts/place-value-compare-judge.mjs")});
    const plan = comparePlan({ numbers: ["0.7", "0.70"], practice: ["0.40", "0.4"], steps: [8] });
    plan.sections[0].moments.push({ narration: "Once more.", restart_numbers: [5], actions: [{ action: "animate", number: 5, end_value: 8, duration_intent: "brief", timing: "during_speech" }] });
    const compiled = api.compileAndValidateLessonPlan(plan, { language: "en-US" });
    const item = { id: "PC-14", expect: { need: "35P-06", numbers: ["0.7", "0.70"], relation: "=", deciding_place: null } };
    const replay = compiled.lesson.steps[0].beats.find((beat) => beat.start?.kind === "replay");
    console.log(JSON.stringify({ start: replay?.start, verdict: judgePlaceValueCompare(item, compiled.lesson), adjustments: compiled.program_adjustments }));
  `);
  // Every variable of the card listed without a value: each back to its start (the pair and its written decimals as
  // written, nothing compared, judged or signed).
  assert.deepEqual(result.start.variables.map(short), ["a", "b", "a_decimals", "b_decimals", "compared", "marked", "signed"]);
  assert.equal(result.start.values, undefined);
  assert.deepEqual(result.verdict.checks.filter((check) => !check.pass), []);
  assert.deepEqual(result.adjustments, []);
});

test("a picture before the card on the same numbers: the card draws its copies with their written zero (#194)", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { comparePlan } = await import(${here("./sample-plans.mjs")});
    const { judgePlaceValueCompare } = await import(${here("../scripts/place-value-compare-judge.mjs")});
    // A number line on 0.7 and 0.70 in section 1; the compare card on the same numbers in section 2.
    const plan = comparePlan({ numbers: ["0.7", "0.70"], practice: ["0.40", "0.4"], steps: [8] });
    const s0 = plan.sections[0];
    const create = s0.moments[0].actions[0];
    const steps = s0.moments.slice(1);
    s0.moments = [s0.moments[0]];
    s0.reusable_items = [{ kind: "board_item", board_kind: "visual", capability: "number_line_compare" }];
    s0.moments[0].actions[0] = { ...create, content: { capability: "number_line_compare", parameters: {}, numbers: [1, 2] } };
    plan.sections[1].reusable_items = [{ kind: "board_item", board_kind: "visual", capability: "place_value_compare" }];
    plan.sections[1].moments.push({ narration: "Now by place.", actions: [{ ...create, reusable_item: 1 }] }, ...steps);
    plan.sections[1].student_activities = s0.student_activities;
    delete s0.student_activities;
    const compiled = api.compileAndValidateLessonPlan(plan, { language: "en-US" });
    const write = compiled.lesson.steps.flatMap((step) => step.beats).flatMap((beat) => beat.actions).find((action) => action.kind === "place_value_compare");
    const item = { id: "PC-14", expect: { need: "35P-06", numbers: ["0.7", "0.70"], relation: "=", deciding_place: null } };
    console.log(JSON.stringify({ card: write.content, verdict: judgePlaceValueCompare(item, compiled.lesson) }));
  `);
  assert.deepEqual([result.card.a, result.card.b, result.card.a_decimals, result.card.b_decimals], [700, 700, 1, 2]);
  assert.deepEqual(result.verdict.checks.filter((check) => !check.pass), []);
});

test("review of #198: the outline's compared is read over; a demonstration past the sign twice plays the sign once; a model's written_decimals key is dropped", () => {
  const result = withTrial(compileScript([
    ["eight", { numbers: ["4530", "4503"], practice: ["6281", "6218"], steps: [8] }, "en-US", null],
    ["equal-8-4", { numbers: ["0.7", "0.70"], practice: ["0.40", "0.4"], steps: [8, 4] }, "en-US", null],
  ]).replace("comparePlan(options)", "(() => { const plan = comparePlan(options); plan.numbers[4].initial = 8; return plan; })()"));
  for (const id of ["eight", "equal-8-4"]) assert.ok(!result[id].error, `${id}: ${result[id].message}`);
  assert.equal(result.eight.lesson.steps[0].beats[0].actions[0].content.compared, 0, "the card opens at 0 whatever the outline wrote");
  const values = (id) => result[id].lesson.steps[0].beats.flatMap((beat) => beat.actions).filter((action) => action.do === "animate").map((action) => action.value);
  assert.deepEqual(values("equal-8-4"), [4]);
  // The model's own written_decimals key is never read: only its mantissa and scale are.
  const stub = stubbedRun({ numbers: ["4530", "4503"], practice: ["6281", "6218"], modelKey: true });
  assert.ok(!stub.error, stub.error);
  assert.equal("a_decimals" in stub.card, false);
});

test("review of #198: the words for the sign give the practice's answer too", async () => {
  const words = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { comparePlan } = await import(${here("./sample-plans.mjs")});
    const out = {};
    for (const prompt of ["6281 is greater than 6218.", "6,218 is less than 6,281", "6281 大于 6218", "6218 小于 6281。", "6281 比 6218 大", "Is 6281 greater than 6218?", "Compare 6281 and 6218."]) {
      const compiled = api.compileAndValidateLessonPlan(comparePlan({ numbers: ["4530", "4503"], practice: ["6281", "6218"], prompt }), { language: "en-US" });
      out[prompt] = (compiled.lesson.lesson.tasks ?? []).length;
    }
    console.log(JSON.stringify(out));
  `);
  assert.deepEqual(Object.values(words), [0, 0, 0, 0, 0, 0, 1]);
});

test("a move of the pair or the practice pair is refused with what the number is to the card (#197)", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { comparePlan } = await import(${here("./sample-plans.mjs")});
    const out = {};
    for (const [number, value] of [[1, 4600], [3, 7000]]) {
      const plan = comparePlan({ numbers: ["4530", "4503"], practice: ["6281", "6218"] });
      plan.sections[0].moments.push({ narration: "Change it.", actions: [{ action: "animate", number, end_value: value, duration_intent: "brief", timing: "during_speech" }] });
      try { api.compileAndValidateLessonPlan(plan, { language: "en-US" }); out[number] = "compiled"; }
      catch (error) { out[number] = [error.code, error.capability, error.message]; }
    }
    console.log(JSON.stringify(out));
  `);
  assert.deepEqual(result[1].slice(0, 2), ["LESSON_PLAN_CARD_NUMBER_STAYS", "place_value_compare"]);
  assert.match(result[1][2], /lesson number 1 is the compare card's first number 4530, which stays as written; the demonstration moves lesson number 5, the places compared/);
  assert.match(result[3][2], /the compare card's practice first number 6281, which stays as written/);
});

test("pilot 2: no card's guidance gives the model a target value or a number to repeat; the practice is a plain invitation", () => {
  const all = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    console.log(JSON.stringify(Object.fromEntries(["place_value_trade", "make_ten", "place_value_times_ten", "place_value_compare"].map((name) => [name, api.LESSON_PLAN_CAPABILITY_REGISTRY[name].model_guidance]))));
  `, "place_value_trade,make_ten,place_value_times_ten,place_value_compare");
  for (const [name, guidance] of Object.entries(all)) {
    // PC-14, pilot 2: "after class ... by setting the comparison progress to 8" echoed "the practice target is 8".
    assert.equal(/数值写(?:8|10|列数)/u.test(guidance), false, `${name}: no practice target value`);
    assert.ok(guidance.includes("目标由程序定，这个数和它的值不在话里说；题目只请孩子课后在卡片上做练习的数"), `${name}: the target is the program's; the words invite`);
  }
  assert.ok(all.place_value_compare.includes("“课后在卡片上比一比 0.8 和 0.80”"));
  assert.ok(all.place_value_compare.includes("compared 和它的值只给程序用，话里不说"));
});
