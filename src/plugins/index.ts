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
  "function_surface_with_section",
  "implicit_surface_with_section",
  "coordinate_circle",
  "rectangle_unit_square_array",
  "geometric_rearrangement",
  "circle_area_rearrangement",
  "process_diagram",
  // Number line (OLL decision 0013) and its question types (0016): adopted 2026-11-12 after the gate on
  // the rewritten cards passed (Coach docs/TRIAL_RECIPE_SPEED_NUMBER_LINE_2026-11-11.md, runs 11 and 11b).
  // They stay last, where the gate measured them.
  "number_line",
  "number_line_compare",
  "number_line_solution",
  "number_line_rounding",
  // Number line in steps (OLL decision 0017 §2): adopted by the owner on 2026-11-15 after the reduced trial
  // (Coach docs/PLOT_TRIAL_2026-11-15.md), ahead of the combined speed gate. Last, where the trial put it.
  "number_line_steps",
  // 3D solids (OLL decision 0019, as amended by 0020): adopted 2026-11-18 after the revised speed gate passed
  // at 80 pairs (Coach docs/SOLIDS_PROBE_2026-11-17.md, gates 1–1e). Last, where the gate measured it. It
  // retired cube_with_section (owner, 2026-11-17): that recipe stays defined, so old lessons keep their
  // meaning, but it is no longer offered.
  "solid_3d",
] as const satisfies readonly (keyof AllRecipes)[];

/**
 * Recipes no longer offered: a newer recipe covers what they showed. They stay defined so their code and
 * tests remain readable; nothing offers or compiles them. cube_with_section: retired when solid_3d switched
 * on (owner, 2026-11-17; switch-on 2026-11-18).
 */
export const RETIRED_RECIPES = ["cube_with_section"] as const satisfies readonly (keyof AllRecipes)[];

/**
 * Recipes that are built and tested but not yet offered in AI lessons. A new
 * recipe changes every provider request, so it joins the catalog only after
 * it passes the speed gate (decision E5). Until then a measurement run
 * offers it by naming it in LEARNING_COACH_TRIAL_RECIPES (comma-separated);
 * a trial recipe goes after the catalog.
 */
export const TRIAL_RECIPES = ["constant_speed_motion", "fraction_model", "base_ten_trade"] as const satisfies readonly (keyof AllRecipes)[];

/** The trial recipes a comma-separated list names, in TRIAL_RECIPES order. */
export function enabledTrialRecipes(list: string | undefined): Array<typeof TRIAL_RECIPES[number]> {
  const named = new Set((list ?? "").split(",").map((name) => name.trim()).filter(Boolean));
  return TRIAL_RECIPES.filter((name) => named.has(name));
}

const processEnvironment = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

/**
 * Catalog recipes a trial recipe retires while it is offered, so a measurement run sees the catalog as it
 * will be at switch-on. (solid_3d retired cube_with_section this way until it switched on, 2026-11-18.)
 */
export const TRIAL_RETIRES: Readonly<Partial<Record<typeof TRIAL_RECIPES[number], readonly (typeof RECIPE_CATALOG_ORDER[number])[]>>> = {};

/** The catalog with the named trial recipes offered, and what they retire left out. */
export function offeredRecipes(trials: ReadonlyArray<typeof TRIAL_RECIPES[number]>): Array<typeof RECIPE_CATALOG_ORDER[number] | typeof TRIAL_RECIPES[number]> {
  const retired = new Set<string>(trials.flatMap((name) => TRIAL_RETIRES[name] ?? []));
  return [...RECIPE_CATALOG_ORDER.filter((name) => !retired.has(name)), ...trials];
}

/** Recipes offered to the model, in catalog order. */
export const OFFERED_RECIPES: ReadonlyArray<typeof RECIPE_CATALOG_ORDER[number] | typeof TRIAL_RECIPES[number]> =
  offeredRecipes(enabledTrialRecipes(processEnvironment?.LEARNING_COACH_TRIAL_RECIPES));

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
  // The trading mat trial recipe (decision 0023): its six numbers first. The first combined reply's schema
  // lists every offered recipe's fields and requires none, and fields written late were left out (fraction
  // probe 2), so the mat's values come before everything; ones first, so a tens-and-ones question writes the
  // hundreds last, as 0. Requests without the trial do not list them, so their order is unchanged.
  "lesson_ones", "lesson_tens", "lesson_hundreds", "practice_ones", "practice_tens", "practice_hundreds",
  "title", "projection", "x_label", "y_label", "formulas", "sample_x_numbers", "points",
  "expression", "section_axis", "section_value", "level", "radius", "angle",
  "radius_expression", "center_x", "center_y", "construction", "leg_a", "leg_b", "steps", "speed", "label_style", "relation", "place",
  "marks", "pieces",
  // The 3D solids trial recipe (decision 0019); last, so requests without it keep their order.
  "solids", "join", "show", "interaction",
  // The fraction model trial recipe (decision 0021); last, so requests without it keep their order.
  "fractions", "fraction_shape", "fraction_view", "split_each_part",
] as const;

/** One prompt bullet: its core text and the installed plugins' sentences, or "" when empty. */
export function promptSlot(slot: PromptSlot, core = "", plugins: readonly CoachSubjectPlugin[] = INSTALLED_PLUGINS): string {
  const text = core + plugins.map((plugin) => plugin.prompt_rules[slot] ?? "").join("");
  return text ? `- ${text}` : "";
}
