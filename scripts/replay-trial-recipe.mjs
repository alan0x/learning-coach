#!/usr/bin/env node
// Replays a trial-recipe run's recorded model replies through the current Coach build, at no cost:
// each candidate turn's raw replies (kept by eval-trial-recipe-speed.mjs in its work directory) are
// fed back in order to the real lesson-plan pipeline, compiled to the first playable part, and judged
// as the live run judged them. Run with LEARNING_COACH_TRIAL_RECIPES naming the recipe.
//
//   LEARNING_COACH_TRIAL_RECIPES=number_line node scripts/replay-trial-recipe.mjs --report <run.json> --work <dir> [--json]
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { TRIAL_CASES, TRIAL_QUALITY_CASES, judgeNumberLine, numberLineLesson, slipVerdict } from "./eval-trial-recipe-speed.mjs";

const { generateLessonPlanWithModel, modelTextFromRawReply } = await import(new URL("../lesson-plan.js", import.meta.url));

/**
 * The model's text in each recorded reply line, in order: framed records, and the older streamed
 * ("content: …") and provider-envelope ("payload: …") lines (review of #63: streamed lines were dropped).
 */
export function recordedReplies(raw) {
  return raw.split("\n").flatMap((line) => {
    const text = line.trim() ? modelTextFromRawReply(line) : undefined;
    return text ? [text] : [];
  });
}

/** Compiles one recorded turn to its first playable part; undefined part when the replies run out first. */
export async function replayTurn(replies, learnerRequest, language) {
  let next = 0;
  let first;
  class Stop extends Error {}
  try {
    await generateLessonPlanWithModel(async () => {
      if (first) throw new Stop();
      if (next >= replies.length) throw new Error("recorded replies exhausted");
      return replies[next++];
    }, { turn_id: "replay", learner_request: learnerRequest, ...(language ? { language } : {}), input_modality: "text", request_source: "self_contained" }, {
      on_playable_prefix: ({ compiled }) => { first ??= compiled.lesson; throw new Stop(); },
    });
  } catch (error) {
    if (!(error instanceof Stop) && !first) return { error: error.message };
  }
  return { lesson: first };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  const report = JSON.parse(await readFile(option("--report"), "utf8"));
  const work = option("--work");
  const files = await readdir(work);
  // Every trial recipe's cases, so a probe offering several recipes is judged in full.
  const cases = new Map([...Object.values(TRIAL_CASES).flat(), ...Object.values(TRIAL_QUALITY_CASES).flat()].map((item) => [item.id, item]));
  const { caseLanguage } = await import("./eval-shadow-speed.mjs");
  const judged = [];
  for (const row of report.rows.filter((entry) => entry.arm === "candidate" && cases.get(entry.case)?.expect)) {
    const file = files.find((name) => name.startsWith(`trial-${row.pair}-candidate-`) && name.endsWith(".raw-model.txt"));
    const item = cases.get(row.case);
    if (!file) { judged.push({ case: row.case, pair: row.pair, quality: { hard: ["no recorded reply"], soft: [] } }); continue; }
    const replies = recordedReplies(await readFile(join(work, file), "utf8"));
    const { lesson, error } = await replayTurn(replies, item.prompt, caseLanguage(item));
    const quality = lesson ? judgeNumberLine(item, numberLineLesson(lesson)) : { hard: [`not judged: ${error}`], soft: [] };
    judged.push({ case: row.case, pair: row.pair, quality, recorded: row.quality });
  }
  const verdict = slipVerdict(judged);
  if (args.includes("--json")) { console.log(JSON.stringify({ judged, verdict }, null, 1)); return; }
  for (const row of judged) {
    const same = JSON.stringify(row.quality.hard) === JSON.stringify(row.recorded?.hard ?? []);
    console.log(`${row.case} pair ${row.pair}: ${row.quality.hard.length ? `HARD ${row.quality.hard.join(" | ")}` : "pass"}${row.quality.soft.length ? ` (soft: ${row.quality.soft.join("; ")})` : ""}${same ? "" : `   [recorded: ${(row.recorded?.hard ?? []).join(" | ") || "pass"}]`}`);
  }
  console.log(`hard pass ${judged.filter((row) => !row.quality.hard.length).length}/${judged.length}; verdict ${verdict.result}: ${verdict.reason}`);
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) await main();
