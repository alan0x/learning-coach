// A count a lesson states is never moved (Coach #78), and the refusal goes to the part of the plan that
// can fix it. Each test is a finding from #78's review, reproduced through the compiler or through the
// generation pipeline with a scripted model.
import assert from "node:assert/strict";
import test from "node:test";

const api = await import(new URL(process.env.COACH_BUILD ? `${process.env.COACH_BUILD}/lesson-plan.js` : "../lesson-plan.js", import.meta.url));
const { samplePlan, reusable } = await import(new URL("./sample-plans.mjs", import.meta.url));
const { modelResponseHelpers } = await import(new URL("./model-responses.mjs", import.meta.url));
const { compileAndValidateLessonPlan, generateLessonPlanWithModel } = api;
const H = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);

const refusal = (plan) => {
  try { compileAndValidateLessonPlan(plan); } catch (error) { return error; }
  return undefined;
};
const visualOf = (capability) => structuredClone(samplePlan(capability).sections[0].moments[0].actions
  .find((action) => action.action === "create" && action.kind === "visual"));
const arrayPlan = ({ initial = 5, min = 1, max = 10 } = {}) => {
  const plan = samplePlan("rectangle_unit_square_array");
  plan.sections[0].student_activities = [];
  Object.assign(plan.numbers[0], { initial, min, max });
  // An animation inside the plan's own range, so only the count check can refuse the plan.
  plan.sections[0].moments[0].actions.find((action) => action.action === "animate").end_value = initial <= 6 ? Math.max(Math.round(initial), 1) : Math.min(max, initial + 1);
  return plan;
};
// A new moment in section 1 with a visual of `capability` on `numbers`, first or last.
const addVisual = (plan, capability, numbers, { first = false } = {}) => {
  const section = plan.sections[0];
  section.reusable_items.push({ kind: "board_item", board_kind: "visual", capability });
  const visual = visualOf(capability);
  const moment = { narration: `Now the ${capability}.`, delivery: "patient", actions: [{ ...visual, content: { ...visual.content, numbers }, placement: { relation: "new_region" }, reusable_item: section.reusable_items.length }] };
  if (!first) { section.moments.push(moment); return plan; }
  section.moments.unshift(moment);
  for (const action of section.moments[1].actions) {
    if (action.references) action.references = action.references.map((reference) => reference.source === "local_board_item" ? { ...reference, moment: 2 } : reference);
  }
  return plan;
};
// The array created in section 2, after a board-only section 1.
const arrayInSectionTwo = (initials) => {
  const plan = arrayPlan({ initial: initials[0], min: Math.min(initials[0], 1), max: Math.max(initials[0] + 2, 8) });
  if (initials[1] !== undefined) Object.assign(plan.numbers[1], { initial: initials[1], min: Math.min(initials[1], 1), max: Math.max(initials[1] + 2, 8) });
  plan.sections = [{
    purpose: "Introduce the question",
    reusable_items: [{ kind: "board_item", board_kind: "math" }],
    moments: [{ narration: "First, the question.", delivery: "patient", actions: [
      { action: "create", kind: "math", role: "derivation", content: { latex: "A = l \\times w" }, placement: { relation: "new_region" }, reusable_item: 1 },
    ] }],
  }, plan.sections[0]];
  plan.close = { summary: "Review.", focus: [reusable(2, 1)] };
  return plan;
};
const scripted = (plan) => {
  const drafts = plan.sections.map(({ moments, student_activities }, index) => H.toModelSectionDraft({ version: plan.version, section: index + 1, moments, ...(student_activities ? { student_activities } : {}) }, plan));
  return { drafts, outline: H.stagedOutline(plan, drafts) };
};
const offered = (request) => JSON.parse(request.prompt).visual_recipes.map(([features]) => features[0]);

test("a count beyond one of its recipes is the outline's fault whichever visual comes first (review finding 2)", () => {
  for (const first of [false, true]) {
    const plan = arrayPlan({ initial: 12, min: 10, max: 14 });
    addVisual(plan, "circle_polygon_bounds", [1], { first });
    const error = refusal(plan);
    assert.equal(error?.code, "LESSON_PLAN_OUTLINE_VISUAL", `polygon ${first ? "first" : "last"}`);
    assert.equal(error.capability, "rectangle_unit_square_array");
    // The fault points at the outline's number, which is what a new outline changes (review finding 7).
    assert.equal(error.path, "$lessonPlan.numbers[0].initial");
  }
});

