import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { measureRequestHashes } from "../scripts/lesson-payload.mjs";
import { completeLessonPlanFixtures } from "./lesson-plan-course-fixtures.mjs";
import { modelResponseHelpers } from "./model-responses.mjs";
import { requestHashFixtures } from "./sample-plans.mjs";

// Subject plugin plan, P1 exit: moving recipes and rules into plugins sends
// byte-identical requests. An intended prompt or schema change re-records
// eval/request-hashes.json with `npm run payload:measure -- --record-hashes`.
test("every model request is byte-identical to the recorded digests", async () => {
  const api = await import(new URL("../lesson-plan.js", import.meta.url));
  const actual = await measureRequestHashes(
    api,
    requestHashFixtures(api.LESSON_PLAN_CAPABILITY_REGISTRY, completeLessonPlanFixtures),
    modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY),
  );
  const { hashes: expected } = JSON.parse(await readFile(new URL("../eval/request-hashes.json", import.meta.url), "utf8"));
  const changed = [];
  for (const fixture of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    for (const run of new Set([...Object.keys(expected[fixture] ?? {}), ...Object.keys(actual[fixture] ?? {})])) {
      if (expected[fixture]?.[run] !== actual[fixture]?.[run]) changed.push(`${fixture} ${run}`);
    }
  }
  assert.deepEqual(changed.slice(0, 20), [], `${changed.length} runs changed`);
});
