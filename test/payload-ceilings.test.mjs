import assert from "node:assert/strict";
import test from "node:test";

import { measureLessonPayload } from "../scripts/lesson-payload.mjs";
import { completeLessonPlanFixtures } from "./lesson-plan-course-fixtures.mjs";
import { modelResponseHelpers } from "./model-responses.mjs";

// Request size is tracked, not capped (owner, 2026-11-24): each request is measured on every path, and
// eval/payload-ceilings.json records the sizes last recorded, for comparison. Growth is to be met by sending
// the model only the components a request needs, not by compressing each component's guidance.
test("every model request is measured on every input route and request path", async () => {
  const api = await import(new URL("../lesson-plan.js", import.meta.url));
  const report = await measureLessonPayload(api, completeLessonPlanFixtures, modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY));
  for (const route of report.routes) {
    for (const entryPoint of ["first_request", "fallback_outline", "first_section_retry", "later_section", "section_repair", "practice"]) {
      assert.ok(report.entry_points[`${route}/${entryPoint}`], `${route}/${entryPoint} is measured`);
    }
  }
});
