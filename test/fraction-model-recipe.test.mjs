// The fraction model recipe (OLL decision 0021, amended). A trial: offered only when
// LEARNING_COACH_TRIAL_RECIPES names it, so requests and recorded lessons are unchanged without it.
// The model writes the fractions as values and what the card shows; the program decides the wholes, the
// model when none is written, a grid's rows and columns, and one share when parts are split. Each FM
// case's ideal model output compiles and passes the fraction judge; each refusal names its reason; a
// stubbed generation run carries a card from the provider's reply to the lesson (test through the real path).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);

test("fraction_model is a trial recipe: not offered by default", () => {
  assert.ok(api.TRIAL_RECIPES.includes("fraction_model"));
  assert.equal(api.OFFERED_RECIPES.includes("fraction_model"), false);
  assert.equal(api.LESSON_PLAN_CAPABILITY_NAMES.includes("fraction_model"), false);
  assert.equal(api.RECIPE_PLUGIN.fraction_model, "math");
});

/** Runs a script with the trial switched on (the switch is read once, when the module loads). */
function withTrial(script) {
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "fraction_model" },
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  }));
}

const f = (numerator, denominator) => ({ numerator, denominator });
// The ideal model output for each in-scope case: the fractions as the question states them, and the view.
// FM-16 (a slider to practise on) waits for the owner's answer on how a fraction's slider is made.
const IDEAL = {
  "FM-01": { fractions: [f(2, 5)], fraction_view: "one" },
  "FM-02": { fraction_shape: "circle", fractions: [f(5, 6)], fraction_view: "one" },
  "FM-03": { fractions: [f(4, 9)], fraction_view: "one" },
  "FM-04": { fraction_shape: "circle", fractions: [f(3, 8), f(1, 3)], fraction_view: "compare" },
  "FM-05": { fractions: [f(5, 6), f(7, 9)], fraction_view: "compare" },
  "FM-06": { fractions: [f(3, 4), f(9, 12)], fraction_view: "equivalent" },
  "FM-07": { fraction_shape: "circle", fractions: [f(5, 6), f(10, 12)], fraction_view: "equivalent" },
  "FM-08": { fractions: [f(11, 4)], fraction_view: "one" },
  "FM-09": { fraction_shape: "circle", fractions: [f(12, 3)], fraction_view: "one" },
  "FM-10": { fractions: [f(43, 100)], fraction_view: "one" },
  "FM-11": { fractions: [f(160, 100)], fraction_view: "one" },
  "FM-12": { fractions: [f(3, 4)], fraction_view: "split", split_each_part: "2" },
  "FM-13": { fraction_shape: "circle", fractions: [f(3, 5)], fraction_view: "split", split_each_part: "4" },
  // Three wholes shared by four: since the share view, a split of whole things draws the cuts only.
  "FM-14": { fraction_shape: "circle", fractions: [f(3, 4)], fraction_view: "share" },
  "FM-15": { fractions: [f(6, 3)], fraction_view: "one" },
  "FM-17": { fractions: [f(3, 10), f(7, 10)], fraction_view: "compare" },
  "FM-18": { fractions: [f(3, 10), f(1, 2)], fraction_view: "compare" },
};
const ZH = new Set(["FM-03", "FM-05", "FM-07", "FM-11", "FM-14", "FM-17"]);

// A plan with one fraction_model visual and no outline numbers.
const compileScript = (entries) => `
  const api = await import(${here("../lesson-plan.js")});
  const { samplePlan } = await import(${here("./sample-plans.mjs")});
  const { judgeFractions } = await import(${here("../scripts/fraction-judge.mjs")});
  const { readFileSync } = await import("node:fs");
  const cases = Object.fromEntries(JSON.parse(readFileSync(new URL(${here("../testsuite/fraction-judge-cases.json")}), "utf8")).cases.map((item) => [item.id, item]));
  const out = {};
  for (const [id, parameters, language] of ${JSON.stringify(entries)}) {
    const plan = samplePlan("process_diagram");
    const visual = plan.sections[0].moments[0].actions[0].content;
    visual.capability = "fraction_model";
    visual.parameters = parameters;
    plan.sections[0].reusable_items[0].capability = "fraction_model";
    try {
      const compiled = api.compileAndValidateLessonPlan(plan, { language });
      const write = compiled.lesson.steps.flatMap((step) => step.beats).flatMap((beat) => beat.actions).find((action) => action.kind === "fraction_model");
      out[id] = { content: write.content, verdict: cases[id] ? judgeFractions(cases[id], compiled.lesson) : undefined };
    } catch (error) {
      out[id] = { error: error.code, path: error.path, message: error.message };
    }
  }
  console.log(JSON.stringify(out));
`;

