// The speed gate (math plan §8, M4 rule as revised by the owner on 2026-11-18).
//
// Why it changed: time to the first playable part is about 1.9 s + 5.3 ms per generated token (output and
// thinking, every call), which explained 67% of the variance in the 2026-11-18 solids gate; the rest is the
// provider's latency, which no request change causes. Twenty pairs of wall-clock times cannot settle
// ±0.5 s (per-pair spread ~4.8 s), so a change costing nothing failed the old median rule about 1 time in 8,
// and a real cost could pass.
//
// The revised rule, for requests the new recipe fits and for those it does not, each on its own:
// - Measure: per request, the tokens generated until the first playable part (every call), converted to
//   seconds at the run's own rate (least squares of first-playable time on generated tokens over all of the
//   run's speed rows). Wall-clock time is still reported, as a cross-check.
// - Judge sequentially on the paired differences (candidate minus baseline), with a bootstrap 95% interval
//   of the median: pass when its upper end is at most +0.5 s, fail when its lower end is above +0.5 s,
//   otherwise add 20 pairs; at 80 pairs, decide by the median at most +0.5 s.
// - Runs of one build pair are pooled (this script takes several run files), so an extension adds to the
//   pairs already measured.
// Cumulative cost is tracked separately: a periodic benchmark of main against a frozen reference build.

