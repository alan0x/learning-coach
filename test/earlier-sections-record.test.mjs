// What a later section is told the earlier sections did (owner, 2026-11-27: a second section retold the first, as its
// request carried only the outline's one-line purposes). Stubbed runs: the model's replies are fixed lesson plans, so
// the record is read from the accepted sections, after the program's adjustments, as in a live lesson.
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
    const log = { requests: [], prompts: [], systems: [], adjustments: [] };
    try {
      await api.generateLessonPlanWithModel(async (request) => {
        log.requests.push(request.label + (request.section ?? ""));
        log.prompts.push(request.prompt);
        log.systems.push(request.system_prompt);
        if (log.requests.length > 24) throw new Error("too many requests");
        return reply(request, log);
      }, { turn_id: "earlier-sections-record", learner_request, language: "en-US" }, {
        max_attempts_per_part: 3,
        on_program_adjustment: (adjustment) => log.adjustments.push([adjustment.kind, adjustment.section, adjustment.reason]),
      });
    } catch (caught) { log.error = { message: caught.message.slice(0, 300), code: caught.code }; }
    return log;
  };
  const animate = (number, end_value) => ({ action: "animate", number, end_value, duration_intent: "brief", timing: "during_speech" });
  const text = (value) => ({ action: "create", kind: "text", role: "follow_up_explanation", content: { text: value }, placement: { relation: "new_region" } });
  ${body}
`], {
  env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "" }, cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8",
}));

// The sample plans' helper writes a plain text card as a note titled "补充说明" (test/sample-plans.mjs).
const prompts = (log, label) => log.prompts.filter((_prompt, index) => log.requests[index] === label).map((prompt) => JSON.parse(prompt));
const systems = (log, label) => log.systems.filter((_system, index) => log.requests[index] === label);

/**
 * Three sections on the trading mat (26 loose ones, 9 tens): section 1 draws it and leaves a task the mat cannot reach,
 * section 2 trades the ones to `end` (6 is a trade; 7 the mat refuses, so the move is left out) and asks two typed
 * questions, one with a check that disagrees; section 3 writes.
 */
const matLesson = (end) => run(`
  const plan = sp.samplePlan("rectangle_unit_square_array");
  plan.numbers = [{ initial: 26, min: 0, max: 59, label: "loose ones" }, { initial: 9, min: 0, max: 34, label: "tens" }];
  const first = plan.sections[0].moments[0];
  first.narration = "Here are 9 tens and 26 loose ones.";
  first.actions = first.actions.filter((action) => action.action !== "animate");
  first.actions[0].content = { capability: "base_ten_trade", parameters: {}, numbers: [1, 2] };
  plan.sections[0].reusable_items[0].capability = "base_ten_trade";
  plan.sections[0].student_activities = [
    // The mat cannot reach 5 loose ones from 26: the compiler drops this task.
    { kind: "number_target", prompt: "Trade until 5 ones are left.", number_controls: [{ number: 1, controls: ["slider"] }], value: 5, tolerance: 0.02, hints: ["Ten ones make a ten."] },
  ];
  plan.sections[1].moments = [{ narration: "Ten ones make a ten.", actions: [animate(1, ${end}), text("26 ones = 2 tens 6 ones")] }];
  delete plan.sections[1].student_activities;
  plan.sections[2] = { purpose: "Read the number", moments: [{ narration: "Now read the number.", actions: [text("116")] }] };
  const stage = staged(plan);
  const typed = (answer, check) => ({ prompt: "What number is 4 tens and 13 ones? (" + answer + ")", answer, check, hints: ["Trade first."] });
  // The first question's check gives another number: the program drops it before the section is accepted.
  stage.drafts[1].answer_activities = [typed("54", "53"), typed("53", "40+13")];
  const log = await generate((request) => request.label === "lesson-plan-bootstrap" ? bootstrap(request, stage) : JSON.stringify(stage.drafts[request.section - 1]),
    "I have 9 tens and 26 ones. What number is that?");
  console.log(JSON.stringify(log));