test("each in-scope case's ideal output compiles and passes the fraction judge (FM-16 parked)", () => {
  const cases = JSON.parse(execFileSync(process.execPath, ["-e", `process.stdout.write(require("node:fs").readFileSync(${JSON.stringify(fileURLToPath(new URL("../testsuite/fraction-judge-cases.json", import.meta.url)))}, "utf8"))`], { encoding: "utf8" })).cases;
  assert.deepEqual(cases.filter((item) => !item.nearMiss && !IDEAL[item.id]).map((item) => item.id), ["FM-16"]);
  const result = withTrial(compileScript(Object.entries(IDEAL).map(([id, parameters]) => [id, parameters, ZH.has(id) ? "zh-CN" : "en-US"])));
  for (const id of Object.keys(IDEAL)) {
    assert.equal(result[id].error, undefined, `${id}: ${result[id].message}`);
    assert.deepEqual(result[id].verdict.hard, [], `${id}: ${result[id].verdict.hard.join(" | ")}`);
    assert.deepEqual(result[id].verdict.soft, [], `${id}: ${result[id].verdict.soft.join(" | ")}`);
  }
  // The program's choices: a grid for hundredths (10 × 10), a bar otherwise; one share marked and named.
  assert.deepEqual(result["FM-10"].content.grid, { rows: 10, columns: 10 });
  assert.equal(result["FM-01"].content.model, "bar");
  assert.deepEqual(result["FM-13"].content.fractions[0], { as: "a", numerator: 3, denominator: 5, split: 4, highlight: 3 });
  assert.equal(result["FM-13"].content.caption, "Each share is 3/20");
  assert.equal(result["FM-12"].content.caption, "Each share is 3/8");
  assert.equal(result["FM-14"].content.caption, "每份是 3/4");
  assert.equal(result["FM-06"].content.relation, "equivalent");
  assert.equal(result["FM-01"].content.caption, undefined, "no share, no caption");
});

