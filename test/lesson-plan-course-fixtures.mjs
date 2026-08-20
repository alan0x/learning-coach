const local = (moment, item) => ({ source: "local_board_item", moment, item });
const reusable = (section, item, role) => ({
  source: "reusable",
  section,
  item,
  ...(role ? { part: { kind: "capability", role } } : {}),
});

function numberTarget({ number = 1, value, tolerance, prompt, success_message }) {
  return {
    kind: "number_target",
    prompt,
    number_controls: [{ number, controls: ["slider"] }],
    value,
    tolerance,
    hints: ["观察滑杆显示的数值，并同时看主图的变化。"],
    hint_after_attempts: 2,
    success_message,
  };
}

function quadraticTranslationCourse() {
  const plan = course({
    title: "二次函数图像的平移",
    goals: ["理解 h 控制左右平移", "理解 k 控制上下平移", "把顶点移动到指定坐标"],
    number: { initial: 0, min: -5, max: 5, label: "h（左右平移）", student_control: { kind: "slider", step: 1 } },
    capability: "function_plot",
    parameters: {
      title: "y=(x-h)²+k",
      expression_tokens: [
        { kind: "input" },
        { kind: "number", number: 1 },
        { kind: "operator", operator: "subtract" },
        { kind: "literal", value: 2 },
        { kind: "operator", operator: "power" },
        { kind: "number", number: 2 },
        { kind: "operator", operator: "add" },
      ],
      curve_label: "y=(x-h)²+k",
      x_min: -6,
      x_max: 6,
      y_min: -6,
      y_max: 12,
    },
    firstNarration: "拖动 h 时整条抛物线左右移动，拖动 k 时整条抛物线上下移动，顶点始终是 (h,k)。",
    formula: "y=(x-h)^2+k\\Rightarrow \\text{顶点 }(h,k)",
    explanationTitle: "两个数值怎样改变曲线",
    explanationItems: ["h 增大时向右移动", "k 增大时向上移动", "开口和宽窄保持不变"],
    animationEnd: 2,
    activity: numberTarget({
      number: 1,
      value: 2,
      tolerance: 0.1,
      prompt: "先把 h 调到 2。",
      success_message: "横向位置正确，顶点横坐标现在是 2。",
    }),
  });
  plan.numbers = [
    plan.numbers[0],
    { initial: 0, min: -5, max: 5, label: "k（上下平移）", student_control: { kind: "slider", step: 1 } },
  ];
  plan.sections[0].moments[0].actions[0].content.numbers = [1, 2];
  plan.sections[2].moments[0].actions.splice(1, 0, {
    action: "animate",
    number: 2,
    end_value: -1,
    easing: "linear",
    duration_intent: "normal",
    timing: "during_speech",
  });
  plan.sections[2].student_activities = [
    plan.sections[2].student_activities[0],
    numberTarget({
      number: 2,
      value: -1,
      tolerance: 0.1,
      prompt: "再把 k 调到 -1，让顶点到达 (2,-1)。",
      success_message: "完成，顶点现在位于 (2,-1)。",
    }),
  ];
  return plan;
}

function course({
  title,
  goals,
  teachingStrategies,
  number,
  capability,
  parameters,
  firstNarration,
  formula,
  explanationTitle,
  explanationItems,
  animationEnd,
  activity,
}) {
  return {
    version: "0.1",
    title,
    goals,
    ...(teachingStrategies ? { teaching_strategies: teachingStrategies } : {}),
    numbers: [number],
    sections: [
      {
        purpose: "建立可以持续观察的主要画面",
        reusable_items: [{ kind: "board_item", board_kind: "visual", capability }],
        moments: [{
          narration: firstNarration,
          delivery: "patient",
          actions: [
            {
              action: "create",
              kind: "visual",
              role: "diagram",
              content: { capability, parameters, numbers: [1] },
              placement: { relation: "new_region" },
              reusable_item: 1,
            },
            {
              action: "focus",
              references: [local(1, 1)],
              intent: "观察主要画面",
              timing: "after_speech",
            },
          ],
        }],
      },
      {
        purpose: "结合原来的主要画面完成解释和推导",
        moments: [{
          narration: "我们保留刚才的画面，在旁边写出关键关系，再把公式和变化一一对应。",
          delivery: "careful",
          actions: [
            {
              action: "point_at",
              reference: reusable(1, 1, "whole"),
              timing: "during_speech",
            },
            {
              action: "create",
              kind: "math",
              role: "derivation",
              content: { latex: formula },
              placement: { relation: "below", reference: reusable(1, 1), gap: "normal" },
            },
            {
              action: "create",
              kind: "note",
              role: "explanation",
              content: { title: explanationTitle, items: explanationItems },
              placement: { relation: "below", reference: local(1, 1), gap: "tight" },
            },
            {
              action: "focus",
              references: [reusable(1, 1), local(1, 1), local(1, 2)],
              intent: "同时看主图、公式和解释",
              timing: "after_speech",
            },
          ],
        }],
      },
      {
        purpose: "用同一数值状态演示变化并让学习者操作",
        moments: [{
          narration: "最后让这个数值连续变化。你看到的画面、标记和滑杆都来自同一份状态。",
          delivery: "encouraging",
          actions: [
            {
              action: "animate",
              number: 1,
              end_value: animationEnd,
              easing: "linear",
              duration_intent: "normal",
              timing: "during_speech",
            },
            {
              action: "focus",
              references: [reusable(1, 1)],
              intent: "观察完整变化",
              timing: "after_speech",
            },
          ],
        }],
        ...(activity ? { student_activities: [activity] } : {}),
      },
    ],
    close: { summary: `完成“${title}”的讲解和操作。`, focus: [reusable(1, 1)] },
  };
}

