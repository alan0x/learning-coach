// The host's subject signal in shadow mode (subject plan P2).
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = await build({
  stdin: {
    contents: `export * from "./src/plugin-signal.ts"; export { INSTALLED_PLUGINS } from "./src/plugins/index.ts";`,
    resolveDir: root, loader: "ts",
  },
  bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
});
const { parsePluginSignal, checkPluginIds, shadowScope, pluginsOutsideScope, PluginSignalError, INSTALLED_PLUGINS } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

const rejects = (input, code) => assert.throws(() => checkPluginIds(parsePluginSignal(input), INSTALLED_PLUGINS),
  (error) => error instanceof PluginSignalError && error.code === code, JSON.stringify(input));

test("a host's subject signal is validated and put in registry order", () => {
  assert.equal(parsePluginSignal({}), undefined);
  assert.deepEqual(checkPluginIds(parsePluginSignal({ plugins: ["shared", "math"], plugin_confidence: 0.82, plugin_source: "jev" }), INSTALLED_PLUGINS),
    { plugins: ["math", "shared"], plugin_confidence: 0.82, plugin_source: "jev" });
  assert.deepEqual(parsePluginSignal({ plugin_source: "none" }), { plugins: [], plugin_source: "none" });
  assert.deepEqual(parsePluginSignal({ plugins: [] }), { plugins: [], plugin_source: "none" });
  rejects({ plugins: ["history"], plugin_source: "jev" }, "LESSON_PLUGIN_UNKNOWN");
  rejects({ plugins: "math", plugin_source: "jev" }, "LESSON_PLUGINS_INVALID");
  rejects({ plugins: ["math", "physics", "shared", "math2"], plugin_source: "jev" }, "LESSON_PLUGINS_INVALID");
  rejects({ plugins: ["math"], plugin_confidence: 1.2, plugin_source: "jev" }, "LESSON_PLUGIN_CONFIDENCE_INVALID");
  rejects({ plugins: ["math"], plugin_source: "keyword" }, "LESSON_PLUGIN_SOURCE_INVALID");
  rejects({ plugins: ["math"], plugin_source: "none" }, "LESSON_PLUGIN_SOURCE_INVALID");
  rejects({ plugins: ["math"] }, "LESSON_PLUGIN_SOURCE_INVALID");
});

test("the shadow scope names what a scoped request would contain and what the lesson used outside it", () => {
  const ids = INSTALLED_PLUGINS.map((plugin) => plugin.manifest.id);
  const broad = shadowScope(undefined, INSTALLED_PLUGINS);
  assert.equal(broad.scoped, false);
  assert.equal(broad.plugin_source, "absent");
  assert.deepEqual(broad.scoped_plugins, ids);

  const math = shadowScope({ plugins: ["math"], plugin_confidence: 0.9, plugin_source: "jev" }, INSTALLED_PLUGINS);
  assert.equal(math.scoped, true);
  assert.deepEqual(math.scoped_plugins, ["math", "shared"]);
  assert.ok(math.scoped_recipes.includes("function_plot") && math.scoped_recipes.includes("process_diagram"));
  assert.ok(!math.scoped_recipes.includes("spring_and_mass"));
  assert.deepEqual(pluginsOutsideScope(math, { math: "0.1.0" }), []);
  assert.deepEqual(pluginsOutsideScope(math, { physics: "0.1.0", shared: "0.1.0" }), ["physics"]);
  // Jev's `none` answer selects the shared tools alone.
  const none = shadowScope({ plugins: ["shared"], plugin_source: "jev" }, INSTALLED_PLUGINS);
  assert.deepEqual(none.scoped_plugins, ["shared"]);
  assert.deepEqual(none.scoped_recipes, ["process_diagram"]);
});

test("every lesson action and the lesson tool declare the installed plugin IDs", async () => {
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
  const ids = INSTALLED_PLUGINS.map((plugin) => plugin.manifest.id);
  const schemas = [
    ...manifest.actions.filter((action) => action.binding?.tool === "oll_generate_lesson").map((action) => action.input_schema),
    manifest.tools.find((tool) => tool.name === "oll_generate_lesson").input_schema,
  ];
  assert.equal(schemas.length, 4);
  for (const schema of schemas) {
    assert.deepEqual(schema.properties.plugins.items.enum, ids);
    assert.deepEqual(schema.properties.plugin_source.enum, ["jev", "context", "none"]);
    assert.equal(schema.properties.plugin_confidence.maximum, 1);
  }
});

test("the shadow-mode report counts sources, scoped requests and lessons outside their scope", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { reportPluginSignal } = await import("../scripts/report-plugin-signal.mjs");
  const directory = await mkdtemp(join(tmpdir(), "plugin-signal-report-"));
  const trace = (id, signal, completed) => [
    { stage: "lesson-plan-generation", status: "started", trace_id: id, recorded_at_epoch_ms: 1_800_000_000_000, ...(signal ? { plugin_signal: signal } : {}) },
    ...(completed ? [{ stage: "lesson-plan-generation", status: "completed", trace_id: id, plugins: completed.plugins, plugins_outside_scope: completed.outside }] : []),
  ].map((event) => JSON.stringify(event)).join("\n");
  try {
    await writeFile(join(directory, "a.generation-trace.jsonl"), trace("a", { plugin_source: "jev", plugins: ["math"], scoped: true }, { plugins: { math: "0.1.0" }, outside: [] }));
    await writeFile(join(directory, "b.generation-trace.jsonl"), trace("b", { plugin_source: "jev", plugins: ["math"], scoped: true }, { plugins: { physics: "0.1.0" }, outside: ["physics"] }));
    await writeFile(join(directory, "c.generation-trace.jsonl"), trace("c", { plugin_source: "none", plugins: [], scoped: false }, { plugins: {}, outside: [] }));
    await writeFile(join(directory, "d.generation-trace.jsonl"), trace("d", undefined));
    const report = await reportPluginSignal([directory]);
    assert.equal(report.lesson_requests, 4);
    assert.deepEqual(report.by_source, { jev: 2, context: 0, none: 1, absent: 1 });
    assert.equal(report.jev_answer_share, 0.5);
    assert.equal(report.scoped, 2);
    assert.equal(report.outside_scope, 1);
    assert.deepEqual(report.outside_scope_examples, [{ trace_id: "b", selected: ["math"], outside: ["physics"] }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
