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

test("held-out routing cases are consistent and separate from the tuning set", async () => {
  const heldOut = await read("../eval/subject-routing-heldout.json");
  const tuning = await read("../eval/subject-routing-cases.json");
  const plugins = new Set(Object.keys(heldOut.plugins));
  const tuningIds = new Set(tuning.cases.map((item) => item.id));
  const tuningPrompts = new Set(tuning.cases.map((item) => item.prompt.trim().toLowerCase()));
  const tuningImages = new Set(tuning.cases.flatMap((item) => item.image ? [item.image.content] : []));
  const ids = new Set();
  for (const item of heldOut.cases) {
    assert.ok(!ids.has(item.id) && !tuningIds.has(item.id), `${item.id} is unique`);
    ids.add(item.id);
    // Image requests share generic wording ("help me with this one"); their image is what differs.
    if (item.image) assert.ok(!tuningImages.has(item.image.content), `${item.id} is not a tuning image`);
    else assert.ok(!tuningPrompts.has(item.prompt.trim().toLowerCase()), `${item.id} is not a tuning prompt`);
    assert.match(item.language, /^(en-US|zh-CN)$/u, `${item.id} language`);
    for (const plugin of [...item.expected_plugins, ...(item.acceptable_plugins ?? [])]) {
      assert.ok(plugins.has(plugin), `${item.id}: unknown plugin ${plugin}`);
    }
    const source = item.request_source ?? "self_contained";
    assert.ok(["self_contained", "current_image", "ink_selection"].includes(source), `${item.id} request_source`);
    assert.equal(Boolean(item.image), source !== "self_contained", `${item.id}: image only for camera and selection`);
    assert.equal(Boolean(item.current_lesson), item.category === "follow_up", `${item.id}: current_lesson only for follow-ups`);
  }
  for (const subject of plugins) {
    assert.ok(heldOut.cases.some((item) => item.expected_plugins[0] === subject), `${subject} has a held-out case`);
  }
  for (const id of heldOut.recheck_from_tuning_set.ids) assert.ok(tuningIds.has(id), `${id} is in the tuning set`);
});

test("the Jev routing runner asks Learn's question and scores routes against the cases", async () => {
  const { jevRequest, scoreRoute } = await import("../scripts/eval-subject-routing.mjs");
  const body = jevRequest({ prompt: "Why do we have seasons?", language: "en-US" });
  assert.deepEqual(Object.keys(body.questions.subject.criteria), ["math", "physics", "chemistry", "biology", "earth_space", "none", "unclear"]);
  assert.equal(body.assets, undefined);
  const withImage = jevRequest({ prompt: "help", language: "zh-CN", request_source: "current_image" }, "iVBORw0KGgo=");
  assert.equal(withImage.state.image, "request_image");
  assert.equal(withImage.assets.request_image.data_base64, "iVBORw0KGgo=");
  assert.equal(withImage.state.has_camera_frame, true);
  const item = { expected_plugins: ["earth_space"], acceptable_plugins: ["physics"] };
  assert.equal(scoreRoute(["earth_space"], item), "correct");
  assert.equal(scoreRoute(["earth_space", "physics"], item), "correct");
  assert.equal(scoreRoute([], item), "broad");
  assert.equal(scoreRoute(["biology"], item), "wrong_subject");
  assert.equal(scoreRoute(["physics"], item), "missing_subject");
  assert.equal(scoreRoute(["shared"], { expected_plugins: [] }), "correct");
  assert.equal(scoreRoute([], { expected_plugins: [] }), "correct");
  assert.equal(scoreRoute(["math"], { expected_plugins: [] }), "wrong_subject");
});
