// A picture on a tap card's lesson numbers goes at once (make-ten objective check 1; review of #186). Stubbed runs:
// the model's replies are fixed lesson plans, so these follow the generation path a live lesson takes.
// - Section 1: the lesson is planned again without the picture; a number line takes its whole family with it, and
//   when an outline puts a picture there again, the card goes instead, so the worst case is the lesson without the
//   card, never a lost lesson.
// - A later section, both pictures in it, in either order: the picture goes, and a card that supported it stays.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);
const run = (script, trial = "") => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
  env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: trial }, cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8",
}));

/**
 * Outlines in turn ([card, other picture, its numbers] or [null, picture] for a lesson without the card): the
 * bootstrap gives the first, each new outline the next. Section 1 draws the card, then the other picture.
 */
const stagedRun = (stages, trial = "") => run(`
  const api = await import(${here("../lesson-plan.js")});
  const { makeTenPlan, placeValuePlan, samplePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
  const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
  const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
  const build = ([card, other, numbers]) => {
    const plan = card === "chart" ? placeValuePlan({ number: 46, practice: 73, given: "numeral" })
      : card === "make_ten" ? makeTenPlan({ numbers: [8, 6], practice: [7, 5] }) : samplePlan(other);
    if (card && other) {
      const picture = samplePlan(other).sections[0].moments[0].actions.find((action) => action.action === "create");
      const at = plan.sections[0];
      at.reusable_items = [...(at.reusable_items ?? []), { kind: "board_item", board_kind: "visual", capability: other }];
      at.moments[0].actions.push({ ...structuredClone(picture), content: { ...structuredClone(picture.content), numbers }, placement: { relation: "new_region" }, reusable_item: at.reusable_items.length });
    }
    const compatible = makeSamplePlanModelCompatible(plan);
    const drafts = compatible.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: compatible.version, moments, student_activities }));
    return { outline: stagedOutline(compatible, drafts), drafts };
  };
  const stages = ${JSON.stringify(stages)}.map(build);
  let stage = 0;
  const requests = [], adjustments = [], outlinePrompts = [];
  let error, generated;
  try {
    generated = await api.generateLessonPlanWithModel(async (request) => {
      requests.push(request.label + (request.section ?? ""));
      if (requests.length > 16) throw new Error("too many requests");
      if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, stages[0].outline, bootstrapSectionFromExact(stages[0].outline, stages[0].drafts[0]));
      if (request.label === "lesson-plan-outline") { outlinePrompts.push(request.prompt); stage = Math.min(stage + 1, stages.length - 1); return JSON.stringify(stages[stage].outline); }
      return JSON.stringify(stages[stage].drafts[request.section - 1]);
    }, { turn_id: "sharing", learner_request: "How do I explain 8 + 6 by making a ten?", language: "en-US" }, {
      max_attempts_per_part: 3, on_program_adjustment: (adjustment) => adjustments.push([adjustment.kind, adjustment.section, adjustment.capability, adjustment.reason]),
    });
  } catch (caught) { error = caught.message.slice(0, 200); }
  console.log(JSON.stringify({ error, requests, adjustments: adjustments.filter(([kind]) => kind === "visual_removed"),
    offered: outlinePrompts.map((prompt) => (JSON.parse(prompt).visual_recipes ?? []).map((recipe) => recipe[0]).flat()),
    drawn: generated ? generated.lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions.filter((action) => action.do === "write").map((action) => action.kind))) : [] }));
`, trial);

test("section 1, the default-on chart: a number line on its number goes at once, with its whole family; the chart is drawn", () => {
  const result = stagedRun([["chart", "number_line_steps", [1]], ["chart"]]);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.requests.slice(0, 2), ["lesson-plan-bootstrap", "lesson-plan-outline"]);
  assert.deepEqual(result.adjustments, [["visual_removed", 1, "number_line_steps", "shares_tap_card_numbers"]]);
  // The new outline is offered no number line of any kind (they draw the same line from the same numbers).
  assert.ok(!result.offered[0].some((feature) => /number_line|number_steps/u.test(feature)), JSON.stringify(result.offered[0]));
  assert.ok(result.drawn.includes("place_value_chart"));
});

test("section 1, a second outline puts another picture on the card's numbers: the card goes, the lesson is made without it", () => {
  const result = stagedRun([["make_ten", "number_line_steps", [1, 2, 3]], ["make_ten", "rectangle_unit_square_array", [1, 2]], [null, "rectangle_unit_square_array"]], "make_ten");
  assert.equal(result.error, undefined);
  assert.deepEqual(result.adjustments, [
    ["visual_removed", 1, "number_line_steps", "shares_tap_card_numbers"],
    ["visual_removed", 1, "make_ten", "shares_tap_card_numbers"],
  ]);
  assert.equal(result.requests.filter((label) => label === "lesson-plan-outline").length, 2);
  assert.ok(result.drawn.length > 0, "a lesson is made");
  assert.equal(result.drawn.includes("make_ten"), false);
});

