import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  callStructuredModel,
  createVertexClient,
  probeVertexSchema,
} from "../main";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function vertexPayload(value) {
  return JSON.stringify({
    candidates: [{
      finishReason: "STOP",
      content: { parts: [{ text: JSON.stringify(value) }] },
    }],
  });
}

async function runTool({
  baseUrl,
  serviceAccount,
  workDirectory,
  input = {},
  environment = {},
  tool = "oll_generate_lesson",
}) {
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

test("a host-provided Vertex access token bypasses the OAuth exchange", async () => {
  let oauthRequests = 0;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // Consume the body before replying.
    }
    if (request.url === "/token") {
      oauthRequests += 1;
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "OAuth must not be called" }));
      return;
    }
    assert.equal(request.headers.authorization, "Bearer host-token");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(vertexPayload({ ok: true }));
  });
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const previous = {
      VERTEX_SA_JSON: process.env.VERTEX_SA_JSON,
      VERTEX_ACCESS_TOKEN: process.env.VERTEX_ACCESS_TOKEN,
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
      VERTEX_BASE_URL: process.env.VERTEX_BASE_URL,
      OLL_MODEL: process.env.OLL_MODEL,
    };
    delete process.env.VERTEX_SA_JSON;
    process.env.VERTEX_ACCESS_TOKEN = "host-token";
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    process.env.VERTEX_BASE_URL = `${baseUrl}/v1`;
    process.env.OLL_MODEL = "test-model";
    try {
      const client = await createVertexClient();
      assert.equal(client.accessToken, "host-token");
      assert.equal(oauthRequests, 0);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("structured Vertex calls retry a connection failure before any HTTP response", async () => {
  let requests = 0;
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: { ok: { type: "boolean" } },
  };
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // Consume the request before simulating a dropped provider connection.
    }
    requests += 1;
    if (requests === 1) {
      request.socket.destroy();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      candidates: [{
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify({ ok: true }) }] },
      }],
    }));
  });
  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const content = await callStructuredModel({
      endpoint: `http://127.0.0.1:${address.port}/generate`,
      model: "test-model",
      accessToken: "test-token",
      timeoutMs: 5_000,
      maxTokens: 32,
      requestAttempts: 2,
    }, {
      label: "lesson-plan-outline",
      turnId: "transport-retry-test",
      systemPrompt: "Return JSON.",
      prompt: "Return ok.",
      responseSchema: schema,
      maxTokens: 32,
      lessonPlanPart: "outline",
      lessonPlanAttempt: 1,
    });
    assert.equal(requests, 2);
    assert.deepEqual(JSON.parse(content), { ok: true });
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("a successful HTTP response without JSON is classified for lesson fallback", async () => {
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // Consume the request before returning an unusable model candidate.
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ candidates: [{ finishReason: "RECITATION" }] }));
  });
  try {
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    await assert.rejects(
      () => callStructuredModel({
        endpoint: `http://127.0.0.1:${address.port}/generate`,
        model: "test-model",
        accessToken: "test-token",
        timeoutMs: 5_000,
        maxTokens: 32,
        requestAttempts: 1,
      }, {
        label: "lesson-plan-outline",
        turnId: "empty-candidate-test",
        systemPrompt: "Return JSON.",
        prompt: "Return a lesson.",
        responseSchema: { type: "object", properties: {} },
        maxTokens: 32,
        lessonPlanPart: "outline",
        lessonPlanAttempt: 1,
      }),
      (error) => error?.code === "VERTEX_RESPONSE_EMPTY"
        && /finishReason=RECITATION/u.test(error.message),
    );
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("Lesson Plan bundle does not duplicate the provider client", async () => {
  const bundle = await readFile(join(root, "lesson-plan.js"), "utf8");
  assert.doesNotMatch(bundle, /async function callStructuredModel\(/u);
  assert.doesNotMatch(bundle, /async function vertexAccessToken\(/u);
  assert.match(bundle, /async function generateLessonPlanWithModel\(/u);
});

test("the complete-lesson executable exposes one Lesson Plan path and no rollback switch", async () => {
  const executable = await readFile(join(root, "main"), "utf8");
  assert.doesNotMatch(executable, /OLL_LESSON_PLAN_MODE/u);
  assert.doesNotMatch(executable, /OLL_AUTHORING_STRATEGY/u);
  assert.doesNotMatch(executable, /lesson-plan-experimental/u);
  assert.match(executable, /authoring_strategy:\s*"lesson_plan"/u);
});

test("the source and executable do not retain the unreachable direct-OLL lesson generator", async () => {
  const source = await readFile(join(root, "src/main.ts"), "utf8");
  const executable = await readFile(join(root, "main"), "utf8");
  const obsoletePatterns = [
    /LESSON_BRIEF_SYSTEM_PROMPT/u,
    /function buildAuthoringResponseJsonSchema\(/u,
    /async function planLesson\(/u,
    /async function generateLessonInParallel\(/u,
    /async function generateLesson\(/u,
    /references\/oll-authoring-v0\.1\.schema\.json/u,
  ];
  for (const pattern of obsoletePatterns) {
    assert.doesNotMatch(source, pattern);
    assert.doesNotMatch(executable, pattern);
  }
  assert.match(source, /generateLessonPlanWithModel/u);
});

test("the complete-lesson command validates the outline before generating the first section", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-lesson-plan-command-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const outline = {
    version: "0.1",
    title: "为什么负负得正",
    goals: ["解释符号规则"],
    teaching_strategies: [],
    numbers: [],
    request_coverage: [{ request_part: 1, treatment: "teach", sections: [1] }],
    course_visuals: [],
    sections: [{
      purpose: "解释符号规则",
      allowed_capabilities: [],
      reusable_items: [{ kind: "board_item", board_kind: "math" }],
    }],
    close: {
      summary: "负数乘负数得到正数。",
      focus: [{ source: "reusable", section: 1, item: 1 }],
    },
  };
  const section = {
    version: "0.1",
    section: 1,
    moments: [{
      narration: "我们用分配律检查这个符号规则。",
      delivery: "patient",
      math_creates: [],
      note_creates: [],
      focuses: [{
        intent: "观察等式",
        timing: "after_speech",
      }],
      points: [],
    }],
    reusable_board_creates: {
      item_1: {
        moment: 1,
        timing: "during_speech",
        role: "derivation",
        content: { latex: "(-1)\\\\times(-1)=1" },
        placement: { relation: "new_region" },
      },
    },
  };
  let modelCalls = 0;
  const server = createServer(async (request, response) => {
    if (request.url === "/token") {
      for await (const _chunk of request) { /* consume OAuth request */ }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ access_token: "test-token", expires_in: 3600 }));
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    const schema = payload.generationConfig.responseJsonSchema;
    const content = schema.properties?.course
      ? {
          disposition: "generate_lesson",
          learner_response: "",
          course: outline,
        }
      : schema.properties?.course_visuals ? outline : section;
    modelCalls += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      candidates: [{
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(content) }] },
      }],
    }));
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
    });
    assert.equal(result.exitCode, 0, result.stderr);
    const messages = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
    const completed = messages.find((message) => message.success === true);
    assert.equal(completed.authoring_strategy, "lesson_plan");
    assert.equal(completed.lesson_plan_sections, 1);
    assert.equal(completed.published_parts, 1);
    assert.equal(modelCalls, 2);
    const lesson = JSON.parse(await readFile(completed.files_to_send[0], "utf8"));
    assert.equal(lesson.dsl, "octos.lesson");
    assert.equal(lesson.steps.length, 1);
    assert.equal(lesson.steps[0].beats[0].actions[0].kind, "math");
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("an incomplete composer request returns clarification without writing a lesson artifact", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-voice-clarify-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  let modelCalls = 0;
  const server = createServer(async (request, response) => {
    if (request.url === "/token") {
      for await (const _chunk of request) { /* consume OAuth request */ }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ access_token: "test-token", expires_in: 3600 }));
      return;
    }
    for await (const _chunk of request) { /* consume model request */ }
    modelCalls += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(vertexPayload({
      disposition: "clarify",
      learner_response: "你想了解这本书的哪一方面？",
      course: null,
    }));
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
        learner_request: "The book.",
        input_modality: "text",
      },
    });
    assert.equal(result.exitCode, 0, result.stderr);
    const completed = result.stdout.trim().split("\n")
      .map((line) => JSON.parse(line))
      .find((message) => message.success === true);
    assert.deepEqual(completed.structured_metadata, {
      lesson_disposition: "clarify",
      learner_response: "你想了解这本书的哪一方面？",
    });
    assert.equal(completed.published_parts, 0);
    assert.equal("files_to_send" in completed, false);
    assert.equal(modelCalls, 1);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
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
  student_task_requirements: [],
  scene3d_task_requirements: [],
  progressive_revision_kinds: [],
  unhandled_request_items: [],
};

