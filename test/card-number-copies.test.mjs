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
  // Generates a three-section lesson (section 3 a text) from stubbed replies; section 3's request record and numbers.
  const recordOf = async (plan, request = "7 + 5 怎么凑十？") => {
    plan.sections[2] = { purpose: "Sum up", moments: [{ narration: "小结。", actions: [{ action: "create", kind: "text", role: "follow_up_explanation", content: { text: "summary" }, placement: { relation: "new_region" } }] }] };
    const compatible = sp.makeSamplePlanModelCompatible(plan);
    const drafts = compatible.sections.map(({ moments, student_activities }, index) => H.toModelSectionDraft({ section: index + 1, version: compatible.version, moments, student_activities }));
    const stage = { outline: H.stagedOutline(compatible, drafts), drafts };
    const log = { requests: [], prompts: [] };
    let lesson;
    try {
      lesson = (await api.generateLessonPlanWithModel(async (next) => {
        log.requests.push(next.label + (next.section ?? ""));
        log.prompts.push(next.prompt);
        if (log.requests.length > 12) throw new Error("too many requests");
        if (next.label === "lesson-plan-bootstrap") return H.bootstrapModelResponse(next, stage.outline, H.bootstrapSectionFromExact(stage.outline, stage.drafts[0]));
        return JSON.stringify(stage.drafts[next.section - 1]);
      }, { turn_id: "copies-record", learner_request: request, language: "zh-CN" }, { max_attempts_per_part: 3 })).lesson;
    } catch (caught) { log.error = caught.message.slice(0, 300); }
    const third = log.prompts.find((_prompt, index) => log.requests[index] === "lesson-plan-section3");
    const record = third && JSON.parse(third).course_and_section;
    return { error: log.error, requests: log.requests, record,
      moved: record?.previous_sections?.[1]?.taught?.flatMap((moment) => moment.moved ?? []),
      current: Object.fromEntries((record?.numbers ?? []).map(({ number, current_value }) => [number, current_value])),
      pictures: (record?.pictures_now ?? []).map(({ capability, numbers }) => [capability, Object.fromEntries((numbers ?? []).map(({ number, value }) => [number, value]))]),
      played: lesson ? actions(lesson).filter((action) => action.do === "animate").map((action) => [action.variable, action.value]) : [] };
  };
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

test("PT-15 with a built chart (7 variables): the chart in section 1 keeps 8.2 and the column card in section 2 reads a copy; section 1 compiles exactly as it did alone", () => {
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
  // Each picture with the values it shows: the card keeps 7, the line shows 6 (review of #194, B1).
  const shows = (capability) => Object.fromEntries(result.third.pictures_now.find((picture) => picture.capability === capability).numbers.map(({ number, value }) => [number, value]));
  assert.equal(shows("make_ten")[1], 7);
  assert.deepEqual(shows("number_line"), { 1: 6, 2: 5 });
  // The copies (numbers 7 and 8 of the compiled lesson) are never in the request.
  assert.ok(result.third.numbers.every(({ number }) => number <= 6), JSON.stringify(result.third.numbers.map(({ number }) => number)));
  assert.doesNotMatch(JSON.stringify(result.third), /"number":(7|8)\b/u);
});

// Review of #194, B1: a later section is told only the moves the lesson plays, each on the picture that plays it.
test("a move of a card's problem number with no picture holding a copy is left out, and the record says nothing moved", () => {
  const result = run(`
    const out = {};
    const makeTenPlan = sp.makeTenPlan({ numbers: [7, 5], practice: [8, 6] });
    makeTenPlan.sections[1].moments.push({ narration: "把 7 换成 6 看看。", actions: [animate(1, 6)] });
    out.makeTen = await recordOf(makeTenPlan);
    const tradePlan = sp.placeValueTradePlan({ operation: "add", numbers: [38, 25], practice: [47, 36] });
    tradePlan.sections[1].moments.push({ narration: "把 38 换成 39。", actions: [animate(1, 39)] });
    out.trade = await recordOf(tradePlan, "38 + 25 怎么算？");
    const timesTenPlan = sp.timesTenPlan({ amount: 0.3, target: 0.001, practice: [5, 0.01] });
    timesTenPlan.sections[1].moments.push({ narration: "换一个数。", actions: [animate(1, 0.5)] });
    out.timesTen = await recordOf(timesTenPlan, "3 个十分之一是几个千分之一？");
    console.log(JSON.stringify(out));
  `);
  for (const [name, card, value] of [["makeTen", "make_ten", 7], ["trade", "place_value_trade", 38], ["timesTen", "place_value_times_ten", 0.3]]) {
    const each = result[name];
    assert.equal(each.error, undefined, `${name}: ${each.error}`);
    assert.deepEqual(each.moved, [], name);
    assert.equal(each.current[1], value, name);
    assert.equal(each.pictures.find(([capability]) => capability === card)[1][1], value, name);
    assert.ok(each.played.every(([variable]) => !variable.startsWith("number_")), name);
  }
});

test("a move of the pair before the line is drawn is left out: the line is drawn, and recorded, at the pair's value", () => {
  const result = run(`
    const plan = makeTen([{ narration: "把 5 换成 4 看看。", actions: [animate(2, 4)] }, { narration: "在数轴上走一遍。", actions: [{ ...local("number_line", [1, 2]), reusable_item: 1 }] }]);
    plan.sections[1].reusable_items = [{ kind: "board_item", board_kind: "visual", capability: "number_line" }];
    console.log(JSON.stringify(await recordOf(plan)));
  `);
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result.moved, []);
  assert.equal(result.current[2], 5);
  assert.deepEqual(result.pictures.find(([capability]) => capability === "number_line")[1], { 1: 7, 2: 5 });
});

