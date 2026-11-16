// Retries that ask differently (the owner's principles, 2026-11-16; plan §7 step 3, steps 2–3 of the
// accommodation order). A retry used to be the same request plus the error, and the speed gate lost lessons
// that repeated a slip on every attempt. Now the retry's schema makes the refused slip unwritable.
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

test("a piecewise request drawn as whole curves is refused, and the retry requires pieces and drops formulas", async () => {
  const request = "Graph f(x) = x + 2 for x < 1 and f(x) = 4 for x >= 1.";
  const bootstrap = plotBootstrap({ formulas: ["x + 2", "0*x + 4"] }, "For x below 1 the graph is x + 2; from x = 1 on it is 4.");
  const pieces = [{ formula: "x + 2", x_to: 1, ends: "()" }, { formula: "4", x_from: 1, ends: "[)" }];
  const { requests, rejected, lesson } = await run(request, [JSON.stringify(bootstrap), asSection(bootstrap, { pieces })]);
  assert.ok(rejected.some((miss) => /LESSON_PLAN_PIECES_REQUIRED/u.test(miss)), rejected.join(" | "));
  const retry = requests.find((sent) => sent.label === "lesson-plan-section");
  assert.ok(retry, requests.map((sent) => sent.label).join());
  const schemas = plotParameters(retry.response_schema);
  assert.ok(schemas.length > 0);
  assert.ok(schemas.every((schema) => schema.properties.formulas === undefined && schema.required.includes("pieces")), JSON.stringify(schemas).slice(0, 400));
  assert.ok(lesson, rejected.join(" | "));
  const plot = lesson.steps.flatMap((step) => step.beats).flatMap((beat) => beat.actions).find((action) => action.do === "write" && action.kind === "plot");
  assert.equal(plot.content.curves.length, 2);
  assert.ok(plot.content.curves.every((curve) => curve.series === "f"));
});

test("one condition on x and one formula is no piecewise function (√x for x ≥ 0)", async () => {
  const bootstrap = plotBootstrap({ formulas: ["sqrt(x)"] }, "The square root is defined for x >= 0.");
  const { rejected, lesson } = await run("Graph y = sqrt(x) for x >= 0.", [JSON.stringify(bootstrap)]);
  assert.ok(lesson, rejected.join(" | "));
  assert.deepEqual(rejected, []);
});

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
