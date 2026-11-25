// The 3D solids recipe (OLL decision 0019, amended by 0020). A trial until 2026-11-18; now offered by default,
// with cube_with_section retired. (withTrial below still sets the old switch; it no longer changes anything.)
// The model writes shapes and the sizes a question states; the program converts, computes the measures,
// places a second solid and makes the cut or net slider. Each SD case's ideal model output compiles and
// passes the solids judge; each refusal names its reason; a stubbed generation run decodes the sizes from
// the provider's mantissa/scale form (run 5's lesson: test through the real path).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);

test("solid_3d is offered by default, last in the catalog where its gate measured it, and the teaching cube is retired", () => {
  // Switched on 2026-11-18 after the revised speed gate passed at 80 pairs (docs/SOLIDS_PROBE_2026-11-17.md).
  assert.equal(api.RECIPE_CATALOG_ORDER.at(-2), "solid_3d");
  assert.ok(api.OFFERED_RECIPES.includes("solid_3d"));
  assert.ok(api.LESSON_PLAN_CAPABILITY_NAMES.includes("solid_3d"));
  assert.equal(api.TRIAL_RECIPES.includes("solid_3d"), false);
  assert.deepEqual(api.RETIRED_RECIPES, ["cube_with_section"]);
  assert.equal(api.OFFERED_RECIPES.includes("cube_with_section"), false);
  assert.equal(api.LESSON_PLAN_CAPABILITY_NAMES.includes("cube_with_section"), false);
  assert.equal(api.RECIPE_PLUGIN.solid_3d, "math");
});

/** Runs a script with the trial switched on (the switch is read once, when the module loads). */
function withTrial(script) {
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "solid_3d" },
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  }));
}

// The ideal model output for each in-scope case: shapes and the sizes the question states.
const IDEAL = {
  "SD-01": { solids: [{ shape: "box", length: 30, width: 20, height: 12 }], show: ["volume", "surface_area"] },
  "SD-02": { solids: [{ shape: "cylinder", radius: 4, height: 10 }], show: ["volume"] },
  "SD-03": { solids: [{ shape: "cone", radius: 3, height: 5 }, { shape: "cylinder", radius: 3, height: 5 }], show: ["volume"] },
  "SD-04": { solids: [{ shape: "sphere", radius: 6 }], show: ["volume", "surface_area"] },
  "SD-05": { solids: [{ shape: "prism", sides: 3, side: 2, height: 4 }], show: ["counts"] },
  "SD-06": { solids: [{ shape: "pyramid", sides: 4, side: 6, height: 4 }], show: ["surface_area"], interaction: "unfold" },
  "SD-07": { solids: [{ shape: "box", length: 6, width: 4, height: 3 }, { shape: "box", length: 2, width: 4, height: 7 }], join: "l_shape", show: ["volume"] },
  "SD-08": { solids: [{ shape: "cylinder", radius: 2, height: 6 }], interaction: "cut" },
  "SD-09": { solids: [{ shape: "box", side: 5 }], show: ["surface_area"], interaction: "unfold" },
  "SD-10": { solids: [{ shape: "cone", radius: 6, height: 8 }], show: ["volume", "surface_area"] },
  "SD-11": { solids: [{ shape: "box", length: 4, width: 3, height: 2 }], show: ["counts"] },
  "SD-12": { solids: [{ shape: "box", side: 4 }, { shape: "sphere", radius: 2 }], show: ["volume"] },
  "SD-13": { solids: [{ shape: "frustum", radius: 10, top_radius: 6, height: 8 }], show: ["volume"] },
  "SD-14": { solids: [{ shape: "prism", sides: 6, side: 2, height: 5 }], show: ["volume"] },
  "SD-15": { solids: [{ shape: "hemisphere", radius: 3 }], show: ["volume"] },
  "SD-C1": { solids: [{ shape: "cylinder", radius: 1, height: 3 }] },
};
const ZH = new Set(["SD-10", "SD-11", "SD-14"]);

