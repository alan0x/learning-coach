import { MATH_PLUGIN } from "./math.js";
import { PHYSICS_PLUGIN } from "./physics.js";
import { SHARED_PLUGIN } from "./shared.js";
import { CHEMISTRY_PLUGIN } from "./chemistry.js";
import { BIOLOGY_PLUGIN } from "./biology.js";
import { EARTH_SPACE_PLUGIN } from "./earth-space.js";
import type { CoachSubjectPlugin, PromptSlot } from "./types.js";

export type { CoachSubjectPlugin, PromptSlot } from "./types.js";
export { MATH_PLUGIN, PHYSICS_PLUGIN, CHEMISTRY_PLUGIN, BIOLOGY_PLUGIN, EARTH_SPACE_PLUGIN, SHARED_PLUGIN };

/** Installed plugins, in the order their prompt sentences are joined. */
export const INSTALLED_PLUGINS: readonly CoachSubjectPlugin[] = [
  MATH_PLUGIN, PHYSICS_PLUGIN, CHEMISTRY_PLUGIN, BIOLOGY_PLUGIN, EARTH_SPACE_PLUGIN, SHARED_PLUGIN,
];

const ALL_RECIPES = { ...MATH_PLUGIN.recipes, ...PHYSICS_PLUGIN.recipes, ...SHARED_PLUGIN.recipes };
type AllRecipes = typeof ALL_RECIPES;

/**
 * The order recipes appear in provider schemas and in the model's recipe
 * catalog. It is the order before plugins existed, so every request stays
 * byte-identical (test/request-hashes.test.mjs). Changing it changes requests.
 */
export const RECIPE_CATALOG_ORDER = [
  "function_plot",
  "unit_circle_projection",
  "circle_polygon_bounds",
  "circle_and_arc",
  "spring_and_mass",
  "cube_with_section",
  "function_surface_with_section",
  "implicit_surface_with_section",
  "coordinate_circle",
  "rectangle_unit_square_array",
  "geometric_rearrangement",
  "circle_area_rearrangement",
  "process_diagram",
] as const satisfies readonly (keyof AllRecipes)[];

/**
 * Recipes that are built and tested but not yet offered in AI lessons. A new
 * recipe changes every provider request, so it joins the catalog only after
 * it passes the speed gate (decision E5). Until then a measurement run
 * offers it by naming it in LEARNING_COACH_TRIAL_RECIPES (comma-separated);
 * a trial recipe goes after the catalog.
 */
export const TRIAL_RECIPES = ["constant_speed_motion", "number_line"] as const satisfies readonly (keyof AllRecipes)[];

/** The trial recipes a comma-separated list names, in TRIAL_RECIPES order. */
export function enabledTrialRecipes(list: string | undefined): Array<typeof TRIAL_RECIPES[number]> {
  const named = new Set((list ?? "").split(",").map((name) => name.trim()).filter(Boolean));
  return TRIAL_RECIPES.filter((name) => named.has(name));
}

const processEnvironment = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

/** Recipes offered to the model, in catalog order. */
export const OFFERED_RECIPES: ReadonlyArray<typeof RECIPE_CATALOG_ORDER[number] | typeof TRIAL_RECIPES[number]> = [
  ...RECIPE_CATALOG_ORDER, ...enabledTrialRecipes(processEnvironment?.LEARNING_COACH_TRIAL_RECIPES),
];

type RegistryName = typeof RECIPE_CATALOG_ORDER[number] | typeof TRIAL_RECIPES[number];
export const PLUGIN_RECIPE_REGISTRY = Object.fromEntries(
  OFFERED_RECIPES.map((name) => [name, ALL_RECIPES[name]]),
) as { readonly [Name in RegistryName]: AllRecipes[Name] };

/** The plugin that owns each recipe. */
export const RECIPE_PLUGIN = Object.fromEntries(
  INSTALLED_PLUGINS.flatMap((plugin) => Object.keys(plugin.recipes).map((name) => [name, plugin.manifest.id])),
) as Record<typeof RECIPE_CATALOG_ORDER[number], string>;

/** Provider-schema properties per recipe, from the plugin that owns it. */
export const RECIPE_SCHEMA_PROPERTIES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = Object.assign(
  {}, ...INSTALLED_PLUGINS.map((plugin) => plugin.schema_properties),
);

/**
 * The order of visual parameter properties in provider schemas: the order
 * before plugins existed, so every schema stays byte-identical. A property no
 * entry lists goes after these, in the order the recipes declare it.
 */
export const SCHEMA_PROPERTY_ORDER = [
  "title", "projection", "x_label", "y_label", "formulas", "sample_x_numbers",
  "expression", "section_axis", "section_value", "level", "radius", "angle",
  "radius_expression", "center_x", "center_y", "construction", "leg_a", "leg_b", "steps", "speed", "label_style",
] as const;

/** One prompt bullet: its core text and the installed plugins' sentences, or "" when empty. */
export function promptSlot(slot: PromptSlot, core = "", plugins: readonly CoachSubjectPlugin[] = INSTALLED_PLUGINS): string {
  const text = core + plugins.map((plugin) => plugin.prompt_rules[slot] ?? "").join("");
  return text ? `- ${text}` : "";
}
