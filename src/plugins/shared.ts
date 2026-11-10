// Tools every subject uses. Today it holds the process diagram; notes, formulas,
// graphs and sliders are still core Coach and move here later in P1.
// Subject plugin (decision 0012, draft). Coach assembles its recipe registry
// and the recipe rules in its prompts from the installed plugins.
import { SHARED_PLUGIN_MANIFEST } from "octos-lesson-language/plugin-shared";
import type { CoachSubjectPlugin } from "./types.js";

export const PROCESS_DIAGRAM_CONTRACT = {
  min_steps: 2,
  max_steps: 8,
  max_step_characters: 80,
  max_title_characters: 120,
} as const;

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
  manifest: SHARED_PLUGIN_MANIFEST,
  recipes: SHARED_RECIPES,
  schema_properties: {
    process_diagram: {
      // Strings carry no length keywords; the validator enforces them.
      steps: { type: "array", minItems: PROCESS_DIAGRAM_CONTRACT.min_steps, maxItems: PROCESS_DIAGRAM_CONTRACT.max_steps, items: { type: "string" } },
    },
  },
  prompt_rules: {
    "outline.visual_choice": "ordered_process_steps 仅是静态流程。",
    "section.constructions": "process_diagram 无数值/动画。",
  },
} as const satisfies CoachSubjectPlugin;