// A plan with one solid_3d visual and no outline numbers; the language decides the measures line.
const compileScript = (entries) => `
  const api = await import(${here("../lesson-plan.js")});
  const { samplePlan } = await import(${here("./sample-plans.mjs")});
  const { judgeSolids } = await import(${here("../scripts/solids-judge.mjs")});
  const cases = Object.fromEntries((await import("node:fs")).readFileSync(new URL(${here("../testsuite/solids-judge-cases.json")}), "utf8") && JSON.parse((await import("node:fs")).readFileSync(new URL(${here("../testsuite/solids-judge-cases.json")}), "utf8")).cases.map((item) => [item.id, item]));
  const out = {};
  for (const [id, parameters, language] of ${JSON.stringify(entries)}) {
    const plan = samplePlan("process_diagram");
    const visual = plan.sections[0].moments[0].actions[0].content;
    visual.capability = "solid_3d";
    visual.parameters = parameters;
    plan.sections[0].reusable_items[0].capability = "solid_3d";
    try {
      const compiled = api.compileAndValidateLessonPlan(plan, { language });
      const write = compiled.lesson.steps.flatMap((step) => step.beats).flatMap((beat) => beat.actions).find((action) => action.kind === "scene3d");
      out[id] = { content: write.content, variables: compiled.lesson.lesson.variables ?? [], verdict: cases[id] ? judgeSolids(cases[id], compiled.lesson) : undefined };
    } catch (error) {
      out[id] = { error: error.code, path: error.path, message: error.message };
    }
  }
  console.log(JSON.stringify(out));
`;

test("each in-scope case's ideal output compiles and passes the solids judge", () => {
  const result = withTrial(compileScript(Object.entries(IDEAL).map(([id, parameters]) => [id, parameters, ZH.has(id) ? "zh-CN" : "en-US"])));
  for (const id of Object.keys(IDEAL)) {
    assert.equal(result[id].error, undefined, `${id}: ${result[id].message}`);
    assert.deepEqual(result[id].verdict.hard, [], `${id}: ${result[id].verdict.hard.join(" | ")}`);
  }
  // The program converts the hexagon's edge to the builder's circumradius (equal for a hexagon) and the
  // square pyramid's edge 6 to 6/√2; the measures come from the program.
  assert.equal(result["SD-06"].content.objects[0].radius, 6 / (2 * Math.sin(Math.PI / 4)));
  assert.equal(result["SD-06"].content.caption, "Surface area = 96");
  assert.equal(result["SD-10"].content.caption, "体积 = 96π ≈ 301.59；表面积 = 96π ≈ 301.59");
  assert.equal(result["SD-03"].content.caption, "Cone: Volume = 15π ≈ 47.12\nCylinder: Volume = 45π ≈ 141.37");
  // The program's slider: a cut through the whole height, a net from closed to flat; no outline number.
  assert.deepEqual(result["SD-08"].variables.map(({ as, ...rest }) => ({ ...rest, named: /_cut$/u.test(as) })), [
    { initial: 0, min: -3, max: 3, label: "Cut height", control: { kind: "slider", step: 0.06 }, named: true },
  ]);
  assert.deepEqual(result["SD-08"].content.bindings, [{ target: "cut.value", expression: result["SD-08"].variables[0].as }]);
  assert.deepEqual(result["SD-09"].variables.map(({ initial, min, max, label }) => [initial, min, max, label]), [[0, 0, 1, "Unfold"]]);
  assert.deepEqual(result["SD-01"].variables, [], "no interaction, no slider");
});

test("joined solids: a stack written top first stands upright; pairs no composite draws are refused", () => {
  const result = withTrial(compileScript([
    ["upright", { solids: [{ shape: "cylinder", radius: 1, height: 3 }, { shape: "cone", radius: 1, height: 2 }], join: "stack", show: ["volume"] }, "en-US"],
    ["turned", { solids: [{ shape: "cone", radius: 1, height: 2 }, { shape: "cylinder", radius: 1, height: 3 }], join: "stack", show: ["volume"] }, "en-US"],
    ["roof", { solids: [{ shape: "box", side: 4 }, { shape: "pyramid", sides: 4, side: 4, height: 3 }], join: "stack" }, "en-US"],
    ["radii", { solids: [{ shape: "cylinder", radius: 1, height: 3 }, { shape: "cone", radius: 2, height: 2 }], join: "stack" }, "en-US"],
    ["side-cones", { solids: [{ shape: "cone", radius: 1, height: 3 }, { shape: "cone", radius: 1, height: 2 }], join: "l_shape" }, "en-US"],
    ["one-joined", { solids: [{ shape: "box", side: 2 }], join: "l_shape" }, "en-US"],
  ]));
  assert.deepEqual(result.upright.content.objects.map((object) => object.kind), ["cylinder", "cone"]);
  assert.deepEqual(result.turned.content.objects, result.upright.content.objects, "the same solid, turned over");
  assert.equal(result.turned.content.caption, "Volume = 11π/3 ≈ 11.52", "3π + 2π/3");
  assert.deepEqual(result.roof.content.objects.map((object) => object.kind), ["box", "pyramid"]);
  assert.match(result.radii.message, /shares its radius \(2 and 1\)/u);
  assert.match(result["side-cones"].message, /only two boxes join into an L shape/u);
  assert.match(result["one-joined"].message, /join needs two solids/u);
});

