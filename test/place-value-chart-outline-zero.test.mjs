// Review 2 and the chart bisect (2026-11-27, trial off): the place-value chart lost its picture in about half of
// PV-03/04/05/08. Each time the outline declared the question's number as 0 (the chart's empty start), section 1 was
// refused four times with "the question's number is 0", which no section can fix (it cannot change an outline number),
// and the chart went after 7 to 11 calls. Now the chart's `outline_fault` finds it before section 1 is repaired: the
// outline is asked once more with the fact, the chart still offered; only a second 0 takes the chart out.
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
  // A chart building 8063 (PV-04's question), the practice 4052; \`zero\` declares the question's number as 0, the max
  // keeping the number (as the traces did), \`practice\` false declares the question's number alone.
  const chart = ({ zero, practice = true }) => {
    const stage = staged(sp.placeValuePlan({ number: 8063, practice: practice ? 4052 : undefined, given: "place_counts", typed: false }));
    if (zero) stage.outline.numbers[0] = { ...stage.outline.numbers[0], initial: 0 };
    return stage;
  };
  const generate = async (outlines) => {
    const log = { requests: [], prompts: [], rejected: [], adjustments: [] };
    let at = 0;
    try {
      const generated = await api.generateLessonPlanWithModel(async (request) => {
        log.requests.push(request.label + (request.section ?? ""));
        log.prompts.push(request.prompt);
        if (log.requests.length > 16) throw new Error("too many requests");
        if (request.label === "lesson-plan-bootstrap") return H.bootstrapModelResponse(request, outlines[0].outline, H.bootstrapSectionFromExact(outlines[0].outline, outlines[0].drafts[0]));
        if (request.label === "lesson-plan-outline") { at += 1; return JSON.stringify(outlines[at].outline); }
        return JSON.stringify(outlines[at].drafts[request.section - 1]);
      }, { turn_id: "chart-zero", learner_request: "8 thousands, 6 tens and 3 ones: what number is it?", language: "en-US" }, {
        max_attempts_per_part: 3,
        on_rejected_part: (part) => log.rejected.push([part.label + (part.section ?? ""), part.error.code, part.error.message.slice(0, 260)]),
        on_program_adjustment: (adjustment) => log.adjustments.push([adjustment.kind, adjustment.section, adjustment.capability ?? null, adjustment.reason]),
      });
      log.written = generated.lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions.filter((action) => action.do === "write").map((action) => action.kind)));
    } catch (caught) { log.error = caught.message.slice(0, 300); }
    const outlinePrompts = log.prompts.filter((_prompt, index) => log.requests[index] === "lesson-plan-outline").map((prompt) => JSON.parse(prompt));
    log.outlineAsks = outlinePrompts.map((prompt) => ({ fact: prompt.previous_validation_error?.message ?? prompt.previous_validation_error ?? null,
      chart: prompt.visual_recipes.some(([features]) => features.includes("place_value_parts")) }));
    delete log.prompts;
    return log;
  };
  ${body}
`], { env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "place_value_chart" }, cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" }));

const FACT = /the place_value_chart visual cannot start on the outline's numbers: the question's number is 0: there is nothing to build or pull apart\. Write the number itself as its value/u;

for (const practice of [true, false]) {
  test(`an outline that declares the chart's question number as 0${practice ? "" : " (and no practice number)"} is asked again once with the fact, the chart still offered; no section repair is spent`, () => {
    const result = run(`console.log(JSON.stringify(await generate([chart({ zero: true, practice: ${practice} }), chart({ zero: false, practice: ${practice} })])));`);
    assert.equal(result.error, undefined, result.error);
    assert.deepEqual(result.requests, ["lesson-plan-bootstrap", "lesson-plan-outline", "lesson-plan-section1", ...result.requests.slice(3)]);
    assert.ok(result.requests.filter((label) => label === "lesson-plan-section1").length === 1, JSON.stringify(result.requests));
    assert.deepEqual(result.rejected.map(([label, code]) => [label, code]), [["lesson-plan-section1", "LESSON_PLAN_OUTLINE_NUMBERS_REFUSED"]]);
    assert.match(result.rejected[0][2], FACT);
    assert.equal(result.outlineAsks.length, 1);
    assert.match(JSON.stringify(result.outlineAsks[0].fact), /the question's number is 0/u);
    assert.equal(result.outlineAsks[0].chart, true);
    assert.deepEqual(result.adjustments.filter(([kind]) => kind === "visual_removed"), []);
    assert.ok(result.written.includes("place_value_chart"), JSON.stringify(result.written));
  });
}

test("a second outline that declares 0 again takes the chart out, recorded; the third outline is asked without it", () => {
  const result = run(`console.log(JSON.stringify(await generate([chart({ zero: true }), chart({ zero: true }), chart({ zero: false })])));`);
  assert.deepEqual(result.requests.slice(0, 3), ["lesson-plan-bootstrap", "lesson-plan-outline", "lesson-plan-outline"]);
  assert.deepEqual(result.adjustments.filter(([kind]) => kind === "visual_removed"), [["visual_removed", 1, "place_value_chart", "outline_numbers_refused"]]);
  // (This stub still writes the chart into the third outline, which is refused as a visual no longer offered.)
  assert.deepEqual(result.outlineAsks.slice(0, 2).map(({ chart }) => chart), [true, false]);
});

test("an outline whose question number is the number itself makes the same calls as before: bootstrap, then the next section", () => {
  const result = run(`console.log(JSON.stringify(await generate([chart({ zero: false })])));`);
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result.rejected, []);
  assert.ok(!result.requests.includes("lesson-plan-outline"), JSON.stringify(result.requests));
  assert.ok(result.written.includes("place_value_chart"));
});
