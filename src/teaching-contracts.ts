import { LessonPlanError, type LessonPlan, type LessonPlanMathToken, type LessonPlanVisualContent } from "./lesson-plan.js";

/** Program-only facts. Never serialized into model catalogs or response schemas. */
export const TEACHING_CONTRACTS = {
  circle_area_rearrangement: {concept:"circle_area", relation:"pi*r^2", preserves:"sector_area", finite_shape:"curved_edges"},
  geometric_rearrangement: {constructions:["right_triangle_square","square_area_identity","triangle_to_rectangle"], excludes:["circle_area_proof"]},
  function_plot: {static_sample_limit:2, input:"slider", feedback:"secant", singularity:"undefined"},
} as const;

// Conservative polynomial-degree check over the already validated postfix tokens.
function affineTokens(tokens: LessonPlanMathToken[]): boolean {
  const stack: number[] = [];
  for (const token of tokens) {
    if (token.kind === "input") stack.push(1);
    else if (["literal", "constant", "number"].includes(token.kind)) stack.push(0);
    else if (token.kind === "negate") continue;
    else if (token.kind === "operator") {
      const b = stack.pop(), a = stack.pop();
      if (a === undefined || b === undefined) return false;
      if (token.operator === "add" || token.operator === "subtract") stack.push(Math.max(a,b));
      else if (token.operator === "multiply") stack.push(a+b);
      else if (token.operator === "divide" && b === 0) stack.push(a);
      else return false;
    } else return false;
  }
  return stack.length === 1 && stack[0] <= 1;
}

export function fixedLineSamples(visual: LessonPlanVisualContent): boolean {
  const tokens = visual.parameters?.expression_tokens;
  return visual.capability === "function_plot" && visual.numbers?.length === 2
    && Array.isArray(tokens)
    && !(tokens as LessonPlanMathToken[]).some(t => t.kind === "number")
    && affineTokens(tokens as LessonPlanMathToken[]);
}

