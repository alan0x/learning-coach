import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.VERTEX_SA_JSON) throw new Error("VERTEX_SA_JSON is required for this live eval");

const caseIndex = process.argv.indexOf("--case");
const selectedId = caseIndex >= 0 ? process.argv[caseIndex + 1] : undefined;
const runAll = process.argv.includes("--all");
if (!selectedId && !runAll) throw new Error("Pass --case <id>, or explicitly pass --all");

const allCases = JSON.parse(await readFile(resolve(root, "eval/lesson-plan-generation-cases.json"), "utf8"));
const selected = runAll ? allCases : allCases.filter((item) => item.id === selectedId);
if (selected.length === 0) throw new Error(`Unknown eval case '${selectedId}'`);

const bundle = await build({
  entryPoints: [resolve(root, "src/lesson-plan-live.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  write: false,
  logLevel: "silent",
});
const live = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);

for (const item of selected) {
  const prefixes = [];
  const startedAt = Date.now();
  let generated;
  try {
    generated = await live.generateLessonPlanWithVertex({
      turn_id: `lesson-plan-eval-${item.id}-${Date.now()}`,
      learner_request: item.learner_request,
      request_parts: item.request_parts,
      language: "zh-CN",
    }, {
      max_concurrency: 1,
      on_rejected_part: (event) => process.stderr.write(`${JSON.stringify({
        stage: "lesson-plan-local-rejection",
        id: item.id,
        ...event,
      })}\n`),
      on_playable_prefix: ({ completed_sections }) => prefixes.push({
        completed_sections,
        elapsed_ms: Date.now() - startedAt,
      }),
    });
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      id: item.id,
      ok: false,
      error_code: typeof error?.code === "string" ? error.code : "LESSON_PLAN_EVAL_FAILED",
      error: error instanceof Error ? error.message : String(error),
      elapsed_ms: Date.now() - startedAt,
    })}\n`);
    process.exitCode = 1;
    continue;
  }

  assert.equal(generated.outline.request_coverage.length, item.request_parts.length);
  assert.ok(generated.outline.request_coverage.every((entry) => entry.treatment === "teach"));
  if (item.minimum_sections !== undefined) {
    assert.ok(
      generated.lesson.steps.length >= item.minimum_sections,
      `expected at least ${item.minimum_sections} sections`,
    );
  }
  const actions = generated.lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions));
  assert.ok(actions.some((action) => action.do === "write"), "course must contain playable board content");
  const writeKinds = new Set(actions.filter((action) => action.do === "write").map((action) => action.kind));
  for (const kind of item.expected_kinds) assert.ok(writeKinds.has(kind), `missing write kind '${kind}'`);
  if (item.requires_animation) assert.ok(actions.some((action) => action.do === "animate"), "missing animation");
  assert.deepEqual(prefixes.map((entry) => entry.completed_sections), generated.lesson.steps.map((_step, index) => index + 1));

  process.stdout.write(`${JSON.stringify({
    id: item.id,
    ok: true,
    elapsed_ms: Date.now() - startedAt,
    model_calls: generated.model_calls,
    sections: generated.lesson.steps.length,
    first_playable_ms: prefixes[0]?.elapsed_ms,
    write_kinds: [...writeKinds].sort(),
    prefixes,
  })}\n`);
}
