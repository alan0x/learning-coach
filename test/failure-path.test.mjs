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
        on_program_adjustment: (adjustment) => log.adjustments.push([adjustment.kind, adjustment.section, adjustment.capability, adjustment.reason, ...(adjustment.close_summary ? [adjustment.close_summary] : [])]),
      });
      log.sections = generated.outline.sections.length;
      log.drafts = generated.drafts.length;
      log.numbers = generated.outline.numbers?.length ?? 0;
      log.steps = generated.lesson.steps.length;
      log.close = generated.lesson.close;
      const oll = await import("octos-lesson-language");
      log.oll_valid = oll.validateAuthoringSchema(generated.lesson).valid;
      try { oll.validateAuthoringLesson(generated.lesson, { assets: [] }); } catch (caught) { log.oll_valid = caught.message; }
      log.written = generated.lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions.filter((action) => action.do === "write").map((action) => action.kind)));
    } catch (caught) { log.error = { message: caught.message.slice(0, 300), code: caught.code, capability: caught.capability }; }
    return log;
  };
  const animate = (number, end_value) => ({ action: "animate", number, end_value, duration_intent: "brief", timing: "during_speech" });
  // A demonstration the card refuses (counted in animated off its path): a fault of the section, which the outline's
  // numbers do not decide, so the card's \`outline_fault\` (#188) leaves it to the section's repairs.
  const offPath = (plan) => { for (const moment of plan.sections[0].moments) for (const action of moment.actions) if (action.action === "animate" && action.number === 5) action.end_value = 0.5; return plan; };
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

