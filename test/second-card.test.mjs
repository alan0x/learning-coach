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
  const { normalizeAuthoringLesson } = await import("octos-lesson-language");
  const H = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
  const animate = (number, end_value) => ({ action: "animate", number, end_value, duration_intent: "brief", timing: "during_speech" });
  const KINDS = {
    make_ten: { plan: () => sp.makeTenPlan({ numbers: [8, 6], practice: [7, 5] }), example: { example_first_addend: 9, example_second_addend: 4 }, moves: [10] },
    place_value_trade: { plan: () => sp.placeValueTradePlan({ operation: "add", numbers: [3486, 2795], practice: [1578, 2645] }), example: { example_first_number: 4527, example_second_number: 1396 }, moves: [2, 4] },
    place_value_times_ten: { plan: () => sp.timesTenPlan({ amount: 0.3, target: 0.001, practice: [5, 0.01] }), example: { example_amount: 0.7, example_unit_asked: 0.001 }, moves: [0.01, 0.001] },
  };
  // A three-section lesson: the first card in section 1, the second card in section 2 (its create writing the example,
  // or nothing), a text in section 3. The outline holds the first card's numbers only: the program adds the second's.
  // opts: plan (→ plan), moves, mutate(plan), section3, outlineNumbers, language.
  const lesson = async (kind, example = KINDS[kind].example, replies, opts = {}) => {
    const plan = (opts.plan ?? KINDS[kind].plan)();
    const card = structuredClone(plan.sections[0].moments[0].actions[0]);
    const declared = plan.numbers.length;
    const demonstration = declared + 1;
    plan.sections[1].reusable_items = [{ kind: "board_item", board_kind: "visual", capability: kind }];
    plan.sections[1].moments.push({ narration: "再看一个例子。", actions: [{ ...card, content: { ...card.content, parameters: { ...(card.content.parameters ?? {}), ...example }, numbers: [1, 2] }, reusable_item: 1 }] },
      ...(opts.moves ?? KINDS[kind].moves).map((value) => ({ narration: "看。", actions: [animate(demonstration, value)] })));
    plan.sections[2] = opts.section3 ?? { purpose: "Sum up", moments: [{ narration: "小结。", actions: [{ action: "create", kind: "text", role: "follow_up_explanation", content: { text: "summary" }, placement: { relation: "new_region" } }] }] };
    opts.mutate?.(plan);
    const kept = plan.numbers.length;
    const compatible = sp.makeSamplePlanModelCompatible(plan);
    const drafts = compatible.sections.map(({ moments, student_activities }, index) => H.toModelSectionDraft({ section: index + 1, version: compatible.version, moments, student_activities }));
    const stage = { outline: H.stagedOutline(compatible, drafts), drafts };
    stage.outline.numbers = stage.outline.numbers.slice(0, opts.outlineNumbers ?? kept);
    const log = { requests: [], prompts: [], adjustments: [], rejected: [], ready: [], published: [] };
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
        if (request.section === 3 && JSON.parse(request.prompt).removed_picture) { delete draft.course_visual_creates; draft.moments = draft.moments.slice(-1); }
        return JSON.stringify(replies?.(request, draft) ?? draft);
      }, { turn_id: "second-card", learner_request: "再讲一个例子", language: opts.language ?? "zh-CN" }, {
        max_attempts_per_part: 3,
        on_outline_ready: (event) => log.ready.push(event),
        on_program_adjustment: (adjustment) => log.adjustments.push([adjustment.kind, adjustment.section, adjustment.capability ?? null, adjustment.reason]),
        on_rejected_part: (part) => log.rejected.push([part.section, part.error.code, part.error.message.slice(0, 240)]),
        on_playable_prefix: ({ compiled }) => log.published.push(normalizeAuthoringLesson(compiled.lesson, { lessonId: "p", boardId: "b", baseRevision: 0, regionIntent: "new_topic" })[0].lesson.variables ?? []),
      })).lesson;
    } catch (caught) { log.error = caught.message.slice(0, 300); }
    const actions = log.lesson ? log.lesson.steps.flatMap((step, at) => step.beats.flatMap((beat) => beat.actions.map((action) => ({ ...action, step: at + 1 })))) : [];
    const second = log.prompts[log.requests.indexOf("lesson-plan-section2")];
    const third = log.prompts[log.requests.lastIndexOf("lesson-plan-section3")];
    // Every variable a published part declared is declared the same in the next part.
    const changed = log.published.slice(1).flatMap((now, k) => log.published[k].filter((before) => JSON.stringify(now.find((each) => each.as === before.as)) !== JSON.stringify(before)).map((before) => (k + 1) + "->" + (k + 2) + ":" + before.as));
    return { changed, parts: log.published.length, error: log.error, requests: log.requests, rejected: log.rejected, adjustments: log.adjustments, ready: log.ready,
      cards: actions.filter((action) => action.do === "write" && action.kind === kind).map((action) => [action.step, action.content]),
      moved: actions.filter((action) => action.do === "animate").map((action) => [action.step, action.variable, action.value]),
      variables: (log.lesson?.lesson.variables ?? []).map((variable) => variable.as),
      tasks: (log.lesson?.lesson.tasks ?? []).map((task) => [task.completion.kind, task.completion.node ?? task.anchor]),
      initials: (log.lesson?.lesson.variables ?? []).map((variable) => [variable.as, variable.initial]),
      sectionTwoNumbers: second && JSON.parse(second).course_and_section.numbers.map(({ number, label }) => [number, label]),
      sectionThreeNumbers: third && JSON.parse(third).course_and_section.numbers.map(({ number, label, initial }) => [number, label, initial]) };
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
    // Every published part extends the one before: the second card's number starting where the card starts changes
    // no variable a part already declared.
    assert.equal(result.parts, 3);
    assert.deepEqual(result.changed, []);
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

