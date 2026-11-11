import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MOTION_CASES, OTHER_CASE_IDS, recipesInPart, summarize } from "../scripts/eval-trial-recipe-speed.mjs";

test("trial-recipe cases pair motion requests with held-out requests from other subjects", async () => {
  const heldOut = new Set(JSON.parse(await readFile(new URL("../eval/subject-routing-heldout.json", import.meta.url), "utf8")).cases.map((item) => item.id));
  assert.equal(MOTION_CASES.length, OTHER_CASE_IDS.length);
  for (const id of OTHER_CASE_IDS) assert.ok(heldOut.has(id), id);
  assert.equal(new Set(MOTION_CASES.map((item) => item.id)).size, MOTION_CASES.length);
});

test("a first part built by the motion builder is recognised", () => {
  const part = (writes) => ({ steps: [{ beats: [{ actions: writes }] }] });
  assert.deepEqual(recipesInPart(part([{ do: "write", as: "v1-track", kind: "geometry", content: { points: [{ as: "start" }, { as: "object" }] } }])), ["constant_speed_motion"]);
  assert.deepEqual(recipesInPart(part([{ do: "write", as: "v1", kind: "plot", content: {} }])), []);
});

test("the summary splits motion and other requests", () => {
  const row = (pair, kind, arm, ms, recipes = []) => ({ pair, kind, arm, outcome: "first_playable", first_playable_ms: ms, prompt_tokens: 100, recipes });
  const summary = summarize([row(0, "motion", "baseline", 9000), row(0, "motion", "candidate", 9200, ["constant_speed_motion"]), row(1, "other", "baseline", 8000), row(1, "other", "candidate", 7900)]);
  assert.equal(summary.motion.paired_difference_ms.median, 200);
  assert.equal(summary.other.paired_difference_ms.median, -100);
  assert.equal(summary.all.candidate_used_trial_recipe, 1);
});
