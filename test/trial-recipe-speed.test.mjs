import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MOTION_CASES, NUMBER_LINE_CASES, OTHER_CASE_IDS, TRIAL_CASES, numberLineInPart, recipesInPart, summarize } from "../scripts/eval-trial-recipe-speed.mjs";

test("trial-recipe cases pair motion requests with held-out requests from other subjects", async () => {
  const heldOut = new Set(JSON.parse(await readFile(new URL("../eval/subject-routing-heldout.json", import.meta.url), "utf8")).cases.map((item) => item.id));
  assert.equal(MOTION_CASES.length, OTHER_CASE_IDS.length);
  for (const id of OTHER_CASE_IDS) assert.ok(heldOut.has(id), id);
  assert.equal(new Set(MOTION_CASES.map((item) => item.id)).size, MOTION_CASES.length);
});

test("a first part built by the motion builder is recognised", () => {
  const part = (writes) => ({ steps: [{ beats: [{ actions: writes }] }] });
  assert.deepEqual(recipesInPart(part([{ do: "write", as: "v1-track", kind: "geometry", content: { points: [{ as: "start" }, { as: "object" }] } }])), ["constant_speed_motion"]);
  assert.deepEqual(recipesInPart(part([{ do: "write", as: "v1", kind: "plot", content: {} }])), []);
});

test("the summary splits motion and other requests", () => {
  const row = (pair, kind, arm, ms, recipes = []) => ({ pair, kind, arm, outcome: "first_playable", first_playable_ms: ms, prompt_tokens: 100, recipes });
  const summary = summarize([row(0, "motion", "baseline", 9000), row(0, "motion", "candidate", 9200, ["constant_speed_motion"]), row(1, "other", "baseline", 8000), row(1, "other", "candidate", 7900)]);
  assert.equal(summary.motion.paired_difference_ms.median, 200);
  assert.equal(summary.other.paired_difference_ms.median, -100);
  assert.equal(summary.all.candidate_used_trial_recipe, 1);
});

test("the number line trial has its own fitting requests, and its card is recognised", () => {
  assert.equal(NUMBER_LINE_CASES.length, OTHER_CASE_IDS.length);
  assert.deepEqual(Object.keys(TRIAL_CASES), ["constant_speed_motion", "number_line"]);
  assert.deepEqual(MOTION_CASES, TRIAL_CASES.constant_speed_motion);
  const part = { steps: [{ beats: [{ actions: [{ do: "write", as: "v1", kind: "number_line", content: { range: { min: 0, max: 1 } } }] }] }] };
  assert.deepEqual(recipesInPart(part), ["number_line"]);
});

test("a first part's number line is summarised for judging quality", () => {
  const part = { lesson: { variables: [{ as: "number_02", min: 0, max: 1, initial: 0.75, control: { kind: "slider", step: 0.25 } }] },
    steps: [{ beats: [{ actions: [{ do: "write", as: "v1", kind: "number_line", content: {
      range: { min: -1, max: 3 }, ticks: { step: 1, subdivisions: 4 },
      points: [{ as: "start", value: 0 }, { as: "end", value: 0.75 }], jumps: [{ as: "move", from: "start", by: 0.75, hops: true }],
      bindings: [{ target: "move.by", expression: "number_02" }],
    } }] }] }] };
  assert.deepEqual(numberLineInPart(part), {
    span: 4, range: { min: -1, max: 3 }, subdivisions: 4, step: 1, hops: true, by: 0.75, start: 0, end: 0.75,
    start_slider: null, change_slider: { min: 0, max: 1, initial: 0.75, step: 0.25 },
  });
  assert.equal(numberLineInPart({ steps: [] }), undefined);
});

