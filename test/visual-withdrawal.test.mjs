// A picture that keeps breaking its own limits costs that picture, not the lesson (owner, 2026-11-25).
// Replayed from the model replies of the two lessons base-ten check 3 lost (BT-31, BT-32), so these tests
// follow the path a live lesson took; where the recorded replies end, a reply written here stands in.
process.env.LEARNING_COACH_TRIAL_RECIPES = "base_ten_trade";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const recorded = JSON.parse(readFileSync(new URL("./fixtures/base-ten-lost-lessons-replies.json", import.meta.url), "utf8")).turns;
const CASES = JSON.parse(readFileSync(new URL("../testsuite/base-ten-dev-cases.json", import.meta.url), "utf8")).cases;

async function replay(id, extra = []) {
  const replies = [...recorded[id], ...extra].map((reply) => JSON.stringify(reply));
  const requests = [], adjustments = [], prefixes = [];
  let result, error;
  try {
    result = await api.generateLessonPlanWithModel(async (request) => {
      requests.push(request);
      if (requests.length > replies.length) throw new Error("recorded replies exhausted");
      return replies[requests.length - 1];
    }, { turn_id: "replay", learner_request: CASES.find((item) => item.id === id).prompt, language: "zh-CN", input_modality: "text", request_source: "self_contained" }, {
      on_program_adjustment: (adjustment) => adjustments.push(adjustment),
      on_playable_prefix: ({ completed_sections, compiled }) => prefixes.push({ completed_sections, lesson: structuredClone(compiled.lesson) }),
    });
  } catch (caught) {
    error = caught;
  }
  return { result, error, requests, adjustments, prefixes };
}

test("BT-32: the mat section 2 could not draw is withdrawn; section 2 is written again without it and the lesson keeps section 1", async () => {
  // Section 2's three recorded replies each give the mat the number line's own numbers (46, 30 and 7).
  // The stand-in reply is the last of them without the mat.
  const { course_visual_creates: _mat, ...withoutMat } = recorded["BT-32"][3];
  const { result, error, requests, adjustments, prefixes } = await replay("BT-32", [withoutMat]);
  assert.equal(error, undefined);
  assert.equal(requests.length, 5);
  const removed = adjustments.filter((adjustment) => adjustment.kind === "visual_removed");
  assert.deepEqual(removed.map(({ section, capability, reason }) => ({ section, capability, reason })),
    [{ section: 2, capability: "base_ten_trade", reason: "visual_limits_after_retries" }]);
  // The true fault is named (the numbers are the number line's), not "at most 19 tens".
  assert.match(removed[0].detail, /needs lesson numbers of its own/u);
  // The extra request is outside the repair budget, offers no picture and carries no stale error.
  const last = JSON.parse(requests.at(-1).prompt);
  assert.deepEqual(last.visuals_for_section, []);
  assert.equal(last.previous_validation_error, undefined);
  assert.doesNotMatch(JSON.stringify(requests.at(-1).response_schema), /course_visual_creates/u);
  // Nothing refers to the mat, and the published section 1 is unchanged.
  assert.deepEqual(result.outline.course_visuals.map((visual) => visual.capability), ["number_line_steps"]);
  assert.doesNotMatch(JSON.stringify(result.lesson), /base_ten|trading/u);
  assert.equal(prefixes[0].completed_sections, 1);
  // (A prefix's last section returns its numbers for the learner; in the full lesson that moves to the end.)
  const said = (step) => step.beats.map((beat) => [beat.say, beat.actions.filter((action) => action.do !== "animate")]);
  assert.deepEqual(said(result.lesson.steps[0]), said(prefixes[0].lesson.steps[0]));
});

test("BT-31: section 1's repairs spent on the mat's limits plan the lesson again without the mat", async () => {
  // Section 1's three recorded replies each draw two mats to compare 263 and 236. The next call must be a new
  // outline that is not offered the mat and is told why; the recorded replies end there.
  const { error, requests, adjustments } = await replay("BT-31");
  assert.match(error.message, /recorded replies exhausted/u);
  assert.deepEqual(requests.map((request) => `${request.part}${request.section ?? ""}`), ["bootstrap", "outline", "section1", "section1", "section1", "outline"]);
  const outline = JSON.parse(requests.at(-1).prompt);
  assert.doesNotMatch(JSON.stringify(outline.visual_recipes), /trade_ten_for_one/u);
  assert.match(JSON.stringify(outline.previous_validation_error), /one trading mat/u);
  assert.deepEqual(adjustments.filter((adjustment) => adjustment.kind === "visual_removed").map(({ section, capability }) => ({ section, capability })),
    [{ section: 1, capability: "base_ten_trade" }]);
});

test("a picture an earlier, published section drew is never withdrawn", async () => {
  const { course_visual_creates: _mat, ...withoutMat } = recorded["BT-32"][3];
  const { result } = await replay("BT-32", [withoutMat]);
  // The number line is created in section 1: withdrawing it while writing section 2 is refused.
  assert.equal(api.withdrawSectionVisual(result.outline, 2, "number_line_steps", result.outline.request_coverage.length), undefined);
});
