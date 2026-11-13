#!/usr/bin/env node
/**
 * Seeded draws for the K–12 math question set (Learn docs/MATH_EXPRESSIVENESS_PLAN.md §3).
 *
 * The questions are written by hand, but which topics they cover, their language and phrasing kind,
 * and which ones are held out are drawn here, so the set is not chosen around the components we have.
 *
 *   draw-math-question-set.mjs topics <catalog.json>   slots: band, domain, star-map topic (K–8), language, kind
 *   draw-math-question-set.mjs held-out <set.json>     the held-out ids, a quarter of each band
 *
 * The catalog is octos-learn's services/learning-history/taxonomy/catalog.json.
 */
import { readFileSync } from "node:fs";

export const SEED = 20261113;

// K–8 counts from the plan; 9–12 is written from the plan's six domains and the natural-input set.
export const DRAWN_BANDS = { "K-2": 30, "3-5": 40, "6-8": 38 };
export const CHINESE_PER_BAND = { "K-2": 6, "3-5": 7, "6-8": 5 };
export const KIND_SHARES = [["question", 0.45], ["detailed", 0.3], ["topic", 0.25]];
// 9–12 is not in the star map: its domains are the plan's six, with counts fixed here before writing.
// Ten more 9–12 questions come from the natural-input set (one per topic); two of its topics are grade 8.
export const WRITTEN_9_12 = {
  "Number & Quantity": 5,
  Algebra: 9,
  Functions: 9,
  Geometry: 8,
  "Statistics & Probability": 6,
  "Precalculus & Calculus": 3,
};

export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(items, next) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** US grade from the catalog's age range: a grade-g learner is about g + 5 to g + 6 years old. */
export function band(topic) {
  const grade = (topic.ageRangeStart + topic.ageRangeEnd) / 2 - 5.5;
  return grade < 2.5 ? "K-2" : grade < 5.5 ? "3-5" : "6-8";
}

/** Proportional to the catalog, at least one per domain present, largest remainder for the rest. */
export function allocate(countsByDomain, total) {
  const domains = Object.keys(countsByDomain).sort();
  const sum = domains.reduce((s, d) => s + countsByDomain[d], 0);
  const quota = Object.fromEntries(domains.map((d) => [d, (countsByDomain[d] / sum) * total]));
  const out = Object.fromEntries(domains.map((d) => [d, Math.max(1, Math.floor(quota[d]))]));
  let left = total - domains.reduce((s, d) => s + out[d], 0);
  const byRemainder = [...domains].sort((a, b) => (quota[b] - out[b]) - (quota[a] - out[a]) || a.localeCompare(b));
  for (const d of byRemainder) if (left > 0 && quota[d] > out[d]) { out[d] += 1; left -= 1; }
  if (left !== 0) throw new Error(`allocation off by ${left}`);
  return out;
}

function counts(n, shares) {
  const out = shares.map(([kind, share]) => [kind, Math.floor(n * share)]);
  let left = n - out.reduce((s, [, c]) => s + c, 0);
  for (let i = 0; left > 0; i = (i + 1) % out.length, left -= 1) out[i][1] += 1;
  return out.flatMap(([kind, c]) => Array(c).fill(kind));
}

export function drawTopics(catalog) {
  const math = catalog.topics.filter((t) => t.subject === "Mathematics").sort((a, b) => a.id.localeCompare(b.id));
  const next = random(SEED);
  const slots = [];
  for (const [b, total] of Object.entries(DRAWN_BANDS)) {
    const inBand = math.filter((t) => band(t) === b);
    const byDomain = {};
    for (const t of inBand) (byDomain[t.domain] ??= []).push(t);
    const plan = allocate(Object.fromEntries(Object.entries(byDomain).map(([d, ts]) => [d, ts.length])), total);
    const bandSlots = [];
    for (const d of Object.keys(plan).sort()) {
      for (const t of shuffled(byDomain[d], next).slice(0, plan[d])) bandSlots.push({ band: b, domain: d, topic: t });
    }
    const languages = shuffled([...Array(CHINESE_PER_BAND[b]).fill("zh-CN"), ...Array(total - CHINESE_PER_BAND[b]).fill("en-US")], next);
    const kinds = shuffled(counts(total, KIND_SHARES), next);
    bandSlots.forEach((slot, i) => slots.push({ ...slot, language: languages[i], kind: kinds[i] }));
  }
  const written = Object.entries(WRITTEN_9_12).flatMap(([domain, n]) => Array(n).fill(domain));
  const kinds = shuffled(counts(written.length, KIND_SHARES), next);
  written.forEach((domain, i) => slots.push({ band: "9-12", domain, topic: null, language: "en-US", kind: kinds[i] }));
  return slots;
}

/** A quarter of each band, rounded, drawn from questions that may be held out (not the natural-input set). */
export function drawHeldOut(questions) {
  const next = random(SEED + 1);
  const held = [];
  for (const b of [...new Set(questions.map((q) => q.band))].sort()) {
    const inBand = questions.filter((q) => q.band === b);
    const eligible = inBand.filter((q) => q.source !== "natural-set").map((q) => q.id).sort();
    held.push(...shuffled(eligible, next).slice(0, Math.round(inBand.length / 4)));
  }
  return new Set(held);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, file] = process.argv.slice(2);
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (mode === "topics") {
    for (const s of drawTopics(data)) {
      const topic = s.topic ? [s.topic.id, s.language, s.kind, s.topic.name, `— ${s.topic.description}`] : ["-", s.language, s.kind];
      console.log([s.band, s.domain, ...topic].join("\t"));
    }
  } else if (mode === "held-out") {
    console.log([...drawHeldOut(data.questions)].sort().join("\n"));
  } else {
    console.error("usage: draw-math-question-set.mjs topics <catalog.json> | held-out <set.json>");
    process.exit(2);
  }
}
