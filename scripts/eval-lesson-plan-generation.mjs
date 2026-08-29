import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.VERTEX_SA_JSON) throw new Error("VERTEX_SA_JSON is required for this live eval");

const caseIndex = process.argv.indexOf("--case");
const selectedId = caseIndex >= 0 ? process.argv[caseIndex + 1] : undefined;
const runAll = process.argv.includes("--all");
if (!selectedId && !runAll) throw new Error("Pass --case <id>, or explicitly pass --all");
const repeatIndex = process.argv.indexOf("--repeat");
const repeat = repeatIndex >= 0 ? Number(process.argv[repeatIndex + 1]) : 1;
if (!Number.isSafeInteger(repeat) || repeat < 1) throw new Error("--repeat must be a positive integer");
const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? resolve(process.argv[outputIndex + 1]) : undefined;
const delayIndex = process.argv.indexOf("--delay-ms");
const delayMs = delayIndex >= 0 ? Number(process.argv[delayIndex + 1]) : 0;
if (!Number.isSafeInteger(delayMs) || delayMs < 0) throw new Error("--delay-ms must be a non-negative integer");

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

const results = [];

async function persistPartialResults() {
  if (!outputPath) return;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    incomplete: true,
    measured_at: new Date().toISOString(),
    model: process.env.OLL_MODEL || "gemini-3.6-flash",
    repeat,
    cases: selected.map((item) => item.id),
    results,
  }, null, 2)}\n`, "utf8");
}

function wait(milliseconds) {
  return milliseconds <= 0 ? Promise.resolve() : new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

for (const item of selected) {
  for (let run = 1; run <= repeat; run += 1) {
  const prefixes = [];
  const rejectedParts = [];
  const startedAt = Date.now();
  let generated;
  try {
    generated = await live.generateLessonPlanWithVertex({
      turn_id: `lesson-plan-eval-${item.id}-${run}-${Date.now()}`,
      learner_request: item.learner_request,
      request_parts: item.request_parts,
      language: "zh-CN",
    }, {
      on_rejected_part: (event) => {
        rejectedParts.push(event);
        process.stderr.write(`${JSON.stringify({
          stage: "lesson-plan-local-rejection",
          id: item.id,
          ...event,
        })}\n`);
      },
      on_playable_prefix: ({ completed_sections }) => prefixes.push({
        completed_sections,
        elapsed_ms: Date.now() - startedAt,
      }),
    });
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
    const plots = actions
      .filter((action) => action.do === "write" && action.kind === "plot")
      .map((action) => action.content);
    for (const kind of item.expected_kinds) assert.ok(writeKinds.has(kind), `missing write kind '${kind}'`);
    if (item.requires_animation) assert.ok(actions.some((action) => action.do === "animate"), "missing animation");
    if (item.minimum_numeric_controls !== undefined) {
      const numericControls = generated.lesson.lesson.variables?.filter((variable) => variable.control) ?? [];
      assert.ok(
        numericControls.length >= item.minimum_numeric_controls,
        `expected at least ${item.minimum_numeric_controls} numeric controls`,
      );
    }
    if (item.maximum_numeric_controls !== undefined) {
      const numericControls = generated.lesson.lesson.variables?.filter((variable) => variable.control) ?? [];
      assert.ok(
        numericControls.length <= item.maximum_numeric_controls,
        `expected at most ${item.maximum_numeric_controls} numeric controls`,
      );
    }
    if (item.required_curve_number_count !== undefined) {
      const parameterizedCurves = plots.flatMap((plot) => plot.curves ?? []).filter((curve) => {
        const referencedNumbers = new Set(curve.expression.match(/number_\d+/gu) ?? []);
        return referencedNumbers.size >= item.required_curve_number_count;
      });
      assert.ok(
        parameterizedCurves.length > 0,
        `expected one curve controlled by at least ${item.required_curve_number_count} lesson numbers`,
      );
    }
    if (item.minimum_curves_in_one_plot !== undefined) {
      assert.ok(
        plots.some((plot) => (plot.curves?.length ?? 0) >= item.minimum_curves_in_one_plot),
        `expected at least ${item.minimum_curves_in_one_plot} curves in one plot`,
      );
    }
    if (item.requires_moving_point) {
      assert.ok(
        plots.some((plot) => (plot.points?.length ?? 0) > 0 && (plot.bindings?.length ?? 0) >= 2),
        "expected a moving point whose x and y coordinates are both bound to the lesson number",
      );
    }
    assert.deepEqual(prefixes.map((entry) => entry.completed_sections), generated.lesson.steps.map((_step, index) => index + 1));

    const result = {
      id: item.id,
      run,
      ok: true,
      elapsed_ms: Date.now() - startedAt,
      model_calls: generated.model_calls,
      sections: generated.lesson.steps.length,
      first_playable_ms: prefixes[0]?.elapsed_ms,
      write_kinds: [...writeKinds].sort(),
      numeric_controls: generated.lesson.lesson.variables?.filter((variable) => variable.control).length ?? 0,
      maximum_curves_in_one_plot: Math.max(0, ...plots.map((plot) => plot.curves?.length ?? 0)),
      rejected_part_count: rejectedParts.length,
      rejected_parts: rejectedParts,
      prefixes,
    };
    results.push(result);
    await persistPartialResults();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const result = {
      id: item.id,
      run,
      ok: false,
      error_code: typeof error?.code === "string" ? error.code : "LESSON_PLAN_EVAL_FAILED",
      error: error instanceof Error ? error.message : String(error),
      elapsed_ms: Date.now() - startedAt,
    };
    results.push(result);
    await persistPartialResults();
    process.stderr.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 1;
  }
  const latest = results.at(-1);
  const rateLimited = latest?.ok === false && latest.error?.includes("429");
  await wait(rateLimited ? Math.max(delayMs, 15_000) : delayMs);
  }
}

function percentile(values, quantile) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
}

const successful = results.filter((result) => result.ok);
const firstPlayable = successful.map((result) => result.first_playable_ms).filter(Number.isFinite);
const completed = successful.map((result) => result.elapsed_ms).filter(Number.isFinite);
const summary = {
  measured_at: new Date().toISOString(),
  model: process.env.OLL_MODEL || "gemini-3.6-flash",
  repeat,
  cases: selected.map((item) => item.id),
  total_runs: results.length,
  successful_runs: successful.length,
  success_rate: results.length === 0 ? 0 : successful.length / results.length,
  first_playable_ms: {
    p50: percentile(firstPlayable, 0.5),
    p95: percentile(firstPlayable, 0.95),
  },
  completed_ms: {
    p50: percentile(completed, 0.5),
    p95: percentile(completed, 0.95),
  },
};
process.stdout.write(`${JSON.stringify({ summary })}\n`);

if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ summary, results }, null, 2)}\n`, "utf8");
}
