import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(await readFile(join(root, "eval/visual-generation-cases.json"), "utf8"));
const caseIndex = process.argv.indexOf("--case");
const selectedId = caseIndex >= 0 ? process.argv[caseIndex + 1] : undefined;
const repeatIndex = process.argv.indexOf("--repeat");
const repeat = repeatIndex >= 0 ? Number(process.argv[repeatIndex + 1]) : 1;
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 20) {
  throw new Error("--repeat must be an integer from 1 to 20");
}
const selected = selectedId ? cases.filter((item) => item.id === selectedId) : cases;
if (selected.length === 0) throw new Error(`Unknown eval case '${selectedId}'`);
if (!process.env.VERTEX_SA_JSON) throw new Error("VERTEX_SA_JSON is required for live visual generation evals");

function normalizeExpression(value) {
  return value.normalize("NFKC").toLowerCase().replace(/^y\s*=/u, "").replace(/\s+/gu, "");
}

function completedModelCalls(stderr) {
  return stderr.split("\n").flatMap((line) => {
    const prefix = "learning-coach: ";
    if (!line.startsWith(prefix)) return [];
    try {
      const event = JSON.parse(line.slice(prefix.length));
      return event.stage === "model-call" && event.status === "completed" ? [event] : [];
    } catch {
      return [];
    }
  });
}

async function runCase(item) {
  const workDirectory = join(tmpdir(), `learning-coach-eval-${item.id}-${Date.now()}`);
  const child = spawn(join(root, "main"), ["oll_generate_lesson"], {
    cwd: root,
    env: { ...process.env, OCTOS_WORK_DIR: workDirectory },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end(JSON.stringify({
    turn_id: `eval-${item.id}-${Date.now()}`,
    learner_request: item.learner_request,
    request_source: "self_contained",
    language: "zh-CN",
    ...(item.tutor_context ? { tutor_context: item.tutor_context } : {}),
  }));
  const exitCode = await new Promise((done, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`eval timed out after ${item.timeout_ms ?? 240_000}ms`));
    }, item.timeout_ms ?? 240_000);
    timeout.unref();
    child.once("close", () => clearTimeout(timeout));
    child.once("error", reject);
    child.once("close", done);
  });
  try {
    assert.equal(exitCode, 0, stderr);
    const protocol = JSON.parse(stdout.trim().split("\n").at(-1));
    assert.equal(protocol.success, true, protocol.output);
    const lesson = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
    const actions = lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions));
    const writes = actions.filter((action) => action.do === "write");
    for (const kind of item.expected.kinds ?? []) {
      assert.ok(writes.some((action) => action.kind === kind), `missing kind=${kind}`);
    }
    const geometries = writes.filter((action) => action.kind === "geometry");
    for (const field of item.expected.geometry_fields ?? []) {
      assert.ok(geometries.some((action) => Array.isArray(action.content[field]) && action.content[field].length > 0), `missing geometry.${field}`);
    }
    for (const terms of item.expected.geometry_text_any_groups ?? []) {
      assert.ok(
        geometries.some((action) => terms.some((term) => JSON.stringify(action.content).includes(term))),
        `geometry does not visibly represent one of: ${terms.join(", ")}`,
      );
    }
    const scenes3d = writes.filter((action) => action.kind === "scene3d");
    for (const field of item.expected.scene3d_fields ?? []) {
      assert.ok(
        scenes3d.some((action) => Array.isArray(action.content[field]) && action.content[field].length > 0),
        `missing scene3d.${field}`,
      );
    }
    for (const kind of item.expected.scene3d_highlight_kinds ?? []) {
      assert.ok(
        scenes3d.some((action) => action.content.highlights?.some((highlight) => highlight.kind === kind)),
        `missing scene3d highlight kind=${kind}`,
      );
    }
    if (item.expected.scene3d_fallback) {
      assert.ok(
        scenes3d.some((action) => action.content.fallback?.trim()),
        "missing visible scene3d fallback explanation",
      );
    }
    for (const terms of item.expected.lesson_text_any_groups ?? []) {
      assert.ok(
        terms.some((term) => JSON.stringify(lesson).includes(term)),
        `lesson does not explain one of: ${terms.join(", ")}`,
      );
    }
    const actualExpressions = writes.filter((action) => action.kind === "plot")
      .flatMap((action) => action.content.curves ?? [])
      .map((curve) => normalizeExpression(curve.expression));
    for (const expression of item.expected.plot_expressions ?? []) {
      assert.ok(actualExpressions.includes(normalizeExpression(expression)), `missing plot expression ${expression}`);
    }
    if (item.expected.requires_connect) {
      assert.ok(actions.some((action) => action.do === "connect"), "missing connect action");
    }
    if (item.expected.shared_variable) {
      const expectation = item.expected.shared_variable;
      const variable = expectation.alias
        ? lesson.lesson.variables?.find((candidate) => candidate.as === expectation.alias)
        : lesson.lesson.variables?.[0];
      assert.ok(variable, `missing shared variable${expectation.alias ? ` ${expectation.alias}` : ""}`);
      const variableAlias = variable.as;
      assert.equal(variable.control?.kind, "slider", `shared variable ${variableAlias} is not student-controllable`);
      for (const kind of expectation.bound_kinds ?? []) {
        const bound = writes.some((action) => action.kind === kind
          && action.content.bindings?.some((binding) => new RegExp(`\\b${variableAlias}\\b`, "u").test(binding.expression)));
        assert.ok(bound, `missing ${kind} binding to ${variableAlias}`);
      }
      if (expectation.animate) {
        assert.ok(actions.some((action) => action.do === "animate" && action.variable === variableAlias),
          `missing animation for ${variableAlias}`);
      }
      if (expectation.direct_angle_control) {
        const directControl = geometries.some((action) => action.content.points?.some((point) =>
          point.interaction?.kind === "angle_control" && point.interaction.variable === variableAlias));
        assert.ok(directControl, `missing direct angle control for ${variableAlias}`);
      }
    }
    if (item.expected.student_task === false) {
      assert.equal(lesson.lesson.tasks, undefined, "free exploration unexpectedly became a scored task");
    } else if (item.expected.student_task) {
      const task = lesson.lesson.tasks?.[0];
      assert.ok(task, "missing after-lesson student task");
      assert.equal(task.availability?.kind, "after_lesson");
      assert.ok(task.prompt?.trim(), "student task prompt is empty");
      assert.ok(task.allowed_operations?.some((operation) =>
        operation.kind === "variable_change" && operation.controls?.length > 0),
      "student task has no usable variable control");
      assert.equal(task.completion?.kind, "expression_target");
      assert.ok(task.hints?.length > 0, "student task has no hints");
      assert.ok(task.success_message?.trim(), "student task has no success feedback");
    }
    if (item.expected.scene3d_view_task) {
      const task = lesson.lesson.tasks?.find((candidate) =>
        candidate.completion?.kind === "scene3d_view_target");
      assert.ok(task, "missing after-lesson 3D view task");
      assert.equal(task.availability?.kind, "after_lesson");
      assert.ok(task.prompt?.trim(), "3D view task prompt is empty");
      assert.ok(task.allowed_operations?.some((operation) =>
        operation.kind === "scene3d_view" && operation.controls?.length > 0),
      "3D view task has no usable scene control");
      assert.ok(task.hints?.length > 0, "3D view task has no hints");
      assert.ok(task.success_message?.trim(), "3D view task has no success feedback");
    }
    const requirementsMatch = stderr.match(
      /"stage":"lesson-requirements"[^\n]*"status":"completed","elapsed_ms":(\d+)/u,
    );
    const firstPartMatch = stderr.match(
      /"kind":"oll_lesson_part","message":"part=0 elapsed_ms=(\d+)"/u,
    );
    const completedMatches = [...stderr.matchAll(
      /"stage":"lesson-generation"[^\n]*"status":"completed","elapsed_ms":(\d+)/gu,
    )];
    const modelCalls = completedModelCalls(stderr);
    const rejections = stderr.split("\n")
      .filter((line) => line.startsWith("learning-coach: rejected "))
      .map((line) => line.slice("learning-coach: ".length));
    const sumMetric = (name) => modelCalls.reduce(
      (total, call) => total + (typeof call[name] === "number" ? call[name] : 0),
      0,
    );
    return {
      attempts: protocol.generation_attempts,
      writes: writes.map((action) => action.kind),
      requirementsMs: requirementsMatch ? Number(requirementsMatch[1]) : undefined,
      firstPartMs: firstPartMatch ? Number(firstPartMatch[1]) : undefined,
      completedMs: completedMatches.length > 0
        ? Number(completedMatches.at(-1)[1])
        : undefined,
      modelCalls: modelCalls.length,
      requestRetries: modelCalls.reduce(
        (total, call) => total + Math.max(0, (call.request_attempts ?? 1) - 1),
        0,
      ),
      promptTokens: sumMetric("prompt_tokens"),
      candidateTokens: sumMetric("candidate_tokens"),
      thoughtTokens: sumMetric("thought_tokens"),
      callTimings: modelCalls.map((call, index) => ({
        index: index + 1,
        label: call.label ?? "unknown",
        elapsedMs: call.elapsed_ms,
        thoughtTokens: call.thought_tokens,
        finishReason: call.finish_reason,
      })),
      rejections,
    };
  } finally {
    if (process.env.OLL_KEEP_EVAL_ARTIFACTS !== "1") {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }
}