`);

test("a later section is told what each earlier moment said, wrote, drew and moved, and where the picture's numbers stand", () => {
  const log = matLesson(6);
  assert.equal(log.error, undefined, JSON.stringify(log.error));
  assert.deepEqual(log.requests, ["lesson-plan-bootstrap", "lesson-plan-section2", "lesson-plan-section3"]);
  const [second] = prompts(log, "lesson-plan-section2");
  const [third] = prompts(log, "lesson-plan-section3");
  const drawn = { course_visual: 1, capability: "base_ten_trade", numbers: [{ number: 1, value: 26 }, { number: 2, value: 9 }] };
  // The task the mat cannot reach is dropped as the section compiles: no learner turn is left.
  assert.ok(log.adjustments.some(([kind, section]) => kind === "activity_removed" && section === 1), JSON.stringify(log.adjustments));
  const firstSection = { taught: [{ narration: "Here are 9 tens and 26 loose ones.", drew: [drawn] }] };
  const record = ({ taught, learner_turn }) => ({ taught, ...(learner_turn ? { learner_turn } : {}) });
  assert.deepEqual(second.course_and_section.previous_sections.map(record), [firstSection]);
  assert.deepEqual(second.course_and_section.pictures_now, [drawn]);
  // The mat trades: the ones go to 6 and the tens follow to 11, as the card moves them.
  assert.deepEqual(third.course_and_section.previous_sections.map(record), [firstSection, {
    taught: [{ narration: "Ten ones make a ten.", wrote: ["补充说明; 26 ones = 2 tens 6 ones"], moved: [{ number: 1, to: 6 }, { number: 2, to: 11 }] }],
    // Only the question that passed its checks.
    learner_turn: [{ kind: "numeric_answer", prompt: "What number is 4 tens and 13 ones? (53)" }],
  }]);
  assert.deepEqual(third.course_and_section.pictures_now, [{ ...drawn, numbers: [{ number: 1, value: 6 }, { number: 2, value: 11 }] }]);
  // The numbers' current values and the record agree: both come from one walk.
  assert.deepEqual(third.course_and_section.numbers.map(({ number, current_value }) => ({ number, value: current_value })), third.course_and_section.pictures_now[0].numbers);
  // The record's outline fields are as before.
  assert.deepEqual(third.course_and_section.previous_sections.map(({ section, purpose }) => [section, purpose]), [[1, "Create the reusable visual"], [2, "Return to the old visual and add an explanation"]]);
  // Later sections are told what the record is and that each section adds something new; the first request is not.
  for (const system of [...systems(log, "lesson-plan-section2"), ...systems(log, "lesson-plan-section3")]) assert.match(system, /previous_sections\[\]\.taught/u);
  assert.doesNotMatch(systems(log, "lesson-plan-bootstrap")[0], /previous_sections\[\]\.taught/u);
  assert.match(systems(log, "lesson-plan-bootstrap")[0], /没有新东西的节不要规划/u);
});

test("a move the mat refuses, left out of section 2, is not in section 3's record", () => {
  const log = matLesson(7);
  assert.equal(log.error, undefined, JSON.stringify(log.error));
  assert.deepEqual(log.requests, ["lesson-plan-bootstrap", "lesson-plan-section2", "lesson-plan-section2", "lesson-plan-section2", "lesson-plan-section3"]);
  assert.ok(log.adjustments.some(([, section, reason]) => section === 2 && reason === "animation_left_out"), JSON.stringify(log.adjustments));
  const [third] = prompts(log, "lesson-plan-section3");
  assert.deepEqual(third.course_and_section.previous_sections[1].taught, [{ narration: "Ten ones make a ten.", wrote: ["补充说明; 26 ones = 2 tens 6 ones"] }]);
  assert.deepEqual(third.course_and_section.pictures_now, [{ course_visual: 1, capability: "base_ten_trade", numbers: [{ number: 1, value: 26 }, { number: 2, value: 9 }] }]);
});

test("a picture taken out of section 2, which is written again without it, is not in section 3's record", () => {
  const log = run(`
    const plan = sp.samplePlan("number_line_rounding");
    delete plan.sections[0].student_activities;
    for (const number of plan.numbers) delete number.student_control;
    const line = plan.sections[0].moments[0].actions[0];
    const note = (value) => ({ action: "create", kind: "note", role: "explanation", content: { title: "Rounding", items: [value] }, placement: { relation: "new_region" }, reusable_item: 1 });
    plan.sections[0] = { purpose: "Introduce rounding", reusable_items: [{ kind: "board_item", board_kind: "note" }], moments: [{ narration: "Rounding to tens.", actions: [note("47 is between 40 and 50.")] }] };
    const drawn = { purpose: "Round on a line", reusable_items: [{ kind: "board_item", board_kind: "visual", capability: "number_line_rounding" }], moments: [
      { narration: "A rounding line.", actions: [line] }, { narration: "Move it.", actions: [animate(1, 49.99)] }] };
    const written = { purpose: "Round on a line", reusable_items: [], moments: [{ narration: "Halfway is 45.", actions: [text("47 rounds to 50.")] }] };
    const third = { purpose: "Another number", reusable_items: [], moments: [{ narration: "Now 62.", actions: [text("62 rounds to 60.")] }] };
    plan.close = { summary: "Review.", focus: [{ source: "reusable", section: 1, item: 1 }] };
    const withLine = staged({ ...plan, sections: [plan.sections[0], drawn, third] });
    const without = staged({ ...plan, sections: [plan.sections[0], written, third] });
    const log = await generate((request) => {
      if (request.label === "lesson-plan-bootstrap") return bootstrap(request, withLine);
      return JSON.stringify((JSON.parse(request.prompt).removed_picture ? without : withLine).drafts[request.section - 1]);
    }, "Round 47 to the nearest ten.");
    console.log(JSON.stringify(log));
  `);
  assert.equal(log.error, undefined, JSON.stringify(log.error));
  assert.deepEqual(log.adjustments.filter(([kind]) => kind === "visual_removed"), [["visual_removed", 2, "visual_limits_after_retries"]]);
  assert.equal(log.requests.at(-1), "lesson-plan-section3");
  const [third] = prompts(log, "lesson-plan-section3");
  assert.deepEqual(third.course_and_section.previous_sections.map(({ taught }) => taught), [
    [{ narration: "Rounding to tens.", wrote: ["Rounding; 47 is between 40 and 50."] }],
    [{ narration: "Halfway is 45.", wrote: ["补充说明; 47 rounds to 50."] }],
  ]);
  assert.equal(third.course_and_section.pictures_now, undefined);
  assert.doesNotMatch(JSON.stringify(third.course_and_section.previous_sections), /number_line_rounding|A rounding line/u);
});