// Review of #194, B3: a card that holds a copy (a chart drawn after the column card, on its first number) builds it.
test("a chart drawn after the column card on the card's first number builds its own copy: its moves play on the chart", () => {
  const result = run(`
    const trade = sp.placeValueTradePlan({ operation: "subtract", numbers: [8.2, 3.75], practice: [6.4, 2.85] });
    const chartSection = structuredClone(sp.placeValuePlan({ number: 8.2, given: "place_counts", typed: false }).sections[0]);
    chartSection.student_activities = [];
    const compiled = compile({ ...structuredClone(trade), sections: [structuredClone(trade.sections[0]), chartSection], close: { summary: "Review.", focus: [{ source: "reusable", section: 1, item: 1 }] } });
    if (compiled.error) { console.log(JSON.stringify(compiled)); } else {
      console.log(JSON.stringify({ left: compiled.view_adjustments.filter((each) => each.reason === "animation_left_out").map((each) => each.detail),
        sectionTwo: compiled.lesson.steps[1].beats.flatMap((beat) => beat.actions).filter((action) => action.do === "animate").map((action) => [action.variable, action.value]) }));
    }
  `);
  assert.equal(result.error, undefined, JSON.stringify(result.error));
  assert.deepEqual(result.left, []);
  assert.deepEqual(result.sectionTwo, [["section_02_moment_01_item_01_ones_count", 8], ["section_02_moment_01_item_01_tenths_count", 2]]);
});

// Review of #194, B2: PT-15 as the model wrote it, a pulled-apart chart (14 variables) in section 1 and the column card
// (up to 7) in section 2. The card the outline's numbers were written for stays; the chart goes before section 1
// publishes, and section 1 is written again without it, as on main.
test("PT-15 with a pulled-apart chart: the chart and the planned column card cannot fit, so the chart goes before section 1 publishes", () => {
  const result = run(`
    const trade = sp.placeValueTradePlan({ operation: "subtract", numbers: [8.2, 3.75], practice: [6.4, 2.85] });
    const chartSection = structuredClone(sp.placeValuePlan({ number: 8.2, given: "numeral", typed: false }).sections[0]);
    chartSection.student_activities = [];
    const summary = { purpose: "Sum up", moments: [{ narration: "小结。", actions: [{ action: "create", kind: "text", role: "follow_up_explanation", content: { text: "8.2 − 3.75 = 4.45" }, placement: { relation: "new_region" } }] }] };
    const staged = (first) => {
      const compatible = sp.makeSamplePlanModelCompatible({ ...structuredClone(trade), sections: [first, structuredClone(trade.sections[0]), structuredClone(summary)], close: { summary: "Review.", focus: [{ source: "reusable", section: 2, item: 1 }] } });
      const drafts = compatible.sections.map(({ moments, student_activities }, index) => H.toModelSectionDraft({ section: index + 1, version: compatible.version, moments, student_activities }));
      return { outline: H.stagedOutline(compatible, drafts), drafts };
    };
    const withChart = staged(chartSection);
    const withNote = staged({ purpose: "Zero", reusable_items: [{ kind: "board_item", board_kind: "note" }], moments: [{ narration: "8.2 = 8.20。", actions: [{ action: "create", kind: "note", role: "main_explanation", content: { title: "8.20", items: ["末尾补 0"] }, placement: { relation: "new_region" }, reusable_item: 1 }] }] });
    const requests = [], adjustments = [];
    let error, lesson;
    try {
      lesson = (await api.generateLessonPlanWithModel(async (request) => {
        requests.push(request.label + (request.section ?? ""));
        if (requests.length > 12) throw new Error("too many requests");
        if (request.label === "lesson-plan-bootstrap") return H.bootstrapModelResponse(request, withChart.outline, H.bootstrapSectionFromExact(withChart.outline, withChart.drafts[0]));
        if (request.section === 2) {
          // The section after the chart went: the column card is the outline's first course visual now.
          const draft = structuredClone(withNote.drafts[1]);
          draft.course_visual_creates = { visual_1: draft.course_visual_creates[Object.keys(draft.course_visual_creates)[0]] };
          return JSON.stringify(draft);
        }
        return JSON.stringify(withNote.drafts[request.section - 1]);
      }, { turn_id: "pt15", learner_request: "8.2 − 3.75 怎么算？", language: "zh-CN" }, {
        max_attempts_per_part: 3, on_program_adjustment: (adjustment) => adjustments.push([adjustment.kind, adjustment.section, adjustment.capability ?? null, adjustment.reason, adjustment.detail ?? ""]),
      })).lesson;
    } catch (caught) { error = caught.message.slice(0, 300); }
    console.log(JSON.stringify({ error, requests, removed: adjustments.filter(([kind]) => kind === "visual_removed"),
      written: lesson ? actions(lesson).filter((action) => action.do === "write").map((action) => action.kind) : [] }));
  `);
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result.requests, ["lesson-plan-bootstrap", "lesson-plan-section1", "lesson-plan-section2", "lesson-plan-section3"]);
  assert.equal(result.removed.length, 1);
  assert.deepEqual(result.removed[0].slice(0, 4), ["visual_removed", 1, "place_value_chart", "planned_card_budget"]);
  assert.match(result.removed[0][4], /the lesson holds at most 16 numbers \(OLL\): section 1 uses 14 and the place_value_trade card planned for section 2 needs up to 7/u);
  assert.ok(result.written.includes("place_value_trade") && !result.written.includes("place_value_chart"), JSON.stringify(result.written));
});
