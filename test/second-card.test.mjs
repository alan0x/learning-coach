// A second card of a kind on the section's own example (design note "second example and copies", PR 3; owner
// direction and lead, 2026-11-27; pilot 1: section 2 kept working the practice over the first card). The outline plans
// a second course visual of the kind in a later section; that section writes the example's two numbers as role-named
// parameters of its create; the program supplies the one number the card's demonstration moves and binds the create to
// it. The card is a demonstration only: one variable, no taps; the practice and its row stay on the first card.
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
  const KINDS = {
    make_ten: { plan: () => sp.makeTenPlan({ numbers: [8, 6], practice: [7, 5] }), example: { example_first_addend: 9, example_second_addend: 4 }, moves: [10] },
    place_value_trade: { plan: () => sp.placeValueTradePlan({ operation: "add", numbers: [3486, 2795], practice: [1578, 2645] }), example: { example_first_number: 4527, example_second_number: 1396 }, moves: [2, 4] },
    place_value_times_ten: { plan: () => sp.timesTenPlan({ amount: 0.3, target: 0.001, practice: [5, 0.01] }), example: { example_amount: 0.7, example_unit_asked: 0.001 }, moves: [0.01, 0.001] },
  };
  // A three-section lesson: the first card in section 1, the second card in section 2 (its create writing the example,
  // or nothing), a text in section 3. The outline holds the first card's numbers only: the program adds the second's.
  const lesson = async (kind, example = KINDS[kind].example, replies) => {
    const plan = KINDS[kind].plan();
    const card = structuredClone(plan.sections[0].moments[0].actions[0]);
    const demonstration = plan.numbers.length + 1;
    plan.sections[1].reusable_items = [{ kind: "board_item", board_kind: "visual", capability: kind }];
    plan.sections[1].moments.push({ narration: "再看一个例子。", actions: [{ ...card, content: { ...card.content, parameters: { ...(card.content.parameters ?? {}), ...example }, numbers: [1, 2] }, reusable_item: 1 }] },
      ...KINDS[kind].moves.map((value) => ({ narration: "看。", actions: [animate(demonstration, value)] })));
    plan.sections[2] = { purpose: "Sum up", moments: [{ narration: "小结。", actions: [{ action: "create", kind: "text", role: "follow_up_explanation", content: { text: "summary" }, placement: { relation: "new_region" } }] }] };
    const compatible = sp.makeSamplePlanModelCompatible(plan);
    const drafts = compatible.sections.map(({ moments, student_activities }, index) => H.toModelSectionDraft({ section: index + 1, version: compatible.version, moments, student_activities }));
    const stage = { outline: H.stagedOutline(compatible, drafts), drafts };
    stage.outline.numbers = stage.outline.numbers.slice(0, plan.numbers.length);
    const log = { requests: [], prompts: [], adjustments: [], rejected: [], ready: [] };
    let section2 = 0;
    try {
      log.lesson = (await api.generateLessonPlanWithModel(async (request) => {
        log.requests.push(request.label + (request.section ?? ""));
        log.prompts.push(request.prompt);
        if (log.requests.length > 14) throw new Error("too many requests");
        if (request.label === "lesson-plan-bootstrap") return H.bootstrapModelResponse(request, stage.outline, H.bootstrapSectionFromExact(stage.outline, stage.drafts[0]));
        if (request.section === 2) section2 += 1;
        const draft = structuredClone(stage.drafts[request.section - 1]);
        // After the second card is withdrawn, section 2 is written without it.
        if (request.section === 2 && JSON.parse(request.prompt).removed_picture) { delete draft.course_visual_creates; draft.moments = draft.moments.slice(0, 1); }
        return JSON.stringify(replies?.(request, draft) ?? draft);
      }, { turn_id: "second-card", learner_request: "再讲一个例子", language: "zh-CN" }, {
        max_attempts_per_part: 3,
        on_outline_ready: (event) => log.ready.push(event),
        on_program_adjustment: (adjustment) => log.adjustments.push([adjustment.kind, adjustment.section, adjustment.capability ?? null, adjustment.reason]),
        on_rejected_part: (part) => log.rejected.push([part.section, part.error.code, part.error.message.slice(0, 240)]),
      })).lesson;
    } catch (caught) { log.error = caught.message.slice(0, 300); }
    const actions = log.lesson ? log.lesson.steps.flatMap((step, at) => step.beats.flatMap((beat) => beat.actions.map((action) => ({ ...action, step: at + 1 })))) : [];
    const second = log.prompts[log.requests.indexOf("lesson-plan-section2")];
    return { error: log.error, requests: log.requests, rejected: log.rejected, adjustments: log.adjustments, ready: log.ready,
      cards: actions.filter((action) => action.do === "write" && action.kind === kind).map((action) => [action.step, action.content]),
      moved: actions.filter((action) => action.do === "animate").map((action) => [action.step, action.variable, action.value]),
      variables: (log.lesson?.lesson.variables ?? []).map((variable) => variable.as),
      tasks: (log.lesson?.lesson.tasks ?? []).map((task) => [task.completion.kind, task.completion.node ?? task.anchor]),
      sectionTwoNumbers: second && JSON.parse(second).course_and_section.numbers.map(({ number, label }) => [number, label]) };
  };
  ${body}