// The number line judge (hard and soft checks, set before run 5).
const { judgeNumberLine, numberLineStates, slipVerdict, NUMBER_LINE_QUALITY_CASES, TRIAL_QUALITY_CASES } = await import("../scripts/eval-trial-recipe-speed.mjs");
const lineLesson = ({ range = { min: -4, max: 4 }, ticks = { step: 1 }, start = 3, change = -5, changeRange = [-5, 0], animations = [], tasks = [], latentEnd = false } = {}) => ({
  content: {
    range, ticks,
    points: [{ as: "start", value: start, label: "起点" }, { as: "end", value: start + change, label: "终点", ...(latentEnd ? { shown: "when_emphasized" } : {}) }],
    jumps: [{ as: "move", from: "start", by: change, hops: true }],
    bindings: [{ target: "start.value", expression: "number_01" }, { target: "end.value", expression: "(number_01)+(number_02)" }, { target: "move.by", expression: "number_02" }],
  },
  variables: [{ as: "number_01", initial: start, min: start - 1, max: start + 1 }, { as: "number_02", initial: change, min: changeRange[0], max: changeRange[1] }],
  tasks, animations,
});

test("number line states combine each variable's starting, animated and target values", () => {
  const states = numberLineStates(lineLesson({ animations: [["number_02", -4]], tasks: [{ completion: { kind: "expression_target", expression: "number_01", value: 2 } }] }));
  assert.deepEqual(states.map((state) => [state.start, state.end]), [[3, -2], [3, -1], [2, -3], [2, -2]]);
});

test("the judge passes a correct line and names each hard miss", () => {
  const item = { expect: { values: [3, -2], change: -5, integer: true } };
  assert.deepEqual(judgeNumberLine(item, lineLesson()), { hard: [], soft: [] });
  // The numerator mistake of run 4: 3/4 drawn as 3.
  assert.match(judgeNumberLine({ expect: { values: [0.75], parts: 4 } }, lineLesson({ range: { min: -1, max: 5 }, ticks: { step: 1, subdivisions: 4 }, start: 0, change: 3, changeRange: [0, 3] })).hard.join(), /wrong value: 0\.75 is never shown/);
  assert.match(judgeNumberLine(item, lineLesson({ changeRange: [-5, -4], change: -4 })).hard.join(), /cannot reach -5|wrong value/);
  // A point stopped between ticks has no number under it.
  assert.match(judgeNumberLine({ expect: {} }, lineLesson({ animations: [["number_02", -4.5]] })).hard.join(), /unreadable: end at -1\.5/);
  // A fourth under "major" labels is unlabelled: a point there is unreadable, as the learner sees it.
  assert.match(judgeNumberLine({ expect: {} }, lineLesson({ ticks: { step: 1, subdivisions: 4 }, start: 0, change: 0.75, changeRange: [0, 1] })).hard.join(), /unreadable: end at 0\.75/);
  // A hidden end is not judged for readability; it is kept back on purpose.
  assert.deepEqual(judgeNumberLine({ expect: {} }, lineLesson({ ticks: { step: 1, subdivisions: 4 }, start: 0, change: 0.75, changeRange: [0, 1], latentEnd: true })).hard, []);
  // In range but off the slider's grid: a slider from −5 stepping by 2 reaches −5, −3, −1 … never −4.
  const offGrid = lineLesson({ changeRange: [-5, 5] });
  offGrid.variables[1].control = { step: 2 };
  assert.match(judgeNumberLine({ expect: { change: -4 } }, offGrid).hard.join(), /cannot reach -4/);
  assert.deepEqual(judgeNumberLine({ expect: { change: -5 } }, offGrid).hard, []);
  assert.match(judgeNumberLine(item, { error: "boom" }).hard.join(), /compile error/);
  assert.deepEqual(judgeNumberLine(item, undefined).hard, ["no number line"]);
});

test("width, hops and parts are soft", () => {
  const { hard, soft } = judgeNumberLine({ expect: { values: [3, -2], change: -5, integer: true, parts: 2 } }, lineLesson({ range: { min: -20, max: 20 } }));
  assert.deepEqual(hard, []);
  assert.deepEqual(soft, ["1 parts, not 2", "40 units wide"]);
});

