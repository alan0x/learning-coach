// Failure paths found in the times-ten objective run (35P-04, objective check 1), each modelled on its trace. Stubbed
// runs: the model's replies are fixed lesson plans, so these follow the generation path a live lesson takes. Each
// fix has a passing twin that makes the same calls with the same prompts: only a run that faults changes.
// - PF-03: a later section's repairs spent on a picture an earlier section drew end the lesson at its published sections.
// - PF-09: section 1 still faulting on a picture with both outline restarts spent is written once more without it.
// - PF-10: two pictures that must share lesson numbers (from their minimum counts alone): the one on fewer goes
//   before any section is written.
// - PF-17: a chart in an outline that declares no number goes at once (min_lesson_numbers).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);
const run = (body) => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
  const api = await import(${here("../lesson-plan.js")});
  const sp = await import(${here("./sample-plans.mjs")});
  const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
  const H = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
  const staged = (plan) => {
    const compatible = sp.makeSamplePlanModelCompatible(plan);
    const drafts = compatible.sections.map(({ moments, student_activities }, index) => H.toModelSectionDraft({ section: index + 1, version: compatible.version, moments, student_activities }));
    return { outline: H.stagedOutline(compatible, drafts), drafts };
  };
  const bootstrap = (request, stage) => H.bootstrapModelResponse(request, stage.outline, H.bootstrapSectionFromExact(stage.outline, stage.drafts[0]));
  const generate = async (reply, learner_request) => {
    const log = { requests: [], prompts: [], rejected: [], adjustments: [] };
    try {
      const generated = await api.generateLessonPlanWithModel(async (request) => {
        log.requests.push(request.label + (request.section ?? "") + (request.part === "practice" ? "-practice" : ""));
        log.prompts.push(request.prompt);
        if (log.requests.length > 24) throw new Error("too many requests");
        return reply(request, log);
      }, { turn_id: "failure-path", learner_request, language: "en-US" }, {
        max_attempts_per_part: 3,
        on_rejected_part: (part) => log.rejected.push(part.error),
        on_program_adjustment: (adjustment) => log.adjustments.push([adjustment.kind, adjustment.section, adjustment.capability, adjustment.reason]),
      });
      log.sections = generated.outline.sections.length;
      log.drafts = generated.drafts.length;
      log.steps = generated.lesson.steps.length;
      log.written = generated.lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions.filter((action) => action.do === "write").map((action) => action.kind)));
    } catch (caught) { log.error = { message: caught.message.slice(0, 300), code: caught.code, capability: caught.capability }; }
    return log;
  };
  const animate = (number, end_value) => ({ action: "animate", number, end_value, duration_intent: "brief", timing: "during_speech" });
  ${body}
`], {
  env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "place_value_times_ten,make_ten" }, cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8",
}));

const sectionPrompt = (log, label, nth = 0) => JSON.parse(log.prompts.filter((_prompt, index) => log.requests[index] === label)[nth]);

/** PF-03's shape: section 1 draws the trading mat; section 2 trades on it, to `end` loose ones (26 can go to 16 or 6). */
const matLesson = (end) => run(`
  const plan = sp.samplePlan("rectangle_unit_square_array");
  plan.numbers = [{ initial: 26, min: 0, max: 59, label: "loose ones" }, { initial: 9, min: 0, max: 34, label: "tens" }];
  const first = plan.sections[0].moments[0];
  first.actions = first.actions.filter((action) => action.action !== "animate");
  first.actions[0].content = { capability: "base_ten_trade", parameters: {}, numbers: [1, 2] };
  plan.sections[0].reusable_items[0].capability = "base_ten_trade";
  delete plan.sections[0].student_activities;
  plan.sections[1].moments = [{ narration: "Ten ones make a ten.", actions: [animate(1, ${end})] }];
  delete plan.sections[1].student_activities;
  const stage = staged(plan);
  const log = await generate((request) => request.label === "lesson-plan-bootstrap" ? bootstrap(request, stage) : JSON.stringify(stage.drafts[request.section - 1]),
    "I have 9 tens and 26 ones. What number is that?");
  console.log(JSON.stringify(log));
