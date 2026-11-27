// Lesson variables across a lesson's parts, and the pictures a section can lose (design note "second example and
// copies", 2026-11-27, PR 1):
// - a lesson number is declared only once the lesson uses it, so a later part never drops a variable an earlier part
//   declared: Learn rebuilds its runtime when lesson.open changes, and a saved program missing a variable does not
//   extend, so the class started over (a chart first drawn in section 2 read numbers section 1's part had declared);
// - too many variables blames a picture the section being written drew, not a card an earlier section drew;
// - a section can lose more than one picture, each once.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);
const run = (script, trial = "") => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
  env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: trial }, cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8",
}));

test("a chart first drawn in section 2: section 1's part declares none of its numbers, and Learn keeps its place when section 2 arrives", () => {
  const result = run(`
    const api = await import(${here("../lesson-plan.js")});
    const { placeValuePlan } = await import(${here("./sample-plans.mjs")});
    const { normalizeAuthoringLesson } = await import("octos-lesson-language");
    const { BrowserLessonSession } = await import("octos-lesson-language/web-runtime");
    const base = placeValuePlan({ number: 46, practice: 73, given: "name" });
    const intro = { purpose: "Introduce", reusable_items: [{ kind: "board_item", board_kind: "note" }], moments: [{ narration: "Let us read 46.", actions: [
      { action: "create", kind: "note", role: "main_explanation", content: { title: "46", items: ["4 tens and 6 ones"] }, placement: { relation: "new_region" }, reusable_item: 1 }] }] };
    const plan = (sections) => ({ ...structuredClone(base), sections: structuredClone(sections), close: { summary: "Review.", focus: [{ source: "reusable", section: 1, item: 1 }] } });
    const parts = [[intro], [intro, base.sections[0]]].map((sections) => api.compileAndValidateLessonPlan(plan(sections), { language: "en-US" }).lesson);
    class Store { values = new Map(); o = new Map(); t = new Map();
      load(k) { return structuredClone(this.values.get(k)); } save(k, c) { this.values.set(k, structuredClone(c)); } remove(k) { this.values.delete(k); }
      loadStudentOperations(k) { return structuredClone(this.o.get(k)); } saveStudentOperations(k, l) { this.o.set(k, structuredClone(l)); } removeStudentOperations(k) { this.o.delete(k); }
      loadStudentTaskProgress(k) { return structuredClone(this.t.get(k)); } saveStudentTaskProgress(k, l) { this.t.set(k, structuredClone(l)); } removeStudentTaskProgress(k) { this.t.delete(k); } }
    // As Learn opens a delivered program (octos-learn oll-artifacts.test.ts): no lesson.close, the runtime opened on
    // lesson.open with the program as its restore guard, then the rest appended.
    const host = { lessonId: "parts", boardId: "b", baseRevision: 0, regionIntent: "new_topic" };
    const open = (store, lesson) => {
      const program = normalizeAuthoringLesson(lesson, host).filter((event) => event.event !== "lesson.close");
      const session = new BrowserLessonSession([structuredClone(program[0])], store, "parts", { incremental: true, reducedMotion: true, deliveredProgram: structuredClone(program) });
      session.appendEvents(structuredClone(program.slice(1)));
      return session;
    };
    const store = new Store();
    const first = open(store, parts[0]);
    while (first.advance()) { /* play the first part */ }
    const end = first.cursor;
    first.pause();
    const second = open(store, parts[1]);
    console.log(JSON.stringify({ variables: parts.map((part) => (part.lesson.variables ?? []).map((variable) => variable.as)), end, after: second.cursor }));
  `);
  assert.deepEqual(result.variables[0], [], "section 1 shows no number: none is declared");
  assert.ok(result.variables[1].length > 0 && result.variables[1].every((alias) => !/^number_/u.test(alias)), JSON.stringify(result.variables[1]));
  assert.ok(result.end > 0);
  assert.equal(result.after, result.end, "the class keeps its place");
});

