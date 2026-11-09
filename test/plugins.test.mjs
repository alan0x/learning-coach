import assert from "node:assert/strict";
import test from "node:test";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const { INSTALLED_PLUGINS, LESSON_PLAN_CAPABILITY_REGISTRY, RECIPE_CATALOG_ORDER, RECIPE_PLUGIN, promptSlot } = api;

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
