import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = await build({
  entryPoints: [resolve(root, "src/lesson-plan-api.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  write: false,
  logLevel: "silent",
});
const { generateLessonPlanWithModel } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);

async function firstRequest(input) {
  let first;
  await assert.rejects(generateLessonPlanWithModel(async (request) => {
    first ??= request;
    throw new Error("capture only");
  }, { turn_id: "teacher-context", learner_request: "什么是斜率？", language: "zh-CN", input_modality: "text", ...input },
  { max_attempts_per_part: 1 }));
  return first;
}

const profile = "老师：阿澜。最看重学生找到理由；出错时先找第一处分歧的步骤；认可时说出具体做对了什么。";
const background = "来自 Octos 记忆：学生说过以后讲新内容先看图。";

test("existing context fields keep their exact prompts; only the new host fields add rules", async () => {
  const plain = await firstRequest({});
  const legacy = await firstRequest({ tutor_context: "多用例子", learner_context: "上一题：y=2x+1" });
  assert.equal(legacy.system_prompt, plain.system_prompt);
  assert.equal(JSON.parse(legacy.prompt).course_context.learner_context, "上一题：y=2x+1");
  assert.equal((await firstRequest({ teacher_profile: " ", learner_background: "" })).system_prompt, plain.system_prompt);
});

test("teacher profile and learner background reach the model with rules that bound their use", async () => {
  const plain = await firstRequest({});
  const withProfile = await firstRequest({ teacher_profile: profile });
  assert.ok(withProfile.system_prompt.startsWith(plain.system_prompt));
  assert.match(withProfile.system_prompt, /teacher_profile 是本次授课预设老师的基础设定/u);
  assert.match(withProfile.system_prompt, /学生本次的明确要求优先于老师风格/u);
  assert.match(withProfile.system_prompt, /每一节都要让设定中的具体做法能被听出来/u);
  assert.match(withProfile.system_prompt, /小习惯全课最多出现一次/u);
  assert.match(withProfile.system_prompt, /全课只用这一个，不再引入第二个比喻/u);
  assert.doesNotMatch(withProfile.system_prompt, /learner_background/u);
  assert.equal(JSON.parse(withProfile.prompt).course_context.teacher_profile, profile);

  const both = await firstRequest({ teacher_profile: profile, learner_background: background });
  assert.match(both.system_prompt, /只引用其中明确写出的事实/u);
  assert.match(both.system_prompt, /不得编造未提供的经历/u);
  // Relevant facts are named once, at the start of the first section, and never as mastery.
  assert.match(both.system_prompt, /在第一节开头用对学生说话的方式明确提起最相关的一到两条（不超过两条）/u);
  assert.match(both.system_prompt, /第二节及以后不再复述这些背景/u);
  assert.match(both.system_prompt, /不说成学会或理解/u);
  assert.match(both.system_prompt, /用不上的不提。用自己的话说，不套用固定句式/u);
  assert.equal(JSON.parse(both.prompt).course_context.learner_background, background);

  const camera = await firstRequest({ teacher_profile: profile, camera_input: true });
  assert.match(camera.system_prompt, /摄像头画面/u);
  assert.match(camera.system_prompt, /teacher_profile 是本次授课预设老师的基础设定/u);
});

test("all three complete-lesson actions declare the host fields; the agent-facing tool does not", async () => {
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
  // The agent model fills tool arguments itself; host facts must not be invented there.
  const tool = manifest.tools.find((entry) => entry.name === "oll_generate_lesson").input_schema;
  assert.equal(tool.properties.teacher_profile, undefined);
  assert.equal(tool.properties.learner_background, undefined);
  const schemas = ["learning.lesson.generate", "learning.lesson.generate-from-camera", "learning.lesson.generate-from-selection"]
    .map((id) => manifest.actions.find((action) => action.id === id).input_schema);
  for (const schema of schemas) {
    assert.equal(schema.properties.teacher_profile.type, "string");
    assert.equal(schema.properties.learner_background.type, "string");
    assert.ok(!(schema.required ?? []).includes("teacher_profile") && !(schema.required ?? []).includes("learner_background"));
  }
});
