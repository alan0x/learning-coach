// Copies of a tap card's problem numbers (design note "second example and copies"; owner direction, 2026-11-27). A
// card only reads its problem numbers (make ten's pair, the column card's pair, the times-ten amount and unit asked),
// so another picture that names one gets a copy of its own instead of being refused; a practice number, the number a
// demonstration moves and a count only the learner's taps change are never copied. Shapes from the evidence lessons:
// MT-02 (a number line in section 2 on the make-ten pair, refused three times and removed), PT-15 (a chart in section 1
// on 8.2, the column card on 8.2 − 3.75 in section 2, which lost the column card).
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
  const animate = (number, end_value) => ({ action: "animate", number, end_value, duration_intent: "brief", timing: "during_speech" });
  const local = (capability, numbers, extra = {}) => {
    const { reusable_item: _slot, ...picture } = structuredClone(sp.samplePlan(capability).sections[0].moments[0].actions.find((action) => action.action === "create"));
    return { ...picture, content: { ...picture.content, ...extra, numbers }, role: "supporting_visual", placement: { relation: "new_region" } };
  };
  // MT-02's shape: 7 + 5 on the make-ten card in section 1 (practice 8 + 6); section 2 adds what the test gives.
  const makeTen = (moments) => {
    const plan = sp.makeTenPlan({ numbers: [7, 5], practice: [8, 6] });
    plan.sections[1].moments.push(...moments);
    return plan;
  };
  const compile = (plan, language = "zh-CN") => {
    try { return api.compileAndValidateLessonPlan(plan, { language }); }
    catch (error) { return { error: { code: error.code, capability: error.capability, message: error.message, withdrawAtOnce: error.withdrawAtOnce ?? false, tapCard: error.tapCard } }; }
  };
  const actions = (lesson) => lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions));
  ${body}
