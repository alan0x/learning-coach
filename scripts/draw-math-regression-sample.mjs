#!/usr/bin/env node
/**
 * The fixed M2/M3 regression sample (Learn docs/MATH_EXPRESSIVENESS_PLAN.md §4): 15 questions per band,
 * drawn once by seed from the M1 strata so the sample holds questions existing components serve,
 * near misses (partly, or an extension away) and questions nothing serves.
 *
 *   draw-math-regression-sample.mjs   prints the sample ids by band and stratum
 */
import { readFileSync } from "node:fs";
import { random, shuffled } from "./draw-math-question-set.mjs";

export const SAMPLE_SEED = 20261114;
// Per band: served by a component, near misses, not served, board only. Short strata pass their
// remainder on to "not served", then to near misses.
export const PER_BAND = { served: 4, near_miss: 5, not_served: 4, board: 2 };

export function stratum(tag) {
  if (tag.coverage === "fully") return tag.component === "board" ? "board" : "served";
  if (tag.coverage === "partly" || tag.coverage === "extend") return "near_miss";
  return "not_served";
}

export function drawSample(questions, tags) {
  const next = random(SAMPLE_SEED);
  const sample = [];
  for (const band of ["K-2", "3-5", "6-8", "9-12"]) {
    const pool = Object.fromEntries(Object.keys(PER_BAND).map((s) => [s, shuffled(questions.filter((q) => q.band === band && stratum(tags[q.id]) === s).map((q) => q.id).sort(), next)]));
    let carry = 0;
    for (const s of ["served", "board", "near_miss", "not_served"]) {
      const want = PER_BAND[s] + (s === "not_served" ? carry : 0);
      const take = pool[s].splice(0, want);
      carry = s === "not_served" ? 0 : carry + want - take.length;
      sample.push(...take.map((id) => ({ id, band, stratum: s })));
    }
    // Anything still short comes from the near misses left in the band.
    const short = 15 - sample.filter((entry) => entry.band === band).length;
    sample.push(...pool.near_miss.splice(0, Math.max(0, short)).map((id) => ({ id, band, stratum: "near_miss" })));
  }
  return sample;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = (name) => JSON.parse(readFileSync(new URL(`../testsuite/${name}`, import.meta.url), "utf8"));
  const set = read("math-expressiveness-question-set.json");
  const m1 = read("math-expressiveness-m1-baseline.json");
  for (const entry of drawSample(set.questions, m1.tags)) console.log([entry.band, entry.stratum, entry.id].join("\t"));
}
