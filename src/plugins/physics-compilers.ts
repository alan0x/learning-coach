// Recipe compilers of the physics plugin: validated recipe parameters to OLL authoring actions.
import { buildSpringAndMass } from "octos-lesson-language/plugin-physics";
import { compileText } from "../lesson-text.js";
import { type CompiledVisual } from "../compiled-visual-reuse.js";
import { type LessonPlan, type LessonPlanVisualContent } from "../lesson-plan.js";
import { variableAlias, parameters, allowParameterKeys, optionalText, place, numberDefinition, angleScaleForUnit, scaledAngleExpression, type VisualCompiler } from "../recipe-kit.js";

function compileSpringAndMass(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title"], path);
  const number = content.numbers?.[0];
  const phaseDefinition = number ? numberDefinition(plan, number, `${path}.numbers[0]`) : undefined;
  const phaseScale = angleScaleForUnit(phaseDefinition?.unit);
  const phase = (phaseDefinition?.initial ?? 0) * phaseScale;
  const variable = number ? variableAlias(number) : undefined;
  // Built by the physics plugin's shared layer (octos-lesson-language/plugin-physics).
  const built = buildSpringAndMass({
    as: base, role, place: placement,
    ...(variable && phaseDefinition ? {
      phase: {
        expression: scaledAngleExpression(variable, phaseScale),
        initial: phase,
        min: phaseDefinition.min * phaseScale,
        max: phaseDefinition.max * phaseScale,
      },
    } : { fixed_phase: phase }),
    text: {
      title: optionalText(input.title, compileText(plan, "弹簧振子的往复运动"), `${path}.title`),
      displacement: compileText(plan, "位移"),
      anchor: compileText(plan, "固定端"),
      equilibrium: compileText(plan, "平衡位置"),
      mass: compileText(plan, "物体"),
      restoring_force: compileText(plan, "回复力"),
      plot_title: compileText(plan, "位移随相位变化"),
      phase: compileText(plan, "相位"),
      current_state: compileText(plan, "当前状态"),
      link_label: compileText(plan, "同一时刻的位移"),
      group_label: compileText(plan, "弹簧运动与函数图像"),
    },
  });
  return { actions: built.actions, whole: built.whole, parts: new Map(Object.entries(built.parts)) };
}


export const PHYSICS_COMPILERS = {
  spring_and_mass: compileSpringAndMass,
} satisfies Record<string, VisualCompiler>;
