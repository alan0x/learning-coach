#!/usr/bin/env node
// Speed gate for a trial recipe (decision E5): does offering a new recipe to
// the model cost first-playable time? Scaled down like the earlier speed
// checks: interleaved pairs, measured to the first playable section only.
//
// Both arms run the same Coach build through the real tool process, exactly
// as Octos starts it; they differ only in LEARNING_COACH_TRIAL_RECIPES, so the
// candidate's requests also offer the trial recipe (its card, guidance and
// schema). Jev is left out: the gate is the same in both arms.
//
// Cases mix requests the recipe fits (constant-speed motion) with requests
// from other subjects, which pay for the larger request without using it.
// Each run records whether its first playable section used the trial recipe.
//
// Uses the owner's model key; run only with the owner's approval. The route
// and key come from the Octos profile inside this process; nothing about them
// is printed or written except the provider and model.
//
//   node scripts/eval-trial-recipe-speed.mjs --build <dir with main + lesson-plan.js>
//     --octos-profile ~/.octos/profiles/<id>.json [--recipes constant_speed_motion] [--pairs 20] [--max-calls 60] [--out <report.json>]
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { profileRouteEnvironment } from "./eval-payload-padding.mjs";
import { runTool, caseLanguage } from "./eval-shadow-speed.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Requests the constant-speed recipe fits; the other half of the pairs come from other subjects. */
export const MOTION_CASES = [
  { id: "CS-01", prompt: "物体做匀速直线运动时，路程是怎样随时间变化的？" },
  { id: "CS-02", prompt: "How does distance change over time when something moves at a constant speed?" },
  { id: "CS-03", prompt: "一辆车以每秒 15 米的速度匀速行驶，怎么画它的路程—时间图像？" },
  { id: "CS-04", prompt: "Why is the distance–time graph of constant speed a straight line?" },
  { id: "CS-05", prompt: "怎样从路程—时间图像看出谁跑得快？" },
  { id: "CS-06", prompt: "A cyclist rides at 5 m/s. How far does she go in 8 seconds? Show it on a graph." },
  { id: "CS-07", prompt: "速度、路程和时间之间是什么关系？" },
  { id: "CS-08", prompt: "What does the slope of a distance–time graph tell you?" },
  { id: "CS-09", prompt: "小明以 1.5 m/s 匀速走路，10 秒走多远？用图像讲讲。" },
  { id: "CS-10", prompt: "Explain speed = distance ÷ time with a moving object." },
];
/** Requests the number line recipe fits (OLL decision 0013): integers, fractions and decimals on a line, Chinese and English. */
export const NUMBER_LINE_CASES = [
  { id: "NL-01", prompt: "用数轴讲一讲 3 加上负 5 等于多少。" },
  { id: "NL-02", prompt: "Show me on a number line why -2 + 7 = 5." },
  { id: "NL-03", prompt: "3/4 在数轴上的哪里？" },
  { id: "NL-04", prompt: "How do I add 1/4 and 2/4 on a number line?" },
  { id: "NL-05", prompt: "温度从零下 3 度升高 8 度，用数轴表示是多少度？" },
  { id: "NL-06", prompt: "Use a number line to explain 6 - 9." },
  { id: "NL-07", prompt: "在数轴上比较 0.5 和 0.8 哪个大。" },
  { id: "NL-08", prompt: "Why is -4 less than -1? Show it on a number line." },
  { id: "NL-09", prompt: "从 1/3 出发，再加 2/3，在数轴上是多少？" },
  { id: "NL-10", prompt: "Count by fourths from 0 to 2 on a number line." },
];
/** The requests each trial recipe fits. */
export const TRIAL_CASES = { constant_speed_motion: MOTION_CASES, number_line: NUMBER_LINE_CASES };

/** Held-out requests the recipe does not fit (subject-routing-heldout.json). */
export const OTHER_CASE_IDS = ["HO-MA-01", "HO-PH-02", "HO-CH-01", "HO-BI-01", "HO-ES-01", "HO-MA-04", "HO-PH-04", "HO-CH-04", "HO-BI-04", "HO-ES-04"];