/** Section 2 draws the card and a number line on its numbers, in the given order; a line in section 1 on another number. */
const laterSection = (order) => run(`
  const api = await import(${here("../lesson-plan.js")});
  const { makeTenPlan, samplePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
  const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
  const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
  const order = ${JSON.stringify(order)};
  const build = (withLine) => {
    const base = makeTenPlan({ numbers: [8, 6], practice: [7, 5] });
    const s1 = base.sections[0];
    base.numbers = [...base.numbers, { initial: 14, min: 0, max: 20, label: "sum" }];
    const opening = samplePlan("number_line").sections[0].moments[0].actions.find((action) => action.action === "create");
    const plan = { ...base, sections: [
      { purpose: "Introduce the sum", reusable_items: [{ kind: "board_item", board_kind: "visual", capability: "number_line" }],
        moments: [{ narration: "Today: a number line.", actions: [{ ...structuredClone(opening), content: { ...structuredClone(opening.content), numbers: [7] }, placement: { relation: "new_region" }, reusable_item: 1 },
          { action: "focus", references: [{ source: "local_board_item", moment: 1, item: 1 }], intent: "show the line", timing: "after_speech" }] }] },
      { purpose: "Make a ten on the card", reusable_items: [...s1.reusable_items], moments: structuredClone(s1.moments), student_activities: s1.student_activities },
    ], close: { summary: "Review the card.", focus: [{ source: "reusable", section: 2, item: 1 }] } };
    if (withLine) {
      const line = samplePlan("number_line_steps").sections[0].moments[0].actions.find((action) => action.action === "create");
      const at = plan.sections[1];
      const lineAction = { ...structuredClone(line), content: { ...structuredClone(line.content), numbers: [1, 2, 3] }, placement: { relation: "new_region" } };
      const cardAction = at.moments[0].actions.shift();
      if (order === "line-first") {
        at.reusable_items = [{ kind: "board_item", board_kind: "visual", capability: "number_line_steps" }, ...at.reusable_items];
        at.moments[0].actions.unshift({ ...lineAction, reusable_item: 1 }, { ...cardAction, reusable_item: 2 });
      } else {
        at.reusable_items = [...at.reusable_items, { kind: "board_item", board_kind: "visual", capability: "number_line_steps" }];
        at.moments[0].actions.unshift({ ...cardAction, reusable_item: 1 }, { ...lineAction, reusable_item: 2 });
      }
      plan.close.focus = [{ source: "reusable", section: 2, item: order === "line-first" ? 2 : 1 }];
    }
    const compatible = makeSamplePlanModelCompatible(plan);
    const drafts = compatible.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: compatible.version, moments, student_activities }));
    const outline = stagedOutline(compatible, drafts);
    // Line first: the card supports the line (the review's shape), so withdrawing the line would take it too.
    if (withLine && order === "line-first") {
      const visuals = outline.course_visuals;
      const line = visuals.findIndex((visual) => visual.required_features.includes("number_steps"));
      const card = visuals.findIndex((visual) => visual.required_features.includes("make_ten_to_add"));
      visuals[card] = { ...visuals[card], relation: "supporting", related_visual: line + 1 };
    }
    return { outline, drafts };
  };
  const shared = build(true), clean = build(false);
  const requests = [], adjustments = [];
  let error, generated, sectionTwo = 0;
  try {
    generated = await api.generateLessonPlanWithModel(async (request) => {
      requests.push(request.label + (request.section ?? ""));
      if (requests.length > 12) throw new Error("too many requests");
      if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, shared.outline, bootstrapSectionFromExact(shared.outline, shared.drafts[0]));
      if (request.label === "lesson-plan-outline") return JSON.stringify(clean.outline);
      if (request.section === 2) sectionTwo += 1;
      // After the first try, section 2 is written without the line, as the withdrawal asks.
      return JSON.stringify((sectionTwo > 1 ? clean : shared).drafts[request.section - 1]);
    }, { turn_id: "sharing", learner_request: "How do I explain 8 + 6 by making a ten?", language: "en-US" }, {
      max_attempts_per_part: 3, on_program_adjustment: (adjustment) => adjustments.push([adjustment.kind, adjustment.section, adjustment.capability, adjustment.reason]),
    });
  } catch (caught) { error = caught.message.slice(0, 200); }
  console.log(JSON.stringify({ error, requests, adjustments: adjustments.filter(([kind]) => kind === "visual_removed"),
    drawn: generated ? generated.lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions.filter((action) => action.do === "write").map((action) => action.kind))) : [] }));
`, "make_ten");