`], {
  env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "make_ten,place_value_trade,place_value_times_ten" }, cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8",
}));

test("MT-02: a number line in section 2 on the make-ten pair draws on copies of its own, with the outline's ranges; its moves are the copies'", () => {
  const result = run(`
    const compiled = compile(makeTen([{ narration: "在数轴上走一遍 7 + 5。", actions: [local("number_line", [1, 2])] },
      { narration: "起点换成 6。", actions: [animate(1, 6)] }]));
    if (compiled.error) { console.log(JSON.stringify(compiled)); } else {
      const variables = compiled.lesson.lesson.variables;
      console.log(JSON.stringify({
        declared: variables.filter((variable) => variable.as.startsWith("number_")).map(({ as, initial, min, max }) => ({ as, initial, min, max })),
        copied: compiled.view_adjustments.filter((each) => each.reason === "number_copied").map((each) => each.section),
        moved: actions(compiled.lesson).filter((action) => action.do === "animate" && action.variable.startsWith("number_")).map((action) => [action.variable, action.value]),
        written: actions(compiled.lesson).filter((action) => action.do === "write").map((action) => action.kind),
      }));
    }
  `);
  assert.equal(result.error, undefined, JSON.stringify(result.error));
  assert.deepEqual(result.copied, [2, 2]);
  // The card reads 1 to 6 unbound; the line binds its copies, 7 (of 7) and 8 (of 5).
  assert.deepEqual(result.declared.map(({ as, initial }) => [as, initial]), [["number_07", 7], ["number_08", 5]]);
  // The copies keep the outline's ranges: the card's fit would have made 7's range 0 to 7 as well, but no wider.
  assert.ok(result.declared.every(({ min, max, initial }) => min <= initial && max >= initial), JSON.stringify(result.declared));
  // "Animate number 1" in section 2, after the line is drawn, moves the line's copy, never the card.
  assert.deepEqual(result.moved, [["number_07", 6]]);
  assert.ok(result.written.includes("make_ten") && result.written.includes("number_line"), JSON.stringify(result.written));
});

test("MT-02, attempt 2: a line on the card's count moved is refused with the fact, naming the line, which goes at once", () => {
  const result = run(`
    console.log(JSON.stringify(compile(makeTen([{ narration: "数轴。", actions: [local("number_line", [1, 6])] }]))));
  `);
  assert.equal(result.error.code, "LESSON_PLAN_SHARED_NUMBER");
  assert.equal(result.error.capability, "number_line");
  assert.equal(result.error.withdrawAtOnce, true);
  assert.match(result.error.message, /lesson number 6 is a count on the make-ten card that only the learner's taps change; the number_line visual shows it too$/u);
  assert.doesNotMatch(result.error.message, /in words|show the/u);
});

test("a line on the practice pair is refused: the practice is the learner's, never copied", () => {
  const result = run(`
    console.log(JSON.stringify(compile(makeTen([{ narration: "数轴。", actions: [local("number_line", [3, 4])] }]))));
  `);
  assert.equal(result.error.code, "LESSON_PLAN_SHARED_NUMBER");
  assert.match(result.error.message, /lesson number 3 is the make-ten card's practice number, which the learner works after class/u);
});

test("one copy per problem number: a third picture on it is refused, with the fact", () => {
  const result = run(`
    console.log(JSON.stringify(compile(makeTen([{ narration: "两种看法。", actions: [local("number_line", [1, 2]), local("rectangle_unit_square_array", [1, 2])] }]))));
  `);
  assert.equal(result.error.code, "LESSON_PLAN_SHARED_NUMBER");
  assert.match(result.error.message, /lesson number 1 is the make-ten card's problem number, and another picture already shows it on a copy of its own; the rectangle_unit_square_array visual shows it too/u);
});

test("before the line is drawn, a move of the pair is left out and recorded; it never refuses the section", () => {
  const result = run(`
    const compiled = compile(makeTen([{ narration: "先说一说。", actions: [animate(2, 4)] }, { narration: "数轴。", actions: [local("number_line", [1, 2])] }]));
    console.log(JSON.stringify(compiled.error ?? { left: compiled.view_adjustments.filter((each) => each.reason === "animation_left_out").length,
      moved: actions(compiled.lesson).filter((action) => action.do === "animate" && action.variable.startsWith("number_")).length }));
  `);
  assert.equal(result.code, undefined, JSON.stringify(result));
  assert.deepEqual(result, { left: 1, moved: 0 });
});

test("PT-15: the chart in section 1 keeps 8.2 and the column card in section 2 reads a copy; section 1 compiles exactly as it did alone", () => {
  const result = run(`
    const trade = sp.placeValueTradePlan({ operation: "subtract", numbers: [8.2, 3.75], practice: [6.4, 2.85] });
    const chart = sp.placeValuePlan({ number: 8.2, given: "place_counts", typed: false });
    const chartSection = chart.sections[0];
    chartSection.student_activities = [];
    const plan = (withCard) => ({ ...structuredClone(trade), sections: [structuredClone(chartSection), ...(withCard ? [structuredClone(trade.sections[0])] : [])],
      close: { summary: "Review.", focus: [{ source: "reusable", section: 1, item: 1 }] } });
    const alone = compile(plan(false), "zh-CN"), both = compile(plan(true), "zh-CN");
    if (alone.error || both.error) { console.log(JSON.stringify({ error: alone.error ?? both.error })); } else {
      console.log(JSON.stringify({
        sectionOneAlone: JSON.stringify(alone.lesson.steps[0]), sectionOneBoth: JSON.stringify(both.lesson.steps[0]),
        variablesAlone: (alone.lesson.lesson.variables ?? []).map((variable) => variable.as),
        variablesBoth: both.lesson.lesson.variables.map((variable) => variable.as),
        written: actions(both.lesson).filter((action) => action.do === "write").map((action) => action.kind),
        copied: both.view_adjustments.filter((each) => each.reason === "number_copied").map((each) => each.section),
      }));
    }
  `);
  assert.equal(result.error, undefined, JSON.stringify(result.error));
  assert.equal(result.sectionOneBoth, result.sectionOneAlone, "a published section never changes");
  assert.ok(result.variablesAlone.every((alias) => result.variablesBoth.includes(alias)), "the later part only adds variables");
  assert.ok(result.written.includes("place_value_chart") && result.written.includes("place_value_trade"), JSON.stringify(result.written));
  assert.deepEqual(result.copied, [2]);
});

test("the record of earlier sections names the model's number with the line's values, never the copy", () => {
  const result = run(`
    const plan = makeTen([{ narration: "在数轴上走一遍。", actions: [{ ...local("number_line", [1, 2]), reusable_item: 1 }] }, { narration: "起点换成 6。", actions: [animate(1, 6)] }]);
    plan.sections[1].reusable_items = [{ kind: "board_item", board_kind: "visual", capability: "number_line" }];
    plan.sections[2] = { purpose: "Sum up", moments: [{ narration: "小结。", actions: [{ action: "create", kind: "text", role: "follow_up_explanation", content: { text: "7 + 5 = 12" }, placement: { relation: "new_region" } }] }] };
    const compatible = sp.makeSamplePlanModelCompatible(plan);
    const drafts = compatible.sections.map(({ moments, student_activities }, index) => H.toModelSectionDraft({ section: index + 1, version: compatible.version, moments, student_activities }));
    const stage = { outline: H.stagedOutline(compatible, drafts), drafts };
    const log = { requests: [], prompts: [] };
    try {
      await api.generateLessonPlanWithModel(async (request) => {
        log.requests.push(request.label + (request.section ?? ""));
        log.prompts.push(request.prompt);
        if (log.requests.length > 12) throw new Error("too many requests");
        if (request.label === "lesson-plan-bootstrap") return H.bootstrapModelResponse(request, stage.outline, H.bootstrapSectionFromExact(stage.outline, stage.drafts[0]));
        return JSON.stringify(stage.drafts[request.section - 1]);
      }, { turn_id: "copies-record", learner_request: "7 + 5 怎么凑十？", language: "zh-CN" }, { max_attempts_per_part: 3 });
    } catch (caught) { log.error = caught.message.slice(0, 300); }
    const third = log.prompts.find((_prompt, index) => log.requests[index] === "lesson-plan-section3");
    console.log(JSON.stringify({ error: log.error, requests: log.requests, third: third && JSON.parse(third).course_and_section }));
  `);
  assert.equal(result.error, undefined, JSON.stringify(result.error));
  assert.deepEqual(result.requests, ["lesson-plan-bootstrap", "lesson-plan-section2", "lesson-plan-section3"]);
  const second = result.third.previous_sections[1].taught;
  const drew = second.flatMap((moment) => moment.drew ?? []).find((picture) => picture.capability === "number_line");
  assert.deepEqual(drew.numbers, [{ number: 1, value: 7 }, { number: 2, value: 5 }]);
  assert.deepEqual(second.flatMap((moment) => moment.moved ?? []), [{ number: 1, to: 6 }]);
  assert.equal(result.third.numbers.find(({ number }) => number === 1).current_value, 6);
  // The copies (numbers 7 and 8 of the compiled lesson) are never in the request.
  assert.ok(result.third.numbers.every(({ number }) => number <= 6), JSON.stringify(result.third.numbers.map(({ number }) => number)));
  assert.doesNotMatch(JSON.stringify(result.third), /"number":(7|8)\b/u);
});
