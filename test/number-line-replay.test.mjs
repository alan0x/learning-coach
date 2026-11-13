// Number line lessons through the real path, from the model's reply to the lesson. The trial recipe
// is offered only when LEARNING_COACH_TRIAL_RECIPES names it, which Coach reads as it loads; this file
// sets it first (the recipe tests check the default in their own process).
process.env.LEARNING_COACH_TRIAL_RECIPES = "number_line,number_line_compare,number_line_solution,number_line_rounding";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The model never writes a slider step: its reply's numbers get one derived from the range
// (span / 200). These tests go through the real path, from the model's reply to the lesson, with the
// replies recorded in speed check run 5 (2026-11-11), so they see what a live lesson sees.
const { replayTurn } = await import(new URL("../scripts/replay-trial-recipe.mjs", import.meta.url));
const { NUMBER_LINE_CASES, NUMBER_LINE_QUALITY_CASES, NUMBER_LINE_COMPARE_CASES, NUMBER_LINE_SOLUTION_CASES, NUMBER_LINE_ROUNDING_CASES, judgeNumberLine, numberLineLesson } = await import(new URL("../scripts/eval-trial-recipe-speed.mjs", import.meta.url));
const run5 = JSON.parse(await readFile(new URL("./fixtures/number-line-run5-replies.json", import.meta.url), "utf8"));
const caseById = new Map([...NUMBER_LINE_CASES, ...NUMBER_LINE_QUALITY_CASES, ...NUMBER_LINE_COMPARE_CASES, ...NUMBER_LINE_SOLUTION_CASES, ...NUMBER_LINE_ROUNDING_CASES].map((item) => [item.id, item]));
const replay = (turn) => replayTurn(turn.replies.map((reply) => JSON.stringify(reply)), caseById.get(turn.case).prompt);

// Run 5's turns, judged as the live run judged them. 29 of 40 passed live; every unreadable line was the
// program's (targets rounded onto the derived step before the fit, the derived step read as the
// lesson's unit, a fit that discarded itself). NL-18 in pair 55 is the model's slip: 2/3 written with
// the wrong decimal scale (66,666,666,666.7) in the outline, which section retries cannot change.
for (const turn of run5.turns) {
  const modelSlip = turn.case === "NL-18" && turn.pair === 55;
  // Written under run 5's card, which did not ask for one step as the move (see the NL-10 test below).
  if (turn.case === "NL-10") continue;
  test(`run 5 replay ${turn.case} (pair ${turn.pair}): ${modelSlip ? "the model's slip stays a miss" : "passes the hard checks"}`, async () => {
    const { lesson, error } = await replay(turn);
    if (modelSlip) { assert.equal(lesson, undefined); assert.match(error, /exhausted/); return; }
    assert.ok(lesson, error);
    assert.deepEqual(judgeNumberLine(caseById.get(turn.case), numberLineLesson(lesson)).hard, []);
  });
}

test("a target the number already starts at: the line starts at 0, moves to 3/4 as it appears, and returns for the learner (owner, option a)", async () => {
  // Run 5's NL-03: the change starts at 0.75 and the task asks for 0.75; live, the target became 0.76.
  const { lesson } = await replay(run5.turns.find((turn) => turn.pair === 4));
  const line = numberLineLesson(lesson);
  const change = line.variables[1];
  assert.equal(change.initial, 0);
  assert.deepEqual(line.animations.filter(([variable]) => variable === change.as).map(([, value]) => value), [0.75, 0]);
  assert.deepEqual(line.tasks.map((task) => task.completion.value), [0.75]);
  assert.equal(line.content.ticks.subdivisions, 4);
  assert.equal(change.control.step, 0.25);
});

test("whole-number lessons get whole-number ticks however their derived slider step reads (23 + 48 had 0.5)", async () => {
  const { lesson } = await replay(run5.turns.find((turn) => turn.pair === 42));
  const line = numberLineLesson(lesson);
  assert.deepEqual([line.content.ticks.step, line.content.ticks.subdivisions], [1, 1]);
  assert.ok(line.variables.every((variable) => variable.control.step === 1));
});