test("a number no picture, move, task or control uses is not declared; one a picture binds is, with its control", () => {
  const result = run(`
    const api = await import(${here("../lesson-plan.js")});
    const { samplePlan } = await import(${here("./sample-plans.mjs")});
    const plan = samplePlan("number_line");
    plan.numbers.push({ initial: 3, min: 0, max: 10, label: "unused" });
    const lesson = api.compileAndValidateLessonPlan(plan, { language: "en-US" }).lesson;
    console.log(JSON.stringify((lesson.lesson.variables ?? []).map((variable) => [variable.as, Boolean(variable.control)])));
  `);
  assert.deepEqual(result, [["number_01", true]]);
});

test("too many variables names a picture the last section drew, not a card an earlier section drew", () => {
  const result = run(`
    const api = await import(${here("../lesson-plan.js")});
    const { placeValuePlan, samplePlan } = await import(${here("./sample-plans.mjs")});
    // A Chinese pull-apart with decimals binds 15 variables in section 1; section 2 draws two number lines.
    const plan = placeValuePlan({ number: 26.075, practice: 18.064, given: "numeral" });
    const line = samplePlan("number_line").sections[0].moments[0].actions.find((action) => action.action === "create");
    plan.numbers.push({ initial: 5, min: 0, max: 10, label: "five" }, { initial: 6, min: 0, max: 10, label: "six" });
    plan.sections[1].moments.push({ narration: "Two numbers on lines.", actions: [3, 4].map((number) => {
      const { reusable_item: _slot, ...local } = structuredClone(line);
      return { ...local, content: { ...local.content, numbers: [number] }, role: "supporting_visual", placement: { relation: "new_region" } };
    }) });
    try { api.compileAndValidateLessonPlan(plan, { language: "zh-CN" }); console.log(JSON.stringify({ compiled: true })); }
    catch (error) { console.log(JSON.stringify({ code: error.code, capability: error.capability })); }
  `, "place_value_chart");
  assert.deepEqual(result, { code: "LESSON_PLAN_OLL_SCHEMA", capability: "number_line" });
});

test("a later section can lose two pictures, each at once: a line, then an array, both on the card's numbers", () => {
  const result = run(`
    const api = await import(${here("../lesson-plan.js")});
    const { makeTenPlan, samplePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    // Section 1 draws a number line on a number of its own; section 2 the card, then the pictures it is given.
    const build = (pictures) => {
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
      const at = plan.sections[1];
      for (const [capability, numbers] of pictures) {
        const picture = samplePlan(capability).sections[0].moments[0].actions.find((action) => action.action === "create");
        at.reusable_items = [...at.reusable_items, { kind: "board_item", board_kind: "visual", capability }];
        at.moments[0].actions.push({ ...structuredClone(picture), content: { ...structuredClone(picture.content), numbers }, placement: { relation: "new_region" }, reusable_item: at.reusable_items.length });
      }
      const compatible = makeSamplePlanModelCompatible(plan);
      const drafts = compatible.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: compatible.version, moments, student_activities }));
      return { outline: stagedOutline(compatible, drafts), drafts };
    };
    const line = ["number_line_steps", [1, 2, 3]], array = ["rectangle_unit_square_array", [1, 2]];
    const staged = [build([line, array]), build([array]), build([])];
    const requests = [], adjustments = [];
    let error, generated, sectionTwo = 0;
    try {
      generated = await api.generateLessonPlanWithModel(async (request) => {
        requests.push(request.label + (request.section ?? ""));
        if (requests.length > 12) throw new Error("too many requests");
        if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, staged[0].outline, bootstrapSectionFromExact(staged[0].outline, staged[0].drafts[0]));
        if (request.section === 2) sectionTwo += 1;
        // Each rewrite leaves out the picture the request was told is gone.
        return JSON.stringify(staged[Math.max(0, Math.min(sectionTwo, 3) - 1)].drafts[request.section - 1]);
      }, { turn_id: "two-withdrawals", learner_request: "How do I explain 8 + 6 by making a ten?", language: "en-US" }, {
        max_attempts_per_part: 3, on_program_adjustment: (adjustment) => adjustments.push([adjustment.kind, adjustment.section, adjustment.capability, adjustment.reason]),
      });
    } catch (caught) { error = caught.message.slice(0, 200); }
    console.log(JSON.stringify({ error, requests, adjustments: adjustments.filter(([kind]) => kind === "visual_removed" || kind === "sections_removed"),
      drawn: generated ? generated.lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions.filter((action) => action.do === "write").map((action) => action.kind))) : [] }));
  `, "make_ten");
  assert.equal(result.error, undefined);
  assert.deepEqual(result.requests, ["lesson-plan-bootstrap", "lesson-plan-section2", "lesson-plan-section2", "lesson-plan-section2"]);
  assert.deepEqual(result.adjustments, [
    ["visual_removed", 2, "number_line_steps", "shares_tap_card_numbers"],
    ["visual_removed", 2, "rectangle_unit_square_array", "shares_tap_card_numbers"],
  ]);
  assert.ok(result.drawn.includes("make_ten"), JSON.stringify(result.drawn));
});