test("refused values are this section's faults, each naming its reason", () => {
  const result = withTrial(compileScript([
    ["thirteenths", { fractions: [f(1, 13)], fraction_view: "one" }, "en-US"],
    ["twentieths-bar", { fraction_shape: "bar", fractions: [f(1, 20)], fraction_view: "one" }, "en-US"],
    ["grid-11", { fraction_shape: "grid", fractions: [f(7, 11)], fraction_view: "one" }, "en-US"],
    ["thirty-sevenths", { fractions: [f(5, 37)], fraction_view: "one" }, "en-US"],
    ["thirty-sevenths-grid", { fraction_shape: "grid", fractions: [f(5, 37)], fraction_view: "one" }, "en-US"],
    ["no-fractions", { fraction_shape: "circle", fraction_view: "one" }, "en-US"],
    ["no-fractions-split", { fraction_shape: "bar", fraction_view: "split", split_each_part: "3" }, "en-US"],
    ["not-equal", { fractions: [f(2, 3), f(3, 4)], fraction_view: "equivalent" }, "en-US"],
    ["one-for-two", { fractions: [f(2, 3)], fraction_view: "compare" }, "en-US"],
    ["too-many-wholes", { fractions: [f(37, 4)], fraction_view: "one" }, "en-US"],
    ["split-big", { fractions: [f(1, 5)], fraction_view: "split", split_each_part: "6" }, "en-US"],
    ["split-none", { fractions: [f(1, 5)], fraction_view: "split" }, "en-US"],
    ["split-zero", { fractions: [f(0, 5)], fraction_view: "split", split_each_part: "2" }, "en-US"],
    ["split-grid", { fraction_shape: "grid", fractions: [f(30, 100)], fraction_view: "split", split_each_part: "2" }, "en-US"],
    ["split-stray", { fractions: [f(1, 5)], fraction_view: "one", split_each_part: "2" }, "en-US"],
    ["split-seven", { fractions: [f(1, 5)], fraction_view: "split", split_each_part: "7" }, "en-US"],
    ["split-runaway", { fractions: [f(1, 5)], fraction_view: "split", split_each_part: "11296257600000" }, "en-US"],
    ["half-part", { fractions: [f(1.5, 4)], fraction_view: "one" }, "en-US"],
    ["two-grids", { fraction_shape: "grid", fractions: [f(30, 100), f(3, 10)], fraction_view: "compare" }, "en-US"],
  ]));
  assert.match(result.thirteenths.message, /no fraction card draws 13 equal parts .*choose another visual, or none/u);
  assert.match(result["twentieths-bar"].message, /at most 12 parts; 20 parts fit a grid \(fraction_shape grid\)/u);
  assert.match(result["grid-11"].message, /no grid of at most 10 by 10 has 11 cells/u);
  assert.match(result["thirty-sevenths"].message, /no fraction card draws 37 equal parts/u);
  assert.match(result["thirty-sevenths-grid"].message, /no fraction card draws 37 equal parts/u);
  assert.match(result["no-fractions"].message, /write the fractions as values.*a numerator of 0 shows a whole divided with none shaded/u);
  // On a split card a numerator of 0 is refused, so the hint there asks for at least one shaded part.
  assert.match(result["no-fractions-split"].message, /write the fraction as values.*so shade at least one/u);
  assert.doesNotMatch(result["no-fractions-split"].message, /numerator of 0/u);
  assert.match(result["not-equal"].message, /2\/3 and 3\/4 are not equal; compare them instead/u);
  assert.match(result["one-for-two"].message, /compare shows two fractions/u);
  assert.match(result["too-many-wholes"].message, /at most 8 wholes/u);
  assert.match(result["split-big"].message, /at most 24 parts/u);
  assert.match(result["split-none"].message, /split each part into 2 to 6/u);
  assert.match(result["split-zero"].message, /shade at least one/u);
  assert.match(result["split-grid"].message, /a grid's cells are not split again/u);
  assert.match(result["split-stray"].message, /split_each_part goes with fraction_view split/u);
  assert.match(result["split-seven"].message, /split each part into 2 to 6/u);
  assert.match(result["split-runaway"].message, /split each part into 2 to 6/u);
  assert.match(result["half-part"].message, /whole number of parts/u);
  assert.match(result["two-grids"].message, /share one denominator/u);
  for (const [id, item] of Object.entries(result)) assert.equal(item.error, "LESSON_PLAN_CAPABILITY_PARAMETER", id);
});

test("a grid's rows and columns: as close to square as at most 10 by 10 allows", () => {
  const result = withTrial(compileScript([
    ["twelve", { fraction_shape: "grid", fractions: [f(5, 12)], fraction_view: "one" }, "en-US"],
    ["ten", { fraction_shape: "grid", fractions: [f(3, 10)], fraction_view: "one" }, "en-US"],
    ["seven", { fraction_shape: "grid", fractions: [f(2, 7)], fraction_view: "one" }, "en-US"],
  ]));
  assert.deepEqual(result.twelve.content.grid, { rows: 3, columns: 4 });
  assert.deepEqual(result.ten.content.grid, { rows: 2, columns: 5 });
  assert.deepEqual(result.seven.content.grid, { rows: 1, columns: 7 });
});

test("a stubbed generation run: the card reaches the lesson; numerators and denominators are plain integers in the provider schema", () => {
  // Only "number" fields go to the provider as { mantissa, scale }; the fraction fields are integers.
  const items = api.RECIPE_SCHEMA_PROPERTIES.fraction_model.fractions.items.properties;
  assert.deepEqual([items.numerator.type, items.denominator.type], ["integer", "integer"]);
  // split_each_part is a choice, not a free integer (fraction probe 1: runaway integers of thousands of digits),
  // named so it cannot be read as the number of parts (probe 2).
  assert.deepEqual(api.RECIPE_SCHEMA_PROPERTIES.fraction_model.split_each_part, { enum: ["2", "3", "4", "5", "6"] });
  assert.equal(api.RECIPE_SCHEMA_PROPERTIES.fraction_model.split, undefined);
  // The values come first, and each fraction needs both numbers (probe 2: the first reply left them out).
  assert.deepEqual(Object.keys(api.RECIPE_SCHEMA_PROPERTIES.fraction_model), ["fractions", "fraction_shape", "fraction_view", "split_each_part"]);
  assert.deepEqual(api.RECIPE_SCHEMA_PROPERTIES.fraction_model.fractions.items.required, ["numerator", "denominator"]);
  const order = api.SCHEMA_PROPERTY_ORDER;
  assert.ok(order.indexOf("fractions") < order.indexOf("fraction_shape"), "fractions before the shape in the provider's order");
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { retiredCubeCourse } = await import(${here("./lesson-plan-course-fixtures.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    // A known two-section course with its visual swapped for fraction_model: no outline numbers.
    const plan = structuredClone(retiredCubeCourse);
    delete plan.numbers;
    for (const section of plan.sections) {
      for (const moment of section.moments) moment.actions = moment.actions.filter((action) => action.action !== "animate");
      // A fraction card has no slider and no 3D view: number targets and view tasks go with the cube.
      if (section.student_activities) section.student_activities = section.student_activities.filter((activity) => activity.kind !== "number_target" && activity.kind !== "scene3d_view");
      if (!section.student_activities?.length) delete section.student_activities;
      for (const item of section.reusable_items ?? []) if (item.capability === "cube_with_section") item.capability = "fraction_model";
      for (const moment of section.moments) for (const action of moment.actions) {
        if (action.content?.capability === "cube_with_section") action.content = { capability: "fraction_model", parameters: { fractions: [{ numerator: 3, denominator: 8 }], fraction_view: "one" } };
      }
    }
    const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
    const outline = stagedOutline(plan, drafts);
    drafts[0].course_visual_creates.visual_1.content = { parameters: {
      fraction_shape: "circle",
      fractions: [{ numerator: 5, denominator: 8 }, { numerator: 2, denominator: 3 }],
      fraction_view: "compare",
    } };
    let calls = 0;
    const generated = await api.generateLessonPlanWithModel(async (request) => {
      calls += 1;
      if (calls > 6) throw new Error("unexpected extra model request");
      if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
      return JSON.stringify(drafts[request.section - 1]);
    }, { turn_id: "fraction-decimals", learner_request: "Compare 5/8 and 2/3", language: "en-US" }, { max_attempts_per_part: 1 });
    const write = generated.lesson.steps.flatMap((step) => step.beats).flatMap((beat) => beat.actions).find((action) => action.kind === "fraction_model");
    console.log(JSON.stringify({ content: write.content, plugins: generated.plugins }));
  `);
  assert.deepEqual(result.content.fractions, [{ as: "a", numerator: 5, denominator: 8 }, { as: "b", numerator: 2, denominator: 3 }]);
  assert.equal(result.content.model, "circle");
  assert.equal(result.content.relation, "compare");
  assert.deepEqual(result.plugins, { math: "0.7.0", shared: "0.1.0" });
});

test("share (0021 amendment 2): a/b is a wholes shared among b, one piece of each whole marked; the program draws the wholes", () => {
  const result = withTrial(compileScript([
    ["two-among-five", { fractions: [f(2, 5)], fraction_view: "share" }, "en-US"],
    ["four-among-six", { fraction_shape: "circle", fractions: [f(4, 6)], fraction_view: "share" }, "en-US"],
    ["three-among-four-zh", { fractions: [f(3, 4)], fraction_view: "share" }, "zh-CN"],
    ["five-among-two", { fractions: [f(5, 2)], fraction_view: "share" }, "en-US"],
    ["among-seven", { fractions: [f(2, 7)], fraction_view: "share" }, "en-US"],
    ["nothing", { fractions: [f(0, 3)], fraction_view: "share" }, "en-US"],
    ["nine-wholes", { fractions: [f(9, 2)], fraction_view: "share" }, "en-US"],
    ["on-a-grid", { fraction_shape: "grid", fractions: [f(2, 5)], fraction_view: "share" }, "en-US"],
    ["with-a-split", { fractions: [f(2, 5)], fraction_view: "share", split_each_part: "2" }, "en-US"],
    ["no-values", { fraction_view: "share" }, "en-US"],
    ["a-pie", { fraction_shape: "pie", fractions: [f(2, 5)], fraction_view: "share" }, "en-US"],
  ]));
  assert.match(result["a-pie"].message, /expected one of bar, circle, grid/);
  assert.deepEqual(result["two-among-five"].content.fractions, [{ as: "a", numerator: 2, denominator: 1, split: 5, highlight: 2 }]);
  assert.equal(result["two-among-five"].content.model, "bar");
  assert.equal(result["two-among-five"].content.caption, "Each share is 2/5");
  assert.equal(result["four-among-six"].content.model, "circle");
  assert.equal(result["four-among-six"].content.caption, "Each share is 4/6 = 2/3");
  assert.equal(result["three-among-four-zh"].content.caption, "每份是 3/4");
  assert.deepEqual(result["five-among-two"].content.fractions, [{ as: "a", numerator: 5, denominator: 1, split: 2, highlight: 5 }]);
  assert.match(result["among-seven"].message, /share among 2 to 6/);
  assert.match(result["nothing"].message, /share 1 to 8 wholes/);
  assert.match(result["nine-wholes"].message, /share 1 to 8 wholes/);
  assert.match(result["on-a-grid"].message, /shared wholes are bars or circles/);
  assert.match(result["with-a-split"].message, /split_each_part goes with fraction_view split/);
  assert.match(result["no-values"].message, /numerator wholes shared equally among denominator/);
  // The choice is offered in the provider schema.
  assert.ok(api.RECIPE_SCHEMA_PROPERTIES.fraction_model.fraction_view.enum.includes("share"));
});

test("a fraction card first written without its values takes a later create's values, at the first moment (0021 amendment 2, rule 2)", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { retiredCubeCourse } = await import(${here("./lesson-plan-course-fixtures.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    const plan = structuredClone(retiredCubeCourse);
    delete plan.numbers;
    for (const section of plan.sections) {
      for (const moment of section.moments) moment.actions = moment.actions.filter((action) => action.action !== "animate");
      if (section.student_activities) section.student_activities = section.student_activities.filter((activity) => activity.kind !== "number_target" && activity.kind !== "scene3d_view");
      if (!section.student_activities?.length) delete section.student_activities;
      for (const item of section.reusable_items ?? []) if (item.capability === "cube_with_section") item.capability = "fraction_model";
      for (const moment of section.moments) for (const action of moment.actions) {
        if (action.content?.capability === "cube_with_section") action.content = { capability: "fraction_model", parameters: { fractions: [{ numerator: 3, denominator: 8 }], fraction_view: "one" } };
      }
    }
    const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
    const outline = stagedOutline(plan, drafts);
    const out = {};
    for (const [name, firstValues, laterValues] of [
      ["rule 2", undefined, [{ numerator: 1, denominator: 3 }, { numerator: 1, denominator: 6 }]],
      ["both without values", undefined, undefined],
    ]) {
      const first = bootstrapSectionFromExact(outline, drafts[0]);
      const at = first.moments.findIndex((moment) => moment.visual_creates?.length);
      const create = first.moments[at].visual_creates[0];
      create.content = { parameters: { fraction_shape: "bar", fraction_view: "compare", ...(firstValues ? { fractions: firstValues } : {}) } };
      // The fixture's first section has one moment: the values come in a second one.
      const later = first.moments.length > at + 1 ? at + 1 : first.moments.push({ narration: "Here are the two fractions.", delivery: first.moments[at].delivery }) - 1;
      first.moments[later].visual_creates = [{ course_visual: create.course_visual, content: { parameters: { fraction_shape: "bar", fraction_view: "compare", ...(laterValues ? { fractions: laterValues } : {}) } } }];
      const labels = [];
      let prefix;
      try {
        await api.generateLessonPlanWithModel(async (request) => {
          labels.push(request.label);
          if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, first);
          throw new Error("stop after the first section");
        }, { turn_id: "rule-2", learner_request: "Same top number, which is bigger?", language: "en-US" }, { max_attempts_per_part: 1, on_playable_prefix: ({ compiled }) => { prefix ??= compiled; } });
      } catch {}
      const beats = prefix?.lesson.steps[0].beats ?? [];
      const writes = beats.flatMap((beat, index) => beat.actions.filter((action) => action.kind === "fraction_model").map((action) => ({ beat: index + 1, fractions: action.content.fractions })));
      out[name] = { labels, writes, at: at + 1 };
    }
    console.log(JSON.stringify(out));
  `);
  const rule = result["rule 2"];
  assert.deepEqual(rule.labels, ["lesson-plan-bootstrap", "lesson-plan-section"], "the first section plays from the first reply");
  assert.equal(rule.writes.length, 1);
  assert.deepEqual(rule.writes[0].fractions, [{ as: "a", numerator: 1, denominator: 3 }, { as: "b", numerator: 1, denominator: 6 }]);
  assert.equal(rule.writes[0].beat, rule.at, "drawn at the first create's moment");
  // With no values in either create, the section is refused as before.
  assert.deepEqual(result["both without values"].writes, []);
});

test("a plain card, then its cut: the second create is drawn as a revision at its moment (0021 amendment 2, rule 1)", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { retiredCubeCourse } = await import(${here("./lesson-plan-course-fixtures.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { judgeFractions } = await import(${here("../scripts/fraction-judge.mjs")});
    const { readFileSync } = await import("node:fs");
    const { normalizeAuthoringLesson, reduceCanonicalEvents } = await import("octos-lesson-language");
    const cases = Object.fromEntries(JSON.parse(readFileSync(new URL(${here("../testsuite/fraction-judge-cases.json")}), "utf8")).cases.map((item) => [item.id, item]));
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    const plan = structuredClone(retiredCubeCourse);
    delete plan.numbers;
    for (const section of plan.sections) {
      for (const moment of section.moments) moment.actions = moment.actions.filter((action) => action.action !== "animate");
      if (section.student_activities) section.student_activities = section.student_activities.filter((activity) => activity.kind !== "number_target" && activity.kind !== "scene3d_view");
      if (!section.student_activities?.length) delete section.student_activities;
      for (const item of section.reusable_items ?? []) if (item.capability === "cube_with_section") item.capability = "fraction_model";
      for (const moment of section.moments) for (const action of moment.actions) {
        if (action.content?.capability === "cube_with_section") action.content = { capability: "fraction_model", parameters: { fractions: [{ numerator: 3, denominator: 8 }], fraction_view: "one" } };
      }
    }
    const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
    const outline = stagedOutline(plan, drafts);
    const out = {};
    for (const [name, firstParameters, laterParameters, laterTiming] of [
      ["cut", { fraction_shape: "circle", fractions: [{ numerator: 3, denominator: 5 }], fraction_view: "one" }, { fraction_shape: "circle", fractions: [{ numerator: 3, denominator: 5 }], fraction_view: "split", split_each_part: "4" }],
      ["share", { fractions: [{ numerator: 2, denominator: 1 }], fraction_view: "one" }, { fractions: [{ numerator: 2, denominator: 5 }], fraction_view: "share" }],
      ["fractions differ", { fractions: [{ numerator: 3, denominator: 1 }], fraction_view: "one" }, { fractions: [{ numerator: 12, denominator: 4 }], fraction_view: "split", split_each_part: "4" }],
      ["shapes differ", { fraction_shape: "circle", fractions: [{ numerator: 3, denominator: 5 }], fraction_view: "one" }, { fractions: [{ numerator: 3, denominator: 5 }], fraction_view: "split", split_each_part: "2" }],
      // Review of #148: the card keeps its title, and a cut written before the speech waits for it.
      ["titled", { title: "Three fifths of a pizza", fraction_shape: "circle", fractions: [{ numerator: 3, denominator: 5 }], fraction_view: "one" }, { fraction_shape: "circle", fractions: [{ numerator: 3, denominator: 5 }], fraction_view: "split", split_each_part: "4" }, "before_speech"],
      // Hundredths with no shape draw on a grid, which cannot be cut: the first create is kept, with no re-ask.
      ["hundredths", { fractions: [{ numerator: 43, denominator: 100 }], fraction_view: "one" }, { fractions: [{ numerator: 43, denominator: 100 }], fraction_view: "split", split_each_part: "2" }],
    ]) {
      const first = bootstrapSectionFromExact(outline, drafts[0]);
      const at = first.moments.findIndex((moment) => moment.visual_creates?.length);
      const create = first.moments[at].visual_creates[0];
      create.content = { parameters: firstParameters };
      const later = first.moments.push({ narration: "Now cut it.", delivery: first.moments[at].delivery, visual_creates: [{ course_visual: create.course_visual, ...(laterTiming ? { timing: laterTiming } : {}), content: { parameters: laterParameters } }] }) - 1;
      const labels = [];
      let prefix;
      try {
        await api.generateLessonPlanWithModel(async (request) => {
          labels.push(request.label);
          if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, first);
          throw new Error("stop after the first section");
        }, { turn_id: "rule-1", learner_request: "Three fifths shared by four", language: "en-US" }, { max_attempts_per_part: 1, on_playable_prefix: ({ compiled }) => { prefix ??= compiled; } });
      } catch {}
      const beats = prefix?.lesson.steps[0].beats ?? [];
      const cards = beats.flatMap((beat, index) => beat.actions.filter((action) => action.kind === "fraction_model" || action.do === "revise").map((action) => ({ beat: index + 1, do: action.do, as: action.as, target: action.target, fractions: action.content.fractions, caption: action.content.caption, title: action.content.title, when: action.when })));
      let board;
      if (prefix) {
        const node = Object.values(reduceCanonicalEvents(normalizeAuthoringLesson(prefix.lesson, { lessonId: "l", boardId: "b", baseRevision: 0, regionIntent: "new_topic" })).nodes).find((each) => each.kind === "fraction_model");
        board = node?.content.fractions;
      }
      out[name] = { labels, cards, at: at + 1, later: later + 1, board, ...(prefix && name === "cut" ? { fm13: judgeFractions(cases["FM-13"], prefix.lesson) } : {}) };
    }
    console.log(JSON.stringify(out));
  `);
  const cut = result.cut;
  assert.deepEqual(cut.labels, ["lesson-plan-bootstrap", "lesson-plan-section"], "the first section plays from the first reply");
  assert.deepEqual(cut.cards.map((card) => [card.beat, card.do]), [[cut.at, "write"], [cut.later, "revise"]]);
  assert.deepEqual(cut.cards[0].fractions, [{ as: "a", numerator: 3, denominator: 5 }]);
  assert.deepEqual(cut.cards[1].fractions, [{ as: "a", numerator: 3, denominator: 5, split: 4, highlight: 3 }]);
  assert.equal(cut.cards[1].caption, "Each share is 3/20");
  assert.equal(cut.cards[1].target, cut.cards[0].as, "the revision targets the card it cuts");
  // The board ends with the cut card, and the judge reads both steps: FM-13 (3/5 in four portions) passes.
  assert.deepEqual(cut.board.map(({ numerator, denominator, split, highlight }) => ({ numerator, denominator, split, highlight })), [{ numerator: 3, denominator: 5, split: 4, highlight: 3 }]);
  assert.deepEqual(cut.fm13, { hard: [], soft: [] });
  // Two wholes, then shared by five: one fifth of each.
  assert.deepEqual(result.share.cards.map((card) => [card.do, card.fractions]), [
    ["write", [{ as: "a", numerator: 2, denominator: 1 }]],
    ["revise", [{ as: "a", numerator: 2, denominator: 1, split: 5, highlight: 2 }]],
  ]);
  assert.equal(result.share.cards[1].caption, "Each share is 2/5");
  // Anything outside the typed table keeps the first create, as before (FD-20's sixteenths are not drawn).
  for (const name of ["fractions differ", "shapes differ", "hundredths"]) assert.deepEqual(result[name].cards.map((card) => card.do), ["write"], name);
  assert.deepEqual(result.hundredths.labels, ["lesson-plan-bootstrap", "lesson-plan-section"], "no re-ask for hundredths");
  const titled = result.titled.cards;
  assert.deepEqual(titled.map((card) => [card.do, card.title]), [["write", "Three fifths of a pizza"], ["revise", "Three fifths of a pizza"]]);
  assert.notEqual(titled[1].when, "before_speech", "the cut waits for the speech");
  assert.deepEqual(result["fractions differ"].cards[0].fractions, [{ as: "a", numerator: 3, denominator: 1 }]);
});

test("rule 1 to the end: a two-step lesson plays all its sections, the cut fraction stays addressable, and a refused cut is asked again", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { retiredCubeCourse } = await import(${here("./lesson-plan-course-fixtures.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { judgeFractions } = await import(${here("../scripts/fraction-judge.mjs")});
    const { readFileSync } = await import("node:fs");
    const { normalizeAuthoringLesson } = await import("octos-lesson-language");
    const cases = Object.fromEntries(JSON.parse(readFileSync(new URL(${here("../testsuite/fraction-judge-cases.json")}), "utf8")).cases.map((item) => [item.id, item]));
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    const plan = structuredClone(retiredCubeCourse);
    delete plan.numbers;
    for (const section of plan.sections) {
      for (const moment of section.moments) moment.actions = moment.actions.filter((action) => action.action !== "animate");
      if (section.student_activities) section.student_activities = section.student_activities.filter((activity) => activity.kind !== "number_target" && activity.kind !== "scene3d_view");
      if (!section.student_activities?.length) delete section.student_activities;
      for (const item of section.reusable_items ?? []) if (item.capability === "cube_with_section") item.capability = "fraction_model";
      for (const moment of section.moments) for (const action of moment.actions) {
        if (action.content?.capability === "cube_with_section") action.content = { capability: "fraction_model", parameters: { fractions: [{ numerator: 3, denominator: 8 }], fraction_view: "one" } };
      }
    }
    const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
    const outline = stagedOutline(plan, drafts);
    const out = {};
    for (const [name, firstParameters, laterParameters] of [
      ["cut", { fraction_shape: "circle", fractions: [{ numerator: 3, denominator: 5 }], fraction_view: "one" }, { fraction_shape: "circle", fractions: [{ numerator: 3, denominator: 5 }], fraction_view: "split", split_each_part: "4" }],
      // Eighths cut into four are 32 parts, more than a whole holds: the cut is refused.
      ["refused cut", { fractions: [{ numerator: 5, denominator: 8 }], fraction_view: "one" }, { fractions: [{ numerator: 5, denominator: 8 }], fraction_view: "split", split_each_part: "4" }],
    ]) {
      const first = bootstrapSectionFromExact(outline, drafts[0]);
      const at = first.moments.findIndex((moment) => moment.visual_creates?.length);
      const create = first.moments[at].visual_creates[0];
      create.content = { parameters: firstParameters };
      first.moments.push({ narration: "Now cut it.", delivery: first.moments[at].delivery, visual_creates: [{ course_visual: create.course_visual, content: { parameters: laterParameters } }] });
      const labels = [];
      const rejected = [];
      let generated;
      try {
        generated = await api.generateLessonPlanWithModel(async (request) => {
          labels.push(request.label + (request.section ? " " + request.section : ""));
          if (labels.length > 8) throw new Error("unexpected extra model request");
          if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, first);
          return JSON.stringify(drafts[request.section - 1]);
        }, { turn_id: "rule-1-full", learner_request: "Three fifths shared by four", language: "en-US" }, {
          max_attempts_per_part: 3,
          on_rejected_part: (part) => rejected.push(part.error.code + " " + part.error.message),
        });
      } catch (error) { out[name] = { labels, rejected, error: String(error.message) }; continue; }
      const lesson = generated.lesson;
      // An emphasis on the cut fraction's part, after the revision: the part is still addressable.
      const alias = lesson.steps.flatMap((step) => step.beats).flatMap((beat) => beat.actions).find((action) => action.kind === "fraction_model")?.as;
      const emphasized = structuredClone(lesson);
      emphasized.steps.at(-1).beats.push({ key: "look-again", say: "Look at one share again.", actions: [{ do: "emphasize", target: alias + "#a", emphasis: "focus" }] });
      let emphasis = "ok";
      try { normalizeAuthoringLesson(emphasized, { lessonId: "l", boardId: "b", baseRevision: 0, regionIntent: "new_topic" }); } catch (error) { emphasis = String(error.message); }
      out[name] = { labels, rejected, sections: lesson.steps.length, emphasis, fm13: judgeFractions(cases["FM-13"], lesson),
        revisions: lesson.steps.flatMap((step) => step.beats).flatMap((beat) => beat.actions).filter((action) => action.do === "revise").length };
    }
    console.log(JSON.stringify(out));
  `);
  const cut = result.cut;
  assert.equal(cut.error, undefined, cut.error);
  assert.equal(cut.sections, 3, "all three sections play");
  assert.equal(cut.revisions, 1);
  assert.equal(cut.emphasis, "ok", "the cut fraction's part stays addressable after the revision");
  assert.deepEqual(cut.fm13, { hard: [], soft: [] });
  assert.deepEqual(cut.rejected, []);
  // A refused cut is this section's fault: section 1 is asked again (and plays from the reply), never silently dropped.
  const refused = result["refused cut"];
  assert.match(refused.rejected.join(" | "), /after splitting, a whole has at most 24 parts/u);
  assert.ok(refused.labels.includes("lesson-plan-section 1"), refused.labels.join(", "));
  assert.equal(refused.error, undefined, refused.error);
});

test("after the v1 re-run: an equivalence with its cut, whole things cut without a share, and the split view's purpose in the guidance", () => {
  const result = withTrial(compileScript([
    ["half-in-quarters", { fractions: [f(1, 2), f(2, 4)], fraction_view: "equivalent", split_each_part: "2" }, "en-US"],
    ["fine-first", { fraction_shape: "circle", fractions: [f(9, 12), f(3, 4)], fraction_view: "equivalent", split_each_part: "3" }, "en-US"],
    ["wrong-count", { fractions: [f(1, 2), f(3, 6)], fraction_view: "equivalent", split_each_part: "2" }, "en-US"],
    ["no-count-works", { fractions: [f(2, 4), f(3, 6)], fraction_view: "equivalent", split_each_part: "2" }, "en-US"],
    ["same-fraction", { fractions: [f(1, 2), f(1, 2)], fraction_view: "equivalent", split_each_part: "2" }, "en-US"],
    ["FM-06", { fractions: [f(3, 4), f(9, 12)], fraction_view: "equivalent", split_each_part: "3" }, "en"],
    ["cups-in-quarters", { fractions: [f(3, 1)], fraction_view: "split", split_each_part: "4" }, "en-US"],
    ["FM-15", { fractions: [f(2, 1)], fraction_view: "split", split_each_part: "3" }, "en"],
  ]));
  assert.deepEqual(result["half-in-quarters"].content.fractions, [{ as: "a", numerator: 1, denominator: 2, split: 2 }, { as: "b", numerator: 2, denominator: 4 }]);
  assert.equal(result["half-in-quarters"].content.relation, "equivalent");
  assert.equal(result["half-in-quarters"].content.caption, undefined);
  // The coarser fraction is cut, whichever comes first.
  assert.deepEqual(result["fine-first"].content.fractions, [{ as: "a", numerator: 9, denominator: 12 }, { as: "b", numerator: 3, denominator: 4, split: 3 }]);
  // A refusal says how to retry (review of #151): the count that works, or to leave the field out.
  assert.match(result["wrong-count"].message, /cutting each part of 1\/2 3 ways gives 3\/6: use split_each_part 3/);
  for (const name of ["no-count-works", "same-fraction"]) assert.match(result[name].message, /neither fraction is the other with its parts cut 2 to 6 ways; leave split_each_part out/, name);
  // The judge's equivalence case passes with the cut drawn (pieces common to both: the textbook comparison).
  assert.deepEqual(result["FM-06"].verdict, { hard: [], soft: [] });
  // Whole things cut: the pieces only, no share marked and no "Each share" (3 ÷ 1/4 counts 12 quarter cups).
  assert.deepEqual(result["cups-in-quarters"].content.fractions, [{ as: "a", numerator: 3, denominator: 1, split: 4 }]);
  assert.equal(result["cups-in-quarters"].content.caption, undefined);
  assert.deepEqual(result["FM-15"].verdict, { hard: [], soft: [] });
  // The split view says what it is for again (the re-run: the model wrote the part count there without it).
  const guidance = withTrial(`const api = await import(${here("../lesson-plan.js")}); console.log(JSON.stringify(api.LESSON_PLAN_CAPABILITY_REGISTRY.fraction_model.model_guidance));`);
  assert.match(guidance, /split把每份再分split_each_part份求每份/u);
});

test("a share that is a whole number is written as one (review of #131)", () => {
  const result = withTrial(compileScript([["whole-share", { fractions: [f(6, 3)], fraction_view: "split", split_each_part: "2" }, "en-US"]]));
  assert.equal(result["whole-share"].content.caption, "Each share is 6/6 = 1");
});

test("split is read from its choice; a whole number is read the same way (probe 2 fixes)", () => {
  const result = withTrial(compileScript([
    ["as-choice", { fractions: [f(3, 4)], fraction_view: "split", split_each_part: "2" }, "en-US"],
    ["as-number", { fractions: [f(3, 4)], fraction_view: "split", split_each_part: 2 }, "en-US"],
  ]));
  assert.deepEqual(result["as-number"].content, result["as-choice"].content);
  assert.equal(result["as-choice"].content.caption, "Each share is 3/8");
});

test("a numerator of 0 draws the whole divided with none shaded (the refusal for missing fractions offers it)", () => {
  const result = withTrial(compileScript([["sixths-none", { fraction_shape: "circle", fractions: [f(0, 6)], fraction_view: "one" }, "en-US"]]));
  assert.equal(result["sixths-none"].error, undefined, result["sixths-none"].message);
  assert.deepEqual(result["sixths-none"].content.fractions[0], { as: "a", numerator: 0, denominator: 6 });
});