test("counting by fourths with whole values only (run 5's card) never shows a fourth: a hard miss the new card addresses", async () => {
  // Run 5's NL-10 moved 0 → 1 → 2. The card now asks for one step (0.25) as the move; run 6 measures it.
  const { lesson } = await replay(run5.turns.find((turn) => turn.case === "NL-10"));
  const { hard, soft } = judgeNumberLine(caseById.get("NL-10"), numberLineLesson(lesson));
  assert.match(hard.join(), /0\.25 is never shown/);
  assert.deepEqual(soft, ["1 parts, not 4"]);
});

test("a target the lesson ends on: the line goes back to 0 after the last moment (run 5's NL-19 animated to 48, then asked for 48)", async () => {
  const { lesson } = await replay(run5.turns.find((turn) => turn.pair === 28));
  const line = numberLineLesson(lesson);
  const change = line.variables[1];
  assert.equal(change.initial, 0);
  const moves = line.animations.filter(([variable]) => variable === change.as).map(([, value]) => value);
  assert.equal(moves.at(-1), 0);
  assert.deepEqual(line.tasks.map((task) => task.completion.value), [48]);
  assert.ok(!judgeNumberLine(caseById.get("NL-19"), line).hard.some((miss) => /already met/.test(miss)));
});

test("a lesson of two sections: every compile of the growing lesson returns the line once, at the lesson's end", async () => {
  // Run 5's NL-20 (17 + 26) planned two sections; the run stopped at the first. Its second section is
  // written here in the model's format: it breaks 26 into 3 and 23, ends on 26, and asks for 26 again.
  const turn = run5.turns.find((entry) => entry.pair === 43);
  const second = {
    moments: [
      { narration: "Break 26 into friendly jumps: first 3, to reach 20.", delivery: "patient", animations: [{ timing: "during_speech", number: 2, end_value: { mantissa: 3, scale: 0 }, duration_intent: "normal" }] },
      { narration: "Then 23 more: 26 in all, and we land on 43.", delivery: "encouraging", animations: [{ timing: "during_speech", number: 2, end_value: { mantissa: 26, scale: 0 }, duration_intent: "normal" }] },
    ],
    number_activities: [{ prompt: "Set the change to 26 once more.", hints: ["Move the slider to 26."], number: 2, value_mantissa: 26, value_scale: 0 }],
  };
  const replies = [...turn.replies, second].map((reply) => JSON.stringify(reply));
  const { generateLessonPlanWithModel } = await import(new URL("../lesson-plan.js", import.meta.url));
  const prefixes = [];
  let next = 0;
  const generated = await generateLessonPlanWithModel(async () => replies[next++], { turn_id: "two-sections", learner_request: caseById.get("NL-20").prompt, input_modality: "text", request_source: "self_contained" }, {
    on_playable_prefix: ({ compiled, completed_sections }) => prefixes.push({ sections: completed_sections, line: numberLineLesson(compiled.lesson) }),
  });
  assert.deepEqual(prefixes.map((prefix) => prefix.sections), [1, 2]);
  for (const { line } of [...prefixes, { line: numberLineLesson(generated.lesson) }]) {
    const change = line.variables[1];
    const moves = line.animations.filter(([variable]) => variable === change.as).map(([, value]) => value);
    assert.equal(change.initial, 0);
    assert.equal(moves.filter((value) => value === 0).length, 1, `one return to 0: ${moves.join(", ")}`);
    assert.equal(moves.at(-1), 0);
    assert.ok(!judgeNumberLine(caseById.get("NL-20"), line).hard.some((miss) => /already met/.test(miss)));
  }
});

test("a starting value at the wrong scale is refused in the outline, where a retry can fix it (NL-18 in runs 5 and 6)", async () => {
  // The model wrote 2/3 as mantissa 666666666667 with scale 1. Before, the range widened to fit it
  // and the lesson failed three times at compile, where only the section is retried.
  const turn = run5.turns.find((entry) => entry.pair === 55);
  const { generateLessonPlanWithModel } = await import(new URL("../lesson-plan.js", import.meta.url));
  const requests = [], rejected = [];
  await assert.rejects(generateLessonPlanWithModel(async (request) => {
    requests.push(request.label);
    if (requests.length > 1) throw new Error("stop after the retry is requested");
    return JSON.stringify(turn.replies[0]);
  }, { turn_id: "scale", learner_request: caseById.get("NL-18").prompt, input_modality: "text", request_source: "self_contained" }, {
    on_rejected_part: (event) => rejected.push(event),
  }));
  assert.deepEqual(requests, ["lesson-plan-bootstrap", "lesson-plan-outline"]);
  assert.equal(rejected[0].error.code, "LESSON_PLAN_NUMBER_RANGE");
  assert.match(rejected[0].error.message, /mantissa and scale/);
});

