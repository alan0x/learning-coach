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
  constant_speed_motion: {
    parts: ["whole", "start", "object", "track", "travelled", "primary_curve", "moving_point", "primary_control"],
    number_inputs: ["time", "speed"],
    number_input_policies: [{ kind: "bounded", min: 0, max: 1_000_000 }, { kind: "positive" }],
    parameter_names: ["title", "speed"],
    model_parameter_names: ["title", "speed"],
    required_model_schema_parameters: [],
    semantic_parameters: ["speed"],
    output_kinds: ["geometry", "plot"],
    student_controls: ["slider"],
    required_features: ["uniform_motion", "distance_time_graph"],
    model_guidance: "匀速直线运动：物体沿直线前进，路程—时间图像是过原点的直线（s = v t）；两个数值依次控制时间和速度，速度改变直线倾斜程度。适合速度、路程与时间关系、读路程—时间图像；不用于变速、加速或曲线运动",
  },
} as const;

export const PHYSICS_PLUGIN = {
  // The manifest and the Jev subject line are the OLL shared layer's.
  manifest: PHYSICS_PLUGIN_MANIFEST,
  subject: { description: PHYSICS_SUBJECT_DESCRIPTION },
  recipes: PHYSICS_RECIPES,
  schema_properties: {
    constant_speed_motion: { speed: { type: "number", minimum: 0 } },
  },
  prompt_rules: {},
} as const satisfies CoachSubjectPlugin;
