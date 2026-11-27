// Pilot 1 (2026-11-27), on Coach main after #194:
// - MT-13's make-ten card never moved: section 1 animated the first addend to 10 ("the bigger frame fills"), which the
//   card left out, so the narration moved counters the card never showed. A move of a card's problem or practice
//   number is refused again with a fact (what the number is, which number the demonstration moves), and left out only
//   once the section's repairs are spent, so the lesson and the card are kept;
// - the after-class practice is the learner's, in the guidance the outline call reads too;
// - a number line in steps beside the make-ten card gets the walk's three numbers from the program (MT-13's line wrote
//   one step, then took the card's count moved).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);
const run = (body, trial = "make_ten") => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
  const api = await import(${here("../lesson-plan.js")});
  const sp = await import(${here("./sample-plans.mjs")});
  const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
  const H = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
  const animate = (number, end_value) => ({ action: "animate", number, end_value, duration_intent: "brief", timing: "during_speech" });
  const staged = (plan) => {
    const compatible = sp.makeSamplePlanModelCompatible(plan);
    const drafts = compatible.sections.map(({ moments, student_activities }, index) => H.toModelSectionDraft({ section: index + 1, version: compatible.version, moments, student_activities }));
    return { outline: H.stagedOutline(compatible, drafts), drafts };
  };
  const generate = async (stage, reply) => {
    const log = { requests: [], prompts: [], adjustments: [], rejected: [] };
    try {
      log.lesson = (await api.generateLessonPlanWithModel(async (request) => {
        log.requests.push(request.label + (request.section ?? ""));
        log.prompts.push(request.prompt);
        if (log.requests.length > 12) throw new Error("too many requests");
        if (request.label === "lesson-plan-bootstrap") return H.bootstrapModelResponse(request, stage.outline, H.bootstrapSectionFromExact(stage.outline, stage.drafts[0]));
        return reply ? reply(request) : JSON.stringify(stage.drafts[request.section - 1]);
      }, { turn_id: "card-number-moves", learner_request: "8 + 5 为什么等于 10 + 3？", language: "zh-CN" }, {
        max_attempts_per_part: 3,
        on_program_adjustment: (adjustment) => log.adjustments.push([adjustment.kind, adjustment.section, adjustment.reason, String(adjustment.detail ?? "").slice(0, 200)]),
        on_rejected_part: (part) => log.rejected.push([part.section, part.error.code, part.error.message.slice(0, 220)]),
      })).lesson;
    } catch (caught) { log.error = caught.message.slice(0, 300); }
    return log;
  };
  const written = (lesson) => lesson ? lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions.filter((action) => action.do === "write").map((action) => action.kind))) : [];
  ${body}