// Run 7: faults only the outline can fix. "Compare 2/3 and 3/5" needed fifteenths (now with 3/5 replaced by 1/25: 75ths), and an outline declared
// no numbers for its number line; each failed three times at section 1, where retries can only rewrite
// the section. Now the bootstrap is rejected and the outline is asked again, without the number line.

// Decision 0016 lets a unit split into 24 parts, so 2/3 and 3/5 (fifteenths) now draw. The tests of the
// "too fine for the ticks" path keep the recorded replies but replace 3/5 (written as 0.6, or as the
// difference 1/15) with 1/25: 2/3 and 1/25 need 75ths, still beyond 24.
const tooFine = (replies) => {
  const value = (mantissa, scale) => Number(mantissa) / 10 ** Number(scale);
  const swap = (mantissa, scale) => {
    const v = value(mantissa, scale);
    return Math.abs(v - 0.6) < 1e-6 || Math.abs(v - 1 / 15) < 1e-3 ? [4, 2] : undefined;
  };
  const walk = (node) => {
    if (!node || typeof node !== "object") return node;
    if ("mantissa" in node && "scale" in node) {
      const replaced = swap(node.mantissa, node.scale);
      if (replaced) { node.mantissa = replaced[0]; node.scale = replaced[1]; }
    }
    for (const [key, child] of Object.entries(node)) {
      if (key.endsWith("_mantissa")) {
        const scaleKey = key.replace(/_mantissa$/u, "_scale");
        const replaced = swap(child, node[scaleKey]);
        if (replaced) { node[key] = replaced[0]; node[scaleKey] = replaced[1]; }
      } else walk(child);
    }
    return node;
  };
  return replies.map((reply) => walk(structuredClone(reply)));
};
const run7Recorded = JSON.parse(await readFile(new URL("./fixtures/number-line-run7-outline-faults.json", import.meta.url), "utf8"));
const run7 = { ...run7Recorded, turns: run7Recorded.turns.map((turn) => (turn.case === "NM-01" ? { ...turn, replies: tooFine(turn.replies) } : turn)) };
for (const turn of run7.turns) {
  test(`run 7 ${turn.case} (pair ${turn.pair}): a fault the outline owns asks for a new outline without the number line`, async () => {
    const { generateLessonPlanWithModel } = await import(new URL("../lesson-plan.js", import.meta.url));
    const requests = [];
    const rejected = [];
    await assert.rejects(generateLessonPlanWithModel(async (request) => {
      requests.push(request);
      // The bootstrap may itself be rejected for a wrong-scale number first (2/3 as 666666666667, scale 1);
      // then the recorded outline retry is replayed, and its section 1 is compiled in turn.
      if (request.label === "lesson-plan-bootstrap") return JSON.stringify(turn.replies[0]);
      // The recorded replies, in order, while the number line is still offered; the request that no
      // longer offers it is where this test stops.
      const offered = request.label !== "lesson-plan-outline"
        || JSON.parse(request.prompt).visual_recipes.some(([features]) => features.includes("number_line"));
      const recorded = turn.replies[requests.length - 1];
      if (offered && recorded) return JSON.stringify(recorded);
      throw new Error("stop: " + request.label);
    }, { turn_id: "outline-fault", learner_request: caseById.get(turn.case).prompt, input_modality: "text", request_source: "self_contained" }, {
      on_rejected_part: (event) => rejected.push(event),
    }), /stop: lesson-plan-outline/);
    const last = requests.at(-1);
    assert.equal(last.label, "lesson-plan-outline");
    const prompt = JSON.parse(last.prompt);
    assert.ok(!prompt.visual_recipes.some(([features]) => features.includes("number_line")), "the new outline is asked without the number line");
    assert.ok(!JSON.stringify(last.response_schema).includes('"number_line"'), "its schema no longer offers the number line's feature either");
    assert.match(prompt.previous_validation_error ?? "", /number line|number_line/);
    assert.ok(rejected.some((event) => event.error.code === "LESSON_PLAN_OUTLINE_VISUAL"));
  });
}