/**
 * What a first part's number line shows, for judging quality alongside speed:
 * the range, ticks, hops, start and end. Undefined when it has none.
 */
export function numberLineInPart(part) {
  const write = (part.steps ?? []).flatMap((step) => step.beats ?? []).flatMap((beat) => beat.actions ?? [])
    .find((action) => action.do === "write" && action.kind === "number_line");
  if (!write) return undefined;
  const { range, ticks, jumps = [], points = [], bindings = [] } = write.content ?? {};
  // The sliders behind the start and the change, so a check can see which answers a learner can reach.
  const slider = (target) => {
    const name = bindings.find((binding) => binding.target === target)?.expression?.trim();
    const variable = (part.lesson?.variables ?? []).find((candidate) => candidate.as === name);
    return variable ? { min: variable.min, max: variable.max, initial: variable.initial, step: variable.control?.step ?? null } : null;
  };
  return {
    span: range ? range.max - range.min : null, range: range ?? null,
    subdivisions: ticks?.subdivisions ?? 1, step: ticks?.step ?? null,
    hops: jumps[0]?.hops ?? null, by: jumps[0]?.by ?? null,
    start: points.find((point) => point.as === "start")?.value ?? null,
    end: points.find((point) => point.as === "end")?.value ?? null,
    start_slider: slider("start.value"), change_slider: slider("move.by"),
  };
}

/** The recipes whose builder output the first playable part contains. */
export function recipesInPart(part) {
  const actions = (part.steps ?? []).flatMap((step) => step.beats ?? []).flatMap((beat) => beat.actions ?? []);
  const writes = actions.filter((action) => action.do === "write");
  const found = [];
  const motion = writes.some((action) => action.kind === "geometry" && String(action.as).endsWith("-track")
    && (action.content?.points ?? []).some((point) => point.as === "object"));
  if (motion) found.push("constant_speed_motion");
  if (writes.some((action) => action.kind === "number_line")) found.push("number_line");
  return found;
}

