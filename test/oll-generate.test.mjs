import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildVertexSchemaContract, probeVertexSchema } from "../main";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("Vertex Schema probe retries temporary rate limits without changing the schema", async () => {
  let requests = 0;
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: { ok: { type: "boolean" } },
  };
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    requests += 1;
    assert.deepEqual(JSON.parse(body).generationConfig.responseJsonSchema, schema);
    response.writeHead(requests === 1 ? 429 : 200, { "content-type": "application/json" });
    response.end(requests === 1
      ? JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } })
      : JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] }));
  });
  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const result = await probeVertexSchema({
      endpoint: `http://127.0.0.1:${address.port}/generate`,
      accessToken: "test-token",
      timeoutMs: 5_000,
      maxTokens: 32,
      requestAttempts: 2,
    }, schema);
    assert.equal(requests, 2);
    assert.deepEqual(result, { ok: true, status: 200, finishReason: "MAX_TOKENS" });
  } finally {
    await new Promise((done) => server.close(done));
  }
});

const validLesson = {
  dsl: "octos.lesson",
  version: "0.1",
  profile: "authoring",
  lesson: {
    mode: "explain",
    language: "zh-CN",
    title: "测试课程",
    goals: ["解释核心概念"],
  },
  steps: [
    {
      key: "explain",
      purpose: "写出并解释核心概念",
      beats: [
        {
          key: "show-concept",
          say: "我们先把核心概念写在白板上。",
          delivery: "patient",
          actions: [
            {
              do: "write",
              as: "core-concept",
              kind: "note",
              role: "concept",
              content: { title: "核心概念", items: ["测试内容"] },
              place: { relation: "new_region" },
            },
            {
              do: "focus",
              when: "after_speech",
              targets: ["core-concept"],
              intent: "current_step",
            },
          ],
        },
      ],
    },
  ],
  close: {
    summary: "已经解释核心概念。",
    focus: ["core-concept"],
  },
};

const validPlotLesson = structuredClone(validLesson);
validPlotLesson.lesson.title = "单位圆与三角函数图像";
validPlotLesson.lesson.goals = ["结合函数图像解释单位圆与三角函数的关系"];
validPlotLesson.steps[0].purpose = "画出正弦和余弦曲线并建立与单位圆坐标的联系";
validPlotLesson.steps[0].beats[0].actions[0] = {
  do: "write",
  as: "sine-plot",
  kind: "plot",
  role: "diagram",
  content: {
    axes: {
      x: { min: 0, max: Math.PI * 2 },
      y: { min: -1.2, max: 1.2 },
    },
    curves: [
      { as: "sine-curve", expression: "sin(x)", label: "y = sin x" },
      { as: "cosine-curve", expression: "cos(x)", label: "y = cos x" },
    ],
  },
  place: { relation: "new_region" },
};
validPlotLesson.steps[0].beats[0].actions[1].targets = ["sine-plot"];
validPlotLesson.close = {
  summary: "已经结合函数图像解释单位圆与三角函数的关系。",
  focus: ["sine-plot"],
};

const unitCircleGeometryAction = {
  do: "write",
  as: "circle-geometry",
  kind: "geometry",
  role: "diagram",
  content: {
    title: "单位圆",
    axes: {
      x: { min: -1.25, max: 1.25, label: "x" },
      y: { min: -1.25, max: 1.25, label: "y" },
      equal_scale: true,
    },
    points: [
      { as: "origin", x: 0, y: 0, label: "O" },
      { as: "point-p", x: .5, y: .8660254, label: "圆上点 P(cos θ, sin θ)" },
      { as: "foot", x: .5, y: 0 },
    ],
    circles: [
      { as: "circle", center: "origin", radius: 1, label: "r = 1" },
    ],
    segments: [
      { as: "radius", from: "origin", to: "point-p", style: "solid" },
      { as: "projection", from: "point-p", to: "foot", label: "sin θ", style: "projection" },
    ],
    arcs: [
      { as: "theta", center: "origin", radius: .28, start_angle: 0, end_angle: Math.PI / 3, label: "θ" },
    ],
  },
  place: { relation: "new_region" },
};

const validUnitCirclePlotLesson = structuredClone(validPlotLesson);
const interactiveUnitCircleGeometryAction = structuredClone(unitCircleGeometryAction);
validUnitCirclePlotLesson.lesson.variables = [{
  as: "theta",
  initial: 0,
  min: 0,
  max: Math.PI * 2,
  label: "旋转角 θ",
  unit: "rad",
  control: { kind: "slider", step: 0.01 },
}];
interactiveUnitCircleGeometryAction.content.points[1].interaction = {
  kind: "angle_control",
  variable: "theta",
  center: "origin",
};
interactiveUnitCircleGeometryAction.content.bindings = [
  { target: "point-p.x", expression: "cos(theta)" },
  { target: "point-p.y", expression: "sin(theta)" },
  { target: "foot.x", expression: "cos(theta)" },
  { target: "theta.end_angle", expression: "theta" },
];
validUnitCirclePlotLesson.steps[0].beats[0].actions[0].content.bindings = [
  { target: "current-angle.x", expression: "theta" },
  { target: "current-angle.y", expression: "sin(theta)" },
];
validUnitCirclePlotLesson.steps[0].beats[0].actions[0].content.points = [
  { as: "current-angle", x: 0, y: 0, label: "当前 θ" },
];
validUnitCirclePlotLesson.steps[0].beats[0].actions.unshift(interactiveUnitCircleGeometryAction);
validUnitCirclePlotLesson.steps[0].beats[0].actions.splice(2, 0, {
  do: "connect",
  as: "rotation-to-wave",
  from: "circle-geometry",
  to: "sine-plot",
  relation: "纵坐标随角度展开",
});
const unitCircleAnimationAction = {
  do: "animate",
  variable: "theta",
  value: Math.PI * 2,
  easing: "linear",
  duration_intent: "extended",
};
validUnitCirclePlotLesson.steps[0].beats.push({
  key: "animate-theta",
  say: "观察角度转满一圈时，圆上点与正弦图上的点如何同步移动。",
  delivery: "patient",
  actions: [
    unitCircleAnimationAction,
    {
      do: "focus",
      when: "after_speech",
      targets: ["circle-geometry", "sine-plot"],
      intent: "current_step",
    },
  ],
});
const modelAuthoredUnitCirclePlotLesson = structuredClone(validUnitCirclePlotLesson);
delete modelAuthoredUnitCirclePlotLesson.lesson.variables;
delete modelAuthoredUnitCirclePlotLesson.steps[0].beats[0].actions[0].content.points[1].interaction;
const modelAuthoredAnimation = modelAuthoredUnitCirclePlotLesson.steps[0].beats.flatMap(
  (beat) => beat.actions,
).find(
  (action) => action.do === "animate",
);
modelAuthoredAnimation.value = 999;
modelAuthoredAnimation.easing = "ease_in_out";
modelAuthoredAnimation.duration_intent = "brief";

const emptyLessonBrief = {
  version: "1",
  request_summary: "解释学习者当前请求",
  request_items: [{
    id: "explain-request",
    source_ref: "learner_request:1",
    kind: "teaching_goal",
    polarity: "require",
  }],
  non_requirement_clauses: [],
  teaching_goal_requirements: [{
    id: "explain-core-concept",
    goal: "解释核心概念",
    request_item_ids: ["explain-request"],
  }],
  presentation_constraints: [],
  visual_requirements: [],
  visual_relationships: [],
  shared_variable_requirements: [],
  student_task_requirements: [],
  scene3d_task_requirements: [],
  progressive_revision_kinds: [],
  unhandled_request_items: [],
};

const plotLessonBrief = {
  version: "1",
  request_summary: "用正弦函数图像解释周期",
  request_items: [
    { id: "explain-period", source_ref: "learner_request:1", kind: "teaching_goal", polarity: "require" },
    { id: "show-sine-plot", source_ref: "learner_request:1", kind: "visual", polarity: "require" },
  ],
  non_requirement_clauses: [],
  teaching_goal_requirements: [{
    id: "explain-trig-relation",
    goal: "结合函数图像解释单位圆与三角函数的关系",
    request_item_ids: ["explain-period"],
  }],
  presentation_constraints: [],
  visual_requirements: [{
    id: "sine-plot",
    surface: "plot",
    purpose: "展示正弦函数的周期波动",
    required_features: ["coordinate_axes", "function_curve"],
    expressions: ["y = \\sin(x)"],
    request_item_ids: ["show-sine-plot"],
  }],
  visual_relationships: [],
  shared_variable_requirements: [],
  student_task_requirements: [],
  scene3d_task_requirements: [],
  progressive_revision_kinds: [],
  unhandled_request_items: [],
};

const unitCirclePlotBrief = {
  version: "1",
  request_summary: "结合单位圆和正弦图像解释旋转到波动",
  request_items: [
    { id: "explain-rotation-wave", source_ref: "learner_request:1", kind: "teaching_goal", polarity: "require" },
    { id: "show-unit-circle", source_ref: "learner_request:1", kind: "visual", polarity: "require" },
    { id: "show-sine-plot", source_ref: "learner_request:1", kind: "visual", polarity: "require" },
    { id: "relate-visuals", source_ref: "learner_request:1", kind: "relationship", polarity: "require" },
    { id: "show-continuous-change", source_ref: "learner_request:1", kind: "continuous_change", polarity: "require" },
  ],
  non_requirement_clauses: [],
  teaching_goal_requirements: [{
    id: "explain-trig-relation",
    goal: "结合函数图像解释单位圆与三角函数的关系",
    request_item_ids: ["explain-rotation-wave"],
  }],
  presentation_constraints: [],
  visual_requirements: [
    {
      id: "circle-geometry",
      surface: "geometry",
      purpose: "展示角度旋转及纵坐标投影",
      required_features: [
        "coordinate_axes", "equal_scale", "circle", "origin_centered_circle", "unit_radius",
        "point_on_circle", "radius_segment", "projection_segment", "angle_arc",
      ],
      expressions: [],
      request_item_ids: ["show-unit-circle", "show-continuous-change"],
      motion_kind: "angular_point",
      motion_subject: "圆上点",
    },
    {
      id: "sine-plot",
      surface: "plot",
      purpose: "展示纵坐标随角度形成正弦波",
      required_features: ["coordinate_axes", "function_curve"],
      expressions: ["sin(x)"],
      request_item_ids: ["show-sine-plot", "show-continuous-change"],
    },
  ],
  visual_relationships: [{
    id: "circle-to-wave",
    from: "circle-geometry",
    to: "sine-plot",
    relation: "maps_to",
    request_item_ids: ["relate-visuals", "explain-rotation-wave", "show-unit-circle", "show-sine-plot"],
  }],
  shared_variable_requirements: [{
    id: "rotation-angle",
    variable: "theta",
    purpose: "让同一个旋转角同步驱动单位圆和正弦图",
    initial: 0,
    min: 0,
    max: Math.PI * 2,
    label: "旋转角 θ",
    unit: "rad",
    slider_step: 0.01,
    animate_to: Math.PI * 2,
    easing: "linear",
    duration_intent: "extended",
    bound_visuals: ["circle-geometry", "sine-plot"],
    direct_angle_geometry: "circle-geometry",
    request_item_ids: ["show-continuous-change"],
  }],
  student_task_requirements: [{
    id: "reach-sine-maximum",
    prompt: "把圆周点拖到 sin θ = 1",
    variable: "theta",
    controls: ["slider", "geometry_point"],
    completion_expression: "sin(theta)",
    completion_value: 1,
    tolerance: 0.01,
    hints: ["观察圆周点的纵坐标怎样随 θ 变化。", "尝试把圆周点拖到单位圆的最高点。"],
    hint_after_attempts: 2,
    success_message: "正确，圆周点在最高点时 sin θ = 1。",
    request_item_ids: ["explain-rotation-wave", "show-continuous-change"],
  }],
  scene3d_task_requirements: [],
  progressive_revision_kinds: [],
  unhandled_request_items: [],
};