const unitCircleStudentTask = {
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
  request_item_ids: ["complete-sine-task"],
};

const unitCircleTaskBrief = structuredClone(unitCirclePlotBrief);
unitCircleTaskBrief.request_items.push({
  id: "complete-sine-task",
  source_ref: "learner_request:1",
  kind: "student_task",
  polarity: "require",
});
unitCircleTaskBrief.student_task_requirements = [structuredClone(unitCircleStudentTask)];

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
    view_match: "view_direction",
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

const paraboloidSectionBrief = {
  version: "1",
  request_summary: "用可旋转的抛物面和水平截面解释截线为圆",
  request_items: [
    { id: "explain-paraboloid", source_ref: "learner_request:1", kind: "teaching_goal", polarity: "require" },
    { id: "show-paraboloid", source_ref: "learner_request:2", kind: "visual", polarity: "require" },
    { id: "show-section-circle", source_ref: "learner_request:2", kind: "visual", polarity: "require" },
    { id: "relate-section-views", source_ref: "learner_request:2", kind: "relationship", polarity: "require" },
    { id: "change-section-height", source_ref: "learner_request:2", kind: "continuous_change", polarity: "require" },
    { id: "control-spatial-view", source_ref: "learner_request:2", kind: "student_control", polarity: "require" },
  ],
  non_requirement_clauses: [],
  teaching_goal_requirements: [{
    id: "explain-horizontal-level-set",
    goal: "解释 z=x^2+y^2 的水平截线为什么是圆",
    request_item_ids: ["explain-paraboloid"],
  }],
  presentation_constraints: [{
    id: "use-three-dimensional-view",
    capability: "scene3d",
    polarity: "require",
    request_item_ids: ["show-paraboloid"],
  }],
  visual_requirements: [
    {
      id: "paraboloid-scene",
      surface: "scene3d",
      purpose: "展示抛物面和会随高度变化的水平截面",
      required_features: ["spatial_axes", "function_surface", "cross_section", "orbit_control"],
      expressions: ["x^2+y^2"],
      request_item_ids: ["show-paraboloid", "change-section-height", "control-spatial-view"],
    },
    {
      id: "section-circle-geometry",
      surface: "geometry",
      purpose: "展示 x^2+y^2=h 的截线圆半径随 h 变化",
      required_features: ["coordinate_axes", "equal_scale", "circle", "origin_centered_circle"],
      expressions: [],
      request_item_ids: ["show-section-circle", "change-section-height"],
    },
  ],
  visual_relationships: [{
    id: "section-to-circle",
    from: "paraboloid-scene",
    to: "section-circle-geometry",
    relation: "maps_to",
    request_item_ids: ["relate-section-views"],
  }],
  shared_variable_requirements: [{
    id: "section-height",
    variable: "h",
    purpose: "让三维水平截面和二维截线圆共用同一高度",
    initial: 1,
    min: 0.25,
    max: 4,
    label: "截面高度 h",
    unit: "",
    slider_step: 0.25,
    animate_to: 4,
    easing: "linear",
    duration_intent: "normal",
    bound_visuals: ["paraboloid-scene", "section-circle-geometry"],
    direct_angle_geometry: "",
    request_item_ids: ["change-section-height"],
  }],
  student_task_requirements: [],
  scene3d_task_requirements: [],
  progressive_revision_kinds: [],
  unhandled_request_items: [],
};

