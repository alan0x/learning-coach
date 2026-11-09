// Recipe compilers of the physics plugin: validated recipe parameters to OLL authoring actions.
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
  const phaseExpression = variable ? scaledAngleExpression(variable, phaseScale) : undefined;
  const motion = `${base}-motion`;
  const plot = `${base}-plot`;
  const plotPhaseMin = phaseDefinition ? phaseDefinition.min * phaseScale : 0;
  const plotPhaseMax = phaseDefinition ? phaseDefinition.max * phaseScale : Math.PI * 2;
  const geometry: Record<string, unknown> = {
    title: optionalText(input.title, compileText(plan, "弹簧振子的往复运动"), `${path}.title`),
    axes: { x: { min: -1.5, max: 1.5, label: compileText(plan, "位移") }, y: { min: -0.6, max: 0.6 }, equal_scale: true },
    points: [
      { as: "anchor", x: -1.25, y: 0, label: compileText(plan, "固定端") },
      { as: "equilibrium", x: 0, y: 0, label: compileText(plan, "平衡位置") },
      { as: "mass", x: Math.cos(phase), y: 0, label: compileText(plan, "物体") },
      { as: "force-tip", x: Math.cos(phase) * 0.5, y: 0, visible: false },
    ],
    segments: [
      { as: "spring", from: "anchor", to: "mass", style: "solid" },
      { as: "force-arrow", from: "mass", to: "force-tip", style: "solid", label: compileText(plan, "回复力") },
    ],
    ...(variable ? {
      bindings: [
        { target: "mass.x", expression: `cos(${phaseExpression})` },
        { target: "force-tip.x", expression: `0.5*cos(${phaseExpression})` },
      ],
    } : {}),
  };
  const plotContent: Record<string, unknown> = {
    title: compileText(plan, "位移随相位变化"),
    axes: { x: { min: plotPhaseMin, max: plotPhaseMax, label: compileText(plan, "相位") }, y: { min: -1.2, max: 1.2, label: compileText(plan, "位移") } },
    curves: [{ as: "primary-curve", expression: "cos(x)", label: "x = cos(t)" }],
    points: [{ as: "moving-point", x: phase, y: Math.cos(phase), label: compileText(plan, "当前状态") }],
    ...(variable ? {
      bindings: [
        { target: "moving-point.x", expression: phaseExpression },
        { target: "moving-point.y", expression: `cos(${phaseExpression})` },
      ],
    } : {}),
  };
  return {
    actions: [
      { do: "write", as: motion, kind: "geometry", role, content: geometry, place: placement },
      { do: "write", as: plot, kind: "plot", role, content: plotContent, place: { relation: "right_of", anchor: motion, gap: "normal" } },
      { do: "connect", as: `${base}-link`, from: motion, to: plot, relation: "same_state", label: compileText(plan, "同一时刻的位移") },
      { do: "group", as: base, role, label: compileText(plan, "弹簧运动与函数图像"), members: [motion, plot] },
    ],
    whole: base,
    parts: new Map([
      ["whole", base], ["spring", `${motion}#spring`], ["mass", `${motion}#mass`],
      ["equilibrium", `${motion}#equilibrium`], ["force_arrow", `${motion}#force-arrow`],
      ["primary_curve", `${plot}#primary-curve`], ["moving_point", `${plot}#moving-point`],
      ...(variable ? [["primary_control", `${plot}#moving-point`]] as Array<[string, string]> : []),
    ]),
  };
}


export const PHYSICS_COMPILERS = {
  spring_and_mass: compileSpringAndMass,
} satisfies Record<string, VisualCompiler>;