test("quality cases are written before the run: every held-out case expects values, near misses are read by hand", () => {
  assert.equal(TRIAL_QUALITY_CASES.number_line, NUMBER_LINE_QUALITY_CASES);
  for (const item of NUMBER_LINE_QUALITY_CASES) assert.ok(item.nearMiss || item.expect?.values?.length, item.id);
  for (const item of NUMBER_LINE_CASES) assert.ok(item.expect?.values?.length, item.id);
  assert.equal(new Set([...NUMBER_LINE_CASES, ...NUMBER_LINE_QUALITY_CASES].map((item) => item.id)).size, 24);
});

test("speed is summarized over the pairs only; quality rows are summarized apart", () => {
  const row = (pair, arm, kind, ms, extra = {}) => ({ pair, arm, kind, case: `C-${pair}`, outcome: "first_playable", first_playable_ms: ms, prompt_tokens: 1, ...extra });
  const summary = summarize([
    row(0, "baseline", "motion", 1000), row(0, "candidate", "motion", 1100, { quality: { hard: [], soft: [] } }),
    row(1, "candidate", "quality", 99999, { quality: { hard: ["wrong value: 0.75 is never shown"], soft: [] } }),
    row(2, "candidate", "near_miss", 5000, { recipes: ["number_line"] }),
  ]);
  assert.equal(summary.all.p50_first_playable_ms.candidate, 1100);
  assert.equal(summary.quality.judged, 2);
  assert.equal(summary.quality.hard_pass, 1);
  assert.deepEqual(summary.quality.hard_misses, [{ case: "C-1", hard: ["wrong value: 0.75 is never shown"] }]);
  assert.deepEqual(summary.quality.near_misses_for_review, [{ case: "C-2", recipes: ["number_line"] }]);
});

test("a decimal question labelled in fractions is a hard miss; decimal labels pass", () => {
  const lesson = lineLesson({ range: { min: -1, max: 2 }, ticks: { step: 1, subdivisions: 10, labels: "all" }, start: 0.5, change: 0.3, changeRange: [0, 1] });
  const item = { expect: { values: [0.5, 0.8], parts: 10, format: "decimal" } };
  assert.deepEqual(judgeNumberLine(item, lesson).hard, ["labels as fractions, the question writes decimals"]);
  lesson.content.ticks.format = "decimal";
  assert.deepEqual(judgeNumberLine(item, lesson), { hard: [], soft: [] });
});

test("the slip rule: no miss passes, one miss is read by hand, two misses or a repeated request fail", () => {
  const row = (id, hard = []) => ({ case: id, quality: { hard, soft: [] } });
  assert.equal(slipVerdict([row("NL-01"), row("NL-02")]).result, "pass");
  assert.equal(slipVerdict([row("NL-01", ["x"]), row("NL-02")]).result, "review");
  assert.equal(slipVerdict([row("NL-01", ["x"]), row("NL-02", ["y"])]).result, "fail");
  assert.match(slipVerdict([row("NL-11", ["x"]), row("NL-11", ["x"])]).reason, /same request missed more than once: NL-11/);
});