/** Normalize only an input mechanism whose binding is known, never a math claim. */
export function normalizePlotInputInstructions(plan: LessonPlan): void {
  const visuals = plan.sections.flatMap(s => s.moments.flatMap(m => m.actions))
    .filter(a => a.action === "create" && a.kind === "visual")
    .map(a => (a as {content:LessonPlanVisualContent}).content);
  if (visuals.length !== 1 || visuals[0].capability !== "function_plot" || visuals[0].numbers?.length !== 2) return;
  const tokens = visuals[0].parameters?.expression_tokens;
  if (Array.isArray(tokens) && (tokens as LessonPlanMathToken[]).some(t => t.kind === "number")) return;
  const samplesFixedLine = fixedLineSamples(visuals[0]);
  for (const section of plan.sections) for (const moment of section.moments) {
    moment.narration = moment.narration
      .replace(/(?:移动|调整|拖动|拖拽)点\s*([AB])\s*(?:或|和|、)\s*(?:点\s*)?([AB])(?:的)?(?:位置|横坐标)/g,
        (_match, first:string, second:string) => `调整点 ${first} 或点 ${second} 的横坐标滑块`)
      .replace(/(?:直接)?拖(?:动|拽)(?:图上|图中|曲线上)?(?:的)?点\s*([AB])/g,
        (_match, label:string) => `调整点 ${label} 的横坐标滑块`);
    if (samplesFixedLine) {
      moment.narration = moment.narration
        .replace(/[^。！？!?；;]*斜率如何保持不变或发生变化[^。！？!?；;]*/g,
          "观察 Δx 与 Δy 如何同比例变化，并验证斜率保持不变")
        .replace(/[^。！？!?；;]*(?:纵向|高度|纵坐标).{0,12}(?:变大|改变|变化).{0,12}(?:横向|横坐标).{0,12}不变[^。！？!?；;]*/g,
          "调整点 A 或点 B 的横坐标滑块，观察 Δx 与 Δy 同比例变化，斜率保持不变")
        .replace(/[^。！？!?；;]*(?:看看|观察).{0,36}(?:斜率|倾斜程度).{0,32}(?:变化|改变)[^。！？!?；;]*/g,
          "调整点 A 或点 B 的横坐标滑块，观察 Δx 与 Δy 同比例变化，斜率保持不变")
        .replace(/[^。！？!?；;]*(?:调整|移动|拖动|拖拽).{0,36}点.{0,36}(?:观察|看看).{0,36}(?:斜率|倾斜程度)[^。！？!?；;]*/g,
          "调整点 A 或点 B 的横坐标滑块，观察 Δx 与 Δy 同比例变化，斜率保持不变");
    }
  }
  if (samplesFixedLine) for (const section of plan.sections) {
    for (const activity of section.student_activities ?? []) {
      if (activity.kind !== "number_target") continue;
      activity.prompt = activity.prompt
        .replace(/观察.{0,24}斜率.{0,12}(?:变化|改变)/g,"观察 Δx 与 Δy 同比例变化，并验证斜率保持不变")
        .replace(/改变.{0,16}(?:倾斜程度|斜率)/g,"验证固定直线的斜率保持不变");
      activity.hints = activity.hints.map((hint) => (
        /变陡|变平缓|(?:倾斜程度|倾斜状态|陡峭程度|比值).{0,16}(?:改变|变化)|(?:改变|变化).{0,16}(?:倾斜程度|斜率|陡峭程度|比值)/.test(hint)
          ? "观察 Δx 与 Δy 的比值是否保持不变"
          : hint
      ));
      if (activity.success_message
        && !/不变|保持/.test(activity.success_message)
        && /(?:改变|变化|更新|影响).{0,20}(?:倾斜程度|斜率|陡峭程度|比值)|(?:倾斜程度|斜率|陡峭程度|比值).{0,20}(?:改变|变化|更新|影响)|如何随.{0,20}变化/.test(activity.success_message)) {
        activity.success_message = "完成！移动取样点后，Δx 与 Δy 同比例变化，固定直线的斜率保持不变。";
      }
    }
  }
}