test("PF-03: a later section's repairs spent on a move section 1's mat refuses: the move is left out and section 2 kept", () => {
  const passing = matLesson(6);
  const failing = matLesson(7);
  assert.equal(passing.error, undefined);
  assert.deepEqual(passing.requests, ["lesson-plan-bootstrap", "lesson-plan-section2"]);
  assert.equal(passing.sections, 2);
  assert.deepEqual(passing.adjustments.filter(([, , , reason]) => reason === "animation_left_out"), []);
  // The same first request for section 2: nothing changes before the fault.
  assert.deepEqual(sectionPrompt(failing, "lesson-plan-section2"), sectionPrompt(passing, "lesson-plan-section2"));
  // Three tries on the mat's move (a picture section 1 drew, which no withdrawal can take out); then the section is
  // compiled without that move, with no extra call (review of #190), recorded as #188 records a move left out.
  assert.equal(failing.error, undefined, JSON.stringify(failing.error));
  assert.deepEqual(failing.requests, ["lesson-plan-bootstrap", "lesson-plan-section2", "lesson-plan-section2", "lesson-plan-section2"]);
  assert.deepEqual([failing.sections, failing.drafts, failing.steps], [2, 2, 2]);
  assert.deepEqual(failing.adjustments.filter(([, , , reason]) => reason === "animation_left_out"), [["plot_view_adjusted", 2, null, "animation_left_out"]]);
  assert.deepEqual(failing.adjustments.filter(([kind]) => kind === "sections_removed"), []);
  assert.equal(failing.close.summary, "Review the main visual.");
  assert.equal(failing.oll_valid, true);
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
  if (!${goodCard}) offPath(card);
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

test("a note on a picture dropped as an outline was accepted does not outlive that outline (review of this change)", () => {
  // The card in section 1 and the chart in section 2 on the card's five numbers: the chart goes as the outline is
  // accepted. The card then faults three times and the lesson is planned again, on a clean two-section outline.
  const result = run(`
    const plan = sp.timesTenPlan({ amount: 0.3, target: 0.001, practice: [5, 0.01] });
    offPath(plan);
    plan.sections[1] = { purpose: "Build a number", reusable_items: [{ kind: "board_item", board_kind: "visual", capability: "place_value_chart" }], moments: [
      { narration: "A chart.", actions: [{ action: "create", kind: "visual", role: "main_visual", content: { capability: "place_value_chart", parameters: { given: "name" }, numbers: [1] }, placement: { relation: "new_region" }, reusable_item: 1 }] }] };
    const first = staged(plan);
    const clean = staged(sp.samplePlan("base_ten_trade"));
    let stage = first;
    const log = await generate((request) => {
      if (request.label === "lesson-plan-bootstrap") return bootstrap(request, first);
      if (request.label === "lesson-plan-outline") { stage = clean; return JSON.stringify(clean.outline); }
      return JSON.stringify(stage.drafts[request.section - 1]);
    }, "Why is 3330 333 tens?");
    console.log(JSON.stringify(log));
  `);
  assert.equal(result.error, undefined, JSON.stringify(result.error));
  assert.deepEqual(result.adjustments.filter(([kind]) => kind === "visual_removed"), [
    ["visual_removed", 2, "place_value_chart", "shares_tap_card_numbers"],
    ["visual_removed", 1, "place_value_times_ten", "visual_limits_after_retries"],
  ]);
  assert.deepEqual(result.requests, ["lesson-plan-bootstrap", "lesson-plan-section1", "lesson-plan-section1", "lesson-plan-section1", "lesson-plan-outline", "lesson-plan-section1", "lesson-plan-section2"]);
  // The first outline's section 1 was told nothing (its note was section 2's); the new outline's sections are told nothing.
  for (const label of ["lesson-plan-section1", "lesson-plan-section2"]) {
    for (const [index, prompt] of result.prompts.entries()) {
      if (result.requests[index] === label) assert.equal(JSON.parse(prompt).removed_picture, undefined, label);
    }
  }
});

test("endOutlineBefore: a part only the removed sections taught is recorded as not taught; a kept picture related to a removed one names no shorter outline", () => {
  const result = run(`
    const outline = {
      version: "0.1", title: "Two parts", goals: ["one", "two"], numbers: [{ initial: 1, min: 0, max: 2 }],
      request_coverage: [{ request_part: 1, treatment: "teach", sections: [1, 2] }, { request_part: 2, treatment: "teach", sections: [2] }],
      course_visuals: [{ capability: "number_line", create_section: 1, use_sections: [1, 2], relation: "primary", reusable_item: 1 }],
      sections: [
        { purpose: "First", allowed_capabilities: ["number_line"], reusable_items: [{ kind: "board_item", board_kind: "visual", capability: "number_line" }] },
        { purpose: "Second", allowed_capabilities: ["number_line"], reusable_items: [{ kind: "board_item", board_kind: "note" }] },
      ],
      close: { summary: "Review.", focus: [{ source: "reusable", section: 2, item: 1 }] },
    };
    const shorter = api.endOutlineBefore(outline, 2, 2);
    const related = structuredClone(outline);
    related.course_visuals = [
      { capability: "number_line", create_section: 2, use_sections: [2], relation: "primary", reusable_item: 1 },
      { capability: "coordinate_circle", create_section: 1, use_sections: [1], relation: "supporting", related_visual: 1, reusable_item: 1 },
    ];
    console.log(JSON.stringify({ shorter, related: api.endOutlineBefore(related, 2, 2) ?? null, first: api.endOutlineBefore(outline, 1, 2) ?? null }));
  `);
  assert.equal(result.shorter.sections.length, 1);
  assert.deepEqual(result.shorter.request_coverage, [
    { request_part: 1, treatment: "teach", sections: [1] },
    { request_part: 2, treatment: "unsupported", sections: [], reason: "The lesson ended before the section that was to teach this part." },
  ]);
  assert.deepEqual(result.shorter.course_visuals[0].use_sections, [1]);
  assert.deepEqual(result.shorter.close, { summary: "Review.", focus: [{ source: "reusable", section: 1, item: 1 }] });
  assert.equal(result.related, null);
  assert.equal(result.first, null);
});

test("PF-09 on a card the outline's numbers refuse (too few, or #188's outline_fault): section 1 is written exactly once more (review of #189)", () => {
  // Two restarts spent (the mat, then the chart, on their own limits), then a third outline whose card cannot start on
  // its numbers: three of the five it takes, or an amount it refuses (3330: one digit in one place, #188). The card goes
  // at once, and section 1 gets one call, not a new repair budget.
  const third = (variant) => run(`
    const one = (plan) => { plan.sections = [plan.sections[0]]; plan.close = { summary: "Review.", focus: [{ source: "reusable", section: 1, item: 1 }] }; return plan; };
    const mat = one(sp.samplePlan("base_ten_trade"));
    mat.numbers[1] = { initial: 33, min: 0, max: 40, label: "tens" };
    const chart = one(sp.placeValuePlan({ number: 300, practice: 73, given: "numeral" }));
    const card = staged(one(sp.timesTenPlan({ amount: 0.3, target: 0.001, practice: [5, 0.01] })));
    if (${JSON.stringify(variant)} === "missing") card.outline.numbers = card.outline.numbers.slice(0, 3);
    else card.outline.numbers[0] = { initial: 3330, min: 0, max: 3330, label: "the amount" };
    const stages = [staged(mat), staged(chart), card];
    let stage = 0;
    const log = await generate((request) => {
      if (request.label === "lesson-plan-bootstrap") return bootstrap(request, stages[0]);
      if (request.label === "lesson-plan-outline") { stage += 1; return JSON.stringify(stages[stage].outline); }
      // Written without the card, this stub still writes it: the one call faults.
      return JSON.stringify(stages[stage].drafts[0]);
    }, "Why does 300 hold 30 tens?");
    console.log(JSON.stringify(log));
  `);
  for (const [variant, reason] of [["missing", "outline_numbers_missing"], ["refused", "outline_numbers_refused"]]) {
    const result = third(variant);
    assert.deepEqual(result.adjustments.filter(([kind]) => kind === "visual_removed"), [
      ["visual_removed", 1, "base_ten_trade", "visual_limits_after_retries"],
      ["visual_removed", 1, "place_value_chart", "visual_limits_after_retries"],
      ["visual_removed", 1, "place_value_times_ten", reason],
    ], variant);
    assert.deepEqual(result.requests.slice(result.requests.lastIndexOf("lesson-plan-outline")), ["lesson-plan-outline", "lesson-plan-section1"], variant);
    assert.ok(result.error, `${variant}: the stub's one call faults, and no further call is made`);
  }
});

/**
 * 35P-04 run 2's PF-19 and 35P-07 run 1's PT-16: section 1 draws a number line (a line in steps, a rounding line);
 * section 2 moves its number to `end` (`as` "move"), which the line cannot mark ("choose another visual", a fault the
 * outline owns that names no recipe, at section 1's create). As "target", section 2 asks for it as a practice target
 * instead, which no move left out can fix. `spare` adds a fourth number, which only a number line section 2 draws uses.
 */
const lineThenMove = (capability, end, as = "move", spare = false) => run(`
  const plan = sp.samplePlan(${JSON.stringify(capability)});
  const target = plan.sections[0].student_activities[0];
  delete plan.sections[0].student_activities;
  for (const number of plan.numbers) delete number.student_control;
  if (${JSON.stringify(as)} === "move") plan.sections[1].moments[0].actions.push(animate(1, ${end}));
  else {
    plan.numbers[0].student_control = { kind: "slider", step: 0.01 };
    plan.sections[1].student_activities = [{ ...target, value: ${end}, tolerance: 0.001 }];
  }
  if (${spare}) {
    plan.numbers.push({ initial: 0.5, min: 0, max: 1, label: "a point", student_control: { kind: "slider", step: 0.05 } });
    const line = sp.samplePlan("number_line").sections[0].moments[0].actions.find((action) => action.action === "create");
    plan.sections[1].reusable_items = [{ kind: "board_item", board_kind: "visual", capability: "number_line" }];
    plan.sections[1].moments.unshift({ narration: "A number line.", actions: [{ ...structuredClone(line), content: { ...structuredClone(line.content), numbers: [plan.numbers.length] }, placement: { relation: "new_region" }, reusable_item: 1 }] });
  }
  const stage = staged(plan);
  const log = await generate((request) => request.label === "lesson-plan-bootstrap" ? bootstrap(request, stage) : JSON.stringify(stage.drafts[request.section - 1]),
    "Round 47 to the nearest ten.");
  console.log(JSON.stringify(log));
`);

for (const [trace, capability, bad, good] of [["PT-16", "number_line_rounding", 49.99, 49.5], ["PF-19", "number_line_steps", 7.03, 7]]) {
  test(`${trace}: a later section's repairs spent on section 1's ${capability} (a fault naming no recipe): the move is left out, section 2 kept`, () => {
    const passing = lineThenMove(capability, good);
    const failing = lineThenMove(capability, bad);
    assert.equal(passing.error, undefined, JSON.stringify(passing.error));
    assert.deepEqual([passing.requests, passing.sections], [["lesson-plan-bootstrap", "lesson-plan-section2"], 2]);
    assert.deepEqual(passing.adjustments.filter(([, , , reason]) => reason === "animation_left_out"), []);
    assert.deepEqual(sectionPrompt(failing, "lesson-plan-section2"), sectionPrompt(passing, "lesson-plan-section2"));
    assert.equal(failing.error, undefined, JSON.stringify(failing.error));
    // Three tries, no extra call: section 2 is compiled without the move.
    assert.deepEqual(failing.requests, ["lesson-plan-bootstrap", "lesson-plan-section2", "lesson-plan-section2", "lesson-plan-section2"]);
    assert.ok(failing.rejected.every((error) => error.code === "LESSON_PLAN_OUTLINE_VISUAL" && /sections\[0\]/u.test(error.path)), JSON.stringify(failing.rejected));
    assert.deepEqual([failing.sections, failing.steps], [2, 2]);
    assert.deepEqual(failing.adjustments.filter(([, , , reason]) => reason === "animation_left_out"), [["plot_view_adjusted", 2, null, "animation_left_out"]]);
    assert.deepEqual(failing.adjustments.filter(([kind]) => kind === "sections_removed"), []);
    assert.ok(failing.written.includes("number_line"), JSON.stringify(failing.written));
    assert.equal(failing.oll_valid, true);
  });
}

test("PF-19 as a practice target: no move to leave out, so the lesson ends at section 1, recorded, its close left out", () => {
  const passing = lineThenMove("number_line_steps", 6, "target");
  const failing = lineThenMove("number_line_steps", 7.03, "target");
  assert.equal(passing.error, undefined, JSON.stringify(passing.error));
  assert.deepEqual([passing.requests, passing.sections], [["lesson-plan-bootstrap", "lesson-plan-section2"], 2]);
  assert.equal(failing.error, undefined, JSON.stringify(failing.error));
  assert.deepEqual(failing.requests, ["lesson-plan-bootstrap", "lesson-plan-section2", "lesson-plan-section2", "lesson-plan-section2"]);
  assert.deepEqual([failing.sections, failing.drafts, failing.steps], [1, 1, 1]);
  assert.deepEqual(failing.adjustments.filter(([kind]) => kind === "sections_removed"), [["sections_removed", 2, "number_line_steps", "visual_limits_after_retries", "left_out"]]);
  assert.deepEqual(failing.adjustments.filter(([, , , reason]) => reason === "animation_left_out"), []);
  // The close the outline wrote for the whole lesson is left out (owner's call on #189); OLL requires a close, so it
  // keeps its focus on what is left, and the lesson passes OLL's own validation. The twin keeps the outline's close.
  assert.equal(passing.close.summary, "Review the main visual.");
  assert.equal(failing.close.summary, "");
  assert.equal(failing.close.focus.length, 1);
  assert.deepEqual([passing.oll_valid, failing.oll_valid], [true, true]);
});

test("a rounding line section 2 draws, with a number it cannot mark: the line is withdrawn and section 2 written once more", () => {
  const result = run(`
    const plan = sp.samplePlan("number_line_rounding");
    delete plan.sections[0].student_activities;
    for (const number of plan.numbers) delete number.student_control;
    const line = plan.sections[0].moments[0].actions[0];
    const note = (text) => ({ action: "create", kind: "note", role: "explanation", content: { title: "Rounding", items: [text] }, placement: { relation: "new_region" }, reusable_item: 1 });
    plan.sections[0] = { purpose: "Introduce rounding", reusable_items: [{ kind: "board_item", board_kind: "note" }], moments: [{ narration: "Rounding to tens.", actions: [note("47 is between 40 and 50.")] }] };
    const drawn = { purpose: "Round on a line", reusable_items: [{ kind: "board_item", board_kind: "visual", capability: "number_line_rounding" }], moments: [
      { narration: "A rounding line.", actions: [line] }, { narration: "Move it.", actions: [animate(1, 49.99)] }] };
    const written = { purpose: "Round on a line", reusable_items: [], moments: [{ narration: "Halfway is 45.",
      actions: [{ action: "create", kind: "text", role: "follow_up_explanation", content: { text: "47 rounds to 50." }, placement: { relation: "new_region" } }] }] };
    plan.close = { summary: "Review.", focus: [{ source: "reusable", section: 1, item: 1 }] };
    const withLine = staged({ ...plan, sections: [plan.sections[0], drawn] });
    const without = staged({ ...plan, sections: [plan.sections[0], written] });
    const log = await generate((request) => {
      if (request.label === "lesson-plan-bootstrap") return bootstrap(request, withLine);
      return JSON.stringify((JSON.parse(request.prompt).removed_picture ? without : withLine).drafts[request.section - 1]);
    }, "Round 47 to the nearest ten.");
    console.log(JSON.stringify(log));
  `);
  assert.equal(result.error, undefined, JSON.stringify(result.error));
  assert.deepEqual(result.requests, ["lesson-plan-bootstrap", "lesson-plan-section2", "lesson-plan-section2", "lesson-plan-section2", "lesson-plan-section2"]);
  assert.deepEqual(result.adjustments.filter(([kind]) => kind === "visual_removed" || kind === "sections_removed"), [["visual_removed", 2, "number_line_rounding", "visual_limits_after_retries"]]);
  assert.equal(result.sections, 2);
  assert.equal(result.written.includes("number_line"), false);
});

test("section 1 with both outline restarts spent, on a line fault naming no recipe: written once more without the line", () => {
  const result = run(`
    const one = (plan) => { plan.sections = [plan.sections[0]]; plan.close = { summary: "Review.", focus: [{ source: "reusable", section: 1, item: 1 }] }; return plan; };
    const mat = one(sp.samplePlan("base_ten_trade"));
    mat.numbers[1] = { initial: 33, min: 0, max: 40, label: "tens" };
    const chart = one(sp.placeValuePlan({ number: 300, practice: 73, given: "numeral" }));
    const line = one(sp.samplePlan("number_line_rounding"));
    delete line.sections[0].student_activities;
    for (const number of line.numbers) delete number.student_control;
    line.sections[0].moments[0].actions.push(animate(1, 49.99));
    const stages = [mat, chart, line].map(staged);
    const note = staged({ ...structuredClone(line), sections: [{ purpose: "Explain", reusable_items: [{ kind: "board_item", board_kind: "note" }], moments: [{ narration: "47 is nearer 50.",
      actions: [{ action: "create", kind: "note", role: "explanation", content: { title: "Rounding", items: ["47 rounds to 50."] }, placement: { relation: "new_region" }, reusable_item: 1 }] }] }] });
    let stage = 0;
    const log = await generate((request) => {
      if (request.label === "lesson-plan-bootstrap") return bootstrap(request, stages[0]);
      if (request.label === "lesson-plan-outline") { stage += 1; return JSON.stringify(stages[stage].outline); }
      if (request.part === "practice") return JSON.stringify({ answer_activities: [] });
      return JSON.stringify((JSON.parse(request.prompt).removed_picture ? note : stages[stage]).drafts[0]);
    }, "Round 47 to the nearest ten.");
    console.log(JSON.stringify(log));
  `);
  assert.equal(result.error, undefined, JSON.stringify(result.error));
  // The line's fault is not retried in section 1 (the outline owns it): one try, then one more without the line.
  assert.deepEqual(result.requests.slice(result.requests.lastIndexOf("lesson-plan-outline")), ["lesson-plan-outline", "lesson-plan-section1", "lesson-plan-section1", "lesson-plan-section1-practice"]);
  assert.deepEqual(result.adjustments.filter(([kind]) => kind === "visual_removed").at(-1), ["visual_removed", 1, "number_line_rounding", "outline_visual_fault"]);
  assert.match(sectionPrompt(result, "lesson-plan-section1", 7).removed_picture, /rounding/u);
  assert.ok(result.written.includes("note") && !result.written.includes("number_line"), JSON.stringify(result.written));
});

test("a lesson ended early compiles with a lesson number only the removed sections used (review of #189)", () => {
  const passing = lineThenMove("number_line_steps", 6, "target", true);
  const failing = lineThenMove("number_line_steps", 7.03, "target", true);
  assert.equal(passing.error, undefined, JSON.stringify(passing.error));
  assert.ok(passing.written.includes("number_line"), JSON.stringify(passing.written));
  assert.equal(failing.error, undefined, JSON.stringify(failing.error));
  assert.deepEqual([failing.sections, failing.steps, failing.numbers], [1, 1, 4]);
  assert.deepEqual(failing.adjustments.filter(([kind]) => kind === "sections_removed"), [["sections_removed", 2, "number_line_steps", "visual_limits_after_retries", "left_out"]]);
  assert.equal(failing.oll_valid, true);
});