const median = (values) => {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function summarize(rows) {
  const group = (filter) => {
    const ok = (arm) => rows.filter((row) => filter(row) && row.arm === arm && row.outcome === "first_playable");
    const pairs = new Map();
    for (const row of rows.filter((entry) => filter(entry) && entry.outcome === "first_playable")) pairs.set(row.pair, { ...pairs.get(row.pair), [row.arm]: row.first_playable_ms });
    const differences = [...pairs.values()].filter((pair) => pair.baseline !== undefined && pair.candidate !== undefined).map((pair) => pair.candidate - pair.baseline);
    const mean = differences.length ? differences.reduce((sum, value) => sum + value, 0) / differences.length : null;
    const sd = differences.length > 1 ? Math.sqrt(differences.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (differences.length - 1)) : null;
    const se = sd !== null ? sd / Math.sqrt(differences.length) : null;
    return {
      complete_pairs: differences.length,
      p50_first_playable_ms: { baseline: median(ok("baseline").map((row) => row.first_playable_ms)), candidate: median(ok("candidate").map((row) => row.first_playable_ms)) },
      p50_prompt_tokens: { baseline: median(ok("baseline").map((row) => row.prompt_tokens)), candidate: median(ok("candidate").map((row) => row.prompt_tokens)) },
      paired_difference_ms: { median: median(differences), mean, ci95: se !== null ? [mean - 1.96 * se, mean + 1.96 * se] : null },
      candidate_used_trial_recipe: ok("candidate").filter((row) => row.recipes?.length).length,
      errors: rows.filter((row) => filter(row) && row.outcome !== "first_playable").length,
    };
  };
  return { all: group(() => true), motion: group((row) => row.kind === "motion"), other: group((row) => row.kind === "other") };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
  const pairs = Number(option("--pairs", "20"));
  const maxCalls = Number(option("--max-calls", "60"));
  const recipes = option("--recipes", "constant_speed_motion");
  const build = resolve(option("--build", root));
  const profilePath = option("--octos-profile");
  const out = option("--out");
  if (!profilePath) throw new Error("--octos-profile is required");
  const routeEnv = await profileRouteEnvironment(profilePath);
  const heldOut = new Map(JSON.parse(await readFile(join(root, "eval/subject-routing-heldout.json"), "utf8")).cases.map((item) => [item.id, item]));
  const fitting = TRIAL_CASES[recipes.split(",")[0].trim()];
  if (!fitting) throw new Error(`no fitting requests for trial recipe '${recipes}'`);
  // "motion" marks requests the trial recipe fits, whichever recipe that is.
  const cases = fitting.flatMap((fit, index) => [{ ...fit, kind: "motion" }, { ...heldOut.get(OTHER_CASE_IDS[index]), kind: "other" }]);
  const workDir = await mkdtemp(join(tmpdir(), "coach-trial-"));
  // Coach logs each raw model reply, which the harness keeps beside the run's compiled parts, so a
  // later fit can be replayed against what the model actually wrote at no cost.
  const env = { ...process.env, ...routeEnv, OCTOS_WORK_DIR: workDir, OLL_DEBUG_GENERATION: "1" };
  delete env.LEARNING_COACH_TRIAL_RECIPES;
  const route = { provider: routeEnv.OCTOS_PROFILE_LLM_PROVIDER, model: routeEnv.OCTOS_PROFILE_LLM_MODEL };
  const budget = { remaining: maxCalls };
  const rows = [];
  const persist = async () => {
    if (!out) return;
    await mkdir(dirname(resolve(out)), { recursive: true });
    // The compiled first parts stay in work_dir after the run, as evidence of what each lesson drew.
    await writeFile(resolve(out), `${JSON.stringify({ measured_at: new Date().toISOString(), ...route, trial_recipes: recipes, pairs, max_calls: maxCalls, work_dir: workDir, summary: summarize(rows), rows }, null, 1)}\n`);
  };
  console.error(JSON.stringify({ stage: "trial-recipe-speed", ...route, trial_recipes: recipes, pairs, max_calls: maxCalls }));
  const { appendFileSync, readFileSync } = await import("node:fs");
  for (let pair = 0; pair < pairs && budget.remaining > 0; pair += 1) {
    const item = cases[pair % cases.length];
    const order = Math.floor(pair / 2) % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
    for (const arm of order) {
      if (budget.remaining <= 0) break;
      const input = { turn_id: `trial-${pair}-${arm}-${Date.now()}`, learner_request: item.prompt, request_source: "self_contained", language: caseLanguage(item), input_modality: "text" };
      const tool = await runTool({
        build, input, env: arm === "candidate" ? { ...env, LEARNING_COACH_TRIAL_RECIPES: recipes } : env,
        maxCalls: Math.min(3, budget.remaining), onCall: () => { budget.remaining -= 1; },
        onRaw: (line) => appendFileSync(join(workDir, `${input.turn_id}.raw-model.txt`), `${line}\n`),
        onFirstPart: (path) => {
          try {
            const part = JSON.parse(readFileSync(path, "utf8"));
            const line = numberLineInPart(part);
            return { recipes: recipesInPart(part), ...(line ? { number_line: line } : {}) };
          } catch { return { recipes: null }; }
        },
      });
      const { first_part_path: _path, ...kept } = tool;
      const row = { pair, case: item.id, kind: item.kind, arm, order: order.indexOf(arm), ...kept };
      rows.push(row);
      console.error(JSON.stringify({ pair, case: item.id, kind: item.kind, arm, outcome: row.outcome, ms: row.first_playable_ms, calls: row.calls, recipes: row.recipes ?? null }));
      await persist();
    }
  }
  await persist();
  console.log(JSON.stringify(summarize(rows), null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
