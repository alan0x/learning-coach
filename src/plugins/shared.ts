// Tools every subject uses. Today it holds the process diagram; notes, formulas,
// graphs and sliders are still core Coach and move here later in P1.
// Subject plugin (decision 0012, draft). Coach assembles its recipe registry
// and the recipe rules in its prompts from the installed plugins.
import type { CoachSubjectPlugin } from "./types.js";

export const SHARED_RECIPES = {
  process_diagram: {
    parts: ["whole", "first_step", "current_step", "last_step"],
    number_inputs: [],
    number_input_policies: [],
    parameter_names: ["title", "steps"],
    model_parameter_names: ["title", "steps"],
    required_model_schema_parameters: ["steps"],
    semantic_parameters: ["steps"],
    output_kinds: ["diagram"],
    student_controls: [],
    required_features: ["ordered_process_steps"],
    model_guidance: "概念或步骤流程图；没有几何移动，也不接受数值输入",
  },
} as const;

export const SHARED_PLUGIN = {
  manifest: { id: "shared", version: "0.1.0", depends: {} },
  recipes: SHARED_RECIPES,
  prompt_rules: {
    "outline.visual_choice": "ordered_process_steps 仅是静态流程。",
    "section.constructions": "process_diagram 无数值/动画。",
  },
} as const satisfies CoachSubjectPlugin;