// Review round 1 of #199 (the reviewer's probes, as tests).
const line = (numbers, slot) => ({ action: "create", kind: "visual", role: "supporting_visual", content: { capability: "number_line_compare", parameters: {}, numbers }, placement: { relation: "new_region" }, reusable_item: slot });
const lineInSectionOne = (numbers) => `(plan) => { const first = plan.sections[0]; first.reusable_items = [...first.reusable_items, { kind: "board_item", board_kind: "visual", capability: "number_line_compare" }]; first.moments.push({ narration: "数轴。", actions: [${JSON.stringify(line(numbers, 0)).replace('"reusable_item":0', '"reusable_item":first.reusable_items.length')}] }); }`;

for (const [kind, plan, example, moves] of [
  ["make_ten", "KINDS.make_ten.plan", undefined, [10]],
  ["place_value_trade", `() => sp.placeValueTradePlan({ operation: "add", numbers: [47, 38], practice: [56, 27] })`, { example_first_number: 68, example_second_number: 25 }, [1, 2]],
]) {
  test(`${kind}: a copy of the question's pair published in section 1 keeps its variables when the second card's number arrives`, () => {
    const result = run(`console.log(JSON.stringify(await lesson(${JSON.stringify(kind)}, ${JSON.stringify(example)}, undefined, { plan: ${plan}, moves: ${JSON.stringify(moves)}, mutate: ${lineInSectionOne([1, 2])} })));`);
    assert.equal(result.error, undefined, result.error);
    assert.deepEqual(result.rejected, []);
    assert.ok(result.parts >= 2);
    assert.deepEqual(result.changed, []);
    assert.ok(result.variables.includes("number_17"), JSON.stringify(result.variables));
    assert.equal(result.cards.length, 2);
  });
}

test("a picture on the second card's demonstration number is refused at once with the fact: it is not the card's problem", () => {
  const result = run(`
    const back = (request, draft) => { if (request.section === 3 && JSON.parse(request.prompt).removed_picture) { delete draft.course_visual_creates; draft.moments = draft.moments.slice(-1); } return draft; };
    const section3 = { purpose: "line", reusable_items: [{ kind: "board_item", board_kind: "visual", capability: "number_line_compare" }], moments: [
      { narration: "数轴。", actions: [${JSON.stringify(line([7, 2], 1))}] }, { narration: "回到那张卡片。", restart_numbers: [7], actions: [animate(7, 10)] }] };
    console.log(JSON.stringify(await lesson("make_ten", undefined, back, { section3 })));
  `);
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result.rejected.map(([section, code]) => [section, code]), [[3, "LESSON_PLAN_SHARED_NUMBER"]]);
  assert.match(result.rejected[0][2], /lesson number 7 is the number the second make-ten card's demonstration moves; the number_line_compare visual shows it too/u);
  // No copy: the second card's number stays its own; its demonstration plays again in section 3.
  assert.ok(!result.variables.some((alias) => /^number_1[7-9]$/u.test(alias)), JSON.stringify(result.variables));
  assert.ok(result.moved.some(([step, variable]) => step === 3 && variable.startsWith("section_02_")), JSON.stringify(result.moved));
});

