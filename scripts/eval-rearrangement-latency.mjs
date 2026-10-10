#!/usr/bin/env node
// Interleaved real-provider comparison. Credentials are supplied via the normal
// skill environment, never command-line arguments or result files.
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createStructuredModelRouter, resolveLessonModelRoute } from "../main";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const baselineRef = option("--baseline-ref", "bc136fc77e8e7117ed08da4a2023bd669648179c");
const repeat = Number(option("--repeat", "3"));
const output = option("--output");
if (!output || !Number.isSafeInteger(repeat) || repeat < 1) throw new Error("Pass --output <directory> and positive --repeat");
const outputDir = resolve(output);
await mkdir(outputDir, { recursive: true });
const temporary = await mkdtemp(resolve(tmpdir(), "rearrangement-baseline-"));
const baselinePath = resolve(temporary, "lesson-plan.mjs");
await writeFile(baselinePath, execFileSync("git", ["show", `${baselineRef}:lesson-plan.js`], { cwd: root, maxBuffer: 4_000_000 }));
const candidateRef = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const versions = {
  baseline: await import(pathToFileURL(baselinePath).href),
  candidate: await import(pathToFileURL(resolve(root, "lesson-plan.js")).href),
};
const allCases = [
  { id: "pythagoras", request: "请给我上一节勾股定理的课程，请使用图形辅助。" },
  { id: "square-identity", request: "请用图形拼接解释为什么(a+b)²=a²+2ab+b²，再用一个数值例子说明。" },
];
const selectedCase = option("--case");
const cases = selectedCase ? allCases.filter(item => item.id === selectedCase) : allCases;
if (!cases.length) throw new Error("Unknown --case");
const route = resolveLessonModelRoute();
const results = [];
const report = async () => writeFile(resolve(outputDir, "results.json"), JSON.stringify({
  baseline_ref: baselineRef,
  candidate_ref: candidateRef,
  completed: results.length === cases.length * repeat * 2,
  provider: route.provider, model: route.model, repetitions: repeat,
  note: "Timing includes local validation and all semantic repair attempts. Compiled status alone does not certify prose correctness; review saved lessons separately.",
  results,
}, null, 2) + "\n");
try {
  for (let run = 1; run <= repeat; run++) for (const [ci, item] of cases.entries()) {
    const order = (run + ci) % 2 ? ["baseline", "candidate"] : ["candidate", "baseline"];
    for (const version of order) {
      const router = await createStructuredModelRouter(route);
      const started = performance.now();
      const record = { case: item.id, run, version, first_playable_ms: null, total_ms: null,
        model_calls: 0, semantic_rejections: [], status: "pending" };
      const responses = [];
      try {
        const generated = await versions[version].generateLessonPlanWithModel(async request => {
          record.model_calls++;
          const response = await router.call({ label: request.label, turnId: request.turn_id,
            systemPrompt: request.system_prompt, prompt: request.prompt, responseSchema: request.response_schema,
            lessonPlanPart: request.part, lessonPlanSection: request.section, lessonPlanAttempt: request.attempt });
          responses.push({ part: request.part, section: request.section, attempt: request.attempt, response });
          return response;
        }, { turn_id: `rearrangement-eval-${version}-${item.id}-${run}`, learner_request: item.request }, {
          on_playable_prefix: () => { record.first_playable_ms ??= Math.round(performance.now() - started); },
          on_rejected_part: event => {
            router.rejectLastResponse();
            record.semantic_rejections.push({ section: event.section, attempt: event.attempt, code: event.error.code, path: event.error.path, message: event.error.message });
          },
        });
        record.status = generated.lesson ? "compiled" : generated.disposition;
        record.sections = generated.lesson?.steps.length ?? 0;
        if (generated.lesson) await writeFile(resolve(outputDir, `${version}-${item.id}-${run}.json`), JSON.stringify({
          input: item.request, lesson: generated.lesson, responses,
          visuals: generated.drafts.flatMap(d => d.moments.flatMap(m => m.actions))
            .filter(a => a.action === "create" && a.kind === "visual").map(a => a.content),
        }, null, 2) + "\n");
      } catch (error) {
        record.status = "failed";
        record.error_code = error.code ?? error.name;
      }
      record.total_ms = Math.round(performance.now() - started);
      results.push(record);
      await report();
      process.stdout.write(JSON.stringify(record) + "\n");
    }
  }
} finally {
  await report();
  await rm(temporary, { recursive: true, force: true });
}
