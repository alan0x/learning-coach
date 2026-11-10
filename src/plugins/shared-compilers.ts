// Recipe compilers of the shared plugin: validated recipe parameters to OLL authoring actions.
import { compileText } from "../lesson-text.js";
import { type CompiledVisual } from "../compiled-visual-reuse.js";
import { type LessonPlan, type LessonPlanVisualContent } from "../lesson-plan.js";
import { pad, parameters, allowParameterKeys, optionalText, optionalStringArray, place, type VisualCompiler } from "../recipe-kit.js";

function compileProcessDiagram(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "steps"], path);
  const steps = optionalStringArray(input.steps, [compileText(plan, "开始"), compileText(plan, "观察变化"), compileText(plan, "得到结论")], `${path}.steps`);
  const elements = steps.map((label, index) => ({ as: `step-${pad(index + 1)}`, label }));
  const edges = steps.slice(1).map((_label, index) => ({
    as: `edge-${pad(index + 1)}`,
    from: `step-${pad(index + 1)}`,
    to: `step-${pad(index + 2)}`,
    label: compileText(plan, "下一步"),
  }));
  const first = `${base}#step-01`;
  const last = `${base}#step-${pad(steps.length)}`;
  const current = `${base}#step-${pad(Math.min(2, steps.length))}`;
  return {
    actions: [{
      do: "write", as: base, kind: "diagram", role,
      content: { title: optionalText(input.title, compileText(plan, "过程图"), `${path}.title`), elements, edges },
      place: placement,
    }],
    whole: base,
    parts: new Map([["whole", base], ["first_step", first], ["current_step", current], ["last_step", last]]),
  };
}


export const SHARED_COMPILERS = {
  process_diagram: compileProcessDiagram,
} satisfies Record<string, VisualCompiler>;
