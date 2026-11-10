import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

test("subject routing cases are consistent", async () => {
  const suite = await read("../eval/subject-routing-cases.json");
  const math = await read("../testsuite/math-natural-course-cases.json");
  const plugins = new Set(Object.keys(suite.plugins));
  const mathIds = new Set(math.cases.map((item) => item.id));
  const ids = new Set();
  for (const id of suite.math_cases_by_reference.ids) {
    assert.ok(mathIds.has(id), `${id} exists in the math suite`);
    assert.ok(!ids.has(id), `${id} is unique`);
    ids.add(id);
  }
  for (const item of suite.cases) {
    assert.ok(!ids.has(item.id), `${item.id} is unique`);
    ids.add(item.id);
    assert.ok(item.prompt?.trim(), `${item.id} has a prompt`);
    assert.match(item.language, /^(en-US|zh-CN)$/u, `${item.id} language`);
    for (const plugin of [...item.expected_plugins, ...(item.acceptable_plugins ?? [])]) {
      assert.ok(plugins.has(plugin), `${item.id}: unknown plugin ${plugin}`);
    }
    const source = item.request_source ?? "self_contained";
    assert.ok(["self_contained", "current_image", "ink_selection"].includes(source), `${item.id} request_source`);
    assert.equal(Boolean(item.image), source !== "self_contained", `${item.id}: image only for camera and selection`);
    assert.ok(["generate_lesson", "clarify"].includes(item.expected_disposition ?? "generate_lesson"), `${item.id} disposition`);
    assert.ok(Array.isArray(item.review_targets) && item.review_targets.length > 0, `${item.id} review targets`);
  }
});
