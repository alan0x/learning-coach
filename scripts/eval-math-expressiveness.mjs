#!/usr/bin/env node
/**
 * M2/M3 run over the fixed regression sample (Learn docs/MATH_EXPRESSIVENESS_PLAN.md §4).
 *
 * Each sampled question becomes one whole lesson through the real Coach tool process, as Octos starts
 * it (no Jev; the broad request). The run records which recipes the lesson's plan used and keeps the
 * compiled lesson, its parts and the raw model replies for hand reading. M2 (chosen and correct) and
 * M3 (never misleads) are read by hand from these files; nothing here judges them.
 *
 * Uses the owner's model key; run only with the owner's approval. Only the provider and model are
 * printed or written.
 *
 *   node scripts/eval-math-expressiveness.mjs --octos-profile ~/.octos/profiles/<id>.json --out <dir>
 *     [--ids K2-01,G35-03] [--max-calls 400] [--lesson-calls 12] [--build <dir with main>]
 *   Re-running with the same --out skips questions that already have a row.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { profileRouteEnvironment } from "./eval-payload-padding.mjs";
import { drawSample } from "./draw-math-regression-sample.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Each recipe's required features, read from the math plugin's source (the program picks a recipe by them). */
export function recipeFeatures(sources = ["math.ts", "shared.ts"].map((file) => readFileSync(join(root, "src", "plugins", file), "utf8"))) {
  const out = {};
  for (const source of sources) {
    // Only the recipe table itself (… _RECIPES = { … } as const;), never the schema tables after it.
    const start = source.search(/_RECIPES = \{/u);
    if (start < 0) continue;
    const table = source.slice(start, source.indexOf("} as const;", start));
    for (const match of table.matchAll(/^  ([a-z_]+): \{[\s\S]*?required_features: \[([^\]]*)\]/gmu)) {
      out[match[1]] = [...match[2].matchAll(/"([a-z_0-9]+)"/gu)].map((feature) => feature[1]);
    }
  }
  return out;
}

/** The feature sets the model asked for, from its raw replies (each reply is JSON-escaped on one line). */
export function requestedFeatures(rawLines) {
  const sets = [];
  for (const line of rawLines) {
    const text = JSON.stringify(JSON.parse(line.slice("learning-coach: raw ".length)).body).replace(/\\+"/gu, '"');
    for (const match of text.matchAll(/"required_features"\s*:\s*\[([^\]]*)\]/gu)) {
      sets.push([...match[1].matchAll(/"([a-z_0-9]+)"/gu)].map((feature) => feature[1]).sort());
    }
  }
  return [...new Map(sets.map((set) => [set.join(","), set])).values()];
}

/** For each requested set, the most specific recipes whose required features it all holds. */
export function recipesFor(requested, features) {
  const found = new Set();
  for (const set of requested) {
    const fits = Object.entries(features).filter(([, needs]) => needs.length && needs.every((need) => set.includes(need)));
    const most = Math.max(0, ...fits.map(([, needs]) => needs.length));
    for (const [name, needs] of fits) if (needs.length === most) found.add(name);
  }
  return [...found].sort();
}

/** What the compiled lesson actually draws: the kinds of its visual writes. */
export function drawnKinds(lesson) {
  const kinds = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (node.do === "write" && typeof node.kind === "string" && !["text", "math", "note", "table", "shape"].includes(node.kind)) kinds.add(node.kind);
    Object.values(node).forEach(visit);
  };
  visit(lesson);
  return [...kinds].sort();
}