// The harness end to end, against a stub build that talks like Coach: one model call, one raw reply,
// an outline of two sections, the first part (a compiled number line), then first playable.
test("the harness runs pairs and quality cases, keeps raw replies, judges each case, and reports what did not run", async () => {
  const { mkdtemp, writeFile, mkdir, readdir } = await import("node:fs/promises");
  const { execFile } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = await mkdtemp(join(tmpdir(), "harness-smoke-"));
  const part = {
    dsl: "octos.lesson", version: "0.1", profile: "authoring",
    lesson: { mode: "explain", language: "zh-CN", title: "数轴", goals: ["看"], variables: [
      { as: "number_01", initial: 35, min: 30, max: 40, label: "起点" }, { as: "number_02", initial: 40, min: 0, max: 100, label: "移动" },
    ] },
    steps: [{ key: "s", purpose: "看", beats: [{ key: "b", say: "看。", actions: [{ do: "write", as: "line", kind: "number_line", role: "main_visual", place: { relation: "new_region" }, content: {
      range: { min: 0, max: 141 }, ticks: { step: 5, subdivisions: 1, labels: "major" },
      points: [{ as: "start", value: 35, label: "起点" }, { as: "end", value: 75, label: "终点" }],
      jumps: [{ as: "move", from: "start", by: 40, hops: true }],
      bindings: [{ target: "start.value", expression: "number_01" }, { target: "end.value", expression: "(number_01)+(number_02)" }, { target: "move.by", expression: "number_02" }],
    } }] }] }],
    close: { summary: "完。", focus: ["line"] },
  };
  await writeFile(join(dir, "part.json"), JSON.stringify(part));
  await writeFile(join(dir, "main"), `
    const { mkdirSync, copyFileSync } = await import("node:fs");
    let input = ""; process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const { turn_id } = JSON.parse(input);
      const dir = process.env.OCTOS_WORK_DIR + "/study/oll"; mkdirSync(dir, { recursive: true });
      const path = dir + "/" + turn_id + ".part-001.octos-lesson.json"; copyFileSync(${JSON.stringify(join(dir, "part.json"))}, path);
      const say = (line) => process.stderr.write(line + "\\n");
      say('learning-coach: {"stage":"model-call","status":"started"}');
      say('learning-coach: raw stub lesson-plan-bootstrap content: {"numbers":[35,40]}');
      say('learning-coach: {"stage":"lesson-plan-outline-ready","status":"completed","sections":2}');
      say(JSON.stringify({ type: "artifact", path }));
      say('learning-coach: {"stage":"lesson-prefix-published","status":"completed"}');
      setInterval(() => {}, 1000);
    });
  `);
  await writeFile(join(dir, "profile.json"), JSON.stringify({ config: { llm: { primary: { family_id: "stub", model_id: "stub-1", route: { api_key_env: "STUB_KEY" } } }, env_vars: { STUB_KEY: "x" } } }));
  const script = fileURLToPath(new URL("../scripts/eval-trial-recipe-speed.mjs", import.meta.url));
  const run = (calls, out) => new Promise((done, fail) => execFile(process.execPath, [script, "--build", dir, "--recipes", "number_line", "--octos-profile", join(dir, "profile.json"), "--pairs", "2", "--max-calls", String(calls), "--out", out],
    { timeout: 60000 }, (error) => (error ? fail(error) : done())));
  await run(100, join(dir, "full.json"));
  const full = JSON.parse(await readFile(join(dir, "full.json"), "utf8"));
  assert.equal(full.rows.length, 4 + NUMBER_LINE_QUALITY_CASES.length, "2 pairs, then every quality case once");
  assert.equal(full.summary.all.complete_pairs, 2);
  assert.equal(full.summary.not_run, undefined);
  const raw = (await readdir(full.work_dir)).filter((name) => name.endsWith(".raw-model.txt"));
  assert.equal(raw.length, full.rows.length, "every run keeps its raw reply");
  assert.match(await readFile(join(full.work_dir, raw[0]), "utf8"), /lesson-plan-bootstrap content/);
  const nl15 = full.rows.find((row) => row.case === "NL-15");
  assert.deepEqual(nl15.quality, { hard: [], soft: [] });
  assert.equal(nl15.sections, 2);
  const nl11 = full.rows.find((row) => row.case === "NL-11");
  assert.match(nl11.quality.hard.join(), /wrong value: 0\.3 is never shown/);
  assert.equal(nl11.quality.review, "later sections not judged: read by hand");
  assert.equal(full.summary.quality.near_misses_for_review.length, 4);
  // Near misses are judged mechanically since the card excludes them: drawing the number line is a hard miss.
  assert.ok(full.rows.filter((row) => row.kind === "near_miss").every((row) => row.quality?.hard[0] === "the number line was drawn for a request it cannot show"));
  // A budget too small for the plan is reported, never passed over.
  await run(3, join(dir, "short.json"));
  const short = JSON.parse(await readFile(join(dir, "short.json"), "utf8"));
  assert.match(short.summary.not_run.join(), /did not run \(budget 3 calls\)/);
});

