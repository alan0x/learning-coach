import { MATH_PLUGIN } from "./math.js";
import { PHYSICS_PLUGIN } from "./physics.js";
import { SHARED_PLUGIN } from "./shared.js";
import type { CoachSubjectPlugin, PromptSlot } from "./types.js";

export type { CoachSubjectPlugin, PromptSlot } from "./types.js";
export { MATH_PLUGIN, PHYSICS_PLUGIN, SHARED_PLUGIN };

/** Installed plugins, in the order their prompt sentences are joined. */
export const INSTALLED_PLUGINS: readonly CoachSubjectPlugin[] = [MATH_PLUGIN, PHYSICS_PLUGIN, SHARED_PLUGIN];

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

export const PLUGIN_RECIPE_REGISTRY = Object.fromEntries(
  RECIPE_CATALOG_ORDER.map((name) => [name, ALL_RECIPES[name]]),
) as { readonly [Name in typeof RECIPE_CATALOG_ORDER[number]]: AllRecipes[Name] };

/** The plugin that owns each recipe. */
export const RECIPE_PLUGIN = Object.fromEntries(
  INSTALLED_PLUGINS.flatMap((plugin) => Object.keys(plugin.recipes).map((name) => [name, plugin.manifest.id])),
) as Record<typeof RECIPE_CATALOG_ORDER[number], string>;

/** One prompt bullet: its core text and the installed plugins' sentences, or "" when empty. */
export function promptSlot(slot: PromptSlot, core = "", plugins: readonly CoachSubjectPlugin[] = INSTALLED_PLUGINS): string {
  const text = core + plugins.map((plugin) => plugin.prompt_rules[slot] ?? "").join("");
  return text ? `- ${text}` : "";
}