let failures = 0;
for (const item of selected) {
  for (let run = 1; run <= repeat; run += 1) {
    const runLabel = repeat === 1 ? item.id : `${item.id}#${run}`;
    try {
      const result = await runCase(item);
      process.stdout.write(
        `PASS ${runLabel} attempts=${result.attempts} requirements_ms=${result.requirementsMs ?? "n/a"} first_part_ms=${result.firstPartMs ?? "n/a"} completed_ms=${result.completedMs ?? "n/a"} writes=${result.writes.join(",")}\n`
        + `MODEL_METRICS ${runLabel} calls=${result.modelCalls} retries=${result.requestRetries} prompt_tokens=${result.promptTokens} candidate_tokens=${result.candidateTokens} thought_tokens=${result.thoughtTokens}\n`
        + `CALL_TIMINGS ${runLabel} ${result.callTimings.map((call) =>
          `${call.index}:${call.label}=${call.elapsedMs ?? "n/a"}ms/thought=${call.thoughtTokens ?? "n/a"}/finish=${call.finishReason ?? "n/a"}`
        ).join(" ")}\n`
        + (result.rejections.length > 0
          ? `REJECTIONS ${runLabel} ${result.rejections.join(" | ")}\n`
          : ""),
      );
    } catch (error) {
      failures += 1;
      process.stderr.write(`FAIL ${runLabel}: ${error.message}\n`);
    }
  }
}
process.exitCode = failures === 0 ? 0 : 1;