`], {
  env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "make_ten,place_value_trade,place_value_times_ten" }, cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8",
}));

for (const [kind, label, values] of [
  ["make_ten", "第二个例子：大数那一框里有几个", [9, 4]],
  ["place_value_trade", "第二个例子：做完了几列", [4527000, 1396000]],
  ["place_value_times_ten", "第二个例子：现在用什么单位在数", [700, 1]],
]) {
  test(`${kind}: section 2 draws a second card on its own example; its demonstration plays; the practice stays on the first card`, () => {
    const result = run(`console.log(JSON.stringify(await lesson(${JSON.stringify(kind)})));`);
    assert.equal(result.error, undefined, result.error);
    assert.deepEqual(result.rejected, []);
    assert.deepEqual(result.requests, ["lesson-plan-bootstrap", "lesson-plan-section2", "lesson-plan-section3"]);
    assert.deepEqual(result.ready.map((event) => event.second_cards), [1]);
    // Section 2 is told the number the program gave the second card's demonstration, after the first card's.
    assert.deepEqual(result.sectionTwoNumbers.at(-1)[1], label);
    assert.deepEqual(result.cards.map(([step]) => step), [1, 2]);
    const second = result.cards[1][1];
    assert.deepEqual([second.a ?? second.amount, second.b ?? second.target], values);
    // One variable for the second card: the number its demonstration moves; it plays in section 2.
    assert.equal(result.variables.filter((alias) => alias.startsWith("section_02_")).length, 1);
    assert.ok(result.moved.some(([step, variable]) => step === 2 && variable.startsWith("section_02_")), JSON.stringify(result.moved));
    // The practice and its row (or answer) are the first card's.
    assert.ok(result.tasks.length >= 2 && result.tasks.every(([, node]) => node === "section-01-moment-01-item-01"), JSON.stringify(result.tasks));
  });
}

test("an example that is the practice pair (either order) is refused with a fact; once the repairs are spent the second card goes, the lesson stays", () => {
  const result = run(`console.log(JSON.stringify(await lesson("make_ten", { example_first_addend: 5, example_second_addend: 7 })));`);
  assert.equal(result.error, undefined, result.error);
  assert.ok(result.rejected.length >= 3, JSON.stringify(result.rejected));
  for (const [section, code, message] of result.rejected) {
    assert.deepEqual([section, code], [2, "LESSON_PLAN_CAPABILITY_PARAMETER"]);
    assert.match(message, /the second make-ten card's example 5 \+ 7 is the practice pair, which the learner works after class/u);
  }
  assert.ok(result.adjustments.some(([kind, section, capability]) => kind === "visual_removed" && section === 2 && capability === "make_ten"), JSON.stringify(result.adjustments));
  assert.deepEqual(result.cards.map(([step]) => step), [1]);
});

test("an example that is the question's pair is refused with a fact", () => {
  const result = run(`console.log(JSON.stringify(await lesson("make_ten", { example_first_addend: 6, example_second_addend: 8 })));`);
  assert.match(result.rejected[0][2], /the second make-ten card's example 6 \+ 8 is the question's pair/u);
});

test("a second card that writes no example is refused with a fact", () => {
  const result = run(`console.log(JSON.stringify(await lesson("make_ten", {})));`);
  assert.match(result.rejected[0][2], /the second make-ten card shows an example of its own, and this create writes none \(example_first_addend, example_second_addend\)/u);
});

test("a first card's example parameters are read over: it is the lesson's card on its outline numbers", () => {
  const result = run(`
    const plan = KINDS.make_ten.plan();
    plan.sections[0].moments[0].actions[0].content.parameters = { example_first_addend: 9, example_second_addend: 4 };
    try {
      const compiled = api.compileAndValidateLessonPlan(plan, { language: "zh-CN" });
      const card = compiled.lesson.steps[0].beats[0].actions.find((action) => action.do === "write" && action.kind === "make_ten");
      console.log(JSON.stringify({ a: card.content.a, b: card.content.b, tasks: (compiled.lesson.lesson.tasks ?? []).length }));
    } catch (error) { console.log(JSON.stringify({ error: error.message })); }
  `);
  assert.deepEqual(result, { a: 8, b: 6, tasks: 2 });
});

test("the outline takes one second card per kind, in a later section than the first", () => {
  const result = run(`
    const outline = (sections) => ({ version: "0.1", title: "Two examples", goals: ["one"], numbers: [{ initial: 8, min: 1, max: 9 }, { initial: 6, min: 1, max: 9 }, { initial: 7, min: 1, max: 9 }, { initial: 5, min: 1, max: 9 }],
      course_visuals: sections.map((section) => ({ capability: "make_ten", create_section: section, use_sections: [section], relation: "primary", reusable_item: 1 })),
      sections: [1, 2, 3].map(() => ({ purpose: "Teach", allowed_capabilities: ["make_ten"], reusable_items: [{ kind: "board_item", board_kind: "visual", capability: "make_ten" }] })),
      close: { summary: "Review.", focus: [{ source: "reusable", section: 1, item: 1 }] } });
    const check = (sections) => { try { api.validateLessonPlanOutline(outline(sections)); return "ok"; } catch (error) { return error.message.slice(0, 120); } };
    console.log(JSON.stringify({ second: check([1, 2]), same: check([1, 1]), third: check([1, 2, 3]) }));
  `);
  assert.equal(result.second, "ok");
  assert.match(result.same, /already has course visual 1/u);
  assert.match(result.third, /already has course visual 1/u);
});

test("the guidance the outline call reads plans a second card for another example, never the practice", () => {
  const result = run(`
    let first;
    await api.generateLessonPlanWithModel(async (request) => { first = request; throw new Error("capture"); },
      { turn_id: "guidance", learner_request: "8 + 6 怎么凑十？", language: "zh-CN" }, { max_attempts_per_part: 1 }).catch(() => {});
    const rows = JSON.parse(first.prompt).visual_recipes.filter((row) => ["make_ten_to_add", "column_add_subtract_trades", "count_in_another_unit"].some((feature) => row[0].includes(feature)));
    console.log(JSON.stringify(rows.map((row) => row[2])));
  `);
  assert.equal(result.length, 3);
  for (const guidance of result) assert.match(guidance, /要在后面的节再讲另一个例子，outline 在那一节再规划一张.*另一个例子画在第二张卡片上，不用练习的数，练习仍在第一张上。/u);
});
