import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SPEED_CASE_IDS, caseLanguage, gateRequest, signalFields, summarize } from "../scripts/eval-shadow-speed.mjs";

const INSTALLED = ["math", "physics", "chemistry", "biology", "earth_space", "shared"];

test("speed cases are held-out text cases with a lesson request", async () => {
  const cases = new Map(JSON.parse(await readFile(new URL("../eval/subject-routing-heldout.json", import.meta.url), "utf8")).cases.map((item) => [item.id, item]));
  assert.equal(new Set(SPEED_CASE_IDS).size, 20);
  for (const id of SPEED_CASE_IDS) {
    const item = cases.get(id);
    assert.ok(item, id);
    assert.equal(item.current_lesson, undefined, id);
    assert.equal(item.request_source ?? "self_contained", "self_contained", id);
    assert.ok(item.expected_plugins.length > 0, id);
  }
  assert.equal(caseLanguage({ prompt: "雨是怎么形成的？" }), "zh-CN");
  assert.equal(caseLanguage({ prompt: "Why do we have seasons?" }), "en");
});

test("the gate request keeps Learn's disposition and self-containment questions and swaps only the subject question", () => {
  const fixed = gateRequest({ prompt: "Why do we have seasons?" });
  const plugin = gateRequest({ prompt: "Why do we have seasons?" }, { plugins: INSTALLED });
  assert.deepEqual(Object.keys(fixed.questions), ["disposition", "subject", "is_self_contained"]);
  assert.deepEqual(fixed.questions.disposition, plugin.questions.disposition);
  assert.deepEqual(fixed.questions.is_self_contained, plugin.questions.is_self_contained);
  assert.deepEqual(Object.keys(fixed.questions.subject.criteria), ["math", "physics", "general_science", "language_humanities", "other"]);
  assert.deepEqual(Object.keys(plugin.questions.subject.criteria), ["math", "physics", "chemistry", "biology", "earth_space", "none", "unclear"]);
});

test("signal fields: a confident Jev answer, then board context, then none", () => {
  assert.deepEqual(signalFields({ probabilities: { earth_space: 0.9, physics: 0.08, math: 0.02 } }),
    { plugins: ["earth_space", "physics"], plugin_confidence: 0.9, plugin_source: "jev" });
  assert.deepEqual(signalFields({ probabilities: { physics: 0.5, unclear: 0.5 } }, ["chemistry"]), { plugins: ["chemistry"], plugin_source: "context" });
  assert.deepEqual(signalFields(undefined, []), { plugins: [], plugin_source: "none" });
});

test("summary pairs candidate against baseline per Jev mode", () => {
  const row = (pair, jev, arm, total) => ({ pair, jev, arm, outcome: "first_playable", total_ms: total, gate_ms: 0, first_playable_ms: total });
  const summary = summarize([row(0, "on", "baseline", 9000), row(0, "on", "candidate", 9500), row(1, "off", "baseline", 8000), row(1, "off", "candidate", 7000),
    { pair: 2, jev: "on", arm: "baseline", outcome: "error", total_ms: null }]);
  assert.equal(summary.on.complete_pairs, 1);
  assert.equal(summary.on.paired_difference_ms.median, 500);
  assert.equal(summary.off.paired_difference_ms.median, -1000);
  assert.equal(summary.on.errors, 1);
});