for (const kind of ["make_ten", "place_value_trade", "place_value_times_ten"]) {
  test(`${kind}: an outline with room for the second card's number keeps it; one at 16 numbers withdraws the second card before its section, the lesson stays`, () => {
    const result = run(`
      const extra = (n) => () => { const plan = KINDS[${JSON.stringify(kind)}].plan(); for (let i = plan.numbers.length; i < n; i += 1) plan.numbers.push({ initial: i, min: 0, max: 20, label: "extra " + (i + 1) }); return plan; };
      const at = async (n) => { const r = await lesson(${JSON.stringify(kind)}, undefined, undefined, { plan: extra(n), outlineNumbers: n, moves: [] }); return { error: r.error, rejected: r.rejected, adjustments: r.adjustments, cards: r.cards.length, requests: r.requests }; };
      console.log(JSON.stringify({ fifteen: await at(15), sixteen: await at(16) }));
    `);
    assert.equal(result.fifteen.error, undefined, result.fifteen.error);
    assert.deepEqual([result.fifteen.cards, result.fifteen.adjustments], [2, []]);
    assert.equal(result.sixteen.error, undefined, result.sixteen.error);
    assert.deepEqual(result.sixteen.rejected, []);
    assert.deepEqual(result.sixteen.adjustments.map(([kind, section, capability, reason]) => [kind, section, capability, reason]), [["visual_removed", 2, kind, "planned_card_budget"]]);
    assert.deepEqual([result.sixteen.cards, result.sixteen.requests], [1, ["lesson-plan-bootstrap", "lesson-plan-section2", "lesson-plan-section3"]]);
  });
}