const cube3dBrief = {
  version: "1",
  request_summary: "用可旋转三维场景展示立方体",
  request_items: [
    { id: "explain-cube", source_ref: "learner_request:1", kind: "teaching_goal", polarity: "require" },
    { id: "show-cube-3d", source_ref: "learner_request:1", kind: "visual", polarity: "require" },
    { id: "control-cube-view", source_ref: "learner_request:1", kind: "student_control", polarity: "require" },
    { id: "complete-view-task", source_ref: "learner_request:1", kind: "student_task", polarity: "require" },
  ],
  non_requirement_clauses: [],
  teaching_goal_requirements: [{
    id: "explain-cube-structure",
    goal: "从不同方向观察立方体的面、棱和空间关系",
    request_item_ids: ["explain-cube"],
  }],
  presentation_constraints: [{
    id: "use-three-dimensional-view",
    capability: "scene3d",
    polarity: "require",
    request_item_ids: ["show-cube-3d"],
  }],
  visual_requirements: [{
    id: "cube-scene",
    surface: "scene3d",
    purpose: "展示一个可以旋转和缩放观察的立方体",
    required_features: ["spatial_axes", "solid_primitives", "spatial_highlights", "orbit_control"],
    expressions: [],
    request_item_ids: ["show-cube-3d", "control-cube-view"],
  }],
  visual_relationships: [],
  shared_variable_requirements: [],
  student_task_requirements: [],
  scene3d_task_requirements: [{
    id: "find-front-view",
    prompt: "把立方体转到正视图",
    visual: "cube-scene",
    controls: ["orbit", "preset", "reset"],
    target_yaw: 0,
    target_pitch: 0,
    target_zoom: 1,
    angular_tolerance: 0.04,
    zoom_tolerance: 0.04,
    hints: ["可以使用正视按钮，或拖动到正前方。"],
    hint_after_attempts: 2,
    success_message: "正确，这是立方体的正视图。",
    request_item_ids: ["complete-view-task"],
  }],
  progressive_revision_kinds: [],
  unhandled_request_items: [],
};

const validCube3dLesson = structuredClone(validLesson);
validCube3dLesson.lesson.title = "从不同方向观察立方体";
validCube3dLesson.lesson.goals = ["观察立方体的面、棱和空间关系"];
validCube3dLesson.steps[0].purpose = "建立可旋转的立方体三维场景";
validCube3dLesson.steps[0].beats[0].say = "拖动立方体，从不同方向观察它的六个面和十二条棱。";
validCube3dLesson.steps[0].beats[0].actions[0] = {
  do: "write",
  as: "cube-scene",
  kind: "scene3d",
  role: "diagram",
  content: {
    title: "可旋转立方体",
    fallback: "一个中心在原点、边长为 2 的立方体，标出了顶点 A、棱 AB 和顶面。",
    axes: true,
    camera: { yaw: 0.72, pitch: 0.55, zoom: 1 },
    objects: [{
      as: "cube",
      kind: "box",
      label: "立方体",
      color: "teal",
      center: { x: 0, y: 0, z: 0 },
      size: { x: 2, y: 2, z: 2 },
    }],
    highlights: [
      { as: "vertex-a", kind: "point", points: [{ x: -1, y: -1, z: 1 }], label: "顶点 A", color: "red" },
      { as: "edge-ab", kind: "edge", points: [{ x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }], label: "棱 AB", color: "orange" },
      { as: "top-face", kind: "face", points: [{ x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }], label: "顶面", color: "purple" },
    ],
  },
  place: { relation: "new_region" },
};
validCube3dLesson.steps[0].beats[0].actions[1].targets = ["cube-scene"];
validCube3dLesson.close = {
  summary: "已经从多个视角观察立方体的空间结构。",
  focus: ["cube-scene"],
};

const springOscillationBrief = {
  version: "1",
  request_summary: "演示弹簧振子为什么往复运动以及位移和余弦函数的关系",
  request_items: [
    { id: "explain-oscillation", source_ref: "learner_request:1", kind: "teaching_goal", polarity: "require" },
    { id: "explain-cosine", source_ref: "learner_request:1", kind: "teaching_goal", polarity: "require" },
    { id: "show-motion", source_ref: "learner_request:2", kind: "continuous_change", polarity: "require" },
    { id: "control-motion", source_ref: "learner_request:3", kind: "student_control", polarity: "require" },
  ],
  non_requirement_clauses: [],
  teaching_goal_requirements: [
    {
      id: "explain-spring-oscillation",
      goal: "解释弹簧恢复作用如何产生往复运动",
      request_item_ids: ["explain-oscillation"],
    },
    {
      id: "explain-cosine-model",
      goal: "解释弹簧位移为什么可以用余弦函数表示",
      request_item_ids: ["explain-cosine"],
    },
  ],
  presentation_constraints: [{
    id: "show-visually",
    capability: "visual",
    polarity: "require",
    request_item_ids: ["show-motion"],
  }],
  visual_requirements: [
    {
      id: "spring-motion",
      surface: "geometry",
      purpose: "展示同一时刻弹簧端点相对平衡位置的位移",
      required_features: ["coordinate_axes", "annotated_points", "line_segments"],
      expressions: [],
      request_item_ids: ["explain-oscillation", "show-motion"],
      motion_kind: "linear_point",
      motion_subject: "振子",
    },
    {
      id: "cosine-displacement",
      surface: "plot",
      purpose: "展示位移随时间按余弦规律变化",
      required_features: ["coordinate_axes", "function_curve", "annotated_points"],
      expressions: ["cos(x)"],
      request_item_ids: ["explain-cosine", "show-motion"],
    },
  ],
  visual_relationships: [{
    id: "motion-to-curve",
    from: "spring-motion",
    to: "cosine-displacement",
    relation: "maps_to",
    request_item_ids: ["explain-cosine", "show-motion"],
  }],
  shared_variable_requirements: [{
    id: "time-phase",
    variable: "t",
    purpose: "让弹簧端点和余弦曲线上的当前点由同一个时间相位驱动",
    initial: 0,
    min: 0,
    max: Math.PI * 2,
    label: "时间相位 t",
    unit: "rad",
    slider_step: 0.01,
    animate_to: Math.PI * 2,
    easing: "linear",
    duration_intent: "extended",
    bound_visuals: ["spring-motion", "cosine-displacement"],
    direct_angle_geometry: "",
    request_item_ids: ["show-motion", "control-motion"],
  }],
  student_task_requirements: [{
    id: "reach-left-extreme",
    prompt: "拖动时间相位，让振子移动到最左端",
    variable: "t",
    controls: ["slider"],
    completion_expression: "cos(t)",
    completion_value: -1,
    tolerance: 0.01,
    hints: ["观察余弦曲线最低点对应的相位。", "把时间相位调到 π 附近。"],
    hint_after_attempts: 2,
    success_message: "正确，相位为 π 时余弦位移达到最小值，振子位于最左端。",
    request_item_ids: ["explain-cosine", "control-motion"],
  }],
  scene3d_task_requirements: [],
  progressive_revision_kinds: [],
  unhandled_request_items: [],
};

const modelAuthoredSpringOscillationLesson = structuredClone(modelAuthoredUnitCirclePlotLesson);
modelAuthoredSpringOscillationLesson.lesson.title = "弹簧振子与余弦函数";
modelAuthoredSpringOscillationLesson.close = {
  summary: "弹簧振子的位移会随时间按余弦规律往复变化。",
  focus: ["spring-motion", "cosine-displacement"],
};
const springActions = modelAuthoredSpringOscillationLesson.steps[0].beats[0].actions;
springActions[0] = {
  do: "write",
  as: "spring-motion",
  kind: "geometry",
  role: "diagram",
  content: {
    title: "弹簧端点的往复运动",
    axes: {
      x: { min: -1.25, max: 1.25, label: "位移" },
      y: { min: -0.5, max: 0.5 },
      equal_scale: true,
    },
    points: [
      { as: "anchor", x: -1, y: 0, label: "固定端" },
      { as: "equilibrium", x: 0, y: 0, label: "平衡位置" },
      { as: "mass", x: 1, y: 0, label: "振子" },
    ],
    segments: [{ as: "spring", from: "anchor", to: "mass", style: "solid" }],
    bindings: [{ target: "mass.x", expression: "cos(t)" }],
  },
  place: { relation: "new_region" },
};
springActions[1] = {
  do: "write",
  as: "cosine-displacement",
  kind: "plot",
  role: "diagram",
  content: {
    title: "位移随时间的变化",
    axes: {
      x: { min: 0, max: Math.PI * 2, label: "t" },
      y: { min: -1.2, max: 1.2, label: "x" },
    },
    curves: [{ as: "cosine-curve", expression: "cos(x)", label: "x = cos t" }],
    points: [{ as: "current-state", x: 0, y: 1, label: "当前状态" }],
    bindings: [
      { target: "current-state.x", expression: "t" },
      { target: "current-state.y", expression: "cos(t)" },
    ],
  },
  place: { relation: "new_region" },
};
springActions[2] = {
  do: "connect",
  as: "motion-to-curve",
  from: "spring-motion",
  to: "cosine-displacement",
  relation: "同一时刻的位移",
};
springActions[3].targets = ["spring-motion", "cosine-displacement"];
const springAnimation = modelAuthoredSpringOscillationLesson.steps[0].beats.flatMap(
  (beat) => beat.actions,
).find((action) => action.do === "animate");
springAnimation.variable = "t";
springAnimation.value = 999;
springAnimation.easing = "ease_in_out";
springAnimation.duration_intent = "brief";
modelAuthoredSpringOscillationLesson.steps[0].beats[1].actions[1].targets = [
  "spring-motion",
  "cosine-displacement",
];