const validParaboloidSectionLesson = structuredClone(validLesson);
validParaboloidSectionLesson.lesson.title = "抛物面的水平截线";
validParaboloidSectionLesson.lesson.goals = ["解释 z=x^2+y^2 的水平截线为什么是圆"];
validParaboloidSectionLesson.lesson.variables = [{
  as: "h",
  initial: 1,
  min: 0.25,
  max: 4,
  label: "截面高度 h",
  unit: "",
  control: { kind: "slider", step: 0.25 },
}];
validParaboloidSectionLesson.steps[0].purpose = "联动观察抛物面截面与截线圆";
validParaboloidSectionLesson.steps[0].beats[0].actions = [
  {
    do: "write",
    as: "paraboloid-scene",
    kind: "scene3d",
    role: "diagram",
    content: {
      title: "z=x²+y² 与水平截面",
      fallback: "开口向上的抛物面被高度为 h 的水平面截出圆。",
      axes: true,
      camera: { yaw: 0.72, pitch: 0.55, zoom: 1 },
      objects: [{
        as: "paraboloid",
        kind: "surface",
        label: "z=x²+y²",
        color: "teal",
        expression: "x^2+y^2",
        x_range: { min: -2, max: 2 },
        y_range: { min: -2, max: 2 },
        samples: 12,
      }],
      sections: [{
        as: "horizontal-section",
        axis: "z",
        value: 1,
        targets: ["paraboloid"],
        display: "plane_and_intersection",
        label: "水平截面",
        color: "orange",
      }],
      bindings: [{ target: "horizontal-section.value", expression: "h" }],
    },
    place: { relation: "new_region" },
  },
  {
    do: "write",
    as: "section-circle-geometry",
    kind: "geometry",
    role: "diagram",
    content: {
      title: "x²+y²=h",
      axes: {
        x: { min: -2.25, max: 2.25, label: "x" },
        y: { min: -2.25, max: 2.25, label: "y" },
        equal_scale: true,
      },
      points: [{ as: "origin", x: 0, y: 0, label: "O" }],
      circles: [{ as: "section-circle", center: "origin", radius: 1, label: "截线圆" }],
      bindings: [{ target: "section-circle.radius", expression: "sqrt(h)" }],
    },
    place: { relation: "right_of", anchor: "paraboloid-scene", gap: "normal" },
  },
  {
    do: "connect",
    as: "section-to-circle",
    from: "paraboloid-scene",
    to: "section-circle-geometry",
    relation: "同一高度 h 的截面与截线",
  },
  {
    do: "focus",
    when: "after_speech",
    targets: ["paraboloid-scene", "section-circle-geometry"],
    intent: "current_step",
  },
];
validParaboloidSectionLesson.steps[0].beats.push({
  key: "animate-section-height",
  say: "观察截面升高时，截线圆的半径怎样变化。",
  delivery: "patient",
  actions: [
    { do: "animate", variable: "h", value: 4, easing: "linear", duration_intent: "normal" },
    {
      do: "focus",
      when: "after_speech",
      targets: ["paraboloid-scene", "section-circle-geometry"],
      intent: "current_step",
    },
  ],
});
validParaboloidSectionLesson.close = {
  summary: "水平截面 z=h 与抛物面相交得到 x²+y²=h，因此截线是半径为 √h 的圆。",
  focus: ["paraboloid-scene", "section-circle-geometry"],
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
  student_task_requirements: [],
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

test("selection classifier returns bounded metadata without creating an artifact", async () => {
  const sessionWorkspace = await mkdtemp(join(tmpdir(), "learning-coach-selection-classification-"));
  const workDirectory = join(sessionWorkspace, "skill-output");
  const uploadsDirectory = join(sessionWorkspace, "uploads");
  await mkdir(workDirectory, { recursive: true });
  await mkdir(uploadsDirectory, { recursive: true });
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
      kind: "math",
      content: "y = x^2",
      confidence: "high",
    }));
  });
  try {
    await writeFile(
      join(uploadsDirectory, "selection.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    assert.equal(typeof address, "object");
    const result = await runTool({
      tool: "oll_classify_selection",
      baseUrl: `http://127.0.0.1:${address.port}`,
      serviceAccount: {
        project_id: "test-project",
        client_email: "lesson@test-project.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
        token_uri: `http://127.0.0.1:${address.port}/token`,
      },
      workDirectory,
      environment: {
        OCTOS_SESSION_WORKSPACE: sessionWorkspace,
      },
      input: {
        source: {
          source_id: "selection-classify-1",
          document_id: "ink-1",
          document_version: 7,
          bounds: { x: 120, y: 80, width: 240, height: 90 },
          checksum: { algorithm: "sha-256", value: "a".repeat(64) },
        },
        board: {
          board_id: "learning-board-session-1",
          revision: 12,
          targets: [{
            target_id: "plot-1:curve:sin",
            node_id: "plot-1",
            element_id: "plot-1:curve:sin",
            kind: "plot-curve",
            label: "SECRET_UNDERLYING_FUNCTION",
            world_bounds: { x: 100, y: 60, width: 320, height: 220 },
            overlap: 0.8,
            distance: 0,
            z_index: 2,
          }],
        },
        selection_media: "uploads/selection.png",
      },
    });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(requests.length, 1);
    assert.deepEqual(
      requests[0].generationConfig.responseJsonSchema.properties.kind.enum,
      ["text", "math", "geometry", "data", "unknown"],
    );
    assert.equal(requests[0].contents[0].parts[1].inlineData.mimeType, "image/png");
    assert.equal(JSON.stringify(requests[0]).includes("SECRET_UNDERLYING_FUNCTION"), false);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.success, true);
    assert.equal(protocol.files_to_send, undefined);
    assert.deepEqual(protocol.structured_metadata, {
      selection_classification: {
        kind: "math",
        content: "y = x^2",
        confidence: "high",
      },
    });
  } finally {
    await new Promise((done) => server.close(done));
    await rm(sessionWorkspace, { recursive: true, force: true });
  }
});

