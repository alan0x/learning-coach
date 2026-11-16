// Retries that ask differently (the owner's principles, 2026-11-16; plan §7 step 3, step 2 of the
// accommodation order). A retry used to be the same request plus the error, and the speed gate lost lessons
// that repeated a sample_x_numbers slip on every attempt. Now the retry's schema makes it unwritable.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const run5 = JSON.parse(await readFile(new URL("./fixtures/number-line-run5-replies.json", import.meta.url), "utf8"));

const plotBootstrap = (parameters, say) => {
  const reply = structuredClone(run5.turns.find((turn) => turn.pair === 42).replies[0]);
  reply.course.outline.numbers = [];
  reply.course.outline.course_visuals = [{ required_features: ["cartesian_function_curve"], use_sections: [1], relation: "primary" }];
  reply.course.first_section = {
    moments: [{ narration: say, delivery: "patient",
      visual_creates: [{ course_visual: 1, content: { parameters, numbers: [] } }],
      math_creates: [{ reusable_item: 1, content: { latex: "f(x)" } }] }],
    number_activities: [],
  };
  return reply;
};
// A section reply for the retry: the bootstrap's first section in the section format.
const asSection = (bootstrap, parameters) => JSON.stringify({
  ...bootstrap.course.first_section,
  moments: bootstrap.course.first_section.moments.map(({ visual_creates: _visuals, math_creates: _math, ...moment }) => moment),
  course_visual_creates: { visual_1: { moment: 1, content: { parameters } } },
  reusable_board_creates: { item_1: { moment: 1, content: { latex: "f(x)" } } },
});

async function run(request, replies) {
  const requests = []; const rejected = []; let lesson;
  class Stop extends Error {}
  try {
    await api.generateLessonPlanWithModel(async (sent) => {
      requests.push(sent);
      const next = replies[requests.length - 1];
      if (next === undefined) throw new Stop();
      return next;
    }, { turn_id: "narrowing", learner_request: request, language: "en", input_modality: "text", request_source: "self_contained" }, {
      on_playable_prefix: ({ compiled }) => { lesson ??= compiled.lesson; throw new Stop(); },
      on_rejected_part: (part) => rejected.push(`${part.error.code} ${part.error.message}`),
    });
  } catch (error) { if (!(error instanceof Stop)) rejected.push(error.message); }
  return { requests, rejected, lesson };
}
const plotParameters = (schema) => {
  const found = [];
  const walk = (node) => { if (!node || typeof node !== "object") return; if (node.properties?.formulas || node.properties?.pieces) found.push(node); Object.values(node).forEach(walk); };
  walk(schema);
  return found;
};

test("x positions written as sample_x_numbers in a lesson with no numbers: the retry leaves the field out", async () => {
  const bootstrap = plotBootstrap({ formulas: ["3*x - 2"], sample_x_numbers: [1, 3] }, "Look at the points at x = 1 and x = 3.");
  const { requests, rejected, lesson } = await run("Draw y = 3x - 2.", [JSON.stringify(bootstrap), asSection(bootstrap, { formulas: ["3*x - 2"] })]);
  assert.ok(rejected.some((miss) => /LESSON_PLAN_NUMBER_REFERENCE/u.test(miss)), rejected.join(" | "));
  const retry = requests.find((sent) => sent.label === "lesson-plan-section");
  assert.ok(plotParameters(retry.response_schema).every((schema) => schema.properties.sample_x_numbers === undefined));
  assert.ok(lesson, rejected.join(" | "));
});

test("other refusals retry with the same schema as the first section request", () => {
  const outline = { numbers: [] };
  assert.equal(api.retryNarrowing(undefined, outline), undefined);
  assert.equal(api.retryNarrowing(new api.LessonPlanError("LESSON_PLAN_EXPRESSION", "$x", "bad"), outline), undefined);
  assert.equal(api.retryNarrowing(new api.LessonPlanError("LESSON_PLAN_NUMBER_REFERENCE", "$a.sample_x_numbers", "bad"), { numbers: [{}] }), undefined);
});

test("the narrowing stays for the section's later attempts, even after a narrowed retry fails for another reason", async () => {
  const bootstrap = plotBootstrap({ formulas: ["3*x - 2"], sample_x_numbers: [1, 3] }, "Look at the points at x = 1 and x = 3.");
  // Attempt 2 fails on its formula; attempt 3 must still leave the sample field out.
  const { requests, lesson, rejected } = await run("Draw y = 3x - 2.", [JSON.stringify(bootstrap), asSection(bootstrap, { formulas: ["2*"] }), asSection(bootstrap, { formulas: ["3*x - 2"] })]);
  const retries = requests.filter((sent) => sent.label === "lesson-plan-section");
  assert.equal(retries.length, 2, rejected.join(" | "));
  for (const retry of retries) assert.ok(plotParameters(retry.response_schema).every((schema) => schema.properties.sample_x_numbers === undefined));
  assert.ok(lesson, rejected.join(" | "));
});