const genericCircleBrief = {
  version: "1",
  request_summary: "在坐标系里画圆",
  request_items: [
    { id: "explain-radius", source_ref: "learner_request:1", kind: "teaching_goal", polarity: "require" },
    { id: "show-circle", source_ref: "learner_request:1", kind: "visual", polarity: "require" },
  ],
  non_requirement_clauses: [],
  teaching_goal_requirements: [{ id: "explain-core-concept", goal: "解释核心概念", request_item_ids: ["explain-radius"] }],
  presentation_constraints: [],
  visual_requirements: [{
    id: "circle-geometry",
    surface: "geometry",
    purpose: "展示一个圆",
    required_features: ["coordinate_axes", "equal_scale", "circle"],
    expressions: [],
    request_item_ids: ["show-circle"],
  }],
  visual_relationships: [],
  shared_variable_requirements: [],
  student_task_requirements: [],
  scene3d_task_requirements: [],
  progressive_revision_kinds: [],
  unhandled_request_items: [],
};

const contractInput = {
  turn_id: "contract-test-turn",
  learner_request: "请结合单位圆和 y=sin x 的函数图像，解释角度旋转如何变成周期波动。",
  request_source: "self_contained",
  language: "zh-CN",
};

test("planning rejects a relationship from a visual object to itself", () => {
  const brief = structuredClone(unitCirclePlotBrief);
  brief.visual_relationships[0].to = brief.visual_relationships[0].from;
  assert.throws(
    () => buildVertexSchemaContract(contractInput, brief),
    /relationship endpoints must reference two different visual requirements/,
  );
});

test("planning rejects a student task that cannot be completed by its declared variable", () => {
  const missingTask = structuredClone(unitCirclePlotBrief);
  missingTask.student_task_requirements = [];
  assert.throws(
    () => buildVertexSchemaContract(contractInput, missingTask),
    /must include at least one after-lesson task/,
  );

  const unknownVariable = structuredClone(unitCirclePlotBrief);
  unknownVariable.student_task_requirements[0].variable = "missing";
  assert.throws(
    () => buildVertexSchemaContract(contractInput, unknownVariable),
    /variable must reference one shared_variable_requirement\.variable/,
  );

  const unreachable = structuredClone(unitCirclePlotBrief);
  unreachable.student_task_requirements[0].completion_value = 2;
  assert.throws(
    () => buildVertexSchemaContract(contractInput, unreachable),
    /no reachable value.*satisfies the task/,
  );

  const sliderCannotReachRangeMaximum = structuredClone(unitCirclePlotBrief);
  sliderCannotReachRangeMaximum.shared_variable_requirements[0].slider_step = 2;
  sliderCannotReachRangeMaximum.student_task_requirements[0].controls = ["slider"];
  sliderCannotReachRangeMaximum.student_task_requirements[0].completion_expression = "theta";
  sliderCannotReachRangeMaximum.student_task_requirements[0].completion_value = Math.PI * 2;
  sliderCannotReachRangeMaximum.student_task_requirements[0].tolerance = 1e-6;
  assert.throws(
    () => buildVertexSchemaContract(contractInput, sliderCannotReachRangeMaximum),
    /no reachable value.*satisfies the task/,
  );
});

test("planning rejects a 3D view task without a matching controllable scene", () => {
  const missingScene = structuredClone(cube3dBrief);
  missingScene.scene3d_task_requirements[0].visual = "missing-scene";
  assert.throws(
    () => buildVertexSchemaContract(contractInput, missingScene),
    /visual must reference a scene3d requirement with orbit_control/,
  );

  const unavailableControl = structuredClone(cube3dBrief);
  unavailableControl.visual_requirements[0].required_features = ["spatial_axes", "solid_primitives"];
  assert.throws(
    () => buildVertexSchemaContract(contractInput, unavailableControl),
    /visual must reference a scene3d requirement with orbit_control/,
  );
});

test("authoring Schema gives every planned visual object an exact write alias", () => {
  const brief = structuredClone(unitCirclePlotBrief);
  brief.visual_requirements.splice(1, 0, {
    id: "projection-geometry",
    surface: "geometry",
    purpose: "单独展示纵坐标投影",
    required_features: ["coordinate_axes", "projection_segment"],
    expressions: [],
    request_item_ids: ["show-unit-circle"],
  });
  const { schema } = buildVertexSchemaContract(contractInput, brief);
  const writeVariants = schema.$defs.action.anyOf.filter(
    (variant) => variant.properties.do.enum[0] === "write",
  );
  const plannedAliases = writeVariants
    .filter((variant) => variant.properties.as?.enum)
    .map((variant) => variant.properties.as.enum[0]);
  assert.deepEqual(
    plannedAliases.sort(),
    ["circle-geometry", "projection-geometry", "sine-plot"],
  );
  assert.equal(
    writeVariants.filter((variant) => variant.properties.kind.enum[0] === "geometry").length,
    2,
  );
});

function isLessonBriefRequest(body) {
  return /课堂需求.*规划器/u.test(body.systemInstruction.parts[0].text);
}

function isLessonBriefVerificationRequest(body) {
  return body.systemInstruction.parts[0].text.includes("要求覆盖复核器");
}

function isComponentRepairRequest(body) {
  return body.systemInstruction.parts[0].text.includes("局部视觉对象修复器");
}

function isBeatRepairRequest(body) {
  return body.systemInstruction.parts[0].text.includes("局部教学节拍修复器");
}

function isAuthoringRequest(body) {
  return !isLessonBriefRequest(body)
    && !isLessonBriefVerificationRequest(body)
    && !isComponentRepairRequest(body)
    && !isBeatRepairRequest(body);
}

function sourceRefsFromPlanningRequest(body) {
  return body.generationConfig.responseJsonSchema.properties.request_items
    .items.properties.source_ref.enum;
}

function plannedBrief(body) {
  const prompt = body.contents[0].parts[0].text;
  if (prompt.includes("3D展示") || prompt.includes("三维场景展示")) return cube3dBrief;
  if (prompt.includes("弹簧为什么会来回运动")) return springOscillationBrief;
  if (prompt.includes("角度旋转如何变成周期波动")) return unitCirclePlotBrief;
  if (prompt.includes("正弦函数图像")) {
    const brief = structuredClone(plotLessonBrief);
    const sourceRefs = sourceRefsFromPlanningRequest(body);
    brief.non_requirement_clauses = sourceRefs.slice(1).map((sourceRef) => ({
      source_ref: sourceRef,
      reason: "这是学习背景，不是新增的展示要求",
    }));
    return brief;
  }
  if (prompt.includes("在坐标系里画一个圆")) return genericCircleBrief;
  const brief = structuredClone(emptyLessonBrief);
  const sourceRefs = sourceRefsFromPlanningRequest(body);
  brief.request_items = sourceRefs.map((sourceRef, index) => ({
    id: `explain-request-${index + 1}`,
    source_ref: sourceRef,
    kind: "teaching_goal",
    polarity: "require",
  }));
  brief.teaching_goal_requirements[0].request_item_ids = brief.request_items.map((item) => item.id);
  return brief;
}

function modelValueForRequest(body, authorValue) {
  if (isLessonBriefRequest(body)) return plannedBrief(body);
  if (isLessonBriefVerificationRequest(body)) return { missing: [], contradictions: [], suggestions: [] };
  return authorValue;
}

const providerSchemaKeywords = new Set([
  "type", "properties", "required", "additionalProperties", "items", "enum", "anyOf", "$defs", "$ref",
  "minItems", "maxItems",
]);

function assertProviderSchemaCompatible(schema) {
  const visit = (value, path = "") => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [key, child] of Object.entries(value)) {
      assert.equal(providerSchemaKeywords.has(key), true, `unsupported provider keyword ${path}/${key}`);
      if (key === "enum") {
        assert.equal(Array.isArray(child), true);
        assert.equal(child.every((item) => typeof item === "string" || typeof item === "number"), true);
      } else if (key === "properties" || key === "$defs") {
        for (const [name, nested] of Object.entries(child)) visit(nested, `${path}/${key}/${name}`);
      } else if (key === "items") {
        visit(child, `${path}/items`);
      } else if (key === "anyOf") {
        child.forEach((nested, index) => visit(nested, `${path}/anyOf/${index}`));
      }
    }
    if (Array.isArray(value.required) && value.properties) {
      for (const requiredProperty of value.required) {
        assert.equal(requiredProperty in value.properties, true, `required property is not declared at ${path}/${requiredProperty}`);
      }
    }
  };
  visit(schema);
}

function vertexPayload(value) {
  return JSON.stringify({
    candidates: [{
      finishReason: "STOP",
      content: { parts: [{ text: JSON.stringify(value) }] },
    }],
  });
}

const meaninglessUnitCircleDiagramLesson = structuredClone(validPlotLesson);
meaninglessUnitCircleDiagramLesson.steps[0].beats[0].actions.unshift({
  do: "write",
  as: "unit-circle",
  kind: "diagram",
  role: "diagram",
  content: {
    elements: [
      { as: "origin", label: "O(0,0)", semantic_position: "center" },
      { as: "point-p", label: "P(cos θ, sin θ)", semantic_position: "top_right" },
      { as: "angle-theta", label: "夹角 θ", semantic_position: "bottom_left" },
      { as: "y-segment", label: "纵坐标 y = sin θ", semantic_position: "right" },
    ],
    edges: [
      { as: "op", from: "origin", to: "point-p", label: "半径 r=1" },
      { as: "py", from: "point-p", to: "y-segment", label: "投影" },
    ],
    title: "单位圆与三角函数定义",
  },
  place: { relation: "new_region" },
});