test("a visual whose own range clamps a task onto its starting value moves the task's target (probe 3: unit squares 15 → 20, both capped)", async () => {
  // The fallback outline chose a unit-square array: 15 squares, task "set it to 20". The array caps its
  // count, so both became the same and OLL rejected the task as already met, three times over.
  const recorded = JSON.parse(await readFile(new URL("./fixtures/clamped-met-target-replies.json", import.meta.url), "utf8"));
  const fixture = { ...recorded, replies: tooFine(recorded.replies) };
  const { generateLessonPlanWithModel } = await import(new URL("../lesson-plan.js", import.meta.url));
  let next = 0;
  let lesson;
  await assert.rejects(generateLessonPlanWithModel(async () => JSON.stringify(fixture.replies[next++]), { turn_id: "clamped", learner_request: fixture.request, input_modality: "text", request_source: "self_contained" }, {
    on_playable_prefix: ({ compiled }) => { lesson = compiled.lesson; throw new Error("first playable"); },
  }), /first playable/);
  const count = lesson.lesson.variables[0];
  const task = lesson.lesson.tasks.find((entry) => entry.completion.expression === count.as);
  assert.ok(Math.abs(task.completion.value - count.initial) > task.completion.tolerance, `${task.completion.value} vs ${count.initial}`);
  assert.ok(task.completion.value >= count.min && task.completion.value <= count.max);
  assert.match(task.prompt, new RegExp(String(task.completion.value)));
});

test("a replacement outline goes through the same acceptance: one that marks the request unsupported ends the lesson there (review of #63)", async () => {
  // Run 7's first NM-01 turn: the bootstrap fails its scale check, the fallback outline's section 1 needs
  // fifteenths, and the outline is asked again without the number line. That replacement says the
  // request cannot be presented: the learner gets that answer, and no further section is requested.
  const turn = run7.turns[0];
  const replacement = structuredClone(turn.replies[1]);
  replacement.course.course_visuals = [];
  replacement.course.request_coverage = [{ treatment: "unsupported", sections: [], reason: "比较这两个分数需要更细的刻度。" }];
  const { generateLessonPlanWithModel } = await import(new URL("../lesson-plan.js", import.meta.url));
  const labels = [];
  const outlines = [];
  const result = await generateLessonPlanWithModel(async (request) => {
    labels.push(request.label);
    if (labels.length <= 3) return JSON.stringify(turn.replies[labels.length - 1]);
    if (labels.length === 4) return JSON.stringify(replacement);
    throw new Error(`unexpected request ${request.label}`);
  }, { turn_id: "unsupported-replacement", learner_request: caseById.get("NM-01").prompt, input_modality: "text", request_source: "self_contained" }, {
    on_outline_ready: (event) => outlines.push(event.sections),
  });
  assert.deepEqual(labels, ["lesson-plan-bootstrap", "lesson-plan-outline", "lesson-plan-section", "lesson-plan-outline"]);
  assert.equal(result.disposition, "unsupported");
  assert.match(result.learner_response, /更细的刻度/);
  assert.equal(outlines.length, 2, "the outline-ready report is refreshed for the replacement");
});

