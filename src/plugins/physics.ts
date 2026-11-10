// Physics: motion and forces, energy, circuits, light, sound, buoyancy.
// Subject plugin (decision 0012, draft). Coach assembles its recipe registry
// and the recipe rules in its prompts from the installed plugins.
import { PHYSICS_PLUGIN_MANIFEST, PHYSICS_SUBJECT_DESCRIPTION } from "octos-lesson-language/plugin-physics";
import type { CoachSubjectPlugin } from "./types.js";

export const PHYSICS_RECIPES = {
  spring_and_mass: {
    parts: ["whole", "spring", "mass", "equilibrium", "force_arrow", "primary_curve", "moving_point", "primary_control"],
    number_inputs: ["phase"],
    number_input_policies: [{ kind: "angle" }],
    parameter_names: ["title"],
    model_parameter_names: ["title"],
    required_model_schema_parameters: [],
    semantic_parameters: [],
    output_kinds: ["geometry", "plot"],
    student_controls: ["slider"],
    required_features: ["spring_mass", "cartesian_function_curve"],
    model_guidance: "弹簧、物体、平衡位置、回复力和余弦变化曲线共享相位",
  },
} as const;

export const PHYSICS_PLUGIN = {
  // The manifest and the Jev subject line are the OLL shared layer's.
  manifest: PHYSICS_PLUGIN_MANIFEST,
  subject: { description: PHYSICS_SUBJECT_DESCRIPTION },
  recipes: PHYSICS_RECIPES,
  schema_properties: {},
  prompt_rules: {},
} as const satisfies CoachSubjectPlugin;