async function runTool({ baseUrl, serviceAccount, workDirectory, input = {}, environment = {}, tool = "oll_generate_lesson" }) {
  const child = spawn(resolve(root, "main"), [tool], {
    cwd: root,
    env: {
      ...process.env,
      VERTEX_SA_JSON: JSON.stringify(serviceAccount),
      VERTEX_BASE_URL: `${baseUrl}/v1`,
      OLL_MODEL: "gemini-3.6-flash",
      OCTOS_WORK_DIR: workDirectory,
      ...environment,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end(JSON.stringify({
    turn_id: "learn-e2e-001",
    learner_request: "请解释为什么负负得正",
    request_source: "self_contained",
    language: "zh-CN",
    ...input,
  }));
  const exitCode = await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("close", done);
  });
  return { exitCode, stdout, stderr };
}

test("selection tool writes a source-linked artifact without producing a lesson", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-selection-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token" }));
      return;
    }
    requests.push(JSON.parse(body));
    response.end(vertexPayload({
      interpretation_kind: "math",
      interpretation_content: "y = x^2",
      interpretation_confidence: "high",
      response_kind: "plot",
      title: "二次函数图像",
      text: "这是所选公式对应的函数图像，原稿保持不变。",
      items: [],
      expression: "x^2",
      x_min: -4,
      x_max: 4,
      y_min: -1,
      y_max: 16,
    }));
  });
  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const checksum = "a".repeat(64);
    const result = await runTool({
      tool: "oll_enhance_selection",
      baseUrl: `http://127.0.0.1:${address.port}`,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `http://127.0.0.1:${address.port}/token`,
      },
      workDirectory,
      input: {
        learner_request: "请为我选中的公式生成函数图像",
        source: {
          source_id: "selection-1",
          document_id: "ink-1",
          document_version: 7,
          bounds: { x: 120, y: 80, width: 240, height: 90 },
          checksum: { algorithm: "sha-256", value: checksum },
        },
        content_hint: "math",
        recognized_content: "y = x^2",
        recognition_confidence: "high",
      },
    });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(requests.length, 1);
    assert.equal(
      requests[0].generationConfig.responseJsonSchema.properties.response_kind.enum[1],
      "plot",
    );
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.success, true);
    assert.equal(protocol.files_to_send.length, 1);
    assert.match(protocol.files_to_send[0], /\.octos-selection-enhancement\.json$/);
    const artifact = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
    assert.equal(artifact.profile, "octos.selection-enhancement");
    assert.equal(artifact.source.checksum.value, checksum);
    assert.equal(artifact.response.kind, "plot");
    assert.equal(artifact.response.expression, "x^2");
    await assert.rejects(
      readFile(join(workDirectory, "study", "oll", "learn-e2e-001.octos-lesson.json")),
    );
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool shares one total deadline across model stages and reports the timed-out stage", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-total-timeout-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    if (request.url === "/token") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ access_token: "vertex-test-token" }));
      return;
    }
    setTimeout(() => {
      if (response.destroyed) return;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(vertexPayload(emptyLessonBrief));
    }, 1_200);
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      environment: {
        // Leave enough room for process startup, RSA signing, and the local
        // token exchange so this test deterministically reaches the model call.
        OLL_TOTAL_TIMEOUT_MS: "500",
        OLL_TIMEOUT_MS: "1000",
        VERTEX_REQUEST_ATTEMPTS: "1",
      },
    });

    assert.equal(result.exitCode, 1);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.error_code, "LESSON_GENERATION_TIMEOUT");
    assert.match(result.stderr, /"stage":"model-call".*"label":"lesson-brief","status":"started"/);
    assert.match(result.stderr, /"label":"lesson-brief","status":"failed".*"error_code":"LESSON_GENERATION_TIMEOUT"/);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool requests Vertex structured output, validates OLL, and returns a deliverable", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-tool-"));
  const requests = [];
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    const parsedBody = request.url === "/token"
      ? Object.fromEntries(new URLSearchParams(body))
      : JSON.parse(body);
    requests.push({
      url: request.url,
      authorization: request.headers.authorization,
      body: parsedBody,
    });
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token", expires_in: 3600 }));
    } else {
      response.end(vertexPayload(modelValueForRequest(parsedBody, validLesson)));
    }
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: { learner_request: "请解释点 A(1,2) 的坐标含义" },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.success, true);
    assert.equal(protocol.files_to_send.length, 1);
    assert.equal(requests.length, 4);
    assert.equal(requests[0].url, "/token");
    assert.match(requests[0].body.assertion, /^[^.]+\.[^.]+\.[^.]+$/);
    assert.equal(requests[0].body.grant_type, "urn:ietf:params:oauth:grant-type:jwt-bearer");
    assert.equal(
      requests[3].url,
      "/v1/projects/test-project/locations/global/publishers/google/models/gemini-3.6-flash:generateContent",
    );
    assert.equal(requests[1].authorization, "Bearer vertex-test-token");
    assert.equal(requests[2].authorization, "Bearer vertex-test-token");
    assert.equal(requests[3].authorization, "Bearer vertex-test-token");
    assert.equal(requests[1].body.generationConfig.responseMimeType, "application/json");
    assert.equal(requests[2].body.generationConfig.responseMimeType, "application/json");
    assert.equal(requests[3].body.generationConfig.responseMimeType, "application/json");
    assert.equal(requests[3].body.generationConfig.temperature, 0);
    const plannerSystemPrompt = requests[1].body.systemInstruction.parts[0].text;
    assert.match(plannerSystemPrompt, /课堂需求与教学设计规划器/);
    assert.match(plannerSystemPrompt, /geometry.*plot.*diagram.*image.*table/s);
    const plannerSchema = requests[1].body.generationConfig.responseJsonSchema;
    assert.deepEqual(
      plannerSchema.properties.request_items.items.properties.source_ref.enum,
      ["learner_request:1"],
    );
    assert.ok(plannerSchema.required.includes("request_items"));
    assert.ok(plannerSchema.required.includes("non_requirement_clauses"));
    assert.ok(plannerSchema.required.includes("teaching_goal_requirements"));
    assert.ok(plannerSchema.required.includes("student_task_requirements"));
    assert.ok(plannerSchema.required.includes("scene3d_task_requirements"));
    assert.ok(plannerSchema.required.includes("unhandled_request_items"));
    const verifierSystemPrompt = requests[2].body.systemInstruction.parts[0].text;
    assert.match(verifierSystemPrompt, /用户要求覆盖复核器/);
    const systemPrompt = requests[3].body.systemInstruction.parts[0].text;
    assert.match(systemPrompt, /混合文字与公式/);
    assert.match(systemPrompt, /kind="math".*content\.latex/);
    assert.match(systemPrompt, /say.*自然语言.*LaTeX/);
    assert.match(systemPrompt, /每个 Beat 必须包含.*after_speech.*focus/);
    assert.match(systemPrompt, /课程要求清单.*可执行要求合同/);
    assert.match(systemPrompt, /确定性写入 lesson\.variables/);
    assert.doesNotMatch(systemPrompt, /明确要求函数图像.*至少创建/u);
    assert.match(systemPrompt, /diagram 只用于语义元素与连线/);
    const generationPrompt = requests[3].body.contents[0].parts[0].text;
    assert.match(generationPrompt, /request_source 已经确定本轮题目的唯一来源/);
    assert.match(generationPrompt, /"request_source": "self_contained"/);
    assert.match(generationPrompt, /"existing_board": null/);
    assert.match(generationPrompt, /课程要求清单/);
    assert.match(generationPrompt, /"write_kinds"/);
    const requestSchema = requests[3].body.generationConfig.responseJsonSchema;
    assertProviderSchemaCompatible(requestSchema);
    assert.equal(requests[3].body.generationConfig.responseSchema, undefined);
    assert.equal(requestSchema.type, "object");
    assert.deepEqual(requestSchema.properties.dsl.enum, ["octos.lesson"]);
    assert.equal(requestSchema.properties.dsl.type, undefined);
    assert.equal(requestSchema.properties.lesson.properties.title.type, "string");
    assert.equal("tasks" in requestSchema.properties.lesson.properties, false);
    assert.equal(requestSchema.properties.steps.type, "array");
    assert.equal(requestSchema.properties.steps.items.$ref, "#/$defs/step");
    assert.equal(requestSchema.$defs.action.anyOf.length, 9);
    const writeVariants = requestSchema.$defs.action.anyOf.filter(
      (variant) => variant.properties.do.enum[0] === "write",
    );
    assert.equal(writeVariants.length, 4);
    assert.deepEqual(
      writeVariants[0].required,
      ["do", "as", "kind", "role", "content", "place"],
    );
    const textWrite = writeVariants.find((variant) => variant.properties.kind.enum[0] === "text");
    const mathWrite = writeVariants.find((variant) => variant.properties.kind.enum[0] === "math");
    const shapeWrite = writeVariants.find((variant) => variant.properties.kind.enum[0] === "shape");
    const noteWrite = writeVariants.find((variant) => variant.properties.kind.enum[0] === "note");
    assert.deepEqual(textWrite.properties.content.required, ["text"]);
    assert.deepEqual(mathWrite.properties.content.required, ["latex"]);
    assert.deepEqual(shapeWrite.properties.content.required, ["text"]);
    assert.deepEqual(noteWrite.properties.content.required, ["title", "items"]);
    assert.equal(writeVariants.some((variant) => variant.properties.kind.enum[0] === "geometry"), false);
    assert.equal(writeVariants.some((variant) => variant.properties.kind.enum[0] === "plot"), false);
    assert.equal(requestSchema.properties.lesson.properties.variables, undefined);
    const focusVariant = requestSchema.$defs.action.anyOf.find(
      (variant) => variant.properties.do.enum[0] === "focus",
    );
    assert.equal(focusVariant.properties.content, undefined);
    assert.equal(requestSchema.$defs.action.anyOf.some(
      (variant) => variant.properties.do.enum[0] === "animate",
    ), false);
    assert.equal(requestSchema.$defs.action.anyOf.some(
      (variant) => variant.properties.do.enum[0] === "revise",
    ), false);
    assert.equal(requestSchema.$defs.alias.pattern, undefined);

    const artifact = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
    assert.deepEqual(artifact, validLesson);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool repairs one incomplete visual object without regenerating the lesson", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-component-repair-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const generationRequests = [];
  const invalidLesson = structuredClone(validPlotLesson);
  invalidLesson.steps[0].beats[0].actions[0].content.curves[0].expression = "x";
  const repairedWrite = structuredClone(validPlotLesson.steps[0].beats[0].actions[0]);
  repairedWrite.role = "example";
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token", expires_in: 3600 }));
      return;
    }
    const parsedBody = JSON.parse(body);
    generationRequests.push(parsedBody);
    const value = isComponentRepairRequest(parsedBody)
      ? repairedWrite
      : modelValueForRequest(parsedBody, invalidLesson);
    response.end(vertexPayload(value));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: { learner_request: "请用正弦函数图像解释周期。" },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(generationRequests.filter(isAuthoringRequest).length, 1);
    const repairRequests = generationRequests.filter(isComponentRepairRequest);
    assert.equal(repairRequests.length, 1);
    assert.deepEqual(repairRequests[0].generationConfig.responseJsonSchema.properties.as.enum, ["sine-plot"]);
    assert.match(repairRequests[0].contents[0].parts[0].text, /OLL_VISUAL_REQUIREMENT_UNSATISFIED/);
    const protocol = JSON.parse(result.stdout);
    assert.deepEqual(JSON.parse(await readFile(protocol.files_to_send[0], "utf8")), validPlotLesson);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool repairs one invalid beat without regenerating the lesson", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-beat-repair-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const generationRequests = [];
  const invalidLesson = structuredClone(validPlotLesson);
  invalidLesson.steps[0].beats.push({
    key: "explain-period",
    say: "再用公式总结周期。",
    delivery: "patient",
    actions: [structuredClone(validPlotLesson.steps[0].beats[0].actions[0])],
  });
  const repairedBeat = {
    key: "explain-period",
    say: "再用公式总结周期。",
    delivery: "patient",
    actions: [
      {
        do: "write",
        as: "period-law",
        kind: "math",
        role: "conclusion",
        content: { latex: "T = 2\\pi" },
        place: { relation: "below", anchor: "sine-plot" },
      },
      {
        do: "focus",
        when: "after_speech",
        targets: ["period-law", "sine-plot"],
        intent: "current_step",
      },
    ],
  };
  const expectedLesson = structuredClone(validPlotLesson);
  expectedLesson.steps[0].beats.push(repairedBeat);
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token", expires_in: 3600 }));
      return;
    }
    const parsedBody = JSON.parse(body);
    generationRequests.push(parsedBody);
    const value = isBeatRepairRequest(parsedBody)
      ? repairedBeat
      : modelValueForRequest(parsedBody, invalidLesson);
    response.end(vertexPayload(value));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: { learner_request: "请用正弦函数图像解释周期。" },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(generationRequests.filter(isAuthoringRequest).length, 1);
    const repairRequests = generationRequests.filter(isBeatRepairRequest);
    assert.equal(repairRequests.length, 1);
    const repairVariants = repairRequests[0].generationConfig.responseJsonSchema.$defs.action.anyOf;
    assert.equal(repairVariants.some((variant) => variant.properties.as?.enum?.[0] === "sine-plot"), false);
    assert.match(repairRequests[0].contents[0].parts[0].text, /OLL_DUPLICATE_ALIAS/);
    assert.match(repairRequests[0].contents[0].parts[0].text, /OLL_MISSING_BEAT_FOCUS/);
    const protocol = JSON.parse(result.stdout);
    assert.deepEqual(JSON.parse(await readFile(protocol.files_to_send[0], "utf8")), expectedLesson);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool retries a lesson whose beat does not hand off camera focus", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-focus-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const generationRequests = [];
  let authorResponseIndex = 0;
  const missingFocusLesson = structuredClone(validLesson);
  missingFocusLesson.steps[0].beats[0].actions = missingFocusLesson.steps[0].beats[0].actions
    .filter((action) => action.do !== "focus");
  const responses = [missingFocusLesson, validLesson];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token", expires_in: 3600 }));
      return;
    }
    const parsedBody = JSON.parse(body);
    generationRequests.push(parsedBody);
    response.end(vertexPayload(modelValueForRequest(
      parsedBody,
      isAuthoringRequest(parsedBody) ? responses[authorResponseIndex++] : validLesson,
    )));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const authorRequests = generationRequests.filter(isAuthoringRequest);
    assert.equal(generationRequests.length, 4);
    assert.equal(authorRequests.length, 2);
    assert.match(
      authorRequests[1].contents[0].parts[0].text,
      /OLL_MISSING_BEAT_FOCUS/,
    );
    assert.match(authorRequests[1].contents[0].parts[0].text, /上一份候选 OLL/);
    const protocol = JSON.parse(result.stdout);
    assert.deepEqual(JSON.parse(await readFile(protocol.files_to_send[0], "utf8")), validLesson);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool repairs an invalid Lesson Brief before authoring", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-brief-repair-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const invalidBrief = {
    version: "1",
    request_summary: "解释负负得正",
    visual_requirements: [{
      id: "bad_id",
      surface: "geometry",
      purpose: "错误的视觉规划",
      required_features: ["coordinate_axes"],
      expressions: ["x"],
    }],
    visual_relationships: [],
    shared_variable_requirements: [],
  };
  const modelRequests = [];
  let plannerResponseIndex = 0;
  const plannerResponses = [invalidBrief, emptyLessonBrief];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token", expires_in: 3600 }));
      return;
    }
    const parsedBody = JSON.parse(body);
    modelRequests.push(parsedBody);
    response.end(vertexPayload(isLessonBriefRequest(parsedBody)
      ? plannerResponses[plannerResponseIndex++]
      : modelValueForRequest(parsedBody, validLesson)));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const plannerRequests = modelRequests.filter(isLessonBriefRequest);
    assert.equal(plannerRequests.length, 2);
    const repairPrompt = plannerRequests[1].contents[0].parts[0].text;
    assert.match(repairPrompt, /上一份课程要求与教学设计/);
    assert.match(repairPrompt, /BRIEF_MISSING_REQUEST_ITEMS/);
    assert.match(repairPrompt, /BRIEF_INCOMPATIBLE_EXPRESSIONS/);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool rejects a planner omission before authoring and repairs the requirements", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-omission-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const learnerRequest = "请画出正弦函数图像并解释周期";
  const omittedBrief = structuredClone(emptyLessonBrief);
  omittedBrief.request_items[0].source_ref = "learner_request:1";
  omittedBrief.non_requirement_clauses = [];
  const completeBrief = structuredClone(plotLessonBrief);
  completeBrief.request_items[0].source_ref = "learner_request:1";
  completeBrief.request_items[1].source_ref = "learner_request:1";
  const plannerResponses = [omittedBrief, completeBrief];
  const modelRequests = [];
  let plannerResponseIndex = 0;
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token" }));
      return;
    }
    const parsedBody = JSON.parse(body);
    modelRequests.push(parsedBody);
    const value = isLessonBriefRequest(parsedBody)
      ? plannerResponses[plannerResponseIndex++]
      : isLessonBriefVerificationRequest(parsedBody)
        ? plannerResponseIndex === 1
          ? {
              missing: [{
                source_ref: "learner_request:1",
                reason: "同一句中的函数图像要求没有被记录",
              }],
              contradictions: [],
              suggestions: [],
            }
          : { missing: [], contradictions: [], suggestions: [] }
        : validPlotLesson;
    response.end(vertexPayload(value));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: { learner_request: learnerRequest },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(modelRequests.filter(isLessonBriefRequest).length, 2);
    assert.equal(modelRequests.filter(isLessonBriefVerificationRequest).length, 2);
    assert.equal(modelRequests.filter(isAuthoringRequest).length, 1);
    assert.match(
      modelRequests.filter(isLessonBriefRequest)[1].contents[0].parts[0].text,
      /BRIEF_REQUIREMENT_MISSING/,
    );
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("pedagogical suggestions do not reject a plan whose explicit request is already covered", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-verifier-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const modelRequests = [];
  let verifierRequestIndex = 0;
  let verifierResponseIndex = 0;
  const verifierResponses = [
    {
      missing: [{
        source_ref: "learner_request:999",
        reason: "错误地引用了不存在的原文分句",
      }],
      contradictions: [],
      suggestions: [],
    },
    {
      missing: [],
      contradictions: [],
      suggestions: [{
        request_item_id: "explain-request-1",
        suggestion: "可以增加数轴作为辅助讲法",
      }],
    },
  ];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token" }));
      return;
    }
    const parsedBody = JSON.parse(body);
    modelRequests.push(parsedBody);
    if (isLessonBriefVerificationRequest(parsedBody) && verifierRequestIndex++ === 0) {
      response.end(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] }));
      return;
    }
    const value = isLessonBriefRequest(parsedBody)
      ? plannedBrief(parsedBody)
      : isLessonBriefVerificationRequest(parsedBody)
        ? verifierResponses[verifierResponseIndex++]
        : validLesson;
    response.end(vertexPayload(value));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(modelRequests.filter(isLessonBriefRequest).length, 1);
    assert.equal(modelRequests.filter(isLessonBriefVerificationRequest).length, 3);
    assert.equal(modelRequests.filter(isAuthoringRequest).length, 1);
    const verificationRequests = modelRequests.filter(isLessonBriefVerificationRequest);
    assert.equal(verificationRequests[0].generationConfig.maxOutputTokens, 4_096);
    assert.equal(verificationRequests[1].generationConfig.maxOutputTokens, 8_192);
    const verificationRepairPrompt = verificationRequests[2]
      .contents[0].parts[0].text;
    assert.match(verificationRepairPrompt, /BRIEF_VERIFICATION_INVALID_SOURCE_REF/);
    assert.match(verificationRepairPrompt, /课程规划没有变化/);
    assert.match(result.stderr, /lesson-brief-review-suggestions/);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("a natural spring request keeps user requirements separate from optional teaching advice", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-natural-spring-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const modelRequests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token" }));
      return;
    }
    const parsedBody = JSON.parse(body);
    modelRequests.push(parsedBody);
    const value = isLessonBriefRequest(parsedBody)
      ? springOscillationBrief
      : isLessonBriefVerificationRequest(parsedBody)
        ? {
            missing: [],
            contradictions: [],
            suggestions: [{
              request_item_id: "explain-oscillation",
              suggestion: "可以补充恢复力箭头帮助理解",
            }],
          }
        : modelAuthoredSpringOscillationLesson;
    response.end(vertexPayload(value));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: {
        learner_request: "我还是不太明白弹簧为什么会来回运动，也不明白它为什么能用余弦函数表示。你能边演示边讲给我看吗？最好让我自己拖着试一试。",
        tutor_context: "建议使用恢复力箭头和能量图作为讲解辅助。",
        learner_context: "学习者刚接触简谐运动。",
      },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(modelRequests.filter(isLessonBriefRequest).length, 1);
    assert.equal(modelRequests.filter(isLessonBriefVerificationRequest).length, 1);
    assert.equal(modelRequests.filter(isAuthoringRequest).length, 1);
    const plannerRequest = modelRequests.find(isLessonBriefRequest);
    assert.deepEqual(sourceRefsFromPlanningRequest(plannerRequest), [
      "learner_request:1",
      "learner_request:2",
      "learner_request:3",
    ]);
    assert.match(plannerRequest.contents[0].parts[0].text, /"teaching_advice"/);
    const plannerInstructions = plannerRequest.systemInstruction.parts[0].text;
    assert.match(plannerInstructions, /可由数值点和线段忠实表达的简单二维物体运动/u);
    assert.match(plannerInstructions, /diagram 是静态语义关系图，不能由共享变量驱动/u);
    assert.match(plannerInstructions, /真实材质、碰撞、复杂连续形变.*unsupported_feature/u);
    assert.match(plannerInstructions, /line_segments.*弹簧.*连杆/u);
    const verifierInstructions = modelRequests.find(isLessonBriefVerificationRequest)
      .systemInstruction.parts[0].text;
    assert.match(verifierInstructions, /motion_subject.*用户要求观看的运动主体/u);
    assert.match(verifierInstructions, /类比.*不能作为主体演示/u);
    assert.match(result.stderr, /lesson-brief-review-suggestions/);
    const protocol = JSON.parse(result.stdout);
    const artifact = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
    assert.equal(artifact.lesson.variables[0].as, "t");
    assert.equal(artifact.lesson.variables[0].control.kind, "slider");
    assert.equal(artifact.steps[0].beats[0].actions[0].as, "spring-motion");
    assert.equal(artifact.steps[0].beats[0].actions[0].content.segments.length, 1);
    assert.equal(artifact.steps[0].beats[0].actions[1].content.curves[0].expression, "cos(x)");
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("a rotating-circle analogy cannot satisfy direct linear spring motion", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-spring-subject-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const invalidLesson = structuredClone(modelAuthoredSpringOscillationLesson);
  const analogy = structuredClone(unitCircleGeometryAction);
  analogy.as = "spring-motion";
  analogy.content.bindings = [
    { target: "point-p.x", expression: "cos(t)" },
    { target: "point-p.y", expression: "sin(t)" },
    { target: "foot.x", expression: "cos(t)" },
  ];
  invalidLesson.steps[0].beats[0].actions[0] = analogy;
  const repairedWrite = structuredClone(modelAuthoredSpringOscillationLesson.steps[0].beats[0].actions[0]);
  const modelRequests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token" }));
      return;
    }
    const parsedBody = JSON.parse(body);
    modelRequests.push(parsedBody);
    const value = isComponentRepairRequest(parsedBody)
      ? repairedWrite
      : isLessonBriefRequest(parsedBody)
        ? springOscillationBrief
        : isLessonBriefVerificationRequest(parsedBody)
          ? { missing: [], contradictions: [], suggestions: [] }
          : invalidLesson;
    response.end(vertexPayload(value));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: {
        learner_request: "我还是不太明白弹簧为什么会来回运动，也不明白它为什么能用余弦函数表示。你能边演示边讲给我看吗？最好让我自己拖着试一试。",
      },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(modelRequests.filter(isAuthoringRequest).length, 1);
    const repairRequests = modelRequests.filter(isComponentRepairRequest);
    assert.equal(repairRequests.length, 1);
    assert.match(repairRequests[0].contents[0].parts[0].text, /OLL_VISUAL_MOTION_UNSATISFIED/);
    const protocol = JSON.parse(result.stdout);
    const artifact = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
    const geometry = artifact.steps.flatMap((step) => step.beats)
      .flatMap((beat) => beat.actions)
      .find((action) => action.do === "write" && action.as === "spring-motion");
    assert.equal(geometry.content.points.some((point) => point.label === "振子"), true);
    assert.equal(geometry.content.bindings.some((binding) => binding.target === "mass.x"), true);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool plans and generates a rotatable 3D cube instead of replacing it with a 2D diagram", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-scene3d-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const modelRequests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token" }));
      return;
    }
    const parsedBody = JSON.parse(body);
    modelRequests.push(parsedBody);
    response.end(vertexPayload(modelValueForRequest(parsedBody, validCube3dLesson)));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: { learner_request: "请用3D展示一个可以旋转的立方体，并让我把它转到正视图" },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.success, true);
    assert.equal(modelRequests.filter(isAuthoringRequest).length, 1);
    const authoringRequest = modelRequests.find(isAuthoringRequest);
    const writeVariants = authoringRequest.generationConfig.responseJsonSchema.$defs.action.anyOf
      .filter((variant) => variant.properties.do.enum[0] === "write");
    const sceneVariant = writeVariants.find(
      (variant) => variant.properties.kind.enum[0] === "scene3d",
    );
    assert.ok(sceneVariant);
    assert.deepEqual(sceneVariant.properties.as.enum, ["cube-scene"]);
    assert.ok(sceneVariant.properties.content.required.includes("fallback"));
    assert.ok(sceneVariant.properties.content.required.includes("highlights"));
    assert.equal(sceneVariant.properties.content.properties.highlights.minItems, 1);
    assert.equal(writeVariants.some(
      (variant) => variant.properties.kind.enum[0] === "diagram",
    ), false);
    const artifact = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
    assert.equal(artifact.steps[0].beats[0].actions[0].kind, "scene3d");
    assert.equal(artifact.steps[0].beats[0].actions[0].content.objects[0].kind, "box");
    assert.deepEqual(
      artifact.steps[0].beats[0].actions[0].content.highlights.map((highlight) => highlight.kind),
      ["point", "edge", "face"],
    );
    assert.deepEqual(artifact.lesson.tasks, [{
      as: "find-front-view",
      prompt: "把立方体转到正视图",
      availability: { kind: "after_lesson" },
      allowed_operations: [{
        kind: "scene3d_view",
        node: "cube-scene",
        controls: ["orbit", "preset", "reset"],
      }],
      completion: {
        kind: "scene3d_view_target",
        node: "cube-scene",
        yaw: 0,
        pitch: 0,
        zoom: 1,
        angular_tolerance: 0.04,
        zoom_tolerance: 0.04,
      },
      hints: ["可以使用正视按钮，或拖动到正前方。"],
      hint_after_attempts: 2,
      success_message: "正确，这是立方体的正视图。",
    }]);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool refuses an image requirement when no authorized image asset exists", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-image-resource-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const imageBrief = {
    version: "1",
    request_summary: "用图片解释叶片结构",
    request_items: [
      { id: "explain-leaf", source_ref: "learner_request:1", kind: "teaching_goal", polarity: "require" },
      { id: "show-image", source_ref: "learner_request:1", kind: "visual", polarity: "require" },
    ],
    non_requirement_clauses: [],
    teaching_goal_requirements: [{ id: "leaf-goal", goal: "解释叶片结构", request_item_ids: ["explain-leaf"] }],
    presentation_constraints: [],
    visual_requirements: [{
      id: "leaf-image",
      surface: "image",
      purpose: "展示叶片结构",
      required_features: ["source_asset"],
      expressions: [],
      request_item_ids: ["show-image"],
    }],
    visual_relationships: [],
    shared_variable_requirements: [],
    student_task_requirements: [],
    scene3d_task_requirements: [],
    progressive_revision_kinds: [],
    unhandled_request_items: [],
  };
  const modelRequests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token" }));
      return;
    }
    const parsedBody = JSON.parse(body);
    modelRequests.push(parsedBody);
    response.end(vertexPayload(isLessonBriefRequest(parsedBody)
      ? imageBrief
      : { missing: [], contradictions: [], suggestions: [] }));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: { learner_request: "请用图片解释叶片结构" },
    });
    assert.equal(result.exitCode, 1);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.error_code, "BRIEF_IMAGE_RESOURCE_UNAVAILABLE");
    assert.equal(modelRequests.filter(isAuthoringRequest).length, 0);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool keeps revise as a typed per-kind capability instead of a universal content branch", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-typed-revise-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const reviseBrief = {
    version: "1",
    request_summary: "逐步解释等式变形",
    request_items: [{
      id: "explain-equation",
      source_ref: "learner_request:1",
      kind: "teaching_goal",
      polarity: "require",
    }],
    non_requirement_clauses: [],
    teaching_goal_requirements: [{ id: "equation-goal", goal: "解释等式变形", request_item_ids: ["explain-equation"] }],
    presentation_constraints: [],
    visual_requirements: [],
    visual_relationships: [],
    shared_variable_requirements: [],
    student_task_requirements: [],
    scene3d_task_requirements: [],
    progressive_revision_kinds: ["math"],
    unhandled_request_items: [],
  };
  const reviseLesson = {
    dsl: "octos.lesson",
    version: "0.1",
    profile: "authoring",
    lesson: { mode: "explain", language: "zh-CN", title: "等式变形", goals: ["解释等式变形"] },
    steps: [{
      key: "solve",
      purpose: "逐步变形",
      beats: [{
        key: "show-equation",
        say: "先写出等式，再把两边同时除以二。",
        actions: [
          { do: "write", as: "equation", kind: "math", role: "derivation", content: { latex: "2x=4" }, place: { relation: "new_region" } },
          { do: "revise", target: "equation", content: { latex: "x=2" }, reason: "两边同时除以二" },
          { do: "focus", when: "after_speech", targets: ["equation"], intent: "current_step" },
        ],
      }],
    }],
    close: { summary: "得到 x 等于二。", focus: ["equation"] },
  };
  const modelRequests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token" }));
      return;
    }
    const parsedBody = JSON.parse(body);
    modelRequests.push(parsedBody);
    response.end(vertexPayload(isLessonBriefRequest(parsedBody)
      ? reviseBrief
      : isLessonBriefVerificationRequest(parsedBody)
        ? { missing: [], contradictions: [], suggestions: [] }
        : reviseLesson));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: { learner_request: "请逐步解释等式变形" },
    });
    assert.equal(result.exitCode, 0, result.stderr);
    const authorRequest = modelRequests.find(isAuthoringRequest);
    const reviseVariant = authorRequest.generationConfig.responseJsonSchema.$defs.action.anyOf.find(
      (variant) => variant.properties.do.enum[0] === "revise",
    );
    assert.deepEqual(reviseVariant.properties.content.required, ["latex"]);
    assert.equal(reviseVariant.properties.content.properties.axes, undefined);
    assert.equal(reviseVariant.properties.content.properties.rows, undefined);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool retries until an explicitly requested function image contains a real plot", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-plot-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const generationRequests = [];
  let authorResponseIndex = 0;
  const responses = [validLesson, validPlotLesson];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token", expires_in: 3600 }));
      return;
    }
    const parsedBody = JSON.parse(body);
    generationRequests.push(parsedBody);
    response.end(vertexPayload(modelValueForRequest(
      parsedBody,
      isAuthoringRequest(parsedBody) ? responses[authorResponseIndex++] : validLesson,
    )));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: {
        learner_request: "请画出正弦函数图像并解释它为什么会周期波动，我之前没听懂",
      },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const authorRequests = generationRequests.filter(isAuthoringRequest);
    assert.equal(generationRequests.length, 4);
    assert.equal(authorRequests.length, 2);
    assert.match(
      authorRequests[1].contents[0].parts[0].text,
      /OLL_VISUAL_OBJECT_MISSING/,
    );
    assert.match(authorRequests[1].contents[0].parts[0].text, /function_curve/);
    const protocol = JSON.parse(result.stdout);
    const artifact = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
    const plot = artifact.steps[0].beats[0].actions.find(
      (action) => action.do === "write" && action.kind === "plot",
    );
    assert.ok(plot);
    assert.deepEqual(
      plot.content.curves.map((curve) => curve.expression),
      ["sin(x)", "cos(x)"],
    );
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool rejects a semantic node diagram that pretends to be a unit circle", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-unit-circle-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const generationRequests = [];
  let authorResponseIndex = 0;
  const responses = [meaninglessUnitCircleDiagramLesson, modelAuthoredUnitCirclePlotLesson];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token", expires_in: 3600 }));
      return;
    }
    const parsedBody = JSON.parse(body);
    generationRequests.push(parsedBody);
    response.end(vertexPayload(modelValueForRequest(
      parsedBody,
      isAuthoringRequest(parsedBody) ? responses[authorResponseIndex++] : validLesson,
    )));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: {
        learner_request: "请结合单位圆和 y=sin x 的函数图像，解释角度旋转如何变成周期波动。",
      },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const authorRequests = generationRequests.filter(isAuthoringRequest);
    assert.equal(generationRequests.length, 4);
    assert.equal(authorRequests.length, 2);
    assert.match(authorRequests[1].contents[0].parts[0].text, /OLL_VISUAL_OBJECT_MISSING/);
    assert.match(authorRequests[1].contents[0].parts[0].text, /circle-geometry/);
    const protocol = JSON.parse(result.stdout);
    const artifact = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
    const geometry = artifact.steps[0].beats[0].actions.find(
      (action) => action.do === "write" && action.kind === "geometry",
    );
    assert.ok(geometry);
    assert.equal(geometry.content.axes.equal_scale, true);
    assert.equal(geometry.content.circles[0].radius, 1);
    assert.equal(geometry.content.segments.some((segment) => segment.style === "projection"), true);
    assert.ok(geometry.content.arcs.length > 0);
    assert.deepEqual(artifact.lesson.variables, [{
      as: "theta",
      initial: 0,
      min: 0,
      max: Math.PI * 2,
      label: "旋转角 θ",
      unit: "rad",
      control: { kind: "slider", step: 0.01 },
    }]);
    assert.equal(geometry.content.bindings.some((binding) => binding.expression === "sin(theta)"), true);
    assert.deepEqual(geometry.content.points[1].interaction, {
      kind: "angle_control",
      variable: "theta",
      center: "origin",
    });
    assert.deepEqual(artifact.steps[0].beats.flatMap((beat) => beat.actions).find(
      (action) => action.do === "animate" && action.variable === "theta",
    ), {
      do: "animate",
      variable: "theta",
      value: Math.PI * 2,
      easing: "linear",
      duration_intent: "extended",
    });
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool deterministically lowers planned connections and circle controls", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-lowering-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const modelRequests = [];
  const authoredLesson = structuredClone(modelAuthoredUnitCirclePlotLesson);
  const authoredGeometry = authoredLesson.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.as === "circle-geometry",
  );
  authoredGeometry.content.arcs = [];
  authoredGeometry.content.bindings = authoredGeometry.content.bindings.filter(
    (binding) => !binding.target.endsWith(".end_angle"),
  );
  for (const beat of authoredLesson.steps[0].beats) {
    beat.actions = beat.actions.filter((action) => action.do !== "connect");
  }
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token" }));
      return;
    }
    const parsedBody = JSON.parse(body);
    modelRequests.push(parsedBody);
    response.end(vertexPayload(modelValueForRequest(parsedBody, authoredLesson)));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: {
        learner_request: "请结合单位圆和 y=sin x 的函数图像，解释角度旋转如何变成周期波动。",
      },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(modelRequests.filter(isAuthoringRequest).length, 1);
    const authoringSchema = modelRequests.find(isAuthoringRequest)
      .generationConfig.responseJsonSchema;
    assert.equal("tasks" in authoringSchema.properties.lesson.properties, false);
    assert.equal(authoringSchema.$defs.action.anyOf.some(
      (variant) => variant.properties.do.enum[0] === "connect",
    ), false);
    const protocol = JSON.parse(result.stdout);
    const lesson = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
    const actions = lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions));
    assert.deepEqual(actions.find((action) => action.do === "connect"), {
      do: "connect",
      as: "circle-to-wave",
      from: "circle-geometry",
      to: "sine-plot",
      relation: "maps_to",
    });
    const geometry = actions.find((action) => action.do === "write" && action.as === "circle-geometry");
    assert.ok(geometry.content.arcs.length > 0);
    assert.equal(geometry.content.bindings.some(
      (binding) => binding.target.endsWith(".end_angle") && binding.expression === "theta",
    ), true);
    assert.deepEqual(geometry.content.points[1].interaction, {
      kind: "angle_control",
      variable: "theta",
      center: "origin",
    });
    assert.deepEqual(lesson.lesson.tasks, [{
      as: "reach-sine-maximum",
      prompt: "把圆周点拖到 sin θ = 1",
      availability: { kind: "after_lesson" },
      allowed_operations: [{
        kind: "variable_change",
        variable: "theta",
        controls: ["slider", "geometry_point"],
      }],
      completion: {
        kind: "expression_target",
        expression: "sin(theta)",
        value: 1,
        tolerance: 0.01,
      },
      hints: ["观察圆周点的纵坐标怎样随 θ 变化。", "尝试把圆周点拖到单位圆的最高点。"],
      hint_after_attempts: 2,
      success_message: "正确，圆周点在最高点时 sin θ = 1。",
    }]);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool rejects static visuals when the brief requires one shared controllable variable", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-shared-variable-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const staticLesson = structuredClone(validUnitCirclePlotLesson);
  delete staticLesson.lesson.variables;
  for (const action of staticLesson.steps[0].beats[0].actions) {
    if (action.do === "write" && (action.kind === "geometry" || action.kind === "plot")) {
      delete action.content.bindings;
    }
    if (action.do === "write" && action.kind === "geometry") {
      delete action.content.points[1].interaction;
    }
  }
  for (const beat of staticLesson.steps[0].beats) {
    beat.actions = beat.actions.filter((action) => action.do !== "animate");
  }
  const modelRequests = [];
  let authorResponseIndex = 0;
  const authorResponses = [staticLesson, validUnitCirclePlotLesson];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token", expires_in: 3600 }));
      return;
    }
    const parsedBody = JSON.parse(body);
    modelRequests.push(parsedBody);
    response.end(vertexPayload(modelValueForRequest(
      parsedBody,
      isAuthoringRequest(parsedBody) ? authorResponses[authorResponseIndex++] : validLesson,
    )));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: {
        learner_request: "请结合单位圆和 y=sin x 的函数图像，解释角度旋转如何变成周期波动。",
      },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const authorRequests = modelRequests.filter(isAuthoringRequest);
    assert.equal(authorRequests.length, 2);
    const schema = authorRequests[0].generationConfig.responseJsonSchema;
    assertProviderSchemaCompatible(schema);
    assert.equal(schema.properties.lesson.required.includes("variables"), false);
    assert.equal("variables" in schema.properties.lesson.properties, false);
    const actionIdentities = schema.$defs.action.anyOf.map((variant) => ({
      action: variant.properties.do.enum[0],
      kind: variant.properties.kind?.enum?.[0],
    }));
    assert.equal(actionIdentities.some((item) => item.kind === "geometry"), true);
    assert.equal(actionIdentities.some((item) => item.kind === "plot"), true);
    assert.equal(actionIdentities.some((item) => item.kind === "diagram"), false);
    assert.equal(actionIdentities.some((item) => item.kind === "image"), false);
    assert.equal(actionIdentities.some((item) => item.kind === "table"), false);
    assert.equal(actionIdentities.some((item) => item.action === "animate"), true);
    assert.equal(actionIdentities.some((item) => item.action === "revise"), false);
    const animateVariant = schema.$defs.action.anyOf.find(
      (variant) => variant.properties.do.enum[0] === "animate",
    );
    assert.deepEqual(
      animateVariant.required,
      ["do", "variable", "value", "easing", "duration_intent"],
    );
    assert.deepEqual(animateVariant.properties.variable.enum, ["theta"]);
    assert.deepEqual(animateVariant.properties.value.enum, [Math.PI * 2]);
    assert.deepEqual(animateVariant.properties.easing.enum, ["linear"]);
    assert.deepEqual(animateVariant.properties.duration_intent.enum, ["extended"]);
    const geometryVariant = schema.$defs.action.anyOf.find(
      (variant) => variant.properties.kind?.enum?.[0] === "geometry",
    );
    const plotVariant = schema.$defs.action.anyOf.find(
      (variant) => variant.properties.kind?.enum?.[0] === "plot",
    );
    assert.ok(geometryVariant.properties.content.required.includes("bindings"));
    assert.ok(plotVariant.properties.content.required.includes("bindings"));
    assert.equal(
      geometryVariant.properties.content.properties.axes.properties.equal_scale.type,
      "boolean",
    );
    const repairPrompt = authorRequests[1].contents[0].parts[0].text;
    assert.doesNotMatch(repairPrompt, /OLL_SHARED_VARIABLE_DECLARATION_UNSATISFIED/);
    assert.match(repairPrompt, /OLL_SHARED_VARIABLE_BINDING_UNSATISFIED/);
    assert.match(repairPrompt, /OLL_SHARED_VARIABLE_ANIMATION_UNSATISFIED/);
    assert.match(repairPrompt, /OLL_SHARED_VARIABLE_DIRECT_CONTROL_UNSATISFIED/);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.generation_attempts, 2);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool moves animation out of a busy explanation Beat", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-animation-beat-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const crowdedLesson = structuredClone(modelAuthoredUnitCirclePlotLesson);
  const animationBeat = crowdedLesson.steps[0].beats.pop();
  const animation = animationBeat.actions.find((action) => action.do === "animate");
  crowdedLesson.steps[0].beats[0].actions.splice(-1, 0, animation);
  const modelRequests = [];
  let authorResponseIndex = 0;
  const authorResponses = [crowdedLesson, modelAuthoredUnitCirclePlotLesson];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token", expires_in: 3600 }));
      return;
    }
    const parsedBody = JSON.parse(body);
    modelRequests.push(parsedBody);
    response.end(vertexPayload(modelValueForRequest(
      parsedBody,
      isAuthoringRequest(parsedBody) ? authorResponses[authorResponseIndex++] : validLesson,
    )));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: {
        learner_request: "请结合单位圆和 y=sin x 的函数图像，解释角度旋转如何变成周期波动。",
      },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const authorRequests = modelRequests.filter(isAuthoringRequest);
    assert.equal(authorRequests.length, 2);
    assert.match(
      authorRequests[1].contents[0].parts[0].text,
      /OLL_ANIMATION_BEAT_NOT_ISOLATED/,
    );
    const protocol = JSON.parse(result.stdout);
    const artifact = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
    const animationBeats = artifact.steps.flatMap((step) => step.beats).filter(
      (beat) => beat.actions.some((action) => action.do === "animate"),
    );
    assert.equal(animationBeats.length, 1);
    assert.deepEqual(
      animationBeats[0].actions.map((action) => action.do),
      ["animate", "focus"],
    );
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool lowers the planned angle arc without regenerating a valid lesson", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-angle-arc-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const missingArcLesson = structuredClone(validUnitCirclePlotLesson);
  const geometry = missingArcLesson.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "geometry",
  );
  delete geometry.content.arcs;
  const modelRequests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token", expires_in: 3600 }));
      return;
    }
    const parsedBody = JSON.parse(body);
    modelRequests.push(parsedBody);
    response.end(vertexPayload(modelValueForRequest(parsedBody, missingArcLesson)));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: {
        learner_request: "请结合单位圆和 y=sin x 的函数图像，解释角度旋转如何变成周期波动。",
      },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const authorRequests = modelRequests.filter(isAuthoringRequest);
    assert.equal(authorRequests.length, 1);
    const responseSchema = authorRequests[0].generationConfig.responseJsonSchema;
    const geometryVariant = responseSchema.$defs.action.anyOf.find(
      (variant) => variant.properties.kind?.enum?.[0] === "geometry",
    );
    assert.ok(geometryVariant.properties.content.required.includes("arcs"));
    assert.equal(geometryVariant.properties.content.properties.arcs.minItems, 1);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.generation_attempts, 1);
    const artifact = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
    const repairedGeometry = artifact.steps[0].beats[0].actions.find(
      (action) => action.do === "write" && action.kind === "geometry",
    );
    assert.ok(repairedGeometry.content.arcs.length > 0);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool does not impose an angle arc on a generic circle requirement", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-generic-circle-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const genericCircleLesson = structuredClone(validLesson);
  const circleAction = structuredClone(unitCircleGeometryAction);
  delete circleAction.content.arcs;
  circleAction.as = "circle-geometry";
  genericCircleLesson.steps[0].beats[0].actions[0] = circleAction;
  genericCircleLesson.steps[0].beats[0].actions[1].targets = ["circle-geometry"];
  genericCircleLesson.close.focus = ["circle-geometry"];
  const modelRequests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    response.writeHead(200, { "content-type": "application/json" });
    if (request.url === "/token") {
      response.end(JSON.stringify({ access_token: "vertex-test-token", expires_in: 3600 }));
      return;
    }
    const parsedBody = JSON.parse(body);
    modelRequests.push(parsedBody);
    response.end(vertexPayload(modelValueForRequest(parsedBody, genericCircleLesson)));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runTool({
      baseUrl,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `${baseUrl}/token`,
      },
      workDirectory,
      input: { learner_request: "请在坐标系里画一个圆并解释半径。" },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(modelRequests.length, 3);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.generation_attempts, 1);
    const artifact = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
    const artifactGeometry = artifact.steps[0].beats[0].actions.find(
      (action) => action.do === "write" && action.kind === "geometry",
    );
    assert.equal(artifactGeometry.content.arcs, undefined);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool isolates the current image observation from old board context", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-camera-"));
  const requests = [];
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    const parsedBody = request.url === "/token" ? null : JSON.parse(body);
    requests.push(parsedBody);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(request.url === "/token"
      ? JSON.stringify({ access_token: "vertex-test-token" })
      : vertexPayload(modelValueForRequest(parsedBody, validLesson)));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const result = await runTool({
      baseUrl: `http://127.0.0.1:${address.port}`,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `http://127.0.0.1:${address.port}/token`,
      },
      workDirectory,
      input: {
        learner_request: "这道题应该怎么写",
        request_source: "current_image",
        board_summary: "旧课程：长方形周长应用题",
        source_observation: {
          kind: "live_camera",
          recognized_problem: "试卷当前第一题：计算 (-2)^3 的值",
          confidence: "high",
        },
      },
    });
    assert.equal(result.exitCode, 0, result.stderr);
    const request = requests.find((candidate) => candidate && isAuthoringRequest(candidate));
    const prompt = request.contents[0].parts[0].text;
    assert.match(prompt, /试卷当前第一题：计算 \(-2\)\^3 的值/);
    assert.doesNotMatch(prompt, /旧课程：长方形周长应用题/);
    assert.match(prompt, /"request_source": "current_image"/);
    assert.match(prompt, /"existing_board": null/);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool refuses to substitute old board history for an unresolved image reference", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-unresolved-image-"));
  try {
    const result = await runTool({
      baseUrl: "http://127.0.0.1:1",
      serviceAccount: {},
      workDirectory,
      input: {
        learner_request: "老师，这个第一题应该怎么做？",
        request_source: "current_image",
        board_summary: "旧课程：长方形周长应用题",
      },
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /source_observation is required/);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.success, false);
    assert.match(protocol.output, /inspect the current frame/);
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool isolates a self-contained request from old board content", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-standalone-"));
  const requests = [];
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    const parsedBody = request.url === "/token" ? null : JSON.parse(body);
    requests.push(parsedBody);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(request.url === "/token"
      ? JSON.stringify({ access_token: "vertex-test-token" })
      : vertexPayload(modelValueForRequest(parsedBody, validLesson)));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const result = await runTool({
      baseUrl: `http://127.0.0.1:${address.port}`,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `http://127.0.0.1:${address.port}/token`,
      },
      workDirectory,
      input: {
        learner_request: "请推导勾股定理",
        request_source: "self_contained",
        board_summary: "旧课程：长方形周长应用题",
        last_applied_action: "旧课程最后一步：x = 6",
      },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const prompt = requests.find((candidate) => candidate && isAuthoringRequest(candidate)).contents[0].parts[0].text;
    assert.match(prompt, /请推导勾股定理/);
    assert.doesNotMatch(prompt, /长方形周长|x = 6/);
    assert.match(prompt, /"existing_board": null/);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool exposes old board content only for an explicit board follow-up", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-follow-up-"));
  const requests = [];
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const server = createServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    const parsedBody = request.url === "/token" ? null : JSON.parse(body);
    requests.push(parsedBody);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(request.url === "/token"
      ? JSON.stringify({ access_token: "vertex-test-token" })
      : vertexPayload(modelValueForRequest(parsedBody, validLesson)));
  });

  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const result = await runTool({
      baseUrl: `http://127.0.0.1:${address.port}`,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `http://127.0.0.1:${address.port}/token`,
      },
      workDirectory,
      input: {
        learner_request: "继续讲刚才白板上的长方形方程为什么要除以二",
        request_source: "explicit_board_follow_up",
        board_summary: "长方形周长方程：2(x + x + 4) = 32",
        last_applied_action: "化简到 4x + 8 = 32",
      },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const prompt = requests.find((candidate) => candidate && isAuthoringRequest(candidate)).contents[0].parts[0].text;
    assert.match(prompt, /"request_source": "explicit_board_follow_up"/);
    assert.match(prompt, /长方形周长方程：2\(x \+ x \+ 4\) = 32/);
    assert.match(prompt, /化简到 4x \+ 8 = 32/);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool requires board context for an explicit board follow-up", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-missing-board-"));
  try {
    const result = await runTool({
      baseUrl: "http://127.0.0.1:1",
      serviceAccount: {},
      workDirectory,
      input: {
        learner_request: "继续刚才那一步",
        request_source: "explicit_board_follow_up",
      },
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /board_summary is required/);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.success, false);
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool rejects calls that do not resolve an authoritative request source", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-missing-source-"));
  try {
    const result = await runTool({
      baseUrl: "http://127.0.0.1:1",
      serviceAccount: {},
      workDirectory,
      input: {
        learner_request: "帮我讲一下",
        request_source: undefined,
        board_summary: "旧课程：长方形周长应用题",
      },
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /request_source must be a non-empty string/);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.success, false);
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
});