test("logger, capture and replay agree: streamed (pretty-printed) and envelope replies come back whole (review of #63)", async () => {
  const api = await import(new URL("../lesson-plan.js", import.meta.url));
  const { recordedReplies } = await import(new URL("../scripts/replay-trial-recipe.mjs", import.meta.url));
  // As the harness keeps them: each framed line without its prefix, one per line.
  const turn = run7.turns[0];
  const lines = [
    api.frameRawReply({ provider: "google", label: "lesson-plan-bootstrap", kind: "content", body: JSON.stringify(turn.replies[0], null, 2) }),
    api.frameRawReply({ provider: "Gemini API", label: "lesson-plan-outline", kind: "payload", body: { candidates: [{ content: { parts: [{ text: JSON.stringify(turn.replies[1]) }] } }] } }),
    api.frameRawReply({ provider: "google", label: "lesson-plan-section", kind: "content", body: JSON.stringify(turn.replies[2], null, 2) }),
  ].map((line) => line.slice(api.RAW_REPLY_PREFIX.length));
  const texts = recordedReplies(lines.join(""));
  assert.deepEqual(texts.map((text) => JSON.parse(text)), turn.replies);
  // Replayed, the streamed bootstrap reaches the same outcome as the recorded one.
  const first = run5.turns.find((entry) => entry.case === "NL-01");
  const streamed = recordedReplies(api.frameRawReply({ provider: "google", label: "lesson-plan-bootstrap", kind: "content", body: JSON.stringify(first.replies[0], null, 2) }).slice(api.RAW_REPLY_PREFIX.length));
  const { lesson } = await replay({ ...first, replies: streamed.map((text) => JSON.parse(text)) });
  assert.deepEqual(judgeNumberLine(caseById.get("NL-01"), numberLineLesson(lesson)).hard, []);
});

// Decision 0016: comparing two numbers (number_line_compare). Built from run 5's "compare 0.5 and 0.8"
// reply: the outline asks for number_comparison, and its two numbers are the two compared values.
const compareReply = (first, second, extra = {}) => {
  const turn = run5.turns.find((entry) => entry.case === "NL-07");
  const reply = structuredClone(turn.replies[0]);
  const decimal = (value) => {
    for (let scale = 0; scale <= 12; scale += 1) if (Math.abs(Math.round(value * 10 ** scale) - value * 10 ** scale) < 1e-6) return { mantissa: Math.round(value * 10 ** scale), scale };
    return { mantissa: Math.round(value * 1e12), scale: 12 };
  };
  reply.course.outline.numbers = [first, second].map(([value, label]) => ({ initial: decimal(value), min: { mantissa: 0, scale: 0 }, max: { mantissa: 1, scale: 0 }, label, unit: "" }));
  reply.course.outline.course_visuals[0].required_features = ["number_line", "number_comparison"];
  const section = reply.course.first_section;
  for (const moment of section.moments) delete moment.animations;
  section.number_activities = extra.activities ?? section.number_activities.map((activity) => ({ ...activity, number: 2, value_mantissa: decimal(second[0]).mantissa, value_scale: decimal(second[0]).scale }));
  return reply;
};
const compileCompare = async (reply, prompt) => {
  const { generateLessonPlanWithModel } = await import(new URL("../lesson-plan.js", import.meta.url));
  let lesson;
  const rejected = [];
  try {
    await generateLessonPlanWithModel(async () => JSON.stringify(reply), { turn_id: "compare", learner_request: prompt, input_modality: "text", request_source: "self_contained" }, {
      on_rejected_part: (event) => rejected.push(`${event.label}: ${event.error.message}`),
      on_playable_prefix: ({ compiled }) => { lesson = compiled.lesson; throw new Error("first playable"); },
    });
  } catch (error) {
    if (!lesson) throw new Error(`no first playable part: ${rejected[0] ?? error.message}`);
  }
  return lesson;
};

test("comparing 0.5 and 0.8: two points on tenths, labelled in decimals, and the line returns before the learner's turn", async () => {
  const lesson = await compileCompare(compareReply([0.5, "0.5"], [0.8, "0.8"]), caseById.get("NL-07").prompt);
  const line = numberLineLesson(lesson);
  assert.deepEqual(line.content.points.map((point) => [point.as, point.label]), [["first", "0.5"], ["second", "0.8"]]);
  assert.deepEqual([line.content.ticks.subdivisions, line.content.ticks.format], [10, "decimal"]);
  assert.deepEqual(judgeNumberLine(caseById.get("NL-07"), line).hard, []);
  // The recorded task asks for 0.8, where the second number starts: it starts at 0, moves to 0.8 as
  // the line appears, and returns for the learner (owner's option a, through the family safeguard).
  const second = line.variables[1];
  assert.equal(second.initial, 0);
  assert.deepEqual(line.animations.filter(([variable]) => variable === second.as).map(([, value]) => value), [0.8, 0]);
});