test("refused meaning faults: a missing size, a measure with no formula, a net that cannot open, outline numbers", () => {
  const result = withTrial(compileScript([
    ["no-height", { solids: [{ shape: "cylinder", radius: 2 }] }, "en-US"],
    ["bad-shape", { solids: [{ shape: "torus", radius: 2 }] }, "en-US"],
    ["nine-sides", { solids: [{ shape: "prism", sides: 9, side: 1, height: 2 }] }, "en-US"],
    ["round-counts", { solids: [{ shape: "cylinder", radius: 1, height: 2 }], show: ["counts"] }, "en-US"],
    ["l-area", { solids: [{ shape: "box", side: 2 }, { shape: "box", side: 1 }], join: "l_shape", show: ["surface_area"] }, "en-US"],
    ["sphere-net", { solids: [{ shape: "sphere", radius: 2 }], interaction: "unfold" }, "en-US"],
    ["zero", { solids: [{ shape: "sphere", radius: 0 }] }, "en-US"],
    ["three", { solids: [{ shape: "sphere", radius: 1 }, { shape: "sphere", radius: 2 }, { shape: "sphere", radius: 3 }] }, "en-US"],
    ["rect-prism", { solids: [{ shape: "prism", length: 3, width: 2, height: 1 }], show: ["counts"] }, "en-US"],
    ["rect-pyramid", { solids: [{ shape: "pyramid", length: 4, width: 2, height: 3 }], show: ["volume"] }, "en-US"],
  ]));
  assert.match(result["no-height"].message, /a cylinder needs radius, height/u);
  assert.match(result["bad-shape"].message, /expected one of box/u);
  assert.match(result["nine-sides"].message, /3 to 8 sides/u);
  assert.match(result["round-counts"].message, /a cylinder has no counts here/u);
  assert.match(result["l-area"].message, /a joined solid has no surface area here/u);
  assert.match(result["sphere-net"].message, /only a box, prism, pyramid, cylinder or cone unfolds/u);
  assert.match(result.zero.message, /radius must be a positive number/u);
  assert.match(result.three.message, /one solid, or two side by side/u);
  for (const id of ["no-height", "bad-shape", "nine-sides", "round-counts", "l-area", "sphere-net", "zero", "three"]) assert.equal(result[id].error, "LESSON_PLAN_CAPABILITY_PARAMETER", id);
  // One reading: a prism on a rectangle is a box; a rectangular pyramid keeps its rectangle.
  assert.equal(result["rect-prism"].content.objects[0].kind, "box");
  assert.equal(result["rect-prism"].content.caption, "6 faces, 12 edges, 8 vertices");
  assert.equal(result["rect-pyramid"].content.caption, "Volume = 8");
});

