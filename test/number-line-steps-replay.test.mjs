// The number line in steps through the real path, from the model's reply to the lesson (OLL decision 0017).
// Offered by default since 2026-11-15 (a trial recipe until then). The replies are run 5's reply for 23 + 48 (number-line-run5-replies.json,
// pair 42), rewritten in the model's format for a line in steps: no reply for this recipe is recorded yet.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { generateLessonPlanWithModel } = await import(new URL("../lesson-plan.js", import.meta.url));
const { NUMBER_LINE_STEPS_CASES, judgeNumberLine, numberLineLesson, recipesInPart } = await import(new URL("../scripts/eval-trial-recipe-speed.mjs", import.meta.url));
const run5 = JSON.parse(await readFile(new URL("./fixtures/number-line-run5-replies.json", import.meta.url), "utf8"));
const cases = Object.fromEntries(NUMBER_LINE_STEPS_CASES.map((item) => [item.id, item]));
const decimal = (value) => ({ mantissa: value, scale: 0 });

/** Run 5's 23 + 48 reply, rewritten: these numbers, the line in steps, and these moments and practice. */
const stepsReply = ({ numbers, labels, moments, activities = [], latex = "8 + 2 + 3 = 13" }) => {
  const reply = structuredClone(run5.turns.find((turn) => turn.pair === 42).replies[0]);
  const outline = reply.course.outline;
  outline.numbers = numbers.map(([initial, min, max], index) => ({ initial: decimal(initial), min: decimal(min), max: decimal(max), label: labels[index], unit: "" }));
  outline.course_visuals = [{ required_features: ["number_line", "number_steps"], use_sections: [1], relation: "primary" }];
  const visualNumbers = numbers.map((_number, index) => index + 1);
  reply.course.first_section = {
    moments: moments.map((moment, index) => ({
      narration: moment.say, delivery: "patient",
      // The template's section keeps its reusable math card, written in the first moment as run 5 wrote it.
      ...(index === 0 ? { visual_creates: [{ course_visual: 1, content: { parameters: {}, numbers: visualNumbers } }], math_creates: [{ reusable_item: 1, content: { latex: latex } }] } : {}),
      ...(moment.animations ? { animations: moment.animations.map(([number, value]) => ({ number, end_value: decimal(value), duration_intent: "normal" })) } : {}),
    })),
    number_activities: activities.map(([number, value]) => ({ prompt: `请把第 ${number} 个数调到 ${value}。`, hints: ["看数轴。"], success_message: "对了。", number, value_mantissa: value, value_scale: 0 })),
  };
  return JSON.stringify(reply);
};

/** Generates with the given replies; records each request, stops at the first playable part. */
const generate = async (replies, prompt) => {
  const requests = [];
  const rejected = [];
  let lesson, error;
  class Stop extends Error {}
  try {
    await generateLessonPlanWithModel(async (request) => {
      requests.push(request);
      if (requests.length > replies.length) throw new Stop();
      return replies[requests.length - 1];
    }, { turn_id: "steps-replay", learner_request: prompt, language: "zh-CN", input_modality: "text", request_source: "self_contained" }, {
      on_playable_prefix: ({ compiled }) => { lesson ??= compiled.lesson; throw new Stop(); },
      on_rejected_part: (part) => rejected.push(`${part.error.code} ${part.error.message}`),
    });
  } catch (caught) {
    if (!(caught instanceof Stop)) error = caught.message;
  }
  return { lesson, error: error ?? rejected.join(" | "), requests, rejected };
};

test("make ten from the model's reply: the outline chooses the line in steps, and the lesson draws both moves", async () => {
  const { lesson, error } = await generate([stepsReply({
    numbers: [[8, 0, 20], [2, 0, 10], [3, 0, 10]], labels: ["起点", "凑成十", "再加"],
    moments: [{ say: "从 8 出发，先加 2 凑成 10。" }, { say: "再加 3，到 13。" }],
  })], cases["ST-01"].prompt);
  assert.ok(lesson, error);
  assert.deepEqual(recipesInPart(lesson), ["number_line_steps"]);
  assert.deepEqual(judgeNumberLine(cases["ST-01"], numberLineLesson(lesson)).hard, []);
});

test("tens then ones with three moves animated from 0, and practice on the last move kept as written", async () => {
  const { lesson, error } = await generate([stepsReply({
    numbers: [[27, 0, 60], [0, 0, 20], [0, 0, 20], [0, 0, 10]], labels: ["起点", "加十", "再加十", "加个位"],
    moments: [
      { say: "从 27 出发。" },
      { say: "先加十，到 37；再加十，到 47。", animations: [[2, 10], [3, 10]] },
      { say: "最后加 5，到 52。", animations: [[4, 5]] },
    ],
    // The lesson ends with the last move at 5, which would meet this target before the learner starts:
    // the line goes back first (decision 0016 §2), and the target stays 5.
    activities: [[4, 5]],
  })], cases["ST-02"].prompt);
  assert.ok(lesson, error);
  const line = numberLineLesson(lesson);
  assert.deepEqual(judgeNumberLine(cases["ST-02"], line).hard, []);
  assert.deepEqual(line.tasks.map((task) => task.completion.value), [5]);
  assert.equal(line.animations.filter(([variable]) => variable === line.variables[3].as).at(-1)[1], 0);
});

test("one move under the line in steps: the outline is asked again without it, and the one-move line is still offered", async () => {
  const { lesson, requests } = await generate([stepsReply({
    numbers: [[8, 0, 20], [5, 0, 10]], labels: ["起点", "加上"],
    moments: [{ say: "从 8 出发，加 5。" }],
  })], "用数轴演示 8 加 5。");
  assert.equal(lesson, undefined);
  const next = requests[1];
  assert.ok(next, "a second request is made");
  assert.match(next.label, /outline/u);
  // The next outline's recipes: the one-move line stays, the line in steps is gone.
  const recipes = JSON.parse(next.prompt).visual_recipes.map(([features]) => features.join("+"));
  assert.ok(recipes.includes("number_line"), recipes.join(" "));
  assert.ok(!recipes.some((features) => features.includes("number_steps")), recipes.join(" "));
});
