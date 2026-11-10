// Recipe compilers of the shared plugin: validated recipe parameters to OLL authoring actions.
import { buildProcessDiagram } from "octos-lesson-language/plugin-shared";
import { compileText } from "../lesson-text.js";
import { type CompiledVisual } from "../compiled-visual-reuse.js";
import { type LessonPlan, type LessonPlanVisualContent } from "../lesson-plan.js";
import { parameters, allowParameterKeys, optionalText, optionalStringArray, place, type VisualCompiler } from "../recipe-kit.js";

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
  // Built by the shared plugin's shared layer, which Studio also uses.
  const built = buildProcessDiagram({
    as: base, role, place: placement,
    title: optionalText(input.title, compileText(plan, "过程图"), `${path}.title`),
    steps: steps.map((label) => ({ label })),
    link_label: compileText(plan, "下一步"),
  });
  return { actions: built.actions, whole: built.whole, parts: new Map(Object.entries(built.parts)) };
}


export const SHARED_COMPILERS = {
  process_diagram: compileProcessDiagram,
} satisfies Record<string, VisualCompiler>;
