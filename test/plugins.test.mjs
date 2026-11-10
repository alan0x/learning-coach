import assert from "node:assert/strict";
import test from "node:test";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const { INSTALLED_PLUGINS, LESSON_PLAN_CAPABILITY_REGISTRY, PLUGIN_COMPILERS, RECIPE_CATALOG_ORDER, RECIPE_PLUGIN, promptSlot } = api;

// Subject plugin plan §7: spring_and_mass goes to physics, process_diagram to
// shared, every other existing recipe to math.
test("each recipe belongs to exactly one installed plugin, as the plan assigns", () => {
  const owners = new Map();
  for (const plugin of INSTALLED_PLUGINS) {
    for (const name of Object.keys(plugin.recipes)) {
      assert.equal(owners.has(name), false, `${name} is in two plugins`);
      owners.set(name, plugin.manifest.id);
    }
  }
  assert.deepEqual([...owners.keys()].sort(), [...RECIPE_CATALOG_ORDER].sort(), "the catalog lists every recipe once");
  assert.equal(new Set(RECIPE_CATALOG_ORDER).size, RECIPE_CATALOG_ORDER.length);
  assert.deepEqual(Object.keys(LESSON_PLAN_CAPABILITY_REGISTRY), [...RECIPE_CATALOG_ORDER], "the registry follows the catalog order");
  assert.equal(RECIPE_PLUGIN.spring_and_mass, "physics");
  assert.equal(RECIPE_PLUGIN.process_diagram, "shared");
  assert.deepEqual(RECIPE_CATALOG_ORDER.filter((name) => RECIPE_PLUGIN[name] === "math").length, 11);
});

test("plugin manifests depend only on installed plugins, and every subject has a Jev description", () => {
  const installed = new Set(INSTALLED_PLUGINS.map((plugin) => plugin.manifest.id));
  for (const plugin of INSTALLED_PLUGINS) {
    assert.match(plugin.manifest.version, /^\d+\.\d+\.\d+$/);
    for (const dependency of Object.keys(plugin.manifest.depends)) assert.ok(installed.has(dependency), `${plugin.manifest.id} needs ${dependency}`);
    if (plugin.manifest.id === "shared") assert.equal(plugin.subject, undefined, "shared is never a subject choice");
    else assert.ok(plugin.subject?.description["zh-CN"], `${plugin.manifest.id} has a subject description`);
  }
});

test("a prompt bullet joins the plugins' sentences and disappears when no plugin fills it", () => {
  const shared = INSTALLED_PLUGINS.find((plugin) => plugin.manifest.id === "shared");
  const math = INSTALLED_PLUGINS.find((plugin) => plugin.manifest.id === "math");
  assert.equal(promptSlot("outline.visual_choice"), `- ${math.prompt_rules["outline.visual_choice"]}${shared.prompt_rules["outline.visual_choice"]}`);
  assert.equal(promptSlot("outline.visual_choice", "", [shared]), "- ordered_process_steps 仅是静态流程。");
  assert.equal(promptSlot("section.formulas", "", [shared]), "", "without math there is no formula rule");
  assert.equal(promptSlot("section.linked_numbers", "联动图引用同一 numbers；", [shared]), "- 联动图引用同一 numbers；");
});

test("each plugin compiles exactly the recipes it declares", () => {
  assert.deepEqual(Object.keys(PLUGIN_COMPILERS).sort(), INSTALLED_PLUGINS.map((plugin) => plugin.manifest.id).sort());
  for (const plugin of INSTALLED_PLUGINS) {
    assert.deepEqual(Object.keys(PLUGIN_COMPILERS[plugin.manifest.id]).sort(), Object.keys(plugin.recipes).sort(), plugin.manifest.id);
  }
});

test("recipes that share a schema property declare it identically, and every property has a place in the order", () => {
  const { RECIPE_SCHEMA_PROPERTIES, SCHEMA_PROPERTY_ORDER } = api;
  const seen = new Map();
  for (const [recipe, properties] of Object.entries(RECIPE_SCHEMA_PROPERTIES)) {
    assert.ok(RECIPE_CATALOG_ORDER.includes(recipe), `${recipe} is a known recipe`);
    for (const [name, schema] of Object.entries(properties)) {
      if (seen.has(name)) assert.deepEqual(schema, seen.get(name).schema, `${name}: ${recipe} vs ${seen.get(name).recipe}`);
      else seen.set(name, { recipe, schema });
      assert.ok(SCHEMA_PROPERTY_ORDER.includes(name), `${name} has a fixed position`);
    }
  }
});

test("recipe hooks and section facts are keyed by known recipes, and unknown names find nothing", () => {
  const { RECIPE_HOOKS, SECTION_FACTS } = api;
  for (const table of [RECIPE_HOOKS, SECTION_FACTS]) {
    for (const recipe of Object.keys(table)) assert.ok(RECIPE_CATALOG_ORDER.includes(recipe), recipe);
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) assert.equal(table[name], undefined, name);
  }
  assert.deepEqual(Object.keys(RECIPE_HOOKS).sort(), ["coordinate_circle", "function_plot", "function_surface_with_section", "implicit_surface_with_section", "process_diagram"]);
});

// A repair request names the first problem found, so moving recipes into
// builders must not change which problem that is.
const { samplePlan } = await import("./sample-plans.mjs");
const firstProblem = (plan) => { try { api.compileAndValidateLessonPlan(plan); return "compiled"; } catch (error) { return error.path; } };

test("an invalid plot title is reported before its samples are evaluated", () => {
  const plot = samplePlan("function_plot");
  plot.sections[0].moments[0].actions[0].content.parameters = { expression: "1/x", title: 123 };
  plot.numbers[0] = { ...plot.numbers[0], min: 0, max: 2, initial: 1 };
  assert.match(firstProblem(plot), /\.parameters\.title$/);
});

test("an invalid implicit-surface title is reported as a title, not an expression", () => {
  const surface = samplePlan("implicit_surface_with_section");
  surface.sections[0].moments[0].actions[0].content.parameters = { expression: "x^2+y^2+z^2", level: 1, title: 123 };
  assert.match(firstProblem(surface), /\.parameters\.title$/);
  surface.sections[0].moments[0].actions[0].content.parameters = { expression: "x^2+y^2+z^2", level: -1 };
  assert.match(firstProblem(surface), /\.parameters\.expression$/, "a surface with no points is still an expression problem");
});

test("an unrenderable implicit surface is reported before its invalid title", () => {
  const surface = samplePlan("implicit_surface_with_section");
  const moment = surface.sections[0].moments[0];
  const visual = moment.actions[0].content;
  delete surface.numbers;
  delete visual.numbers;
  moment.actions = moment.actions.filter((action) => action.action !== "animate");
  visual.parameters = { expression: "x^2+y^2+z^2", level: -1, title: " " };
  assert.match(firstProblem(surface), /\.parameters\.expression$/);
});
