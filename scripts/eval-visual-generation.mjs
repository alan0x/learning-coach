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
const selected = selectedId ? cases.filter((item) => item.id === selectedId) : cases;
if (selected.length === 0) throw new Error(`Unknown eval case '${selectedId}'`);
if (!process.env.VERTEX_SA_JSON) throw new Error("VERTEX_SA_JSON is required for live visual generation evals");

function normalizeExpression(value) {
  return value.normalize("NFKC").toLowerCase().replace(/^y\s*=/u, "").replace(/\s+/gu, "");
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
    return { attempts: protocol.generation_attempts, writes: writes.map((action) => action.kind) };
  } finally {
    if (process.env.OLL_KEEP_EVAL_ARTIFACTS !== "1") {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }
}

let failures = 0;
for (const item of selected) {
  try {
    const result = await runCase(item);
    process.stdout.write(`PASS ${item.id} attempts=${result.attempts} writes=${result.writes.join(",")}\n`);
  } catch (error) {
    failures += 1;
    process.stderr.write(`FAIL ${item.id}: ${error.message}\n`);
  }
}
process.exitCode = failures === 0 ? 0 : 1;
