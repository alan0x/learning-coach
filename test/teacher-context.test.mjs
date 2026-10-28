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
  assert.equal((await firstRequest({ teacher_profile: " ", learner_background: "", current_lesson: " " })).system_prompt, plain.system_prompt);
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

test("the board's current lesson resolves a follow-up that points back at it", async () => {
  const plain = await firstRequest({});
  const lesson = "本白板刚讲过的内容（学生看得到）：\n最近一节课：用整百数估算商\n课后思考题：如果除数是23，不方便看作整百数，怎样估算商？（参考答案：把23看作20来估）";
  const followUp = await firstRequest({ learner_request: "我不知道反思题，你能给我讲讲吗？", current_lesson: lesson });
  assert.ok(followUp.system_prompt.startsWith(plain.system_prompt));
  assert.match(followUp.system_prompt, /current_lesson 是同一块白板上刚讲过的内容/u);
  assert.match(followUp.system_prompt, /也不要求学生再描述一遍/u);
  assert.match(followUp.system_prompt, /不能改变学生明确提出的主题/u);
  assert.match(followUp.system_prompt, /应生成课程（generate_lesson），不要判为需要追问/u);
  assert.match(followUp.system_prompt, /附带了图片或选区时，“这道题”“这里”指图片或选区里的内容/u);
  assert.equal(JSON.parse(followUp.prompt).course_context.current_lesson, lesson);
  assert.doesNotMatch(plain.system_prompt, /current_lesson/u);
});

test("a teacher's own experiences are optional, brief, and never invented beyond what is given", async () => {
  const plain = await firstRequest({});
  const experiences = "- 我在观星塔值夜，每隔一小时记一次气温，天亮前后最冷。";
  const withExperiences = await firstRequest({ teacher_profile: profile, teacher_experiences: experiences });
  assert.ok(withExperiences.system_prompt.startsWith(plain.system_prompt));
  assert.match(withExperiences.system_prompt, /用不上就不提，大多数课都不会提/u);
  assert.match(withExperiences.system_prompt, /全课最多提一段/u);
  assert.match(withExperiences.system_prompt, /另外补充的细节和数字要与本课 outline 里的数值一致/u);
  assert.match(withExperiences.system_prompt, /两者冲突时不提经历/u);
  assert.doesNotMatch(withExperiences.system_prompt, /真实经历/u);
  assert.match(withExperiences.system_prompt, /老师现在仍在学院任教/u);
  assert.match(withExperiences.system_prompt, /不能编出新的地点、人物、职业或经历/u);
  assert.match(withExperiences.system_prompt, /不要说成是和学生一起经历的/u);
  assert.equal(JSON.parse(withExperiences.prompt).course_context.teacher_experiences, experiences);
  assert.doesNotMatch(plain.system_prompt, /teacher_experiences/u);
  assert.equal((await firstRequest({ teacher_experiences: " " })).system_prompt, plain.system_prompt);
});

test("all three complete-lesson actions declare the host fields; the agent-facing tool does not", async () => {
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
  // The agent model fills tool arguments itself; host facts must not be invented there.
  const tool = manifest.tools.find((entry) => entry.name === "oll_generate_lesson").input_schema;
  assert.equal(tool.properties.teacher_profile, undefined);
  assert.equal(tool.properties.learner_background, undefined);
  assert.equal(tool.properties.current_lesson, undefined);
  assert.equal(tool.properties.teacher_experiences, undefined);
  const schemas = ["learning.lesson.generate", "learning.lesson.generate-from-camera", "learning.lesson.generate-from-selection"]
    .map((id) => manifest.actions.find((action) => action.id === id).input_schema);
  for (const schema of schemas) {
    assert.equal(schema.properties.teacher_profile.type, "string");
    assert.equal(schema.properties.learner_background.type, "string");
    assert.equal(schema.properties.current_lesson.type, "string");
    assert.equal(schema.properties.teacher_experiences.type, "string");
    for (const field of ["teacher_profile", "learner_background", "current_lesson", "teacher_experiences"]) assert.ok(!(schema.required ?? []).includes(field));
  }
});

test("a practice invitation names the practice's own target, not one already reached", async () => {
  // The compiler swaps a target equal to the slider's resting value for a
  // reachable one; the narration must not have promised the original value.
  const plain = await firstRequest({});
  assert.match(plain.system_prompt, /邀请里说的目标值必须就是 number_activities 的目标值，且不同于课程结束时滑杆所在的值/u);
});

test("practice wording follows what happened in the lesson, and a missing interaction is replaced rather than refused", async () => {
  const plain = await firstRequest({});
  // "调回" only for a value the slider really had; later practice is computed from the earlier one's result.
  assert.match(plain.system_prompt, /只有课中滑杆确实到过的值才能说“调回”/u);
  assert.match(plain.system_prompt, /后一项的说明、提示和完成语按那时各数值的实际状态计算/u);
  // An unsupported interaction form falls back to a drawable visual instead of an unsupported answer.
  assert.match(plain.system_prompt, /只是要求的互动或画面形式做不到.*写 teach 并换成可实现的画面/u);
  assert.match(plain.system_prompt, /只有数学内容本身无法正确呈现时才写 unsupported/u);
});