test("selection tool writes a source-linked artifact without producing a lesson", async () => {
  const sessionWorkspace = await mkdtemp(join(tmpdir(), "learning-coach-selection-"));
  const workDirectory = join(sessionWorkspace, "skill-output");
  const uploadsDirectory = join(sessionWorkspace, "uploads");
  await mkdir(workDirectory, { recursive: true });
  await mkdir(uploadsDirectory, { recursive: true });
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const requests = [];
  const modelResponses = [{
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
  }, {
    interpretation_kind: "math",
    interpretation_content: "x^4+y^4+z^4=1",
    interpretation_confidence: "high",
    response_kind: "scene3d",
    scene_kind: "implicit_surface",
    title: "四次隐式曲面",
    text: "拖动可以从不同方向观察这个三维曲面。",
    items: [],
    expression: "x^4+y^4+z^4-1",
    x_min: -1.2,
    x_max: 1.2,
    y_min: -1.2,
    y_max: 1.2,
    z_min: -1.2,
    z_max: 1.2,
    level: 0,
    samples: 12,
    alternatives: [],
  }, {
    interpretation_kind: "math",
    interpretation_content: "w+x+y+z=1",
    interpretation_confidence: "high",
    response_kind: "scene3d",
    scene_kind: "implicit_surface",
    title: "四变量关系",
    text: "这个关系含有四个独立变量。",
    items: [],
    expression: "w+x+y+z-1",
    x_min: -1,
    x_max: 1,
    y_min: -1,
    y_max: 1,
    z_min: -1,
    z_max: 1,
    level: 0,
    samples: 12,
    alternatives: ["固定 w 后绘制三维切片"],
  }, {
    interpretation_kind: "math",
    interpretation_content: "y = x^2",
    interpretation_confidence: "high",
    response_kind: "explanation",
    title: "二次函数说明",
    text: "这个式子表示输出等于输入的平方。",
    items: ["图像关于 y 轴对称", "最小值是 0"],
  }];
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
    response.end(vertexPayload(modelResponses[requests.length - 1]));
  });
  try {
    await writeFile(
      join(uploadsDirectory, "selection.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
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
      environment: { OCTOS_SESSION_WORKSPACE: sessionWorkspace },
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
        tool_id: "generate-plot",
        board: {
          board_id: "learning-board-session-1",
          revision: 12,
          targets: [{
            target_id: "formula-node:formula-fragment",
            node_id: "formula-node",
            element_id: "formula-fragment",
            kind: "math-fragment",
            label: "y = x^2",
            value_json: JSON.stringify({ latex: "y=x^2" }),
            world_bounds: { x: 118, y: 78, width: 244, height: 94 },
            overlap: 0.91,
            distance: 0,
            z_index: 4,
          }],
        },
        selection_media: "uploads/selection.png",
      },
    });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].contents[0].parts.length, 1);
    assert.equal(
      "interpretation_content" in requests[0].generationConfig.responseJsonSchema.properties,
      false,
    );
    assert.equal(
      requests[0].generationConfig.responseJsonSchema.properties.response_kind.enum[1],
      "plot",
    );
    assert.deepEqual(requests[0].generationConfig.thinkingConfig, {
      thinkingLevel: "LOW",
    });
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.success, true);
    assert.equal(protocol.files_to_send.length, 1);
    assert.match(protocol.files_to_send[0], /\.octos-selection-enhancement\.json$/);
    const artifact = JSON.parse(await readFile(protocol.files_to_send[0], "utf8"));
    assert.equal(artifact.profile, "octos.selection-enhancement");
    assert.equal(artifact.version, "0.2");
    assert.equal(artifact.source.checksum.value, checksum);
    assert.equal(artifact.tool_id, "generate-plot");
    assert.equal(artifact.board.targets[0].target_id, "formula-node:formula-fragment");
    assert.deepEqual(artifact.board.targets[0].value, { latex: "y=x^2" });
    assert.equal(artifact.board.targets[0].overlap, 0.91);
    assert.deepEqual(
      artifact.board.targets[0].world_bounds,
      { x: 118, y: 78, width: 244, height: 94 },
    );
    assert.equal(artifact.response.kind, "plot");
    assert.equal(artifact.response.expression, "x^2");
    for (const programOwnedField of [
      "x_min", "x_max", "y_min", "y_max", "z_min", "z_max", "samples",
    ]) {
      assert.equal(
        programOwnedField in requests[0].generationConfig.responseJsonSchema.properties,
        false,
        programOwnedField,
      );
    }
    assert.deepEqual(artifact.response.x_range, { min: -4, max: 4 });
    assert.ok(artifact.response.y_range.min < 0);
    assert.ok(artifact.response.y_range.max > 15);

    const sceneResult = await runTool({
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
        turn_id: "selection-scene3d",
        learner_request: "生成函数图像",
        source: {
          source_id: "selection-scene3d-source",
          document_id: "ink-1",
          document_version: 8,
          bounds: { x: 120, y: 80, width: 300, height: 90 },
          checksum: { algorithm: "sha-256", value: checksum },
        },
        content_hint: "math",
        tool_id: "generate-plot",
        board: { board_id: "learning-board-session-1", revision: 13, targets: [] },
        recognized_content: "x^4+y^4+z^4=1",
        recognition_confidence: "high",
      },
    });
    assert.equal(sceneResult.exitCode, 0, sceneResult.stderr);
    const sceneProtocol = JSON.parse(sceneResult.stdout);
    const sceneArtifact = JSON.parse(await readFile(sceneProtocol.files_to_send[0], "utf8"));
    assert.equal(sceneArtifact.response.kind, "scene3d", JSON.stringify(sceneArtifact.response));
    assert.equal(sceneArtifact.response.content.objects[0].kind, "implicit_surface");
    assert.equal(sceneArtifact.response.content.objects[0].expression, "x^4+y^4+z^4-1");
    assert.deepEqual(sceneArtifact.response.content.objects[0].x_range, { min: -2, max: 2 });
    assert.deepEqual(sceneArtifact.response.content.objects[0].y_range, { min: -2, max: 2 });
    assert.deepEqual(sceneArtifact.response.content.objects[0].z_range, { min: -2, max: 2 });
    assert.equal(sceneArtifact.response.content.objects[0].samples, 12);

    const unsupportedResult = await runTool({
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
        turn_id: "selection-unsupported",
        learner_request: "生成函数图像",
        source: {
          source_id: "selection-unsupported-source",
          document_id: "ink-1",
          document_version: 9,
          bounds: { x: 120, y: 80, width: 300, height: 90 },
          checksum: { algorithm: "sha-256", value: checksum },
        },
        content_hint: "math",
        tool_id: "generate-plot",
        board: { board_id: "learning-board-session-1", revision: 14, targets: [] },
        recognized_content: "w+x+y+z=1",
        recognition_confidence: "high",
      },
    });
    assert.equal(unsupportedResult.exitCode, 0, unsupportedResult.stderr);
    const unsupportedProtocol = JSON.parse(unsupportedResult.stdout);
    const unsupportedArtifact = JSON.parse(await readFile(
      unsupportedProtocol.files_to_send[0],
      "utf8",
    ));
    assert.equal(unsupportedArtifact.response.kind, "unsupported");
    assert.equal(unsupportedArtifact.response.reason_code, "unsupported_variables");
    assert.deepEqual(unsupportedArtifact.response.alternatives, ["固定 w 后绘制三维切片"]);

    const explanationResult = await runTool({
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
        turn_id: "selection-explanation",
        learner_request: "解释这一部分",
        source: {
          source_id: "selection-explanation-source",
          document_id: "ink-1",
          document_version: 10,
          bounds: { x: 120, y: 80, width: 300, height: 90 },
          checksum: { algorithm: "sha-256", value: checksum },
        },
        content_hint: "math",
        tool_id: "explain",
        board: { board_id: "learning-board-session-1", revision: 15, targets: [] },
        recognized_content: "y=x^2",
        recognition_confidence: "high",
      },
    });
    assert.equal(explanationResult.exitCode, 0, explanationResult.stderr);
    const explanationSchema = requests[3].generationConfig.responseJsonSchema;
    assert.equal("response_kind" in explanationSchema.properties, false);
    assert.equal("interpretation_kind" in explanationSchema.properties, false);
    assert.equal("expression" in explanationSchema.properties, false);
    assert.equal("x_min" in explanationSchema.properties, false);
    assert.doesNotMatch(requests[3].systemInstruction.parts[0].text, /implicit_surface/u);
    const explanationProtocol = JSON.parse(explanationResult.stdout);
    const explanationArtifact = JSON.parse(await readFile(
      explanationProtocol.files_to_send[0],
      "utf8",
    ));
    assert.equal(explanationArtifact.response.kind, "explanation");
    assert.equal(explanationArtifact.response.title, "二次函数说明");
    await assert.rejects(
      readFile(join(workDirectory, "study", "oll", "learn-e2e-001.octos-lesson.json")),
    );
  } finally {
    await new Promise((done) => server.close(done));
    await rm(sessionWorkspace, { recursive: true, force: true });
  }
});