// Review of #193, B1: an OLL kind names no recipe (number_line is drawn by five, geometry by eight), so the picture
// blamed is read from the section's own creates. Section 1 publishes a 15-variable chart; section 2's picture on two
// more lesson numbers goes over 16: that picture goes, and the lesson keeps both sections.
for (const capability of ["number_line_compare", "rectangle_unit_square_array"]) {
  test(`too many variables from section 2's ${capability} (an OLL kind other recipes share) names it; the lesson keeps both sections`, () => {
    const result = run(`
      const api = await import(${here("../lesson-plan.js")});
      const { placeValuePlan, samplePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
      const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
      const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
      const capability = ${JSON.stringify(capability)};
      const build = (withPicture) => {
        const plan = placeValuePlan({ number: 26.075, practice: 18.064, given: "numeral" });
        plan.numbers.push({ initial: 5, min: 1, max: 10, label: "five" }, { initial: 6, min: 1, max: 10, label: "six" });
        if (withPicture) {
          const at = plan.sections[1];
          const picture = samplePlan(capability).sections[0].moments[0].actions.find((action) => action.action === "create");
          at.reusable_items = [...(at.reusable_items ?? []), { kind: "board_item", board_kind: "visual", capability }];
          at.moments.push({ narration: "Two more numbers.", actions: [{ ...structuredClone(picture), content: { ...structuredClone(picture.content), numbers: [3, 4] }, placement: { relation: "new_region" }, reusable_item: at.reusable_items.length }] });
        }
        const compatible = makeSamplePlanModelCompatible(plan);
        const drafts = compatible.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: compatible.version, moments, student_activities }));
        return { outline: stagedOutline(compatible, drafts), drafts };
      };
      const staged = build(true), without = build(false);
      const requests = [], adjustments = [];
      let error, generated;
      try {
        generated = await api.generateLessonPlanWithModel(async (request) => {
          requests.push(request.label + (request.section ?? ""));
          if (requests.length > 12) throw new Error("too many requests");
          if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, staged.outline, bootstrapSectionFromExact(staged.outline, staged.drafts[0]));
          return JSON.stringify((JSON.parse(request.prompt).removed_picture ? without : staged).drafts[request.section - 1]);
        }, { turn_id: "blame", learner_request: "26.075 的每一位表示多少？", language: "zh-CN" }, {
          max_attempts_per_part: 3,
          on_program_adjustment: (adjustment) => adjustments.push([adjustment.kind, adjustment.section, adjustment.capability, adjustment.reason]),
        });
      } catch (caught) { error = caught.message.slice(0, 200); }
      console.log(JSON.stringify({ error, requests, removed: adjustments.filter(([kind]) => kind === "visual_removed" || kind === "sections_removed"),
        steps: generated?.lesson.steps.length, drawn: generated ? generated.lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions.filter((action) => action.do === "write").map((action) => action.kind))) : [] }));
    `);
    assert.equal(result.error, undefined, JSON.stringify(result.error));
    assert.deepEqual(result.removed, [["visual_removed", 2, capability, "visual_limits_after_retries"]]);
    assert.ok(result.steps >= 2 && result.drawn.includes("place_value_chart"), JSON.stringify(result));
  });
}
