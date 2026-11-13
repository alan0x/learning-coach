// The constant-speed motion recipe (subject plan P2, step 3). It is a trial
// recipe: built and tested, offered to the model only when
// LEARNING_COACH_TRIAL_RECIPES names it (decision E5), so default requests
// stay byte-identical (test/request-hashes.test.mjs).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const api = await import(new URL("../lesson-plan.js", import.meta.url));

test("by default the trial recipe is installed but not offered", () => {
  assert.deepEqual([...api.TRIAL_RECIPES], ["constant_speed_motion"]);
  assert.equal(api.OFFERED_RECIPES.includes("constant_speed_motion"), false);
  assert.equal(api.LESSON_PLAN_CAPABILITY_NAMES.includes("constant_speed_motion"), false);
  assert.equal(api.RECIPE_PLUGIN.constant_speed_motion, "physics");
  assert.deepEqual(api.enabledTrialRecipes(" constant_speed_motion , unknown"), ["constant_speed_motion"]);
  assert.deepEqual(api.enabledTrialRecipes(undefined), []);
});

// Runs in a child process: the switch is read once, when the module loads.
const trialScript = `
  const api = await import(${JSON.stringify(new URL("../lesson-plan.js", import.meta.url).href)});
  const { samplePlan } = await import(${JSON.stringify(new URL("./sample-plans.mjs", import.meta.url).href)});
  const plan = samplePlan("spring_and_mass");
  const visual = plan.sections[0].moments[0].actions[0].content;
  visual.capability = "constant_speed_motion";
  visual.numbers = [1, 2];
  plan.sections[0].reusable_items[0].capability = "constant_speed_motion";
  plan.numbers = [
    { initial: 0, min: 0, max: 10, label: "时间 t", unit: "s", student_control: { kind: "slider", step: 0.1 } },
    { initial: 2, min: 0.5, max: 5, label: "速度 v", unit: "m/s", student_control: { kind: "slider", step: 0.5 } },
  ];
  const compiled = api.compileAndValidateLessonPlan(plan);
  const writes = compiled.lesson.steps[0].beats[0].actions.filter((action) => action.do === "write");
  console.log(JSON.stringify({
    offered: api.OFFERED_RECIPES.at(-1),
    names: api.LESSON_PLAN_CAPABILITY_NAMES.length,
    matched: api.matchLessonPlanCapability(["uniform_motion", "distance_time_graph"]),
    kinds: writes.map((action) => action.kind),
    track: writes[0].content,
    graph: writes[1].content,
  }));
`;

test("with the trial switch on, the recipe is offered and compiles a lesson with time and speed sliders", () => {
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", trialScript], {
    env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "constant_speed_motion" },
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  });
  const result = JSON.parse(output);
  assert.equal(result.offered, "constant_speed_motion");
  assert.equal(result.names, api.LESSON_PLAN_CAPABILITY_NAMES.length + 1);
  assert.equal(result.matched, "constant_speed_motion");
  assert.deepEqual(result.kinds, ["geometry", "plot"]);
  assert.equal(result.graph.curves[0].expression, "(number_02)*x");
  assert.deepEqual(result.graph.bindings.map((binding) => binding.expression), ["(number_01)", "(number_02)*(number_01)"]);
  assert.deepEqual(result.graph.axes.x, { min: 0, max: 10, label: "时间 t（s）" });
  assert.deepEqual(result.graph.axes.y, { min: 0, max: 50, label: "路程 s（m）" });
  assert.equal(result.track.bindings[0].label.suffix, " m");
});

test("motion units come from the speed's unit unless the time number names its own", async () => {
  const { build } = await import("esbuild");
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../src/plugins/physics-compilers.ts", import.meta.url))],
    bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
  });
  const { motionUnits } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
  assert.deepEqual(motionUnits("m/s", undefined), { distance: "m", time: "s" });
  assert.deepEqual(motionUnits("km/h", undefined), { distance: "km", time: "h" });
  assert.deepEqual(motionUnits("m/s", "秒"), { distance: "m", time: "秒" });
  assert.deepEqual(motionUnits(undefined, undefined), { distance: "m", time: "s" });
  assert.deepEqual(motionUnits("米每秒", undefined), { distance: "", time: "" });
});
