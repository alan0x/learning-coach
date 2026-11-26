// The place-value chart judge (OLL decision 0025), on lessons the recipe makes: sample plans compiled through
// the real pipeline with the trial on, then judged through OLL's own normalizer and reducer. A served build and
// a served pull apart pass; a near miss that draws a chart FAILS (decision 0025 §7); a task whose words write
// the practice number fails, however it is written; and the development cases are well formed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);

test("the development cases: 15 this need serves, each a number the chart holds with its form, and 6 near misses", async () => {
  const { placeValueParse, placeValueParts, placeValueTaskFault } = await import("octos-lesson-language/plugin-math");
  const { cases } = JSON.parse(await readFile(new URL("../testsuite/place-value-dev-cases.json", import.meta.url), "utf8"));
  assert.equal(cases.length, 21);
  const served = cases.filter((item) => !item.expect.forbid);
  assert.equal(served.length, 15);
  assert.deepEqual(cases.filter((item) => item.expect.forbid).map((item) => item.expect.forbid), Array(6).fill(["place_value_chart"]));
  for (const item of served) {
    const value = placeValueParse(item.expect.number);
    assert.ok(value !== undefined, item.id);
    assert.equal(item.expect.given === "numeral", item.expect.direction === "pull_apart", item.id);
    assert.ok(["name", "expanded", "expanded_factors", "place_counts", "numeral"].includes(item.expect.given), item.id);
    // The card would take each case's number with its form.
    assert.equal(placeValueTaskFault(value, item.expect.given), undefined, item.id);
    assert.ok(placeValueParts(value).length >= 2, item.id);
  }
});

// Lessons compiled with the trial on and judged in the same process: [id, plan options, language, case, mutate].
function judged(entries) {
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
    const api = await import(${here("../lesson-plan.js")});
    const { placeValuePlan, samplePlan } = await import(${here("./sample-plans.mjs")});
    const { judgePlaceValueChart } = await import(${here("../scripts/place-value-judge.mjs")});
    const out = {};
    for (const [id, options, language, item, mutate] of ${JSON.stringify(entries)}) {
      const plan = options === "number_line" ? samplePlan("number_line") : placeValuePlan(options);
      const { lesson } = api.compileAndValidateLessonPlan(plan, { language });
      // A change to the compiled lesson, as a lesson the compiler did not make could have it.
      if (mutate) lesson.lesson.tasks[0][mutate.field] = mutate.value;
      out[id] = judgePlaceValueChart(item, lesson);
    }
    console.log(JSON.stringify(out));
  `], { env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "place_value_chart" }, cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" }));
}

const failed = (verdict) => verdict.checks.filter((check) => !check.pass).map((check) => check.check);
const BUILD = { id: "PV-01", expect: { number: "60408", direction: "build", given: "name" } };
const APART = { id: "PV-12", expect: { number: "26.075", direction: "pull_apart", given: "numeral" } };
const NEAR = { id: "PV-16", expect: { need: "35P-06", forbid: ["place_value_chart"] } };

test("a served build and a served pull apart pass; a near miss with a chart fails; a leaked practice number fails", () => {
  const build = { number: 60408, practice: 30705, given: "name" };
  const apart = { number: 26.075, practice: 18.064, given: "numeral" };
  const result = judged([
    ["build", build, "en-US", BUILD],
    ["apart", apart, "zh-CN", APART],
    // PV-16 (comparing two numbers, 35P-06) answered with a chart: a failure, not a note.
    ["near-chart", build, "en-US", NEAR],
    // The same near miss taught without a chart passes.
    ["near-plain", "number_line", "en-US", NEAR],
    // The compiler drops a task that writes its number, so the leak is put into the compiled lesson: plainly,
    // grouped with a space, and in full-width digits in a hint.
    ["leak", build, "en-US", BUILD, { field: "prompt", value: "Build 30705 on the chart." }],
    ["leak-grouped", build, "en-US", BUILD, { field: "prompt", value: "Now build 30 705." }],
    ["leak-hint", build, "zh-CN", BUILD, { field: "hints", value: ["先看万位：３０７０５。"] }],
  ]);
  assert.deepEqual(failed(result.build), []);
  assert.ok(result.build.pass);
  assert.deepEqual(failed(result.apart), []);
  assert.ok(result.apart.pass);
  assert.equal(result["near-chart"].pass, false);
  assert.deepEqual(failed(result["near-chart"]), ["no place-value chart for this question"]);
  assert.ok(result["near-plain"].pass);
  for (const id of ["leak", "leak-grouped", "leak-hint"]) {
    assert.equal(result[id].pass, false, id);
    assert.deepEqual(failed(result[id]), ["a build task's words do not write its number"], id);
  }
  // The question's number differs from the practice's: a lesson on another number is not this case's.
  const other = judged([["other", { number: 60480, practice: 30705, given: "name" }, "en-US", BUILD]]).other;
  assert.deepEqual(failed(other), ["the chart shows the question's number"]);
});

test("a pull apart whose row is missing or asks for other parts fails", () => {
  const apart = { number: 26.075, practice: 18.064, given: "numeral" };
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
    const api = await import(${here("../lesson-plan.js")});
    const { placeValuePlan } = await import(${here("./sample-plans.mjs")});
    const { judgePlaceValueChart } = await import(${here("../scripts/place-value-judge.mjs")});
    const item = ${JSON.stringify(APART)};
    const { lesson } = api.compileAndValidateLessonPlan(placeValuePlan(${JSON.stringify(apart)}), { language: "zh-CN" });
    const missing = structuredClone(lesson);
    missing.lesson.tasks = missing.lesson.tasks.filter((task) => task.completion.kind !== "numeric_row");
    const wrong = structuredClone(lesson);
    wrong.lesson.tasks[1].completion.parts[1].blank.answer = "2";
    console.log(JSON.stringify({ missing: judgePlaceValueChart(item, missing), wrong: judgePlaceValueChart(item, wrong) }));
  `], { env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "place_value_chart" }, cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" }));
  for (const id of ["missing", "wrong"]) assert.deepEqual(failed(result[id]), ["a pull-apart task is followed by the row of its parts"], id);
});
