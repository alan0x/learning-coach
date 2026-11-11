#!/usr/bin/env node
// Shadow-mode subject signal report (subject plan P2): reads Coach generation
// traces and reports how lesson requests arrived (Jev, context, none or no
// signal), how many would have been scoped, and how often a lesson used a
// plugin outside its scope.
//   node scripts/report-plugin-signal.mjs <trace directory or file>... [--since <ISO date>]
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

async function traceFiles(path) {
  const info = await stat(path);
  if (info.isFile()) return path.endsWith(".generation-trace.jsonl") ? [path] : [];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => traceFiles(join(path, entry.name))));
  return nested.flat();
}

export async function reportPluginSignal(paths, { since } = {}) {
  const sinceMs = since ? Date.parse(since) : undefined;
  const files = (await Promise.all(paths.map(traceFiles))).flat();
  const report = {
    lesson_requests: 0,
    by_source: { jev: 0, context: 0, none: 0, absent: 0 },
    jev_answer_share: 0,
    scoped: 0,
    completed_scoped: 0,
    outside_scope: 0,
    outside_scope_examples: [],
  };
  for (const file of files) {
    const events = (await readFile(file, "utf8")).split("\n").filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
    const started = events.find((event) => event.stage === "lesson-plan-generation" && event.status === "started");
    if (!started || (sinceMs !== undefined && (started.recorded_at_epoch_ms ?? 0) < sinceMs)) continue;
    report.lesson_requests += 1;
    const signal = started.plugin_signal;
    const source = signal?.plugin_source ?? "absent";
    report.by_source[source] = (report.by_source[source] ?? 0) + 1;
    if (!signal?.scoped) continue;
    report.scoped += 1;
    const completed = events.find((event) => event.stage === "lesson-plan-generation" && event.status === "completed" && event.plugins);
    if (!completed) continue;
    report.completed_scoped += 1;
    if (completed.plugins_outside_scope?.length) {
      report.outside_scope += 1;
      if (report.outside_scope_examples.length < 10) {
        report.outside_scope_examples.push({ trace_id: started.trace_id, selected: signal.plugins, outside: completed.plugins_outside_scope });
      }
    }
  }
  report.jev_answer_share = report.lesson_requests ? report.by_source.jev / report.lesson_requests : 0;
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const sinceIndex = args.indexOf("--since");
  const since = sinceIndex >= 0 ? args.splice(sinceIndex, 2)[1] : undefined;
  if (!args.length) {
    console.error("usage: report-plugin-signal.mjs <trace directory or file>... [--since <ISO date>]");
    process.exit(2);
  }
  console.log(JSON.stringify(await reportPluginSignal(args, { since }), null, 2));
}