/** Narrow guards for known severe failures, not a claim to parse all prose. */
export function validateTeachingClaims(plan: LessonPlan): void {
  const plots = plan.sections.flatMap(section => section.moments.flatMap(moment => moment.actions))
    .filter(action => action.action === "create" && action.kind === "visual")
    .map(action => (action as {content:LessonPlanVisualContent}).content)
    .filter(visual => visual.capability === "function_plot");
  const hasCircleArea = plan.sections.some(section => section.moments.some(moment => moment.actions.some(action =>
    action.action === "create" && action.kind === "visual" && (action.content as LessonPlanVisualContent).capability === "circle_area_rearrangement")));
  const onlyFixedLineSamples = plots.length === 1 && fixedLineSamples(plots[0]);
  for (const [si,section] of plan.sections.entries()) {
    for (const [mi, moment] of section.moments.entries()) {
      const text = moment.narration ?? "";
      const claims = text.split(/[。！？!?；;]/);
      if (hasCircleArea && /(?:高|底边|底边长|底)(?:度|长度)?(?:正好|恰好|精确|就是|等于|为|是){1,3}.{0,8}(?:半径|πr|r)/.test(text)
        && !/趋近|趋于|极限|无限|越来越|近似|接近/.test(section.moments.slice(0,mi+1).map(m => m.narration).join(" "))) {
        throw new LessonPlanError("LESSON_PLAN_TEACHING_MISMATCH",`$plan.sections[${si}].moments[${mi}]`,"finite sectors have curved edges; base tends to pi*r and height tends to r as subdivisions increase");
      }
      if (plots.length && /拖(?:动|拽)(?:图上|图中|曲线上|一下|这个|那个|两个|两|的|\s)*(?:点\s*[ABＰP]|[ABＰP]\s*点|两个点|两点)/.test(text)
        && !/滑块|滑杆/.test(text)) {
        throw new LessonPlanError("LESSON_PLAN_INTERACTION_MISMATCH",`$plan.sections[${si}].moments[${mi}]`,"use the point's horizontal-coordinate slider; directly dragging plot points is unavailable");
      }
      if (onlyFixedLineSamples && claims.some(claim =>
        /(?:斜率|倾斜角度|倾斜程度|倾斜方向|陡峭程度)(?:的数值)?(?:就|也|会|将|随之|随点移动|发生|而|从而|不断|逐渐|产生|有所|明显|直接|可以|能够|能|\s|[，,]){0,8}(?:改变|变化)(?!量|率)|(?:改变|变化)(?:了|着|其|它的|直线的|连线的|割线的|两点连线的|\s){0,5}(?:斜率|倾斜角度|倾斜程度|陡峭程度)/.test(claim)
        && !/不变|不会|不改变|保持|无论|有没有|是否|会不会/.test(claim))) {
        throw new LessonPlanError("LESSON_PLAN_TEACHING_MISMATCH",`$plan.sections[${si}].moments[${mi}]`,"moving two samples on a fixed straight line preserves its slope; use a nonlinear curve for changing secant slope");
      }
      if (/(?:斜率|k).{0,10}越大.{0,12}越陡/.test(text) && !/绝对值|正数|为正|大于.?0|k\s*>\s*0/.test(text)) {
        throw new LessonPlanError("LESSON_PLAN_TEACHING_MISMATCH",`$plan.sections[${si}].moments[${mi}]`,"steepness depends on absolute slope; larger signed k is not always steeper");
      }
    }
    for (const [mi,moment] of section.moments.entries()) {
      const visuals=moment.actions.filter(a=>a.action==="create" && a.kind==="visual");
      for (const action of visuals) {
        if (action.action!=="create" || action.kind!=="visual") continue;
        const visual=action.content as {capability:string;parameters?:Record<string,unknown>;numbers?:number[]};
        const text=[section.purpose,moment.narration,visual.parameters?.title].join(" ");
        const path=`$plan.sections[${si}].moments[${mi}]`;
        if (visual.capability==="geometric_rearrangement" && /圆(?:的)?面积|circle.{0,12}area|area.{0,12}circle/i.test(text)
          && /证明|推导|拼|重排|prove|derive/i.test(text)) {
          throw new LessonPlanError("LESSON_PLAN_TEACHING_MISMATCH",path,"circle area requires circle_area_rearrangement; polygon recipes cannot prove pi*r^2");
        }
        if (visual.capability!=="function_plot") continue;
        const tokens=visual.parameters?.expression_tokens;
        const dynamic=Array.isArray(tokens)&&tokens.some(t=>t?.kind==="number");
        const count=dynamic?0:new Set(visual.numbers??[]).size;
        if (!dynamic && /整条.{0,8}(移动|平移)|(?:平移|移动)整条|translate.{0,12}(curve|parabola)/i.test(text)) {
          throw new LessonPlanError("LESSON_PLAN_INTERACTION_MISMATCH",path,"moving the whole curve requires formula number references; static sample inputs only move points");
        }
        if (/两个点|两点|two points/i.test(text) && /分别.{0,8}(移动|调整|拖)|移动.{0,6}(两个点|两点)|独立.{0,8}(点|控制)|move.{0,12}(both|two)/i.test(text) && count!==2) {
          throw new LessonPlanError("LESSON_PLAN_INTERACTION_MISMATCH",path,`two independently moving points require a formula without n1/n2 and content.numbers=[1,2]; received ${count} sample inputs, dynamic=${dynamic}`);
        }
        if (/拖(?:动|拽).{0,10}(图上|图中|曲线上).{0,8}点/.test(text)) {
          throw new LessonPlanError("LESSON_PLAN_INTERACTION_MISMATCH",path,"plot points use sliders; direct point dragging is unavailable");
        }
      }
    }
  }
}
