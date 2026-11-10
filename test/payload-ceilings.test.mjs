import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { checkPayloadCeilings, measureLessonPayload } from "../scripts/lesson-payload.mjs";
import { completeLessonPlanFixtures } from "./lesson-plan-course-fixtures.mjs";
import { modelResponseHelpers } from "./model-responses.mjs";

// Decision S6 of the subject plugin plan: every request stays under a fixed
// byte ceiling per input route and request path (eval/payload-ceilings.json).
test("every model request stays within its recorded payload ceiling", async () => {
  const api = await import(new URL("../lesson-plan.js", import.meta.url));
  const report = await measureLessonPayload(api, completeLessonPlanFixtures, modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY));
  const ceilings = JSON.parse(await readFile(new URL("../eval/payload-ceilings.json", import.meta.url), "utf8"));
  assert.deepEqual(checkPayloadCeilings(report, ceilings), []);
  for (const route of report.routes) {
    for (const entryPoint of ["first_request", "fallback_outline", "first_section_retry", "later_section", "section_repair", "practice"]) {
      assert.ok(report.entry_points[`${route}/${entryPoint}`], `${route}/${entryPoint} is measured`);
    }
  }
});