test("comparing 2/3 and 3/5 shares fifteenths; 5/6 and 7/8 share 24ths (decision 0016)", async () => {
  const fifteenths = numberLineLesson(await compileCompare(compareReply([2 / 3, "2/3"], [0.6, "3/5"], { activities: [] }), "用数轴比较 2/3 和 3/5 哪个大。"));
  assert.equal(fifteenths.content.ticks.subdivisions, 15);
  assert.deepEqual(judgeNumberLine({ expect: { values: [2 / 3, 0.6] } }, fifteenths).hard, []);
  const twentyFourths = numberLineLesson(await compileCompare(compareReply([5 / 6, "5/6"], [7 / 8, "7/8"], { activities: [] }), caseById.get("CMP-03").prompt));
  assert.equal(twentyFourths.content.ticks.subdivisions, 24);
  assert.deepEqual(judgeNumberLine(caseById.get("CMP-03"), twentyFourths).hard, []);
});

// Review of #67: different requested values must never become one point. 0.66 is 2/3 cut to two places
// and 0.67 is 2/3 rounded; 0.166 and 0.167 the same for 1/6. Snapped to 2/3 (1/6), they would coincide
// while keeping their own labels. The fit keeps them as written, and the line, which no grid up to 24
// parts can draw them on, is refused: the outline is asked again without the number line.
for (const [low, high] of [[0.66, 0.67], [0.166, 0.167]]) {
  for (const decimalQuestion of [true, false]) {
    test(`comparing ${low} and ${high}${decimalQuestion ? " in a decimal question" : ""}: never one point; refused at the outline (review of #67)`, async () => {
      const reply = compareReply([low, String(low)], [high, String(high)], { activities: [] });
      const parameters = reply.course.first_section.moments[0].visual_creates[0].content.parameters;
      if (decimalQuestion) parameters.label_style = "decimal"; else delete parameters.label_style;
      const { generateLessonPlanWithModel } = await import(new URL("../lesson-plan.js", import.meta.url));
      const rejected = [];
      const labels = [];
      let drawn;
      await assert.rejects(generateLessonPlanWithModel(async (request) => {
        labels.push(request.label);
        if (request.label === "lesson-plan-bootstrap") return JSON.stringify(reply);
        throw new Error(`stop: ${request.label}`);
      }, { turn_id: "literal", learner_request: `Compare ${low} and ${high} on a number line.`, input_modality: "text", request_source: "self_contained" }, {
        on_rejected_part: (event) => rejected.push(event.error.code),
        on_playable_prefix: ({ compiled }) => { drawn = numberLineLesson(compiled.lesson); },
      }), /stop: lesson-plan-outline/);
      assert.equal(drawn, undefined, "no lesson with coincident points is published");
      assert.deepEqual(labels, ["lesson-plan-bootstrap", "lesson-plan-outline"]);
      assert.ok(rejected.includes("LESSON_PLAN_OUTLINE_VISUAL"), rejected.join());
    });
  }
}

test("fraction recovery still works where it is unambiguous: 0.8333 and 0.875 (5/6 and 7/8) on 24ths", async () => {
  // A fraction question (no decimal labels), as the model wrote it in compare probe 1.
  const reply = compareReply([0.8333, "5/6"], [0.875, "7/8"], { activities: [] });
  delete reply.course.first_section.moments[0].visual_creates[0].content.parameters.label_style;
  const line = numberLineLesson(await compileCompare(reply, caseById.get("CMP-03").prompt));
  assert.equal(line.content.ticks.subdivisions, 24);
  const values = line.variables.map((variable) => variable.initial);
  assert.ok(Math.abs(values[0] - 5 / 6) < 1e-9 && Math.abs(values[1] - 7 / 8) < 1e-9, JSON.stringify(values));
});

