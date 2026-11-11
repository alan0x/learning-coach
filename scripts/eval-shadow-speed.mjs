#!/usr/bin/env node
// Speed gate for subject plan P2 shadow mode, with Jev on and with Jev off
// (scaled down by the owner on 2026-11-11, like the payload experiment:
// first playable only, 20 interleaved pairs).
//
// A run is what Learn and Octos do for one typed lesson request:
//   1. Jev on: Learn awaits its Jev admission gate (disposition, subject,
//      self-containment). Jev off: there is no gate call.
//   2. Octos starts the Coach tool process with the lesson input on stdin.
//   3. First playable: the tool's first `lesson-prefix-published` event.
// The run is stopped there. Its time is gate time plus tool time.
//
// Baseline: the installed Coach 0.25.1 build. With Jev on it gets today's
// five-choice subject question and no subject fields.
// Candidate: this branch's build (Coach 0.26). With Jev on it gets the
// plugin-based subject question; the fields come from Jev's answer.
// With Jev off they come from the board context or are `none`.
// Pairs alternate Jev on and Jev off, and the order within a pair alternates.
//
// Uses the owner's model key and Jev key; run only with the owner's approval.
// Both come from the Octos profile inside this process; nothing about them is
// printed or written except the provider and model.
//
//   node scripts/eval-shadow-speed.mjs --baseline <dir with main + lesson-plan.js> --candidate <dir>
//     --octos-profile ~/.octos/profiles/<id>.json [--pairs 20] [--max-calls 60] [--out <report.json>]
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SUBJECT_PLUGINS, selectSubjectPlugins, subjectQuestion } from "octos-lesson-language/plugin-subjects";
import { profileRouteEnvironment } from "./eval-payload-padding.mjs";
import { profileJev } from "./eval-subject-routing.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const GATE_TIMEOUT_MS = 2000; // Learn's DEFAULT_TYPESAFE_TIMEOUT_MS
const INSTALLED = [...SUBJECT_PLUGINS.map((plugin) => plugin.manifest.id), "shared"];

/** Held-out text cases with a clear lesson request, across every subject and the mixed ones. */
export const SPEED_CASE_IDS = [
  "HO-MA-01", "HO-PH-01", "HO-CH-01", "HO-BI-01", "HO-ES-01",
  "HO-MX-01", "HO-MA-02", "HO-PH-02", "HO-CH-02", "HO-BI-02",
  "HO-ES-02", "HO-MX-02", "HO-MA-04", "HO-PH-04", "HO-CH-04",
  "HO-BI-04", "HO-ES-04", "HO-MX-04", "HO-AM-03", "HO-MX-03",
];

// Today's subject question (Learn main, admission-fast-gate.ts).
const FIXED_SUBJECT_QUESTION = {
  type: "choice",
  instructions: "如果该内容涉及学习主题，判断其最可能所属的主学科领域",
  criteria: {
    math: "数学（代数、几何、函数、微积分、概率等）",
    physics: "物理与工程技术",
    general_science: "化学、生物及常规自然科学",
    language_humanities: "语言、文学、历史与人文社科",
    other: "日常常识或其他非典型学科",
  },
};

export function caseLanguage(item) {
  return item.language ?? (/[㐀-鿿]/u.test(item.prompt) ? "zh-CN" : "en");
}

/** Learn's gate request for a fresh-board typed request; `plugins` selects the P2 question. */
export function gateRequest(item, { plugins, model = "jev-latest" } = {}) {
  return {
    model,
    state: { learner_request: item.prompt, input_modality: "text", has_camera_frame: false, has_selection: false },
    questions: {
      disposition: {
        type: "choice",
        instructions: "判断用户当前的输入是否构成一个清晰、可实质性展开教学的学习主题或提问",
        criteria: {
          generate_lesson: "提出了具体的学习问题、概念解释或明确的学习主题（包括简短但清晰的主题，如'勾股定理'、'为什么负负得正'）",
          clarify: "是真实的口语，但内容残缺不全、指代不明或缺少主干，需要向用户追问（如'这本书'、'刚才那个'）",
          ignore: "仅为语气词、口头填充、停顿、唤醒词或无实际教学意图的噪音（如'呃'、'啊对'、'嗯'、'好'）",
        },
      },
      subject: plugins ? subjectQuestion(plugins, caseLanguage(item)) : FIXED_SUBJECT_QUESTION,
      is_self_contained: { type: "noul", instructions: "该输入是否无需额外依赖上下文即可独立理解并直接展开一堂课？" },
    },
  };
}

