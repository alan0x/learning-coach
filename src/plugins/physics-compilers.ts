// Recipe compilers of the physics plugin: validated recipe parameters to OLL authoring actions.
import { buildConstantSpeedMotion, buildSpringAndMass } from "octos-lesson-language/plugin-physics";
import { compileText } from "../lesson-text.js";
import { type CompiledVisual } from "../compiled-visual-reuse.js";
import { type LessonPlan, type LessonPlanVisualContent } from "../lesson-plan.js";
import { variableAlias, parameters, allowParameterKeys, optionalText, optionalNumber, fail, place, numberDefinition, angleScaleForUnit, scaledAngleExpression, type VisualCompiler } from "../recipe-kit.js";

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

/** Time shown when the visual binds no time number: the object has reached the end of its run. */
const STILL_MOTION_TIME = 10;
const DEFAULT_SPEED = 2;

/** Distance and time units from the speed's unit ("m/s" → m and s), unless the time number names its own. */
export function motionUnits(speedUnit: string | undefined, timeUnit: string | undefined): { distance: string; time: string } {
  if (!speedUnit?.trim()) return { distance: "m", time: timeUnit?.trim() || "s" };
  // A speed unit that is not "distance/time" (such as 米每秒) names no distance unit the program can show.
  const [distance = "", time = ""] = speedUnit.includes("/") ? speedUnit.split("/").map((part) => part.trim()) : [];
  return { distance, time: timeUnit?.trim() || time };
}

function compileConstantSpeedMotion(
  base: string,
  content: LessonPlanVisualContent,
  role: string,
  placement: ReturnType<typeof place>,
  plan: LessonPlan,
  path: string,
): CompiledVisual {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "speed"], path);
  const [timeNumber, speedNumber] = content.numbers ?? [];
  const timeDefinition = timeNumber ? numberDefinition(plan, timeNumber, `${path}.numbers[0]`) : undefined;
  const speedDefinition = speedNumber ? numberDefinition(plan, speedNumber, `${path}.numbers[1]`) : undefined;
  const speed = speedDefinition?.initial ?? optionalNumber(input.speed, DEFAULT_SPEED, `${path}.speed`);
  if (!(speed > 0)) fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.speed`, "speed must be positive");
  if (timeDefinition && !(timeDefinition.max > 0)) {
    fail("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.numbers[0]`, "time must be able to grow past 0");
  }
  const units = motionUnits(speedDefinition?.unit, timeDefinition?.unit);
  const unitSuffix = (unit: string) => unit ? compileText(plan, "（{{v0}}）", { v0: unit }) : "";
  // Built by the physics plugin's shared layer (octos-lesson-language/plugin-physics).
  const built = buildConstantSpeedMotion({
    as: base, role, place: placement,
    time: timeNumber && timeDefinition
      ? { expression: variableAlias(timeNumber), initial: timeDefinition.initial, max: timeDefinition.max }
      : { initial: STILL_MOTION_TIME, max: STILL_MOTION_TIME },
    speed: speedNumber && speedDefinition
      ? { expression: variableAlias(speedNumber), initial: speed, max: speedDefinition.max }
      : { initial: speed, max: speed },
    text: {
      title: optionalText(input.title, compileText(plan, "匀速直线运动"), `${path}.title`),
      start: compileText(plan, "起点"),
      object: compileText(plan, "运动物体"),
      distance_readout: compileText(plan, "物体 s = "),
      distance_unit: units.distance,
      distance_axis: `${compileText(plan, "路程 s")}${unitSuffix(units.distance)}`,
      time_axis: `${compileText(plan, "时间 t")}${unitSuffix(units.time)}`,
      plot_title: compileText(plan, "路程随时间变化"),
      curve_label: "s = v t",
      current_state: compileText(plan, "当前状态"),
      link_label: compileText(plan, "同一时刻"),
      group_label: compileText(plan, "匀速运动与路程—时间图像"),
    },
  });
  return { actions: built.actions, whole: built.whole, parts: new Map(Object.entries(built.parts)) };
}

export const PHYSICS_COMPILERS = {
  spring_and_mass: compileSpringAndMass,
  constant_speed_motion: compileConstantSpeedMotion,
} satisfies Record<string, VisualCompiler>;
