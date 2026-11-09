// Recipe hooks of the shared plugin.
import type { RecipeHooks } from "./hooks.js";
import { PROCESS_DIAGRAM_CONTRACT } from "./shared.js";

export const SHARED_HOOKS: Record<string, RecipeHooks> = {
  process_diagram: {
    removal_reason(content) {
      const input = content.parameters ?? {};
      const steps = input.steps;
      const title = input.title;
      if (!Array.isArray(steps)) return "missing_steps";
      if (steps.length < PROCESS_DIAGRAM_CONTRACT.min_steps || steps.length > PROCESS_DIAGRAM_CONTRACT.max_steps) {
        return "step_count_out_of_range";
      }
      if (!steps.every((step) => (
        typeof step === "string"
        && step.trim().length >= 1
        && step.trim().length <= PROCESS_DIAGRAM_CONTRACT.max_step_characters
      ))) {
        return "step_text_out_of_range";
      }
      if (title !== undefined && (
        typeof title !== "string"
        || title.trim().length < 1
        || title.trim().length > PROCESS_DIAGRAM_CONTRACT.max_title_characters
      )) {
        return "title_text_out_of_range";
      }
      return undefined;
    },
  },
};