test("complete lessons reject current-image input instead of falling back to another generator", async () => {
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
    assert.match(result.stderr, /Complete lesson generation accepts self_contained requests only/);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.success, false);
    assert.equal(protocol.error_code, "LESSON_REQUEST_SOURCE_UNSUPPORTED");
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("complete lessons reject explicit board follow-up input instead of falling back", async () => {
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
    assert.match(result.stderr, /Complete lesson generation accepts self_contained requests only/);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.success, false);
    assert.equal(protocol.retryable, false);
    assert.equal(protocol.do_not_retry_same_turn, true);
    assert.deepEqual(protocol.structured_metadata, {
      retryable: false,
      do_not_retry_same_turn: true,
    });
    assert.equal(protocol.output, "这次课程没有生成成功，请稍后重试。");
    assert.equal(protocol.error_code, "LESSON_REQUEST_SOURCE_UNSUPPORTED");
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("old board-reference fields cannot bypass the complete-lesson source boundary", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "learning-coach-stale-board-ref-"));
  try {
    const result = await runTool({
      baseUrl: "http://127.0.0.1:1",
      serviceAccount: {},
      workDirectory,
      input: {
        learner_request: "围绕我选中的公式讲一课",
        request_source: "explicit_board_follow_up",
        board_summary: "已明确选择一个公式",
        base_revision: 9,
        board_context: {
          board_id: "learning-board-session-1",
          revision: 8,
          references: [{
            as: "board-ref-1-1",
            type: "node",
            target_id: "prior:node:formula",
            fragments: [],
          }],
        },
      },
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Complete lesson generation accepts self_contained requests only/);
    assert.equal(JSON.parse(result.stdout).success, false);
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
});

test("complete lessons reject a missing request source before model generation", async () => {
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
    assert.match(result.stderr, /Complete lesson generation accepts self_contained requests only/);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.success, false);
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
});