`);

test("PF-03: a later section's repairs spent on section 1's mat end the lesson at its published section, recorded", () => {
  const passing = matLesson(6);
  const failing = matLesson(7);
  assert.equal(passing.error, undefined);
  assert.deepEqual(passing.requests, ["lesson-plan-bootstrap", "lesson-plan-section2"]);
  assert.equal(passing.sections, 2);
  assert.deepEqual(passing.adjustments.filter(([kind]) => kind === "sections_removed"), []);
  // The same first request for section 2: nothing changes before the fault.
  assert.deepEqual(sectionPrompt(failing, "lesson-plan-section2"), sectionPrompt(passing, "lesson-plan-section2"));
  // Three tries on the mat (a picture section 1 drew, which no withdrawal can take out), then the lesson ends at section 1.
  assert.equal(failing.error, undefined, JSON.stringify(failing.error));
  assert.deepEqual(failing.requests, ["lesson-plan-bootstrap", "lesson-plan-section2", "lesson-plan-section2", "lesson-plan-section2"]);
  assert.deepEqual([failing.sections, failing.drafts, failing.steps], [1, 1, 1]);
  assert.deepEqual(failing.adjustments.filter(([kind]) => kind === "sections_removed"), [["sections_removed", 2, "base_ten_trade", "visual_limits_after_retries"]]);
  assert.ok(failing.written.includes("base_ten_trade"));
  // Every try's fault is recorded, the third too, with the picture it was on (trace only).
  assert.equal(failing.rejected.length, 3);
  assert.ok(failing.rejected.every((error) => error.capability === "base_ten_trade"), JSON.stringify(failing.rejected));
});

test("rejection records name the picture (trace only); the repair prompt's error is as before, with no capability", () => {
  const failing = matLesson(7);
  const repair = JSON.parse(sectionPrompt(failing, "lesson-plan-section2", 1).previous_validation_error);
  assert.deepEqual(Object.keys(repair).sort(), ["code", "message", "path"]);
  assert.equal(failing.rejected[0].capability, "base_ten_trade");
});

/**
 * PF-09's shape: the mat, then the chart, then the times-ten card, each faulting in section 1 on its own limits. The
 * third outline's section 1 holds only the card. `goodCard` makes the third outline's section 1 valid (the twin).
 */
const threeOutlines = (goodCard) => run(`
  const one = (plan) => { plan.sections = [plan.sections[0]]; plan.close = { summary: "Review.", focus: [{ source: "reusable", section: 1, item: 1 }] }; return plan; };
  const mat = one(sp.samplePlan("base_ten_trade"));
  mat.numbers[1] = { initial: 33, min: 0, max: 40, label: "tens" };
  const chart = one(sp.placeValuePlan({ number: 300, practice: 73, given: "numeral" }));
  const card = one(sp.timesTenPlan({ amount: 0.3, target: 0.001, practice: [5, 0.01] }));
  if (!${goodCard}) card.numbers[0] = { initial: 3330, min: 0, max: 3330, label: "the amount" };
  const stages = [mat, chart, card].map(staged);
  // Written without the card, section 1 fills the note slot it is given.
  const note = staged({ ...structuredClone(card), sections: [{ purpose: "Explain", reusable_items: [{ kind: "board_item", board_kind: "note" }], moments: [{ narration: "Three tenths are three hundred thousandths.",
    actions: [{ action: "create", kind: "note", role: "explanation", content: { title: "Counting in thousandths", items: ["0.3 is 300 thousandths."] }, placement: { relation: "new_region" }, reusable_item: 1 }] }] }] });
  let stage = 0;
  const log = await generate((request) => {
    if (request.label === "lesson-plan-bootstrap") return bootstrap(request, stages[0]);
    if (request.label === "lesson-plan-outline") { stage += 1; return JSON.stringify(stages[stage].outline); }
    if (request.part === "practice") return JSON.stringify({ answer_activities: [] });
    return JSON.stringify((JSON.parse(request.prompt).removed_picture ? note : stages[stage]).drafts[0]);
  }, "Why does 300 hold 30 tens?");
  console.log(JSON.stringify(log));