// Decision 0016: solution sets (number_line_solution). Built from the same recorded reply: the outline asks
// for solution_set, its numbers are the boundaries, and the visual names the relation.
const solutionReply = (relation, bounds) => {
  const reply = compareReply(...[...bounds, ...bounds].slice(0, 2).map((value, index) => [value, index === 0 ? "a" : "b"]), { activities: [] });
  reply.course.outline.numbers = reply.course.outline.numbers.slice(0, bounds.length).map((number) => ({ ...number, min: { mantissa: -10, scale: 0 }, max: { mantissa: 10, scale: 0 } }));
  reply.course.outline.course_visuals[0].required_features = ["number_line", "solution_set"];
  const create = reply.course.first_section.moments[0].visual_creates[0].content;
  create.parameters = { relation };
  create.numbers = bounds.map((_value, index) => index + 1);
  return reply;
};
for (const [id, relation, bounds] of [["SOL-01", "x>a", [-2]], ["SOL-02", "x<=a", [3]], ["SOL-03", "a<x<=b", [1, 4]], ["SOL-04", "a<x<b", [1, 5]], ["SOL-05", "x<a|x>=b", [-1, 2]]]) {
  test(`${id} (${relation}): the program draws the exact solution set, ends open or filled, rays or interval`, async () => {
    const line = numberLineLesson(await compileCompare(solutionReply(relation, bounds), caseById.get(id).prompt));
    assert.deepEqual(judgeNumberLine(caseById.get(id), line).hard, []);
  });
}