`], {
  env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: trial }, cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8",
}));

test("MT-13: section 1 animates the first addend to 10; refused with the fact on each try, then left out, and the card and the lesson are kept", () => {
  const result = run(`
    const plan = sp.makeTenPlan({ numbers: [8, 5], practice: [7, 6], steps: [] });
    plan.sections[0].moments.push({ narration: "把 2 个圆片移过去，8 就满十了。", actions: [animate(1, 10)] });
    const log = await generate(staged(plan));
    console.log(JSON.stringify({ ...log, lesson: undefined, written: written(log.lesson) }));
  `);
  assert.equal(result.error, undefined, result.error);
  // The bootstrap's section 1, then its three repairs (this stub never repairs), then section 2.
  assert.deepEqual(result.requests, ["lesson-plan-bootstrap", "lesson-plan-section1", "lesson-plan-section1", "lesson-plan-section1", "lesson-plan-section2"]);
  assert.equal(result.rejected.length, 4, JSON.stringify(result.rejected));
  for (const [section, code, message] of result.rejected) {
    assert.deepEqual([section, code], [1, "LESSON_PLAN_CARD_NUMBER_STAYS"]);
    assert.match(message, /lesson number 1 is the make-ten card's first addend 8, which stays as written; the demonstration moves lesson number 5, the count in the bigger frame$/u);
  }
  // The section's request after a refusal carries the fact, never an instruction.
  const retry = JSON.parse(result.prompts[result.requests.indexOf("lesson-plan-section1")]);
  assert.match(retry.previous_validation_error, /stays as written/u);
  assert.ok(result.adjustments.some(([kind, section, reason]) => section === 1 && reason === "animation_left_out"), JSON.stringify(result.adjustments));
  assert.ok(result.written.includes("make_ten"), JSON.stringify(result.written));
});

test("the after-class practice is the learner's: the guidance the outline call reads says a lesson names it but never works it", () => {
  const result = run(`
    let first;
    await api.generateLessonPlanWithModel(async (request) => { first = request; throw new Error("capture"); },
      { turn_id: "practice", learner_request: "How do I explain 8 + 6 by making a ten?", language: "en-US" }, { max_attempts_per_part: 1 }).catch(() => {});
    const rows = JSON.parse(first.prompt).visual_recipes;
    // The four tap cards with an after-class practice: the chart, the column card, make ten and times ten.
    const cards = ["place_value_parts", "column_add_subtract_trades", "make_ten_to_add", "count_in_another_unit"];
    console.log(JSON.stringify({ label: first.label, rows: rows.filter((row) => cards.some((feature) => row[0].includes(feature))).map((row) => row[2]) }));
  `, "make_ten,place_value_trade,place_value_times_ten");
  assert.ok(["lesson-plan-bootstrap", "lesson-plan-outline"].includes(result.label), result.label);
  assert.equal(result.rows.length, 4);
  for (const guidance of result.rows) {
    assert.match(guidance, /练习的数是孩子课后自己做的：课上可以说“课后试试……”，但不讲它怎么做、不写出它的算式、不说它的答案，outline 也不为它安排一节。/u);
  }
});

test("a number line in steps after the make-ten card is given the walk's three numbers (8 + 5: 8, +2, +3), new to the lesson in section 2", () => {
  const result = run(`
    const plan = sp.makeTenPlan({ numbers: [8, 5], practice: [7, 6] });
    const line = sp.samplePlan("number_line_steps").sections[0].moments[0].actions.find((action) => action.action === "create");
    plan.sections[1].reusable_items = [{ kind: "board_item", board_kind: "visual", capability: "number_line_steps" }];
    plan.sections[1].moments.push({ narration: "在数轴上走一遍：从 8 起，先走 2 到 10，再走 3。", actions: [{ ...structuredClone(line), content: { ...structuredClone(line.content), numbers: [7, 8, 9] }, placement: { relation: "new_region" }, reusable_item: 1 }] });
    // The outline the model writes has the card's four numbers only: the program supplies the rest.
    const stage = staged(plan);
    stage.outline.numbers = stage.outline.numbers.slice(0, 4);
    const log = await generate(stage);
    const second = log.prompts[log.requests.indexOf("lesson-plan-section2")];
    console.log(JSON.stringify({ error: log.error, requests: log.requests, rejected: log.rejected,
      numbers: second && JSON.parse(second).course_and_section.numbers.map(({ number, label, initial }) => [number, label, initial]),
      written: written(log.lesson), variables: (log.lesson?.lesson.variables ?? []).map((variable) => [variable.as, variable.initial]) }));
  `);
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result.rejected, []);
  assert.deepEqual(result.numbers.slice(6), [[7, "数轴的起点（大数）", 8], [8, "补成十的一步", 2], [9, "剩下的一步", 3]]);
  assert.ok(result.written.includes("make_ten") && result.written.includes("number_line"), JSON.stringify(result.written));
  assert.deepEqual(result.variables.filter(([as]) => as.startsWith("number_")).map(([as, initial]) => [as, initial]), [["number_07", 8], ["number_08", 2], ["number_09", 3]]);
});