/** Tokens a request generated: output and thinking over every call, from the raw replies Coach logs. */
export function generatedTokens(raw) {
  let total = 0, found = false;
  for (const line of String(raw).split("\n")) {
    if (!line.includes("usageMetadata")) continue;
    const start = line.indexOf("{");
    let record;
    try { record = JSON.parse(line.slice(start)); } catch { continue; }
    const usage = record.body?.usageMetadata ?? record.usageMetadata;
    if (!usage) continue;
    found = true;
    total += (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  }
  return found ? total : undefined;
}

/** The fallback rate when a run has too few rows to fit one (2026-11-18 solids gate, 120 rows). */
export const DEFAULT_RATE = { ms_per_token: 5.34, intercept_ms: 1930, r2: 0.67, n: 120, fitted: false };

/** First-playable milliseconds per generated token, fitted over a run's speed rows (both arms). */
export function tokenRate(rows) {
  const points = rows.filter((row) => row.outcome === "first_playable" && Number.isFinite(row.generated_tokens) && Number.isFinite(row.first_playable_ms))
    .map((row) => [row.generated_tokens, row.first_playable_ms]);
  if (points.length < 20) return DEFAULT_RATE;
  const mx = points.reduce((sum, [x]) => sum + x, 0) / points.length, my = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
  const sxy = points.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0), sxx = points.reduce((sum, [x]) => sum + (x - mx) ** 2, 0);
  const syy = points.reduce((sum, [, y]) => sum + (y - my) ** 2, 0);
  if (!(sxx > 0) || !(sxy > 0)) return DEFAULT_RATE;
  const slope = sxy / sxx;
  return { ms_per_token: slope, intercept_ms: my - slope * mx, r2: (sxy * sxy) / (sxx * syy), n: points.length, fitted: true };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** A bootstrap 95% interval of the median, seeded so a verdict is reproducible. */
export function medianInterval(values, resamples = 4000, seed = 1) {
  let state = seed >>> 0;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  const medians = Array.from({ length: resamples }, () => median(values.map(() => values[Math.floor(next() * values.length)]))).sort((a, b) => a - b);
  return [medians[Math.floor(0.025 * resamples)], medians[Math.floor(0.975 * resamples)]];
}

/** Paired differences in converted milliseconds, one per pair that both arms completed. */
export function pairedTokenMs(rows, kind, rate, candidate = "candidate") {
  const pairs = new Map();
  for (const row of rows) {
    if (row.kind !== kind || row.outcome !== "first_playable" || !Number.isFinite(row.generated_tokens)) continue;
    const key = `${row.run ?? ""}\u0000${row.pair}`;
    pairs.set(key, { ...pairs.get(key), [row.arm]: row.generated_tokens });
  }
  return [...pairs.values()].filter((pair) => pair.baseline !== undefined && pair[candidate] !== undefined)
    .map((pair) => (pair[candidate] - pair.baseline) * rate.ms_per_token);
}

export const GATE = { limit_ms: 500, step_pairs: 20, max_pairs: 80 };

/** One group's sequential verdict: pass, fail, or extend (add `step_pairs` pairs). */
export function groupVerdict(differences, gate = GATE) {
  const n = differences.length;
  // A planned group with no complete pair (say every candidate hit the call cap) is never a pass (review of #73).
  if (n === 0) return { result: "incomplete", pairs: 0, reason: "no complete pairs" };
  if (n < 2) return { result: "extend", pairs: n, reason: "too few complete pairs" };
  const [low, high] = medianInterval(differences);
  const middle = median(differences);
  const summary = { pairs: n, median_ms: Math.round(middle), ci95_ms: [Math.round(low), Math.round(high)] };
  if (high <= gate.limit_ms) return { result: "pass", ...summary, reason: `upper end ${Math.round(high)} ms ≤ +${gate.limit_ms} ms` };
  if (low > gate.limit_ms) return { result: "fail", ...summary, reason: `lower end ${Math.round(low)} ms > +${gate.limit_ms} ms: clearly slower` };
  if (n >= gate.max_pairs) {
    return middle <= gate.limit_ms
      ? { result: "pass", ...summary, reason: `at ${n} pairs, median ${Math.round(middle)} ms ≤ +${gate.limit_ms} ms` }
      : { result: "fail", ...summary, reason: `at ${n} pairs, median ${Math.round(middle)} ms > +${gate.limit_ms} ms` };
  }
  return { result: "extend", ...summary, reason: `interval spans +${gate.limit_ms} ms: add ${gate.step_pairs} pairs (cap ${gate.max_pairs})` };
}

/**
 * The gate over a run's rows (or several runs' rows, each tagged with `run`): fitting ("motion") and other
 * requests judged on their own. Fail if either fails, extend if either needs more pairs, else pass.
 */
export function tokenSpeedVerdict(rows, gate = GATE) {
  const planned = [["motion", "fitting"], ["other", "other"]].filter(([kind]) => rows.some((row) => row.kind === kind));
  if (!planned.length) return { result: "not judged", reason: "no speed pairs: a quality-only run" };
  const rate = tokenRate(rows.filter((row) => row.kind === "motion" || row.kind === "other"));
  const groups = Object.fromEntries(planned.map(([kind, name]) => [name, groupVerdict(pairedTokenMs(rows, kind, rate), gate)]));
  const results = Object.values(groups).map((group) => group.result);
  const result = ["fail", "incomplete", "extend"].find((name) => results.includes(name)) ?? "pass";
  return { result, rate: { ...rate, ms_per_token: Number(rate.ms_per_token.toFixed(3)), intercept_ms: Math.round(rate.intercept_ms), r2: Number(rate.r2.toFixed(2)) }, groups };
}

// node scripts/speed-gate.mjs <run.json> [<run.json> …]: the revised verdict over one or more harness runs
// of the same two builds, pooled. Rows written before generated_tokens was recorded are read from the
// raw replies the run kept in its work_dir.
if (process.argv[1] && new URL(import.meta.url).pathname === (await import("node:path")).resolve(process.argv[1])) {
  const { readFileSync, readdirSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const files = process.argv.slice(2);
  if (!files.length) throw new Error("Usage: node scripts/speed-gate.mjs <run.json> [<run.json> …]");
  const rows = [];
  const builds = new Set();
  for (const [index, file] of files.entries()) {
    const run = JSON.parse(readFileSync(file, "utf8"));
    builds.add(JSON.stringify([run.trial_recipes ?? null, run.baseline_build ?? null, run.candidate_build ?? null]));
    const raws = run.work_dir && existsSync(run.work_dir) ? readdirSync(run.work_dir).filter((name) => name.endsWith(".raw-model.txt")) : [];
    for (const row of run.rows) {
      let tokens = row.generated_tokens;
      if (tokens === undefined) {
        const raw = raws.find((name) => name.startsWith(`trial-${row.pair}-${row.arm}-`));
        if (raw) tokens = generatedTokens(readFileSync(join(run.work_dir, raw), "utf8"));
      }
      rows.push({ ...row, run: index, generated_tokens: tokens });
    }
  }
  if (builds.size > 1) console.error("warning: the runs differ in trial recipes or builds; pooled anyway");
  console.log(JSON.stringify(tokenSpeedVerdict(rows), null, 1));
}
