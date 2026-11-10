#!/usr/bin/env node
// Usage:
//   node scripts/measure-lesson-payload.mjs [--out report.json]   measure and print the per-entry-point summary
//   node scripts/measure-lesson-payload.mjs --record-ceilings     write eval/payload-ceilings.json from this build
//   node scripts/measure-lesson-payload.mjs --record-hashes       write eval/request-hashes.json from this build
// Run `npm run build` first; this reads the built lesson-plan.js.
import { readFile, writeFile } from "node:fs/promises";

import { completeLessonPlanFixtures } from "../test/lesson-plan-course-fixtures.mjs";
import { modelResponseHelpers } from "../test/model-responses.mjs";
import { requestHashFixtures } from "../test/sample-plans.mjs";
import { checkPayloadCeilings, measureLessonPayload, measureRequestHashes } from "./lesson-payload.mjs";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const helpers = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
const report = await measureLessonPayload(api, completeLessonPlanFixtures, helpers);
const args = process.argv.slice(2);
const ceilingsUrl = new URL("../eval/payload-ceilings.json", import.meta.url);

const failed = report.runs.filter((run) => run.error);
if (failed.length) {
  for (const run of failed) console.error(`generation failed: ${run.fixture} ${run.route} ${run.mode}: ${run.error}`);
  process.exitCode = 1;
}

if (args.includes("--record-ceilings")) {
  if (failed.length) throw new Error("Refusing to record ceilings while some runs fail");
  const ceilings = {
    note: "Hard payload ceilings per input route and request path (subject plugin plan, decision S6). Bytes of system prompt + prompt + response schema, excluding images. Raising a ceiling requires a plan change and a fresh live speed comparison.",
    recorded_from: "learning-coach main baseline",
    entry_points: Object.fromEntries(Object.entries(report.entry_points).map(([key, summary]) => [key, {
      total_bytes: summary.total_bytes.max,
      schema_bytes: summary.schema_bytes.max,
    }])),
  };
  await writeFile(ceilingsUrl, `${JSON.stringify(ceilings, null, 2)}\n`);
  console.log(`Recorded ${Object.keys(ceilings.entry_points).length} entry-point ceilings.`);
}

if (args.includes("--record-hashes")) {
  const hashes = await measureRequestHashes(api, requestHashFixtures(api.LESSON_PLAN_CAPABILITY_REGISTRY, completeLessonPlanFixtures), helpers);
  await writeFile(new URL("../eval/request-hashes.json", import.meta.url), `${JSON.stringify({
    note: "Digest of every model request per fixture, route/path/language/context (subject plugin plan, P1 exit). Moving code into plugins must not change any digest. Re-record only for an intended prompt or schema change.",
    hashes,
  }, null, 1)}\n`);
  console.log(`Recorded ${Object.values(hashes).reduce((sum, runs) => sum + Object.keys(runs).length, 0)} request digests.`);
}

const outIndex = args.indexOf("--out");
if (outIndex >= 0) await writeFile(args[outIndex + 1], `${JSON.stringify(report, null, 2)}\n`);

let problems = [];
try {
  problems = checkPayloadCeilings(report, JSON.parse(await readFile(ceilingsUrl, "utf8")));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
console.log(JSON.stringify({ fixtures: report.fixtures.length, entry_points: report.entry_points, ceiling_problems: problems }, null, 2));
if (problems.length) process.exitCode = 1;
