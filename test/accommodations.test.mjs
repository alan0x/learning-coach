// The owner's two principles (2026-11-16): the model writes meaning; the program accepts what has exactly
// one safe reading, drops what nobody narrates, and refuses only meaning. Plan §7 step 3, step 1 of the
// accommodation order: free, no request changes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const run5 = JSON.parse(await readFile(new URL("./fixtures/number-line-run5-replies.json", import.meta.url), "utf8"));

test("curve labels that do not match the curves one to one are left out, and the plot compiles", async () => {
  const reply = structuredClone(run5.turns.find((turn) => turn.pair === 42).replies[0]);
  reply.course.outline.numbers = [];
  reply.course.outline.course_visuals = [{ required_features: ["cartesian_function_curve"], use_sections: [1], relation: "primary" }];
  reply.course.first_section = {
    moments: [{ narration: "看这条抛物线。", delivery: "patient",
      visual_creates: [{ course_visual: 1, content: { parameters: { formulas: ["x^2"], curve_labels: ["抛物线", "多余的标签"] }, numbers: [] } }],
      math_creates: [{ reusable_item: 1, content: { latex: "y = x^2" } }] }],
    number_activities: [],
  };
  let lesson; const rejected = [];
  class Stop extends Error {}
  try {
    await api.generateLessonPlanWithModel(async (request) => { if (request.label !== "lesson-plan-bootstrap") throw new Stop(); return JSON.stringify(reply); },
      { turn_id: "labels", learner_request: "画出 y = x² 的图像。", language: "zh-CN", input_modality: "text", request_source: "self_contained" },
      { on_playable_prefix: ({ compiled }) => { lesson ??= compiled.lesson; throw new Stop(); }, on_rejected_part: (part) => rejected.push(part.error.message) });
  } catch (error) { if (!(error instanceof Stop)) rejected.push(error.message); }
  assert.ok(lesson, rejected.join(" | "));
  const plot = lesson.steps.flatMap((step) => step.beats).flatMap((beat) => beat.actions).find((action) => action.do === "write" && action.kind === "plot");
  assert.equal(plot.content.curves.length, 1);
  assert.notEqual(plot.content.curves[0].label, "抛物线");
});
