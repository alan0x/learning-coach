// The revised speed gate (math plan §8, owner 2026-11-18): generated tokens converted to seconds at the
// run's own rate, judged sequentially on the bootstrap interval of the paired median.
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RATE, GATE, generatedTokens, groupVerdict, medianInterval, pairedTokenMs, tokenRate, tokenSpeedVerdict } from "../scripts/speed-gate.mjs";

test("generated tokens: output and thinking over every call, from Coach's raw reply lines", () => {
  const line = (label, out, thoughts) => `learning-coach: raw ${JSON.stringify({ label, body: { usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: out, ...(thoughts ? { thoughtsTokenCount: thoughts } : {}) } } })}`;
  assert.equal(generatedTokens([line("lesson-plan-bootstrap", 1000, 500), line("lesson-plan-section", 700)].join("\n")), 2200);
  assert.equal(generatedTokens("no usage here"), undefined);
});

test("the rate is fitted on the run (first-playable time on generated tokens), with a recorded fallback", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({ outcome: "first_playable", generated_tokens: 1000 + 50 * index, first_playable_ms: 2000 + 5 * (1000 + 50 * index) }));
  const rate = tokenRate(rows);
  assert.ok(Math.abs(rate.ms_per_token - 5) < 1e-9 && Math.abs(rate.intercept_ms - 2000) < 1e-6 && rate.fitted);
  assert.deepEqual(tokenRate(rows.slice(0, 5)), DEFAULT_RATE, "too few rows: the recorded rate");
});

test("sequential verdict: pass on a clear interval, fail when clearly slower, extend in between, decide at the cap", () => {
  const spread = (center, n) => Array.from({ length: n }, (_, index) => center + (index % 2 ? 300 : -300));
  assert.equal(groupVerdict(spread(-1000, 20)).result, "pass");
  assert.equal(groupVerdict(spread(2000, 20)).result, "fail");
  const wide = (center, n) => Array.from({ length: n }, (_, index) => center + (index - n / 2) * 200);
  const middle = groupVerdict(wide(400, 20));
  assert.equal(middle.result, "extend");
  assert.match(middle.reason, /add 20 pairs \(cap 80\)/u);
  assert.equal(groupVerdict(wide(400, GATE.max_pairs)).result, "pass", "at the cap the median decides");
  assert.equal(groupVerdict(wide(700, GATE.max_pairs)).result, "fail");
  assert.equal(groupVerdict([]).result, "incomplete");
  const [low, high] = medianInterval([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(low <= 5.5 && high >= 5.5);
  assert.deepEqual(medianInterval([1, 2, 3, 4, 5]), medianInterval([1, 2, 3, 4, 5]), "seeded: reproducible");
});

test("pairs are keyed by run, so extensions pool without colliding pair numbers", () => {
  const row = (run, pair, arm, tokens) => ({ run, pair, kind: "other", arm, outcome: "first_playable", generated_tokens: tokens, first_playable_ms: 1 });
  const rows = [row(0, 0, "baseline", 1000), row(0, 0, "candidate", 1100), row(1, 0, "baseline", 1000), row(1, 0, "candidate", 900)];
  assert.deepEqual(pairedTokenMs(rows, "other", { ms_per_token: 5 }), [500, -500]);
  const verdict = tokenSpeedVerdict(rows);
  assert.deepEqual(Object.keys(verdict.groups), ["other"], "only the groups a run planned");
  assert.equal(tokenSpeedVerdict([]).result, "not judged");
});
