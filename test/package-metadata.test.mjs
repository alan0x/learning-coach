import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("package, manifest, and skill metadata publish the same version", async () => {
  const [packageJson, manifestJson, skillMarkdown] = await Promise.all([
    readFile(new URL("package.json", projectRoot), "utf8").then(JSON.parse),
    readFile(new URL("manifest.json", projectRoot), "utf8").then(JSON.parse),
    readFile(new URL("SKILL.md", projectRoot), "utf8"),
  ]);

  const skillVersion = skillMarkdown.match(
    /^metadata:\s*\n(?:^[ \t]+.*\n)*?^[ \t]+version:\s*([^\s]+)\s*$/m,
  )?.[1];

  assert.ok(skillVersion, "SKILL.md must declare metadata.version");
  assert.equal(manifestJson.version, packageJson.version);
  assert.equal(skillVersion, packageJson.version);
});

test("the text lesson action accepts established context for a short follow-up", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", projectRoot), "utf8"));
  const action = manifest.actions.find(({ id }) => id === "learning.lesson.generate");

  assert.equal(action.input_schema.properties.learner_context.type, "string");
  assert.equal(action.input_schema.required.includes("learner_context"), false);
});

test("the ink-selection lesson action is background and materializes one selection image", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", projectRoot), "utf8"));
  const action = manifest.actions.find(({ id }) => id === "learning.lesson.generate-from-selection");

  assert.ok(action);
  assert.equal(action.execution, "background");
  assert.deepEqual(action.surfaces, ["learning.selection"]);
  assert.deepEqual(action.input_schema.properties.request_source.enum, ["ink_selection"]);
  assert.equal(action.binding.tool, "oll_generate_lesson");
  assert.equal(action.binding.input_mode, "file_each");
  assert.equal(action.binding.file_argument, "selection_media");
  assert.equal(action.binding.file_materialization, "workspace_relative");
});

test("the selection action declares the delivery mode sent by the whiteboard", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", projectRoot), "utf8"));
  const action = manifest.actions.find(({ id }) => id === "learning.selection.enhance");

  assert.deepEqual(action.input_schema.properties.delivery_mode, {
    type: "string",
    enum: ["card", "board-writing"],
  });
});
