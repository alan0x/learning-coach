// Number line lessons through the real path, from the model's reply to the lesson. The trial recipe
// is offered only when LEARNING_COACH_TRIAL_RECIPES names it, which Coach reads as it loads; this file
// sets it first (the recipe tests check the default in their own process).
process.env.LEARNING_COACH_TRIAL_RECIPES = "number_line";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The model never writes a slider step: its reply's numbers get one derived from the range
// (span / 200). These tests go through the real path, from the model's reply to the lesson, with the
// replies recorded in speed check run 5 (2026-11-11), so they see what a live lesson sees.
const { replayTurn } = await import(new URL("../scripts/replay-trial-recipe.mjs", import.meta.url));
const { NUMBER_LINE_CASES, NUMBER_LINE_QUALITY_CASES, judgeNumberLine, numberLineLesson } = await import(new URL("../scripts/eval-trial-recipe-speed.mjs", import.meta.url));
const run5 = JSON.parse(await readFile(new URL("./fixtures/number-line-run5-replies.json", import.meta.url), "utf8"));
const caseById = new Map([...NUMBER_LINE_CASES, ...NUMBER_LINE_QUALITY_CASES].map((item) => [item.id, item]));
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

// Run 7: faults only the outline can fix. "Compare 2/3 and 3/5" needs fifteenths, and an outline declared
// no numbers for its number line; each failed three times at section 1, where retries can only rewrite
// the section. Now the bootstrap is rejected and the outline is asked again, without the number line.
const run7 = JSON.parse(await readFile(new URL("./fixtures/number-line-run7-outline-faults.json", import.meta.url), "utf8"));
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
    assert.match(prompt.previous_validation_error ?? "", /number line|number_line/);
    assert.ok(rejected.some((event) => event.error.code === "LESSON_PLAN_OUTLINE_VISUAL"));
  });
}