`);

test("PF-09: with both outline restarts spent, section 1 is written once more without the card, in a note slot it is given", () => {
  const passing = threeOutlines(true);
  const failing = threeOutlines(false);
  const before = ["lesson-plan-bootstrap", "lesson-plan-section1", "lesson-plan-section1", "lesson-plan-section1",
    "lesson-plan-outline", "lesson-plan-section1", "lesson-plan-section1", "lesson-plan-section1", "lesson-plan-outline"];
  assert.equal(passing.error, undefined, JSON.stringify(passing.error));
  assert.deepEqual(passing.requests, [...before, "lesson-plan-section1", "lesson-plan-section1-practice"]);
  assert.equal(failing.error, undefined, JSON.stringify(failing.error));
  // Three tries on the card, then exactly one more call, outside the repair budget.
  assert.deepEqual(failing.requests, [...before, "lesson-plan-section1", "lesson-plan-section1", "lesson-plan-section1", "lesson-plan-section1", "lesson-plan-section1-practice"]);
  // Up to the third outline (whose numbers differ), the twin made the same calls with the same prompts.
  assert.deepEqual(failing.prompts.slice(0, before.length), passing.prompts.slice(0, before.length));
  const last = sectionPrompt(failing, "lesson-plan-section1", 9);
  assert.match(last.removed_picture, /count_in_another_unit/u);
  assert.equal(last.previous_validation_error, undefined);
  assert.deepEqual(failing.adjustments.filter(([kind]) => kind === "visual_removed" || kind === "reusable_item_added"), [
    ["visual_removed", 1, "base_ten_trade", "visual_limits_after_retries"],
    ["visual_removed", 1, "place_value_chart", "visual_limits_after_retries"],
    ["visual_removed", 1, "place_value_times_ten", "visual_limits_after_retries"],
    ["reusable_item_added", 1, null, "section_lost_its_only_item"],
  ]);
  assert.equal(failing.written.includes("place_value_times_ten"), false);
  assert.ok(failing.written.includes("note"), JSON.stringify(failing.written));
});

/**
 * PF-10's shape: the chart in section 1 and the times-ten card in section 2. With five lesson numbers the chart (one at
 * least) and the card (five) must share one; with a sixth they need not.
 */
const chartThenCard = (spare) => run(`
  const plan = sp.timesTenPlan({ amount: 0.3, target: 0.001, practice: [5, 0.01] });
  const cardSection = plan.sections[0];
  const chartNumber = ${spare} ? 6 : 1;
  if (${spare}) plan.numbers.push({ initial: 46, min: 0, max: 46, label: "a number to build" });
  const chartSection = { purpose: "Build a number", reusable_items: [{ kind: "board_item", board_kind: "visual", capability: "place_value_chart" }], moments: [
    { narration: "A chart.", actions: [{ action: "create", kind: "visual", role: "main_visual", content: { capability: "place_value_chart", parameters: { given: "name" }, numbers: [chartNumber] }, placement: { relation: "new_region" }, reusable_item: 1 }] },
    ...sp.placeValueSteps(${spare} ? 46 : 0.3).map((value, index) => ({ narration: "Step " + (index + 1) + ".", actions: [animate(chartNumber, value)] })),
  ] };
  const noteSection = { purpose: "Build a number", reusable_items: [{ kind: "board_item", board_kind: "note" }], moments: [{ narration: "Three tenths.",
    actions: [{ action: "create", kind: "note", role: "explanation", content: { title: "Tenths", items: ["0.3 is three tenths."] }, placement: { relation: "new_region" }, reusable_item: 1 }] }] };
  const withChart = staged({ ...plan, sections: [chartSection, cardSection], close: { summary: "Review.", focus: [{ source: "reusable", section: 2, item: 1 }] } });
  const withNote = staged({ ...plan, sections: [noteSection, cardSection], close: { summary: "Review.", focus: [{ source: "reusable", section: 2, item: 1 }] } });
  const log = await generate((request) => {
    if (request.label === "lesson-plan-bootstrap") return bootstrap(request, withChart);
    return JSON.stringify((JSON.parse(request.prompt).removed_picture ? withNote : withChart).drafts[request.section - 1]);
  }, "Why is 3 tenths 300 thousandths?");
  console.log(JSON.stringify(log));
