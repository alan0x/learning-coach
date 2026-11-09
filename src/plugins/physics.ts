// Physics: motion and forces, energy, circuits, light, sound, buoyancy.
// Subject plugin (decision 0012, draft). Coach assembles its recipe registry
// and the recipe rules in its prompts from the installed plugins.
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
  manifest: { id: "physics", version: "0.1.0", depends: { shared: "0.1.0" } },
  subject: { description: { "zh-CN": "物理：运动与力、能量、电路、光、声、浮力等" } },
  recipes: PHYSICS_RECIPES,
  prompt_rules: {},
} as const satisfies CoachSubjectPlugin;