/** Runs the Coach tool to the end of the lesson (or the call cap), as Octos starts it. */
export function runLesson({ build, input, env, maxCalls, onRaw = () => {} }) {
  return new Promise((done) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [join(build, "main"), "oll_generate_lesson"], { env, stdio: ["pipe", "pipe", "pipe"] });
    const row = { outcome: "error", first_playable_ms: null, total_ms: null, calls: 0, prompt_tokens: 0, candidate_tokens: 0, thought_tokens: 0, sections: null, parts: [], rejections: 0 };
    let stdout = "";
    let buffer = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('{"type":"artifact"')) {
          try { row.parts.push(JSON.parse(line).path); } catch { /* not an artifact line */ }
          continue;
        }
        if (line.startsWith("learning-coach: raw ")) { onRaw(line); continue; }
        const json = line.startsWith("learning-coach: {") ? line.slice("learning-coach: ".length) : undefined;
        if (!json) continue;
        let entry;
        try { entry = JSON.parse(json); } catch { continue; }
        if (entry.stage === "lesson-plan-outline-ready" && typeof entry.sections === "number") row.sections = entry.sections;
        if (entry.stage === "lesson-plan-local-rejection") row.rejections += 1;
        if (entry.stage === "lesson-prefix-published" && row.first_playable_ms === null) row.first_playable_ms = Date.now() - startedAt;
        if (entry.stage === "model-call" && entry.status === "started") {
          row.calls += 1;
          if (row.calls > maxCalls) { row.outcome = "call_cap"; child.kill("SIGTERM"); }
        }
        if (entry.stage === "model-call" && entry.status === "completed") {
          row.prompt_tokens += entry.prompt_tokens ?? 0;
          row.candidate_tokens += entry.candidate_tokens ?? 0;
          row.thought_tokens += entry.thought_tokens ?? 0;
        }
      }
    });
    child.on("close", (code) => {
      row.total_ms = Date.now() - startedAt;
      if (row.outcome !== "call_cap") {
        try {
          const result = JSON.parse(stdout.trim().split("\n").at(-1));
          row.outcome = result.success ? (result.structured_metadata?.lesson_disposition ? `no lesson: ${result.structured_metadata.lesson_disposition}` : "lesson") : "failed";
          if (!result.success) row.error = String(result.error ?? result.output ?? "").slice(0, 300);
        } catch { row.outcome = `exit ${code}`; }
      }
      done(row);
    });
    child.stdin.end(JSON.stringify(input));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
  const profilePath = option("--octos-profile");
  const out = option("--out");
  if (!profilePath || !out) throw new Error("--octos-profile and --out are required");
  const build = resolve(option("--build", root));
  const maxCalls = Number(option("--max-calls", "400"));
  const lessonCalls = Number(option("--lesson-calls", "12"));
  const read = (name) => JSON.parse(readFileSync(join(root, "testsuite", name), "utf8"));
  const set = read("math-expressiveness-question-set.json");
  const m1 = read("math-expressiveness-m1-baseline.json");
  const byId = new Map(set.questions.map((q) => [q.id, q]));
  const sample = drawSample(set.questions, m1.tags);
  const ids = option("--ids")?.split(",").map((id) => id.trim()) ?? sample.map((entry) => entry.id);
  const features = recipeFeatures();
  const strata = new Map(sample.map((entry) => [entry.id, entry.stratum]));
  const routeEnv = await profileRouteEnvironment(profilePath);
  const route = { provider: routeEnv.OCTOS_PROFILE_LLM_PROVIDER, model: routeEnv.OCTOS_PROFILE_LLM_MODEL };
  await mkdir(resolve(out), { recursive: true });
  const reportPath = join(resolve(out), "report.json");
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : { ...route, build, rows: [] };
  const done = new Set(report.rows.map((row) => row.id));
  let spent = report.rows.reduce((sum, row) => sum + row.calls, 0);
  console.error(JSON.stringify({ stage: "math-expressiveness", ...route, questions: ids.length, already: done.size, max_calls: maxCalls }));
  for (const id of ids) {
    if (done.has(id)) continue;
    const q = byId.get(id);
    if (!q) throw new Error(`no question '${id}'`);
    if (spent + lessonCalls > maxCalls) { console.error(JSON.stringify({ stage: "stopped", reason: "call budget", spent })); break; }
    const dir = join(resolve(out), id);
    await mkdir(dir, { recursive: true });
    const workDir = join(dir, "work");
    const turn = `m2-${id}-${Date.now()}`;
    const env = { ...process.env, ...routeEnv, OCTOS_WORK_DIR: workDir, OLL_DEBUG_GENERATION: "1" };
    delete env.LEARNING_COACH_TRIAL_RECIPES;
    const input = { turn_id: turn, learner_request: q.prompt, request_source: "self_contained", language: q.language === "zh-CN" ? "zh-CN" : "en", input_modality: "text" };
    const raw = [];
    // Coach writes each raw reply as one stderr line with OLL_DEBUG_GENERATION; kept for reading and replay.
    const run = await runLesson({ build, input, env, maxCalls: lessonCalls, onRaw: (line) => raw.push(line) });
    spent += run.calls;
    await writeFile(join(dir, "raw-replies.txt"), raw.length ? `${raw.join("\n")}\n` : "");
    const oll = join(workDir, "study", "oll");
    const files = existsSync(oll) ? readdirSync(oll) : [];
    const lesson = files.find((file) => file.endsWith(".octos-lesson.json"));
    if (lesson) await copyFile(join(oll, lesson), join(dir, "lesson.json"));
    const { parts, ...kept } = run;
    const row = {
      id, band: q.band, stratum: strata.get(id) ?? null, held_out: q.held_out, m1: m1.tags[id].coverage,
      expected_component: m1.tags[id].component ?? null, ...kept, parts: parts.length,
      requested_features: requestedFeatures(raw), recipes: recipesFor(requestedFeatures(raw), features),
      drawn: lesson ? drawnKinds(JSON.parse(readFileSync(join(oll, lesson), "utf8"))) : [], review: "pending",
    };
    report.rows.push(row);
    report.measured_at = new Date().toISOString();
    report.calls = spent;
    await writeFile(reportPath, `${JSON.stringify(report, null, 1)}\n`);
    console.error(JSON.stringify({ id, outcome: row.outcome, calls: row.calls, recipes: row.recipes, drawn: row.drawn, ms: row.total_ms }));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