export const completeLessonPlanFixtures = {
  unit_circle_to_sine: course({
    title: "从单位圆的旋转到正弦函数的周期波动",
    goals: ["理解圆周运动的纵坐标怎样变成正弦值", "理解转一圈对应一个周期"],
    number: { initial: 0, min: 0, max: Math.PI * 2, label: "旋转角度 θ", unit: "rad", student_control: { kind: "slider", step: 0.01 } },
    capability: "unit_circle_projection",
    parameters: { title: "单位圆与 y=sin(x)", projection: "sin" },
    firstNarration: "圆上点转动时，它的纵坐标不断升高、回到零、降低再回到零；右边的正弦曲线记录的就是这份高度。",
    formula: "P(\\cos\\theta,\\sin\\theta),\\quad y=\\sin\\theta",
    explanationTitle: "旋转怎样变成波动",
    explanationItems: ["角度是横向进度", "圆上点的纵坐标是函数值", "转满 2π 后状态重复"],
    animationEnd: Math.PI * 2,
    activity: numberTarget({ value: Math.PI / 2, tolerance: 0.02, prompt: "把圆上点移动到纵坐标最大的地方。", success_message: "正确，θ=π/2 时 sin θ 取得最大值 1。" }),
  }),

  square_function: course({
    title: "二次函数 y=x² 的图像为什么开口向上",
    goals: ["理解平方值不会小于零", "观察自变量远离零时函数值怎样变化"],
    number: { initial: 0, min: -3, max: 3, label: "自变量 x", student_control: { kind: "slider", step: 0.1 } },
    capability: "function_plot",
    parameters: { title: "y=x² 与自变量变化", expression: "x^2", curve_label: "y=x²", x_min: -4, x_max: 4, y_min: -1, y_max: 10 },
    firstNarration: "动点从左向右移动时，x 先接近零再远离零；平方值在零点最小，所以曲线从高处下降后又升高。",
    formula: "y=x^2\\ge 0,\\quad (-x)^2=x^2",
    explanationTitle: "开口向上的两个原因",
    explanationItems: ["平方值不小于零", "正负相反的 x 有相同函数值", "|x| 越大，x² 越大"],
    animationEnd: 3,
    activity: numberTarget({ value: 2, tolerance: 0.05, prompt: "把 x 调到 2，观察对应点的高度。", success_message: "现在 x=2，对应 y=4。" }),
  }),

  quadratic_translation: quadraticTranslationCourse(),

  arc_length: course({
    title: "圆心角、半径与圆弧长度",
    goals: ["理解弧度的几何意义", "理解弧长公式 s=rθ"],
    number: { initial: 0.2, min: 0, max: Math.PI * 2, label: "圆心角 θ", unit: "rad", student_control: { kind: "slider", step: 0.01 } },
    capability: "circle_and_arc",
    parameters: { title: "圆心角控制圆弧", radius: 2 },
    firstNarration: "半径保持不变时，圆心角越大，沿圆周扫过的圆弧越长。",
    formula: "s=r\\theta",
    explanationTitle: "为什么是乘法关系",
    explanationItems: ["单位圆上弧长等于弧度数", "半径放大 r 倍，弧长也放大 r 倍", "角度必须使用弧度"],
    animationEnd: Math.PI,
    activity: numberTarget({ value: Math.PI / 2, tolerance: 0.02, prompt: "把圆心角调到 π/2，观察四分之一圆弧。", success_message: "正确，这是四分之一圆，对应弧长 rπ/2。" }),
  }),

  spring_oscillation: course({
    title: "弹簧为什么往复运动以及为什么可以用余弦函数描述",
    goals: ["理解回复力总是指向平衡位置", "把弹簧位移和余弦曲线对应起来"],
    number: { initial: 0, min: 0, max: Math.PI * 2, label: "时间相位 t", unit: "rad", student_control: { kind: "slider", step: 0.01 } },
    capability: "spring_and_mass",
    parameters: { title: "弹簧振子与余弦位移" },
    firstNarration: "物体偏离平衡位置后，弹簧的回复力把它拉回；惯性又让它越过平衡位置，于是运动反复发生。",
    formula: "F=-kx,\\quad a=-\\frac{k}{m}x,\\quad x=A\\cos(\\omega t+\\varphi)",
    explanationTitle: "往复运动的原因",
    explanationItems: ["回复力方向与位移相反", "惯性使物体越过平衡位置", "理想情况下位移按余弦规律重复"],
    animationEnd: Math.PI * 2,
    activity: numberTarget({ value: Math.PI, tolerance: 0.02, prompt: "把相位调到 π，观察物体位于哪一侧。", success_message: "相位为 π 时 cos π=-1，物体位于另一侧极值。" }),
  }),

  cube_and_section: course({
    title: "从不同方向观察正方体的顶点、棱、面与水平截面",
    goals: ["理解正方体的顶点、棱和面", "通过旋转和截面建立空间想象"],
    number: { initial: 0, min: -0.9, max: 0.9, label: "截面高度", student_control: { kind: "slider", step: 0.1 } },
    capability: "cube_with_section",
    parameters: { title: "可旋转正方体与水平截面" },
    firstNarration: "拖动场景可以从不同方向观察正方体；水平平面穿过正方体时，场景会同时显示切割平面和真实截面。",
    formula: "V=8,\\quad E=12,\\quad F=6",
    explanationTitle: "正方体的组成",
    explanationItems: ["8 个顶点是棱的交点", "12 条棱连接相邻顶点", "6 个面都是正方形"],
    animationEnd: 0.8,
    activity: {
      kind: "scene3d_view",
      reference: reusable(1, 1),
      prompt: "把正方体转到俯视方向。",
      controls: ["orbit", "zoom", "preset", "reset"],
      match: "view_direction",
      yaw: 0,
      pitch: -Math.PI / 2,
      zoom: 1,
      angular_tolerance: 0.12,
      zoom_tolerance: 0.25,
      hints: ["可以点击俯视预设，也可以直接拖动。"],
      hint_after_attempts: 2,
      success_message: "现在看到的是正方体的俯视方向。",
    },
  }),

  paraboloid_section: course({
    title: "用水平截面理解 z=x²+y² 的三维图像",
    goals: ["认识开口向上的抛物面", "理解水平截线为什么是圆"],
    number: { initial: 1, min: 0.25, max: 4, label: "截面高度 h", student_control: { kind: "slider", step: 0.25 } },
    capability: "function_surface_with_section",
    parameters: { title: "z=x²+y² 与水平截面", expression: "x^2+y^2", x_min: -2, x_max: 2, y_min: -2, y_max: 2, section_axis: "z", samples: 12 },
    firstNarration: "旋转曲面可以看到它像一个向上张开的碗；水平平面与曲面的真实交线会随着高度改变。",
    formula: "z=h\\Rightarrow x^2+y^2=h\\Rightarrow r=\\sqrt{h}",
    explanationTitle: "截线为什么是圆",
    explanationItems: ["固定高度 z=h", "剩下的方程是 x²+y²=h", "这是圆心在原点、半径为 √h 的圆"],
    animationEnd: 4,
    activity: numberTarget({ value: 4, tolerance: 0.02, prompt: "把截面高度调到 4，观察截线的大小。", success_message: "h=4 时，截线圆半径为 2。" }),
  }),

  natural_log_origin: course({
    title: "自然对数的由来与推导思路",
    goals: ["理解自然对数与指数函数互为反函数", "理解 ln x 的积分和面积意义"],
    teachingStrategies: ["先用反函数建立直觉，再用面积定义解释运算规律"],
    number: { initial: 2, min: 0.2, max: 5, label: "正数 x", student_control: { kind: "slider", step: 0.1 } },
    capability: "function_plot",
    parameters: { title: "y=ln(x)", expression: "ln(x)", curve_label: "y=ln(x)", x_min: 0.1, x_max: 5, y_min: -2.5, y_max: 2 },
    firstNarration: "自然对数只接受正数。它可以从指数函数的反函数出发，也可以用曲线 1/t 下从 1 到 x 的有向面积来定义。",
    formula: "y=\\ln x\\Longleftrightarrow e^y=x,\\qquad \\ln x=\\int_1^x\\frac{1}{t}\\,dt",
    explanationTitle: "两条互相一致的来源",
    explanationItems: ["e^x 的反函数是 ln x", "1/t 的面积满足乘法变加法", "因此 ln(ab)=ln a+ln b"],
    animationEnd: 5,
    activity: numberTarget({ value: 1, tolerance: 0.02, prompt: "把 x 调回 1，观察 ln 1 的值。", success_message: "ln 1=0，对应从 1 到 1 的面积为零。" }),
  }),
};