test("a trade example on other places than the question's, or a subtraction written small first, is refused with the fact naming the example", () => {
  const result = run(`
    const plan = () => sp.placeValueTradePlan({ operation: "subtract", numbers: [8.2, 3.75], practice: [6.4, 2.85] });
    const first = async (example) => (await lesson("place_value_trade", example, undefined, { plan, moves: [1] })).rejected[0]?.[2];
    console.log(JSON.stringify({ places: await first({ example_first_number: 73.1, example_second_number: 2.65 }), swapped: await first({ example_first_number: 2.65, example_second_number: 7.1 }) }));
  `);
  assert.match(result.places, /the second place-value trade card's example 73\.1, 2\.65 has other places than the question's pair 8\.2, 3\.75: the second card keeps the question's places/u);
  assert.match(result.swapped, /the second place-value trade card's example 2\.65 − 7\.1: 2\.65 − 7\.1 is below zero: the first number is the larger/u);
});

test("an English lesson labels the second card's number in English", () => {
  const result = run(`console.log(JSON.stringify(await lesson("make_ten", undefined, undefined, { language: "en" })));`);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.sectionTwoNumbers.at(-1)[1], "second example: in the bigger number's frame");
});

for (const [kind, label, start] of [
  ["make_ten", "第二个例子：大数那一框里有几个", 9],
  ["place_value_trade", "第二个例子：做完了几列", 0],
  ["place_value_times_ten", "第二个例子：现在用什么单位在数", 0.1],
]) {
  test(`${kind}: a first card that writes example parameters is still the first; the second card is recognised; later sections read the second card's number from its start`, () => {
    const result = run(`
      const mutate = (plan) => { const content = plan.sections[0].moments[0].actions[0].content; content.parameters = { ...(content.parameters ?? {}), ...KINDS[${JSON.stringify(kind)}].example }; };
      console.log(JSON.stringify(await lesson(${JSON.stringify(kind)}, undefined, undefined, { mutate })));
    `);
    assert.equal(result.error, undefined, result.error);
    assert.deepEqual(result.rejected, []);
    assert.deepEqual(result.cards.map(([step]) => step), [1, 2]);
    assert.equal(result.variables.filter((alias) => alias.startsWith("section_02_")).length, 1);
    assert.deepEqual(result.changed, []);
    const [, named, initial] = result.sectionThreeNumbers.at(-1);
    assert.deepEqual([named, initial], [label, start]);
  });
}

test("the acceptance budget counts the second card's number: section 1 at 16 variables leaves it no room", () => {
  const result = run(`
    const outline = { version: "0.1", title: "Two examples", goals: ["one"], numbers: [{ initial: 8, min: 1, max: 9 }, { initial: 6, min: 1, max: 9 }, { initial: 7, min: 1, max: 9 }, { initial: 5, min: 1, max: 9 }],
      course_visuals: [1, 2].map((section) => ({ capability: "make_ten", create_section: section, use_sections: [section], relation: "primary", reusable_item: 1 })),
      sections: [1, 2, 3].map(() => ({ purpose: "Teach", allowed_capabilities: ["make_ten"] })), close: { summary: "Review." } };
    console.log(JSON.stringify({ fifteen: api.plannedSecondCardOverflow(outline, 15), sixteen: api.plannedSecondCardOverflow(outline, 16) }));
  `);
  assert.deepEqual(result.fifteen, []);
  assert.deepEqual(result.sixteen.map(({ capability, section }) => [capability, section]), [["make_ten", 2]]);
  assert.match(result.sixteen[0].detail, /the lesson holds at most 16 numbers \(OLL\): section 1 uses 16; the second make_ten card needs one more/u);
});

test("section 1 at 16 variables (the trade card and three other pictures) withdraws the second trade card at acceptance; at 15 it stays; every part extends the one before", () => {
  const result = run(`
    const big = () => sp.placeValueTradePlan({ operation: "add", numbers: [456789, 345678], practice: [356789, 245678] });
    const extras = (capabilities) => (plan) => {
      const base = plan.numbers.length, first = plan.sections[0];
      first.reusable_items = [...(first.reusable_items ?? [])];
      let added = 0;
      for (const capability of capabilities) {
        const sample = sp.samplePlan(capability);
        const create = structuredClone(sample.sections[0].moments[0].actions.find((action) => action.action === "create"));
        const numbers = create.content.numbers.map((number) => { plan.numbers.splice(base + added, 0, structuredClone(sample.numbers[number - 1])); added += 1; return base + added; });
        first.reusable_items.push({ kind: "board_item", board_kind: "visual", capability });
        first.moments.push({ narration: capability + "。", actions: [{ ...create, role: "supporting_visual", content: { ...create.content, numbers }, placement: { relation: "new_region" }, reusable_item: first.reusable_items.length }] });
      }
      for (const moment of plan.sections[1].moments) for (const action of moment.actions) if (action.action === "animate" && action.number === base + 1) action.number = base + added + 1;
    };
    const at = async (capabilities) => {
      const r = await lesson("place_value_trade", { example_first_number: 556789, example_second_number: 145678 }, undefined, { plan: big, moves: [3, 6], mutate: extras(capabilities) });
      return { error: r.error, rejected: r.rejected, adjustments: r.adjustments, cards: r.cards.length, changed: r.changed, parts: r.parts, variables: r.variables.length };
    };
    console.log(JSON.stringify({ sixteen: await at(["number_line_steps", "number_line_compare", "rectangle_unit_square_array"]), fifteen: await at(["number_line_steps", "number_line_compare", "number_line"]) }));
  `);
  for (const each of [result.sixteen, result.fifteen]) {
    assert.equal(each.error, undefined, each.error);
    assert.deepEqual([each.rejected, each.changed, each.parts, each.variables], [[], [], 3, 16]);
  }
  assert.deepEqual(result.sixteen.adjustments, [["visual_removed", 2, "place_value_trade", "planned_card_budget"]]);
  assert.equal(result.sixteen.cards, 1);
  assert.deepEqual([result.fifteen.adjustments, result.fifteen.cards], [[], 2]);
});

test("make_ten: a copy of the question's pair published in section 2 keeps its variables when the second card arrives in section 3", () => {
  const result = run(`
    const line = ${JSON.stringify(line([1, 2], 0))};
    const mutate = (plan) => {
      const two = plan.sections[1], cardMoments = two.moments.slice(1), cardItem = two.reusable_items.at(-1);
      two.reusable_items = [{ kind: "board_item", board_kind: "visual", capability: "number_line_compare" }];
      two.moments = [two.moments[0], { narration: "数轴。", actions: [{ ...line, reusable_item: 1 }] }, { narration: "移动。", actions: [animate(1, 9)] }];
      plan.sections[2] = { purpose: "Another example", reusable_items: [cardItem], moments: cardMoments.map((moment) => ({ ...moment, actions: moment.actions.map((action) => (action.action === "create" ? { ...action, reusable_item: 1 } : action)) })) };
      plan.sections[3] = { purpose: "Sum up", moments: [{ narration: "小结。", actions: [{ action: "create", kind: "text", role: "follow_up_explanation", content: { text: "summary" }, placement: { relation: "new_region" } }] }] };
    };
    console.log(JSON.stringify(await lesson("make_ten", undefined, undefined, { mutate })));
  `);
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(result.rejected, []);
  assert.deepEqual([result.parts, result.changed], [4, []]);
  assert.ok(result.variables.includes("number_17"), JSON.stringify(result.variables));
  assert.deepEqual(result.cards.map(([step]) => step), [1, 3]);
});
