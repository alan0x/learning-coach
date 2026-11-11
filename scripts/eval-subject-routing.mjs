#!/usr/bin/env node
// Subject routing against Jev (subject plan §9, P2 step 2). Asks Jev the same
// subject question Octos Learn asks (OLL plugin-subjects), applies the same
// T1/T2 selection, and scores the route against each case's expected plugins.
//
// Uses the owner's Jev key: run only with the owner's approval. The key is
// read from TYPESAFE_API_KEY and never printed or written.
//
//   TYPESAFE_API_KEY=… node scripts/eval-subject-routing.mjs \
//     [--cases eval/subject-routing-heldout.json] [--recheck] [--images <dir of <id>.png>] [--out <report.json>]
//
// Camera and selection cases need their rendered image as <id>.png in --images;
// without it they are reported as skipped.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SUBJECT_PLUGINS, selectSubjectPlugins, subjectQuestion } from "octos-lesson-language/plugin-subjects";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const root = fileURLToPath(new URL("../", import.meta.url));
const INSTALLED = [...SUBJECT_PLUGINS.map((plugin) => plugin.manifest.id), "shared"];

/** Correct when every expected plugin is selected and nothing outside expected ∪ acceptable is. */
export function scoreRoute(selected, item) {
  const expected = item.expected_plugins;
  const allowed = new Set([...expected, ...(item.acceptable_plugins ?? []), "shared"]);
  const subjects = selected.filter((id) => id !== "shared");
  if (!expected.length) return subjects.length === 0 ? "correct" : "wrong_subject";
  if (!selected.length) return "broad";
  if (subjects.some((id) => !allowed.has(id))) return "wrong_subject";
  return expected.every((id) => subjects.includes(id)) ? "correct" : "missing_subject";
}

export function jevRequest(item, imageBase64) {
  const language = item.language ?? "zh-CN";
  return {
    model: "jev-latest",
    state: {
      learner_request: item.prompt,
      input_modality: "text",
      has_camera_frame: item.request_source === "current_image",
      has_selection: item.request_source === "ink_selection",
      ...(item.current_lesson ? { current_lesson: item.current_lesson } : {}),
      ...(imageBase64 ? { image: "request_image" } : {}),
    },
    ...(imageBase64 ? { assets: { request_image: { type: "image", format: "png", data_base64: imageBase64 } } } : {}),
    questions: { subject: subjectQuestion(INSTALLED, language) },
  };
}

async function askJev(key, body) {
  const startedAt = Date.now();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
  if (body.assets) headers["TypeSafe-Danger-Zone-Images"] = "true";
  const response = await fetch(JEV_URL, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Jev HTTP ${response.status}`);
  const result = await response.json();
  return { answer: result.answers?.subject, model: result.model, latency_ms: Date.now() - startedAt };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (!key) { console.error("TYPESAFE_API_KEY is required (the owner's Jev key; run only with approval)"); process.exit(2); }
  const suite = JSON.parse(await readFile(join(root, option("--cases") ?? "eval/subject-routing-heldout.json"), "utf8"));
  let cases = suite.cases;
  if (args.includes("--recheck") && suite.recheck_from_tuning_set) {
    const tuning = JSON.parse(await readFile(join(root, "eval/subject-routing-cases.json"), "utf8"));
    cases = [...cases, ...tuning.cases.filter((item) => suite.recheck_from_tuning_set.ids.includes(item.id))];
  }
  const images = option("--images");
  const rows = [];
  for (const item of cases) {
    let image;
    if (item.image) {
      if (!images) { rows.push({ id: item.id, outcome: "skipped_no_image" }); continue; }
      image = (await readFile(join(images, `${item.id}.png`))).toString("base64");
    }
    try {
      const { answer, model, latency_ms } = await askJev(key, jevRequest(item, image));
      const selection = selectSubjectPlugins(answer?.probabilities, INSTALLED);
      const selected = selection?.plugins ?? [];
      rows.push({ id: item.id, category: item.category, choice: answer?.choice, probabilities: answer?.probabilities,
        selected, outcome: scoreRoute(selected, item), model, latency_ms });
    } catch (error) {
      rows.push({ id: item.id, category: item.category, outcome: "error", error: error instanceof Error ? error.message : String(error) });
    }
  }
  const scored = rows.filter((row) => !["skipped_no_image", "error"].includes(row.outcome));
  const count = (outcome) => scored.filter((row) => row.outcome === outcome).length;
  const latencies = scored.map((row) => row.latency_ms).sort((a, b) => a - b);
  const summary = {
    cases: rows.length, scored: scored.length,
    correct: count("correct"), broad: count("broad"), missing_subject: count("missing_subject"), wrong_subject: count("wrong_subject"),
    errors: rows.filter((row) => row.outcome === "error").length, skipped: rows.filter((row) => row.outcome === "skipped_no_image").length,
    latency_p50_ms: latencies[Math.floor((latencies.length - 1) / 2)] ?? null,
  };
  const report = { summary, rows };
  if (option("--out")) await writeFile(option("--out"), `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