test("a stubbed generation run decodes nested sizes from mantissa and scale", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { retiredCubeCourse } = await import(${here("./lesson-plan-course-fixtures.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    // The cube-and-section course with its visual swapped for solid_3d: no outline numbers, so no
    // animations or number targets (the solid's slider is the program's).
    const plan = structuredClone(retiredCubeCourse);
    delete plan.numbers;
    for (const section of plan.sections) {
      for (const moment of section.moments) moment.actions = moment.actions.filter((action) => action.action !== "animate");
      if (section.student_activities) section.student_activities = section.student_activities.filter((activity) => activity.kind !== "number_target");
      if (!section.student_activities?.length) delete section.student_activities;
      for (const item of section.reusable_items ?? []) if (item.capability === "cube_with_section") item.capability = "solid_3d";
      for (const moment of section.moments) for (const action of moment.actions) {
        if (action.content?.capability === "cube_with_section") action.content = { capability: "solid_3d", parameters: { solids: [{ shape: "cone", radius: 3, height: 4.5 }] } };
      }
    }
    const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
    const outline = stagedOutline(plan, drafts);
    // As the provider writes them: every number as { mantissa, scale }.
    drafts[0].course_visual_creates.visual_1.content = { parameters: {
      solids: [{ shape: "cone", radius: { mantissa: 3, scale: 0 }, height: { mantissa: 45, scale: 1 } }, { shape: "cylinder", radius: { mantissa: 3, scale: 0 }, height: { mantissa: 45, scale: 1 } }],
      show: ["volume"], interaction: "cut",
    } };
    let calls = 0;
    const generated = await api.generateLessonPlanWithModel(async (request) => {
      calls += 1;
      if (calls > 6) throw new Error("unexpected extra model request");
      if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
      return JSON.stringify(drafts[request.section - 1]);
    }, { turn_id: "solid-decimals", learner_request: "Compare a cone and a cylinder", language: "en-US" }, { max_attempts_per_part: 1 });
    const write = generated.lesson.steps.flatMap((step) => step.beats).flatMap((beat) => beat.actions).find((action) => action.kind === "scene3d");
    console.log(JSON.stringify({ objects: write.content.objects, caption: write.content.caption, variables: generated.lesson.lesson.variables, calls: generated.model_calls }));
  `);
  assert.deepEqual(result.objects.map((object) => [object.kind, object.radius, object.height]), [["cone", 3, 4.5], ["cylinder", 3, 4.5]]);
  assert.equal(result.caption, "Cone: Volume = 13.5π ≈ 42.41\nCylinder: Volume = 40.5π ≈ 127.23");
  assert.deepEqual(result.variables.map((variable) => [variable.min, variable.max]), [[-2.25, 2.25]]);
});

test("review fixes: routing, the wider cylinder below, sizes a shape does not use, one language per scene", () => {
  const routed = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const route = (features) => { try { return api.matchLessonPlanCapability(features); } catch (error) { return error.code; } };
    console.log(JSON.stringify({ routes: [["solids"], ["solids", "section_plane"], ["solid_3d", "section_plane"]].map(route), names: api.LESSON_PLAN_CAPABILITY_NAMES }));
  `);
  // A cut through any shape asks for solids with section_plane. While the trial is on, the teaching cube is
  // retired (owner, 2026-11-17): its features are no longer offered, so no cut can route to the fixed cube.
  assert.deepEqual(routed.routes, ["solid_3d", "solid_3d", "LESSON_PLAN_UNSUPPORTED_REQUIREMENT"]);
  assert.ok(!routed.names.includes("cube_with_section") && routed.names.includes("solid_3d"));
  const result = withTrial(compileScript([
    ["narrow-below", { solids: [{ shape: "cylinder", radius: 1, height: 2 }, { shape: "cylinder", radius: 3, height: 1 }], join: "stack" }, "en-US"],
    ["cone-top-radius", { solids: [{ shape: "cone", radius: 6, top_radius: 3, height: 8 }] }, "en-US"],
    ["sphere-height", { solids: [{ shape: "sphere", radius: 3, height: 4 }] }, "en-US"],
    ["both-bases", { solids: [{ shape: "prism", sides: 3, side: 2, length: 4, height: 1 }] }, "en-US"],
    ["cube-and-sizes", { solids: [{ shape: "box", side: 2, length: 3 }] }, "en-US"],
    ["spanish", { solids: [{ shape: "cylinder", radius: 4, height: 10 }], show: ["volume"], interaction: "cut" }, "es-US"],
  ]));
  assert.deepEqual(result["narrow-below"].content.objects.map((object) => object.radius), [3, 1], "turned over: the wider one stands below");
  assert.match(result["cone-top-radius"].message, /a cone has no top_radius; it is drawn from radius, height/u);
  assert.match(result["sphere-height"].message, /a sphere has no height/u);
  assert.match(result["both-bases"].message, /a regular base \(sides, side\) or a rectangle/u);
  assert.match(result["cube-and-sizes"].message, /a cube by its side, or length, width and height/u);
  const spanish = result.spanish;
  assert.equal(spanish.content.title, "立体图形");
  assert.match(spanish.content.caption, /^体积 = 160π/u, "title, slider and measures in the same language");
  assert.equal(spanish.variables[0].label, "截面高度");
});

test("probe 1 (2026-11-17): sizes in an order the provider can follow, and unused sizes that say nothing", () => {
  // The provider writes properties in schema order: height must come after every other size.
  const order = Object.keys(api.RECIPE_SCHEMA_PROPERTIES.solid_3d.solids.items.properties);
  assert.equal(order.at(-1), "height");
  assert.deepEqual(order.slice(0, 3), ["shape", "radius", "top_radius"]);
  const result = withTrial(compileScript([
    // As probe 1's model wrote a can, with its height where the schema let it.
    ["can", { solids: [{ shape: "cylinder", radius: 4, top_radius: 4, sides: 32, side: 0, height: 10 }], show: ["volume"] }, "en-US"],
    ["cone-zeros", { solids: [{ shape: "cone", radius: 6, top_radius: 0, side: 0, height: 8 }], show: ["volume"] }, "en-US"],
    ["cone-top", { solids: [{ shape: "cone", radius: 6, top_radius: 3, height: 8 }] }, "en-US"],
    ["side-as-height", { solids: [{ shape: "cylinder", radius: 4, top_radius: 4, side: 10 }] }, "en-US"],
  ]));
  assert.equal(result.can.content.caption, "Volume = 160π ≈ 502.65");
  assert.equal(result["cone-zeros"].content.caption, "Volume = 96π ≈ 301.59");
  assert.match(result["cone-top"].message, /a cone has no top_radius/u, "a real top radius means a frustum: refused");
  assert.match(result["side-as-height"].message, /a cylinder has no side/u, "a size where another belongs is never moved");
});
