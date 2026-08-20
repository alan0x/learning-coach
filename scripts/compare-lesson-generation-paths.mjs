import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.VERTEX_SA_JSON) throw new Error("VERTEX_SA_JSON is required for this live comparison");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const caseId = argument("--case");
if (!caseId) throw new Error("Pass exactly one --case <id>; old and new paths are always run sequentially");
const cases = JSON.parse(await readFile(join(root, "eval/lesson-path-comparison-cases.json"), "utf8"));
const selected = cases.find((item) => item.id === caseId);
if (!selected) throw new Error(`Unknown comparison case '${caseId}'`);

const outputArgument = argument("--output");
const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
const outputRoot = resolve(outputArgument ?? join(root, "eval/results/lesson-path-comparison", `${timestamp}-${caseId}`));
await mkdir(outputRoot, { recursive: true });

function parseStageEvents(stderr) {
  return stderr.split("\n").flatMap((line) => {
    const payload = line.startsWith("learning-coach: ")
      ? line.slice("learning-coach: ".length)
      : line;
    try {
      return [JSON.parse(payload)];
    } catch {
      return [];
    }
  });
}

function lessonSummary(lesson) {
  const beats = lesson.steps.flatMap((step) => step.beats);
  const actions = beats.flatMap((beat) => beat.actions);
  const writeKinds = [...new Set(actions
    .filter((action) => action.do === "write")
    .map((action) => action.kind))].sort();
  return {
    sections: lesson.steps.length,
    beats: beats.length,
    narration_characters: beats.reduce((total, beat) => total + (beat.say?.length ?? 0), 0),
    write_kinds: writeKinds,
    action_kinds: [...new Set(actions.map((action) => action.do))].sort(),
    variables: lesson.lesson.variables?.length ?? 0,
    tasks: lesson.lesson.tasks?.length ?? 0,
  };
}

async function runPath(mode) {
  const pathDirectory = join(outputRoot, mode);
  const workDirectory = join(pathDirectory, "work");
  await mkdir(workDirectory, { recursive: true });
  const startedAt = Date.now();
  const child = spawn(join(root, "main"), ["oll_generate_lesson"], {
    cwd: root,
    env: {
      ...process.env,
      OCTOS_WORK_DIR: workDirectory,
      OLL_LESSON_PLAN_MODE: mode === "new" ? "experimental" : "off",
      OLL_AUTHORING_STRATEGY: "parallel",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end(JSON.stringify({
    turn_id: `lesson-path-comparison-${mode}-${caseId}-${Date.now()}`,
    learner_request: selected.learner_request,
    request_source: "self_contained",
    language: "zh-CN",
  }));
  const exitCode = await new Promise((done, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${mode} path timed out after 300000ms`));
    }, 300_000);
    timeout.unref();
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      done(code);
    });
  });
  const wallMs = Date.now() - startedAt;
  await writeFile(join(pathDirectory, "stdout.log"), stdout, "utf8");
  await writeFile(join(pathDirectory, "stderr.log"), stderr, "utf8");
  assert.equal(exitCode, 0, `${mode} path failed; see ${join(pathDirectory, "stderr.log")}`);
  const protocolLines = stdout.trim().split("\n").flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const protocol = protocolLines.at(-1);
  assert.equal(protocol?.success, true, protocol?.output ?? `${mode} path returned no success protocol`);
  await writeFile(join(pathDirectory, "protocol.json"), `${JSON.stringify(protocol, null, 2)}\n`, "utf8");
  const lesson = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
  const lessonPath = join(pathDirectory, "lesson.json");
  await copyFile(protocol.files_to_send[0], lessonPath);
  const summary = lessonSummary(lesson);
  for (const kind of selected.expected_kinds) {
    assert.ok(summary.write_kinds.includes(kind), `${mode} path is missing required ${kind} content`);
  }
  const events = parseStageEvents(stderr);
  const firstPart = events.find((event) => event.kind === "oll_lesson_part");
  const modelCalls = events.filter((event) => event.stage === "model-call" && event.status === "completed");
  return {
    mode,
    wall_ms: wallMs,
    first_playable_ms: typeof firstPart?.message === "string"
      ? Number(firstPart.message.match(/elapsed_ms=(\d+)/u)?.[1])
      : undefined,
    model_calls: modelCalls.length,
    authoring_strategy: protocol.authoring_strategy,
    lesson_path: lessonPath,
    ...summary,
  };
}

// Never use Promise.all here. The free Vertex tier must see one course at a time.
const oldResult = await runPath("old");
const newResult = await runPath("new");
const report = {
  case: selected,
  execution: "sequential",
  old: oldResult,
  new: newResult,
  difference: {
    first_playable_ms: oldResult.first_playable_ms !== undefined && newResult.first_playable_ms !== undefined
      ? newResult.first_playable_ms - oldResult.first_playable_ms
      : null,
    wall_ms: newResult.wall_ms - oldResult.wall_ms,
    model_calls: newResult.model_calls - oldResult.model_calls,
  },
  manual_review: [
    "逐节比较用户要求是否都被讲到",
    "比较旁白是否像一整节课，而不是画面说明",
    "比较画面、动画、学生任务和回到旧图的效果",
  ],
};
await writeFile(join(outputRoot, "summary.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ ok: true, output: outputRoot, ...report.difference })}\n`);