/** The subject fields Learn sends (learn subject-signal.ts): Jev, then board context, then none. */
export function signalFields(answer, contextPlugins = []) {
  const selection = selectSubjectPlugins(answer?.probabilities, INSTALLED);
  if (selection) return { plugins: selection.plugins, plugin_confidence: Number(selection.confidence.toFixed(4)), plugin_source: "jev" };
  const context = contextPlugins.filter((id) => INSTALLED.includes(id) && id !== "shared").slice(0, 2);
  return context.length ? { plugins: context, plugin_source: "context" } : { plugins: [], plugin_source: "none" };
}

async function askGate(key, body) {
  const startedAt = Date.now();
  try {
    const response = await fetch(JEV_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Jev HTTP ${response.status}`);
    const result = await response.json();
    return { ms: Date.now() - startedAt, ok: true, disposition: result.answers?.disposition?.choice ?? null, subject: result.answers?.subject };
  } catch (error) {
    // Learn passes the request through on a timeout or failure.
    return { ms: Date.now() - startedAt, ok: false, error: error instanceof Error ? error.name : "error" };
  }
}

/** Starts the Coach tool as Octos does and stops it at the first playable section. */
export function runTool({ build, input, env, maxCalls, onCall = () => {} }) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [join(build, "main"), "oll_generate_lesson"], { env, stdio: ["pipe", "ignore", "pipe"] });
    const row = { first_playable_ms: null, calls: 0, prompt_tokens: null, plugin_signal: null, stages: [], outcome: "error" };
    let buffer = "";
    const stop = (outcome) => { if (row.outcome === "error" && outcome) row.outcome = outcome; child.kill("SIGTERM"); };
    child.stderr.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const json = line.startsWith("learning-coach: {") ? line.slice("learning-coach: ".length) : undefined;
        if (!json) continue;
        let entry;
        try { entry = JSON.parse(json); } catch { continue; }
        if (!row.stages.includes(entry.stage)) row.stages.push(entry.stage);
        if (entry.stage === "lesson-plan-generation" && entry.status === "started") row.plugin_signal = entry.plugin_signal ?? null;
        if (entry.stage === "model-call" && entry.status === "started") {
          row.calls += 1;
          onCall();
          if (row.calls > maxCalls) stop("call_cap");
        }
        if (entry.stage === "model-call" && entry.status === "completed" && row.prompt_tokens === null) {
          row.prompt_tokens = entry.usage?.prompt_tokens ?? entry.prompt_tokens ?? null;
        }
        if (entry.stage === "lesson-prefix-published" && row.first_playable_ms === null) {
          row.first_playable_ms = Date.now() - startedAt;
          stop("first_playable");
        }
      }
    });
    child.on("close", () => resolvePromise(row));
    child.stdin.end(JSON.stringify(input));
  });
}

const median = (values) => {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** p50 first playable per arm and the paired differences (candidate − baseline), per Jev mode. */
export function summarize(rows) {
  const summary = {};
  for (const jev of ["on", "off"]) {
    const ok = (arm) => rows.filter((row) => row.jev === jev && row.arm === arm && row.outcome === "first_playable");
    const pairs = new Map();
    for (const row of rows.filter((entry) => entry.jev === jev && entry.outcome === "first_playable")) {
      pairs.set(row.pair, { ...pairs.get(row.pair), [row.arm]: row.total_ms });
    }
    const differences = [...pairs.values()].filter((pair) => pair.baseline !== undefined && pair.candidate !== undefined)
      .map((pair) => pair.candidate - pair.baseline);
    const mean = differences.length ? differences.reduce((sum, value) => sum + value, 0) / differences.length : null;
    const sd = differences.length > 1 ? Math.sqrt(differences.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (differences.length - 1)) : null;
    const se = sd !== null ? sd / Math.sqrt(differences.length) : null;
    summary[jev] = {
      complete_pairs: differences.length,
      p50_first_playable_ms: { baseline: median(ok("baseline").map((row) => row.total_ms)), candidate: median(ok("candidate").map((row) => row.total_ms)) },
      p50_gate_ms: { baseline: median(ok("baseline").map((row) => row.gate_ms)), candidate: median(ok("candidate").map((row) => row.gate_ms)) },
      p50_tool_ms: { baseline: median(ok("baseline").map((row) => row.first_playable_ms)), candidate: median(ok("candidate").map((row) => row.first_playable_ms)) },
      paired_difference_ms: { median: median(differences), mean, ci95: se !== null ? [mean - 1.96 * se, mean + 1.96 * se] : null },
      gate_failures: rows.filter((row) => row.jev === jev && row.gate && !row.gate.ok).length,
      errors: rows.filter((row) => row.jev === jev && row.outcome !== "first_playable").length,
    };
  }
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
  const pairs = Number(option("--pairs", "20"));
  const maxCalls = Number(option("--max-calls", "60"));
  const baseline = resolve(option("--baseline", ""));
  const candidate = resolve(option("--candidate", ""));
  const profilePath = option("--octos-profile");
  const out = option("--out");
  if (!profilePath) throw new Error("--octos-profile is required");
  if (!Number.isSafeInteger(pairs) || pairs < 1 || pairs > SPEED_CASE_IDS.length * 2) throw new Error("--pairs out of range");
  const jev = await profileJev(profilePath);
  const routeEnv = await profileRouteEnvironment(profilePath);
  const cases = new Map(JSON.parse(await readFile(join(root, "eval/subject-routing-heldout.json"), "utf8")).cases.map((item) => [item.id, item]));
  const workDir = await mkdtemp(join(tmpdir(), "coach-speed-"));
  const env = { ...process.env, ...routeEnv, OCTOS_WORK_DIR: workDir };
  const route = { provider: routeEnv.OCTOS_PROFILE_LLM_PROVIDER, model: routeEnv.OCTOS_PROFILE_LLM_MODEL };
  const budget = { remaining: maxCalls };
  const rows = [];
  const persist = async () => {
    if (!out) return;
    await mkdir(dirname(resolve(out)), { recursive: true });
    await writeFile(resolve(out), `${JSON.stringify({ measured_at: new Date().toISOString(), ...route, jev_model: jev.model,
      pairs, max_calls: maxCalls, summary: summarize(rows), rows }, null, 1)}\n`);
  };
  console.error(JSON.stringify({ stage: "shadow-speed-gate", ...route, jev_model: jev.model, pairs, max_calls: maxCalls }));
  for (let pair = 0; pair < pairs && budget.remaining > 0; pair += 1) {
    const item = cases.get(SPEED_CASE_IDS[pair % SPEED_CASE_IDS.length]);
    const jevMode = pair % 2 === 0 ? "on" : "off";
    // Jev off: alternate a board whose latest lesson had the expected subjects and a fresh board.
    const context = jevMode === "off" && pair % 4 === 1 ? item.expected_plugins : [];
    const order = Math.floor(pair / 2) % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
    for (const arm of order) {
      if (budget.remaining <= 0) break;
      const startedAt = Date.now();
      let gate;
      if (jevMode === "on") {
        gate = await askGate(jev.key, gateRequest(item, { model: jev.model, ...(arm === "candidate" ? { plugins: INSTALLED } : {}) }));
      }
      const gateMs = Date.now() - startedAt;
      const fields = arm === "candidate" ? signalFields(gate?.ok ? gate.subject : undefined, context) : {};
      const input = {
        turn_id: `speed-${pair}-${arm}-${Date.now()}`,
        learner_request: item.prompt,
        request_source: "self_contained",
        language: caseLanguage(item),
        input_modality: "text",
        ...fields,
      };
      const tool = await runTool({ build: arm === "baseline" ? baseline : candidate, input, env,
        maxCalls: Math.min(3, budget.remaining), onCall: () => { budget.remaining -= 1; } });
      const row = {
        pair, case: item.id, jev: jevMode, arm, order: order.indexOf(arm), gate_ms: gateMs,
        ...(gate ? { gate: { ok: gate.ok, disposition: gate.disposition ?? null, subject_choice: gate.subject?.choice ?? null, ...(gate.error ? { error: gate.error } : {}) } } : {}),
        fields, ...tool,
        total_ms: tool.first_playable_ms === null ? null : gateMs + tool.first_playable_ms,
      };
      rows.push(row);
      console.error(JSON.stringify({ pair, case: item.id, jev: jevMode, arm, outcome: row.outcome, gate_ms: gateMs, tool_ms: tool.first_playable_ms, calls: tool.calls, source: fields.plugin_source ?? null, plugins: fields.plugins ?? null }));
      await persist();
    }
  }
  await persist();
  console.log(JSON.stringify(summarize(rows), null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
