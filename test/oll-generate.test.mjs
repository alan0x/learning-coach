import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { probeVertexSchema } from "../main";

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
  as: "trig-curves",
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
validPlotLesson.steps[0].beats[0].actions[1].targets = ["trig-curves"];
validPlotLesson.close = {
  summary: "已经结合函数图像解释单位圆与三角函数的关系。",
  focus: ["trig-curves"],
};

const unitCircleGeometryAction = {
  do: "write",
  as: "unit-circle",
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
      { as: "point-p", x: .5, y: .8660254, label: "P(cos θ, sin θ)" },
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
  from: "unit-circle",
  to: "trig-curves",
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
      targets: ["unit-circle", "trig-curves"],
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
  progressive_revision_kinds: [],
  unhandled_request_items: [],
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
      required_features: ["coordinate_axes", "annotated_points"],
      expressions: [],
      request_item_ids: ["explain-oscillation", "show-motion"],
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
  progressive_revision_kinds: [],
  unhandled_request_items: [],
};

function isLessonBriefRequest(body) {
  return /课堂需求.*规划器/u.test(body.systemInstruction.parts[0].text);
}

function isLessonBriefVerificationRequest(body) {
  return body.systemInstruction.parts[0].text.includes("要求覆盖复核器");
}

function isAuthoringRequest(body) {
  return !isLessonBriefRequest(body) && !isLessonBriefVerificationRequest(body);
}

function sourceRefsFromPlanningRequest(body) {
  return body.generationConfig.responseJsonSchema.properties.request_items
    .items.properties.source_ref.enum;
}

function plannedBrief(body) {
  const prompt = body.contents[0].parts[0].text;
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

async function runTool({ baseUrl, serviceAccount, workDirectory, input = {}, environment = {} }) {
  const child = spawn(resolve(root, "main"), ["oll_generate_lesson"], {
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
    }, 120);
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
        OLL_TOTAL_TIMEOUT_MS: "40",
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
    assert.equal(requestSchema.properties.steps.type, "array");
    assert.equal(requestSchema.properties.steps.items.$ref, "#/$defs/step");
    assert.equal(requestSchema.$defs.action.anyOf.length, 10);
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
    assert.match(result.stderr, /lesson-brief-review-suggestions/);
    const protocol = JSON.parse(result.stdout);
    const artifact = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
    assert.equal(artifact.lesson.variables[0].as, "t");
    assert.equal(artifact.lesson.variables[0].control.kind, "slider");
    assert.equal(artifact.steps[0].beats[0].actions[0].as, "spring-motion");
    assert.equal(artifact.steps[0].beats[0].actions[1].content.curves[0].expression, "cos(x)");
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("tool reports unsupported 3D instead of silently replacing it with a 2D diagram", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-unsupported-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const unsupportedBrief = {
    version: "1",
    request_summary: "用 3D 展示可旋转立方体",
    request_items: [
      { id: "explain-cube", source_ref: "learner_request:1", kind: "teaching_goal", polarity: "require" },
      { id: "need-3d", source_ref: "learner_request:1", kind: "unsupported_feature", polarity: "require" },
    ],
    non_requirement_clauses: [],
    teaching_goal_requirements: [{ id: "explain-cube-goal", goal: "展示可旋转立方体", request_item_ids: ["explain-cube"] }],
    presentation_constraints: [],
    visual_requirements: [],
    visual_relationships: [],
    shared_variable_requirements: [],
    progressive_revision_kinds: [],
    unhandled_request_items: [{ request_item_id: "need-3d", status: "unsupported", reason: "当前 OLL 没有 3D 语法" }],
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
      ? unsupportedBrief
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
      input: { learner_request: "请用3D展示一个可以旋转的立方体" },
    });

    assert.equal(result.exitCode, 1);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.error_code, "UNSUPPORTED_REQUIREMENT");
    assert.equal(modelRequests.filter(isAuthoringRequest).length, 0);
    assert.match(protocol.output, /当前 OLL 没有 3D 语法/);
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
      /OLL_VISUAL_REQUIREMENT_UNSATISFIED/,
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
    assert.match(authorRequests[1].contents[0].parts[0].text, /OLL_VISUAL_REQUIREMENT_UNSATISFIED/);
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

test("tool repairs only the missing angle arc while preserving a valid geometry candidate", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-angle-arc-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const missingArcLesson = structuredClone(validUnitCirclePlotLesson);
  const geometry = missingArcLesson.steps[0].beats[0].actions.find(
    (action) => action.do === "write" && action.kind === "geometry",
  );
  delete geometry.content.arcs;
  const authorResponses = [missingArcLesson, validUnitCirclePlotLesson];
  const modelRequests = [];
  let authorResponseIndex = 0;
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
    const responseSchema = authorRequests[0].generationConfig.responseJsonSchema;
    const geometryVariant = responseSchema.$defs.action.anyOf.find(
      (variant) => variant.properties.kind?.enum?.[0] === "geometry",
    );
    assert.ok(geometryVariant.properties.content.required.includes("arcs"));
    assert.equal(geometryVariant.properties.content.properties.arcs.minItems, 1);
    const repairPrompt = authorRequests[1].contents[0].parts[0].text;
    assert.match(repairPrompt, /上一份候选 OLL/);
    assert.match(repairPrompt, /"as":"unit-circle"/);
    const violationSection = repairPrompt.split("精确校验错误：")[1];
    assert.match(violationSection, /OLL_VISUAL_REQUIREMENT_UNSATISFIED/);
    assert.match(violationSection, /angle_arc/);
    assert.doesNotMatch(violationSection, /projection_segment/);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.generation_attempts, 2);
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
  circleAction.as = "coordinate-circle";
  genericCircleLesson.steps[0].beats[0].actions[0] = circleAction;
  genericCircleLesson.steps[0].beats[0].actions[1].targets = ["coordinate-circle"];
  genericCircleLesson.close.focus = ["coordinate-circle"];
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