test("the solution-set check catches a wrong end, a filled point on an open end, and boundaries out of order", async () => {
  // x >= -2 drawn for "x > -2": the end is filled where it should be open.
  const filledEnd = numberLineLesson(await compileCompare(solutionReply("x>=a", [-2]), caseById.get("SOL-01").prompt));
  assert.match(judgeNumberLine(caseById.get("SOL-01"), filledEnd).hard.join(), /wrong solution set: expected \(-2, \+∞, drawn \[-2, \+∞/);
  // A filled point drawn on the open end reads as filled.
  const withPoint = structuredClone(numberLineLesson(await compileCompare(solutionReply("x>a", [-2]), caseById.get("SOL-01").prompt)));
  withPoint.content.points = [{ as: "dot", value: -2 }];
  assert.match(judgeNumberLine(caseById.get("SOL-01"), withPoint).hard.join(), /filled point sits on the open end -2/);
  // a must be below b: refused as a parameter fault of the section.
  const { generateLessonPlanWithModel } = await import(new URL("../lesson-plan.js", import.meta.url));
  const rejected = [];
  await assert.rejects(generateLessonPlanWithModel(async (request) => {
    if (request.label === "lesson-plan-bootstrap") return JSON.stringify(solutionReply("a<x<b", [5, 1]));
    throw new Error("stop");
  }, { turn_id: "order", learner_request: "x between 1 and 5", input_modality: "text", request_source: "self_contained" }, { on_rejected_part: (event) => rejected.push(event.error.message) }), /stop/);
  assert.ok(rejected.some((message) => /smaller than the second/.test(message)), rejected.join());
});

// Decision 0016: rounding (number_line_rounding). The outline asks for rounding; its number is the one
// rounded, and the visual names the place.
const roundingReply = (value, place, range = [0, 1000]) => {
  const reply = compareReply([value, String(value)], [value, String(value)], { activities: [] });
  reply.course.outline.numbers = reply.course.outline.numbers.slice(0, 1).map((number) => ({ ...number, label: String(value), min: { mantissa: range[0], scale: 0 }, max: { mantissa: range[1], scale: 0 } }));
  reply.course.outline.course_visuals[0].required_features = ["number_line", "rounding"];
  reply.course.first_section.moments[0].visual_creates[0].content = { parameters: { place }, numbers: [1] };
  return reply;
};
for (const [id, value, place] of [["RND-01", 47, "tens"], ["RND-02", 362, "hundreds"], ["RND-03", 3.6, "ones"], ["RND-04", 1.24, "tenths"], ["RND-05", 85, "tens"]]) {
  test(`${id}: ${value} rounded to ${place} shows both neighbours, the halfway point and the jump to the result`, async () => {
    const line = numberLineLesson(await compileCompare(roundingReply(value, place), caseById.get(id).prompt));
    assert.deepEqual(judgeNumberLine(caseById.get(id), line).hard, []);
    // The number itself is never moved.
    assert.ok(Math.abs(line.variables[0].initial - value) < 1e-12, String(line.variables[0].initial));
  });
}

test("the rounding check catches a jump to the wrong neighbour", async () => {
  const line = structuredClone(numberLineLesson(await compileCompare(roundingReply(47, "tens"), caseById.get("RND-01").prompt)));
  // As if the jump went down to 40.
  line.content.bindings = line.content.bindings.map((binding) => (binding.target === "move.by" ? { ...binding, expression: "40 - number_01" } : binding));
  assert.match(judgeNumberLine(caseById.get("RND-01"), line).hard.join(), /wrong rounding: no jump from 47 to 50/);
});

test("the rounding check catches a jump from the wrong number: 40 → 50 beside a point at 47 (review of #69)", async () => {
  const line = structuredClone(numberLineLesson(await compileCompare(roundingReply(47, "tens"), caseById.get("RND-01").prompt)));
  // The jump now starts at the lower neighbour; 40, 47 and 50 are all still shown.
  line.content.jumps = line.content.jumps.map((jump) => (jump.as === "move" ? { ...jump, from: "lower", by: 10 } : jump));
  line.content.bindings = line.content.bindings.filter((binding) => !binding.target.startsWith("move."));
  assert.match(judgeNumberLine(caseById.get("RND-01"), line).hard.join(), /wrong rounding: no jump from 47 to 50 \(jumps: 40 → 50\)/);
});


// Review of #68: the split between the two boundaries' ranges keeps every value the lesson gives them,
// and each boundary keeps a usable range even when the boundaries are adjacent ticks.
const withAnimation = (reply, number, value) => {
  reply.course.first_section.moments[0].animations = [{ timing: "during_speech", number, end_value: { mantissa: value, scale: 0 }, duration_intent: "normal" }];
  return reply;
};
test("a < x < b with a animated to 4 (between 1 and 5): the animation stays 4 and the ranges stay apart (review of #68)", async () => {
  const line = numberLineLesson(await compileCompare(withAnimation(solutionReply("a<x<b", [1, 5]), 1, 4), caseById.get("SOL-04").prompt));
  const [a, b] = line.variables;
  assert.deepEqual(line.animations.filter(([variable]) => variable === a.as).map(([, value]) => value), [4]);
  assert.ok(a.max < b.min && a.max >= 4 && b.min <= 5, JSON.stringify([a, b]));
  assert.deepEqual(judgeNumberLine(caseById.get("SOL-04"), line).hard, []);
});
for (const [low, high] of [[1, 2], [0, 1]]) {
  test(`${low} < x < ${high} (adjacent whole-number boundaries): both sliders keep a usable range (review of #68)`, async () => {
    const line = numberLineLesson(await compileCompare(solutionReply("a<x<b", [low, high]), `Graph ${low} < x < ${high} on a number line.`));
    const [a, b] = line.variables;
    assert.ok(a.min < a.max && b.min < b.max && a.max < b.min, JSON.stringify([a, b]));
    assert.deepEqual([a.initial, b.initial], [low, high]);
    const expect = { values: [low, high], solution: [{ from: low, to: high, fromClosed: false, toClosed: false }] };
    assert.deepEqual(judgeNumberLine({ expect }, line).hard, []);
  });
}
test("a lesson that moves a past b is refused as a section fault, never redrawn with changed values (review of #68)", async () => {
  const { generateLessonPlanWithModel } = await import(new URL("../lesson-plan.js", import.meta.url));
  const rejected = [];
  await assert.rejects(generateLessonPlanWithModel(async (request) => {
    if (request.label === "lesson-plan-bootstrap") return JSON.stringify(withAnimation(solutionReply("a<x<b", [1, 5]), 1, 6));
    throw new Error("stop");
  }, { turn_id: "cross", learner_request: "x between 1 and 5", input_modality: "text", request_source: "self_contained" }, { on_rejected_part: (event) => rejected.push(event.error.message) }), /stop/);
  assert.ok(rejected.some((message) => /must stay smaller than every value/.test(message)), rejected.join());
});