for (const order of ["card-first", "line-first"]) {
  test(`a later section with both pictures, ${order}: the line goes at once and the card stays${order === "line-first" ? ", unlinked from the line it supported" : ""}`, () => {
    const result = laterSection(order);
    assert.equal(result.error, undefined);
    assert.deepEqual(result.requests, ["lesson-plan-bootstrap", "lesson-plan-section2", "lesson-plan-section2"]);
    assert.deepEqual(result.adjustments, [["visual_removed", 2, "number_line_steps", "shares_tap_card_numbers"]]);
    assert.deepEqual(result.drawn.filter((kind) => kind === "number_line" || kind === "make_ten"), ["number_line", "make_ten"]);
  });
}

test("section 1 with both outline restarts spent: the card is named and repaired as usual, as on main (review of #186, round 2)", () => {
  const result = run(`
    const api = await import(${here("../lesson-plan.js")});
    const { makeTenPlan, samplePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    const withPicture = (other, numbers) => {
      const plan = makeTenPlan({ numbers: [8, 6], practice: [7, 5] });
      const picture = samplePlan(other).sections[0].moments[0].actions.find((action) => action.action === "create");
      const at = plan.sections[0];
      at.reusable_items = [...(at.reusable_items ?? []), { kind: "board_item", board_kind: "visual", capability: other }];
      at.moments[0].actions.push({ ...structuredClone(picture), content: { ...structuredClone(picture.content), numbers }, placement: { relation: "new_region" }, reusable_item: at.reusable_items.length });
      return plan;
    };
    // An outline-owned fault of the unit-square array: a count of 12 beyond what it draws.
    const overflow = samplePlan("rectangle_unit_square_array");
    overflow.sections[0].student_activities = [];
    Object.assign(overflow.numbers[0], { initial: 12, min: 10, max: 14 });
    const staged = [withPicture("number_line_steps", [1, 2, 3]), overflow, withPicture("function_plot", [1])].map((plan) => {
      const compatible = makeSamplePlanModelCompatible(plan);
      const drafts = compatible.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: compatible.version, moments, student_activities }));
      return { outline: stagedOutline(compatible, drafts), drafts };
    });
    let stage = 0;
    const requests = [], rejected = [], adjustments = [];
    let error;
    try {
      await api.generateLessonPlanWithModel(async (request) => {
        requests.push(request.label + (request.section ?? ""));
        if (requests.length > 16) throw new Error("too many requests");
        if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, staged[0].outline, bootstrapSectionFromExact(staged[0].outline, staged[0].drafts[0]));
        if (request.label === "lesson-plan-outline") { stage = Math.min(stage + 1, staged.length - 1); return JSON.stringify(staged[stage].outline); }
        return JSON.stringify(staged[stage].drafts[request.section - 1]);
      }, { turn_id: "sharing", learner_request: "How do I explain 8 + 6 by making a ten?", language: "en-US" }, {
        max_attempts_per_part: 3, on_program_adjustment: (adjustment) => adjustments.push([adjustment.kind, adjustment.section, adjustment.capability, adjustment.reason]),
        on_rejected_part: (part) => rejected.push(part.error.code),
      });
    } catch (caught) { error = { message: caught.message.slice(0, 200), capability: caught.capability }; }
    console.log(JSON.stringify({ error, requests, rejected, adjustments: adjustments.filter(([kind]) => kind === "visual_removed") }));
  `, "make_ten");
  // Two restarts: the line (shared numbers), then the array (its own limit).
  assert.equal(result.requests.filter((label) => label === "lesson-plan-outline").length, 2);
  // Then the third outline's section 1 shares the card's numbers again: no restart is left, so the card is named and
  // section 1 is repaired three times, as on main (this stub never writes a repair).
  assert.deepEqual(result.requests.slice(-4, -1), ["lesson-plan-section1", "lesson-plan-section1", "lesson-plan-section1"]);
  assert.deepEqual(result.rejected.slice(2, 5), ["LESSON_PLAN_SHARED_NUMBER", "LESSON_PLAN_SHARED_NUMBER", "LESSON_PLAN_SHARED_NUMBER"]);
  // With the repairs spent on the card, section 1 is written once more without it (35P-04 objective run, PF-09: a
  // lesson is never lost to a picture). This stub writes the card again, so the lesson still ends there.
  assert.deepEqual(result.adjustments, [["visual_removed", 1, "number_line_steps", "shares_tap_card_numbers"], ["visual_removed", 1, "make_ten", "visual_limits_after_retries"]]);
  assert.equal(result.requests.at(-1), "lesson-plan-section1");
  assert.equal(result.requests.length, 8);
  assert.match(result.error.message, /course visual is not declared for this section/u);
});