`);

test("PF-10: a picture that must share the card's numbers goes as the outline is accepted, before any section call", () => {
  const failing = chartThenCard(false);
  assert.equal(failing.error, undefined, JSON.stringify(failing.error));
  // The chart and the card's adjustments come first, before any section is asked for; the bootstrap's section 1 (with
  // the chart) is set aside and section 1 is written once, told the picture is gone.
  assert.deepEqual(failing.adjustments.slice(0, 2), [
    ["visual_removed", 1, "place_value_chart", "shares_tap_card_numbers"],
    ["reusable_item_added", 1, null, "section_lost_its_only_item"],
  ]);
  assert.deepEqual(failing.requests, ["lesson-plan-bootstrap", "lesson-plan-section1", "lesson-plan-section2"]);
  assert.match(sectionPrompt(failing, "lesson-plan-section1").removed_picture, /place_value_parts/u);
  assert.deepEqual(failing.rejected, []);
  assert.equal(failing.written.includes("place_value_chart"), false);
  assert.ok(failing.written.includes("place_value_times_ten"));
});

test("PF-10's twin: with a spare number the chart (one) and the card (five) fit six numbers, and nothing is dropped", () => {
  const passing = chartThenCard(true);
  assert.equal(passing.error, undefined, JSON.stringify(passing.error));
  assert.deepEqual(passing.requests, ["lesson-plan-bootstrap", "lesson-plan-section2"]);
  assert.deepEqual(passing.adjustments.filter(([kind]) => kind === "visual_removed" || kind === "reusable_item_added"), []);
  assert.equal(sectionPrompt(passing, "lesson-plan-section2").removed_picture, undefined);
  assert.ok(passing.written.includes("place_value_chart") && passing.written.includes("place_value_times_ten"));
});

test("certain sharing is read from minimum counts only: a tie, a fit or a card the outline cannot start names nothing", () => {
  const result = run(`
    const outline = (count, ...capabilities) => ({ numbers: Array.from({ length: count }, () => ({ initial: 1, min: 0, max: 1 })),
      course_visuals: capabilities.map((capability, index) => ({ capability, create_section: index + 1, use_sections: [index + 1], relation: "primary", reusable_item: 1 })) });
    console.log(JSON.stringify([
      api.certainNumberSharing(outline(5, "place_value_chart", "place_value_times_ten")),
      api.certainNumberSharing(outline(5, "place_value_times_ten", "place_value_chart")),
      api.certainNumberSharing(outline(6, "place_value_chart", "place_value_times_ten")) ?? null,
      api.certainNumberSharing(outline(6, "make_ten", "place_value_times_ten")),
      api.certainNumberSharing(outline(11, "make_ten", "place_value_times_ten")) ?? null,
      api.certainNumberSharing(outline(5, "place_value_trade", "place_value_times_ten")) ?? null,
      api.certainNumberSharing(outline(4, "place_value_chart", "place_value_times_ten")) ?? null,
      api.certainNumberSharing(outline(1, "place_value_chart", "number_line")) ?? null,
    ]));
  `);
  assert.deepEqual(result, [
    { visual: 1, capability: "place_value_chart", card: "place_value_times_ten" },
    { visual: 2, capability: "place_value_chart", card: "place_value_times_ten" },
    null,
    { visual: 2, capability: "place_value_times_ten", card: "make_ten" },
    null,
    // Two cards on five numbers each: a tie names neither (their own compile checks decide).
    null,
    // The card starts on more numbers than the outline declares: it goes itself, at once (outline_numbers_missing).
    null,
    // A number line declares no minimum.
    null,
  ]);
});

/** PF-17's shape: the chart chosen in an outline that declares `numbers` lesson numbers. */
const chartOutline = (numbers) => run(`
  const plan = sp.placeValuePlan({ number: 46, given: "name", typed: false });
  plan.sections = [plan.sections[0]];
  plan.close = { summary: "Review.", focus: [{ source: "reusable", section: 1, item: 1 }] };
  const stage = staged(plan);
  stage.outline.numbers = stage.outline.numbers.slice(0, ${numbers});
  const log = await generate((request) => {
    if (request.label === "lesson-plan-bootstrap") return bootstrap(request, stage);
    throw new Error("stop");
  }, "Build 46 on the chart.");
  console.log(JSON.stringify(log));
`);

test("PF-17: a chart in an outline that declares no number goes at once, never a section's attempts; one number is enough", () => {
  const failing = chartOutline(0);
  assert.deepEqual(failing.adjustments.filter(([kind]) => kind === "visual_removed"), [["visual_removed", 1, "place_value_chart", "outline_numbers_missing"]]);
  assert.deepEqual(failing.requests, ["lesson-plan-bootstrap", "lesson-plan-outline"]);
  // A chart on one number (no practice number) compiles today: it is kept, and the bootstrap's lesson is the lesson.
  const passing = chartOutline(1);
  assert.equal(passing.error, undefined, JSON.stringify(passing.error));
  assert.deepEqual(passing.adjustments.filter(([kind]) => kind === "visual_removed"), []);
  assert.ok(passing.written.includes("place_value_chart"));
});