test("a decimal at a count's range edge is a rounding, not a shared-number fault (review finding 3)", () => {
  const low = arrayPlan({ initial: 1.4, min: 1.4, max: 8 });
  low.sections[0].moments[0].actions.find((action) => action.action === "animate").end_value = 6;
  assert.equal(compileAndValidateLessonPlan(low).lesson.lesson.variables[0].initial, 1);
  const high = arrayPlan({ initial: 5.6, min: 1, max: 5.6 });
  high.sections[0].moments[0].actions.find((action) => action.action === "animate").end_value = 3;
  assert.equal(compileAndValidateLessonPlan(high).lesson.lesson.variables[0].initial, 6);
});

test("a shared-number fault names the visual whose range pushed the count out (review finding 5)", () => {
  // A coordinate circle (whose positive range leaves 3 alone) binds the count first; a cube section (−1 to 1) narrows it.
  const plan = arrayPlan({ initial: 3, min: 1, max: 6 });
  addVisual(plan, "coordinate_circle", [1]);
  addVisual(plan, "cube_with_section", [1]);
  const error = refusal(plan);
  assert.equal(error?.code, "LESSON_PLAN_SHARED_NUMBER");
  assert.match(error.message, /drive the cube_with_section visual/);
  assert.match(error.path, /moments\[2\]/, "the cube's moment, not the circle's");
});

test("after first playable, a count its visual cannot draw is the section's to fix (review finding 1)", () => {
  // The outline has a number the array can draw (3), so the section creating the array can drive it with that one.
  const error = refusal(arrayInSectionTwo([12, 3]));
  assert.equal(error?.code, "LESSON_PLAN_NUMBER_NOT_DRAWABLE");
  assert.match(error.path, /^\$lessonPlan\.sections\[1\]/);
  assert.match(error.message, /drive this visual with a lesson number in that range/);
});

test("an outline whose numbers the array can never draw is refused before anything plays (review finding 1)", async () => {
  const { drafts, outline } = scripted(arrayInSectionTwo([12, 10]));
  const calls = [];
  const rejected = [];
  let published = 0;
  await assert.rejects(generateLessonPlanWithModel(async (request) => {
    calls.push(request.label);
    if (request.label === "lesson-plan-bootstrap") return H.bootstrapModelResponse(request, outline, drafts[0]);
    if (request.label === "lesson-plan-outline") {
      assert.ok(!offered(request).includes("unit_square_array"), "the new outline is asked without the array");
      throw new Error("stop: outline re-asked");
    }
    return H.sectionModelResponse(request, drafts);
  }, { turn_id: "count-outline", learner_request: "area of a 12 by 10 rectangle", input_modality: "text", request_source: "self_contained" }, {
    on_playable_prefix: () => { published += 1; },
    on_rejected_part: (part) => { rejected.push(part.error); },
  }), /stop: outline re-asked/);
  assert.equal(published, 0);
  assert.deepEqual(calls, ["lesson-plan-bootstrap", "lesson-plan-outline"]);
  assert.equal(rejected[0]?.code, "LESSON_PLAN_OUTLINE_VISUAL");
  assert.equal(rejected[0].path, "$lessonPlanOutline.course_visuals[0]");
});

test("excluding the array never excludes a number line beside it (review findings 4 and 6)", async () => {
  // An array of 12 beside a number line. The array is excluded; the model's next outline uses it again.
  const plan = arrayPlan({ initial: 12, min: 10, max: 14 });
  plan.sections = [plan.sections[0]];
  const line = samplePlan("number_line");
  const base = plan.numbers.length;
  plan.numbers.push(...structuredClone(line.numbers));
  const lineVisual = visualOf("number_line");
  plan.sections[0].reusable_items.push({ kind: "board_item", board_kind: "visual", capability: "number_line" });
  plan.sections[0].moments.push({ narration: "And a number line.", delivery: "patient", actions: [{ ...lineVisual, content: { ...lineVisual.content, numbers: lineVisual.content.numbers.map((number) => number + base) }, placement: { relation: "new_region" }, reusable_item: 2 }] });
  const { drafts, outline } = scripted(plan);
  const outlineRequests = [];
  await generateLessonPlanWithModel(async (request) => {
    if (request.label === "lesson-plan-bootstrap") return H.bootstrapModelResponse(request, outline, drafts[0]);
    if (request.label === "lesson-plan-outline") {
      outlineRequests.push(offered(request));
      if (outlineRequests.length > 2) throw new Error("stop");
      return JSON.stringify(request.response_schema.properties?.disposition ? { disposition: "generate_lesson", learner_response: "", course: outline } : outline);
    }
    return H.sectionModelResponse(request, drafts);
  }, { turn_id: "count-number-line", learner_request: "12 squares and a jump", input_modality: "text", request_source: "self_contained" }).catch(() => {});
  assert.ok(outlineRequests.length >= 2);
  for (const recipes of outlineRequests) {
    assert.ok(!recipes.includes("unit_square_array"));
    assert.ok(recipes.includes("number_line"), "the number line was never at fault");
  }
});
