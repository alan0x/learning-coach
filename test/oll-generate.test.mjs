import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
validUnitCirclePlotLesson.steps[0].beats[0].actions.splice(3, 0, {
  do: "animate",
  variable: "theta",
  value: Math.PI * 2,
  easing: "linear",
  duration_intent: "extended",
});

const emptyLessonBrief = {
  version: "1",
  request_summary: "解释学习者当前请求",
  visual_requirements: [],
  visual_relationships: [],
  shared_variable_requirements: [],
};

const plotLessonBrief = {
  version: "1",
  request_summary: "用正弦函数图像解释周期",
  visual_requirements: [{
    id: "sine-plot",
    surface: "plot",
    purpose: "展示正弦函数的周期波动",
    evidence: "正弦函数图像",
    required_features: ["coordinate_axes", "function_curve"],
    expressions: ["sin(x)"],
  }],
  visual_relationships: [],
  shared_variable_requirements: [],
};

const unitCirclePlotBrief = {
  version: "1",
  request_summary: "结合单位圆和正弦图像解释旋转到波动",
  visual_requirements: [
    {
      id: "circle-geometry",
      surface: "geometry",
      purpose: "展示角度旋转及纵坐标投影",
      evidence: "单位圆",
      required_features: [
        "coordinate_axes", "equal_scale", "circle", "origin_centered_circle", "unit_radius",
        "point_on_circle", "radius_segment", "projection_segment", "angle_arc",
      ],
      expressions: [],
    },
    {
      id: "sine-plot",
      surface: "plot",
      purpose: "展示纵坐标随角度形成正弦波",
      evidence: "函数图像",
      required_features: ["coordinate_axes", "function_curve"],
      expressions: ["sin(x)"],
    },
  ],
  visual_relationships: [{
    from: "circle-geometry",
    to: "sine-plot",
    relation: "maps_to",
    evidence: "结合",
  }],
  shared_variable_requirements: [{
    id: "rotation-angle",
    variable: "theta",
    purpose: "让同一个旋转角同步驱动单位圆和正弦图",
    evidence: "角度旋转",
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
  }],
};

const genericCircleBrief = {
  version: "1",
  request_summary: "在坐标系里画圆",
  visual_requirements: [{
    id: "circle-geometry",
    surface: "geometry",
    purpose: "展示一个圆",
    evidence: "圆",
    required_features: ["coordinate_axes", "equal_scale", "circle"],
    expressions: [],
  }],
  visual_relationships: [],
  shared_variable_requirements: [],
};

function isLessonBriefRequest(body) {
  return body.systemInstruction.parts[0].text.includes("课堂需求规划器");
}

function plannedBrief(body) {
  const prompt = body.contents[0].parts[0].text;
  if (prompt.includes("角度旋转如何变成周期波动")) return unitCirclePlotBrief;
  if (prompt.includes("正弦函数图像")) return plotLessonBrief;
  if (prompt.includes("在坐标系里画一个圆")) return genericCircleBrief;
  return emptyLessonBrief;
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

async function runTool({ baseUrl, serviceAccount, workDirectory, input = {} }) {
  const child = spawn(resolve(root, "main"), ["oll_generate_lesson"], {
    cwd: root,
    env: {
      ...process.env,
      VERTEX_SA_JSON: JSON.stringify(serviceAccount),
      VERTEX_BASE_URL: `${baseUrl}/v1`,
      OLL_MODEL: "gemini-3.5-flash",
      OCTOS_WORK_DIR: workDirectory,
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
      response.end(vertexPayload(isLessonBriefRequest(parsedBody) ? plannedBrief(parsedBody) : validLesson));
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
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const protocol = JSON.parse(result.stdout);
    assert.equal(protocol.success, true);
    assert.equal(protocol.files_to_send.length, 1);
    assert.equal(requests.length, 3);
    assert.equal(requests[0].url, "/token");
    assert.match(requests[0].body.assertion, /^[^.]+\.[^.]+\.[^.]+$/);
    assert.equal(requests[0].body.grant_type, "urn:ietf:params:oauth:grant-type:jwt-bearer");
    assert.equal(
      requests[2].url,
      "/v1/projects/test-project/locations/global/publishers/google/models/gemini-3.5-flash:generateContent",
    );
    assert.equal(requests[1].authorization, "Bearer vertex-test-token");
    assert.equal(requests[2].authorization, "Bearer vertex-test-token");
    assert.equal(requests[1].body.generationConfig.responseMimeType, "application/json");
    assert.equal(requests[2].body.generationConfig.responseMimeType, "application/json");
    assert.equal(requests[2].body.generationConfig.temperature, 0);
    const plannerSystemPrompt = requests[1].body.systemInstruction.parts[0].text;
    assert.match(plannerSystemPrompt, /Lesson Brief/);
    assert.match(plannerSystemPrompt, /geometry.*plot.*diagram.*image.*table/s);
    const plannerSchema = requests[1].body.generationConfig.responseJsonSchema;
    assert.deepEqual(plannerSchema.required, [
      "version", "request_summary", "visual_requirements", "visual_relationships",
      "shared_variable_requirements",
    ]);
    const systemPrompt = requests[2].body.systemInstruction.parts[0].text;
    assert.match(systemPrompt, /混合文字与公式/);
    assert.match(systemPrompt, /kind="math".*content\.latex/);
    assert.match(systemPrompt, /say.*自然语言.*LaTeX/);
    assert.match(systemPrompt, /每个 Beat 必须包含.*after_speech.*focus/);
    assert.match(systemPrompt, /lesson_brief.*可执行要求合同/);
    assert.match(systemPrompt, /滑杆、动画、直接拖点必须引用同一个变量/);
    assert.doesNotMatch(systemPrompt, /明确要求函数图像.*至少创建/u);
    assert.match(systemPrompt, /diagram 只用于语义元素与连线/);
    const generationPrompt = requests[2].body.contents[0].parts[0].text;
    assert.match(generationPrompt, /request_source 已经确定本轮题目的唯一来源/);
    assert.match(generationPrompt, /"request_source": "self_contained"/);
    assert.match(generationPrompt, /"existing_board": null/);
    assert.match(generationPrompt, /lesson_brief/);
    const requestSchema = requests[2].body.generationConfig.responseJsonSchema;
    assert.equal(requests[2].body.generationConfig.responseSchema, undefined);
    assert.equal(requestSchema.type, "object");
    assert.deepEqual(requestSchema.properties.dsl.enum, ["octos.lesson"]);
    assert.equal(requestSchema.properties.dsl.type, undefined);
    assert.equal(requestSchema.properties.lesson.properties.title.type, "string");
    assert.equal(requestSchema.properties.steps.type, "array");
    assert.equal(requestSchema.properties.steps.items.$ref, "#/$defs/step");
    assert.equal(requestSchema.$defs.action.anyOf.length, 17);
    const writeVariants = requestSchema.$defs.action.anyOf.filter(
      (variant) => variant.properties.do.enum[0] === "write",
    );
    assert.equal(writeVariants.length, 9);
    assert.deepEqual(
      writeVariants[0].required,
      ["do", "as", "kind", "role", "content", "place"],
    );
    const textWrite = writeVariants.find((variant) => variant.properties.kind.enum[0] === "text");
    const mathWrite = writeVariants.find((variant) => variant.properties.kind.enum[0] === "math");
    const plotWrite = writeVariants.find((variant) => variant.properties.kind.enum[0] === "plot");
    const geometryWrite = writeVariants.find((variant) => variant.properties.kind.enum[0] === "geometry");
    assert.deepEqual(textWrite.properties.content.required, ["text"]);
    assert.deepEqual(mathWrite.properties.content.required, ["latex"]);
    assert.deepEqual(plotWrite.properties.content.required, ["axes", "curves"]);
    assert.equal(plotWrite.properties.content.properties.text, undefined);
    assert.deepEqual(geometryWrite.properties.content.required, ["axes", "points"]);
    assert.deepEqual(geometryWrite.properties.content.properties.axes.required, ["x", "y", "equal_scale"]);
    assert.deepEqual(geometryWrite.properties.content.properties.axes.properties.equal_scale.enum, [true]);
    assert.deepEqual(geometryWrite.properties.content.properties.circles.items.required, ["as", "center", "radius"]);
    assert.deepEqual(geometryWrite.properties.content.properties.segments.items.required, ["as", "from", "to"]);
    assert.deepEqual(geometryWrite.properties.content.properties.arcs.items.required, ["as", "center", "radius", "start_angle", "end_angle"]);
    assert.deepEqual(
      plotWrite.properties.content.properties.curves.items.required,
      ["as", "expression"],
    );
    assert.equal(plotWrite.properties.content.properties.curves.minItems, 1);
    const focusVariant = requestSchema.$defs.action.anyOf.find(
      (variant) => variant.properties.do.enum[0] === "focus",
    );
    assert.equal(focusVariant.properties.content, undefined);
    const animateVariant = requestSchema.$defs.action.anyOf.find(
      (variant) => variant.properties.do.enum[0] === "animate",
    );
    assert.deepEqual(animateVariant.required, ["do", "variable", "value"]);
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
    response.end(vertexPayload(isLessonBriefRequest(parsedBody)
      ? plannedBrief(parsedBody)
      : responses[authorResponseIndex++]));
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
    const authorRequests = generationRequests.filter((request) => !isLessonBriefRequest(request));
    assert.equal(generationRequests.length, 3);
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
      evidence: "解释",
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
      : validLesson));
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
    assert.match(repairPrompt, /上一份 Lesson Brief/);
    assert.match(repairPrompt, /BRIEF_INVALID_ID/);
    assert.match(repairPrompt, /BRIEF_INCOMPATIBLE_EXPRESSIONS/);
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
    response.end(vertexPayload(isLessonBriefRequest(parsedBody)
      ? plannedBrief(parsedBody)
      : responses[authorResponseIndex++]));
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
    const authorRequests = generationRequests.filter((request) => !isLessonBriefRequest(request));
    assert.equal(generationRequests.length, 3);
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
  const responses = [meaninglessUnitCircleDiagramLesson, validUnitCirclePlotLesson];
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
    response.end(vertexPayload(isLessonBriefRequest(parsedBody)
      ? plannedBrief(parsedBody)
      : responses[authorResponseIndex++]));
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
    const authorRequests = generationRequests.filter((request) => !isLessonBriefRequest(request));
    assert.equal(generationRequests.length, 3);
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
    assert.equal(artifact.steps[0].beats[0].actions.some(
      (action) => action.do === "animate" && action.variable === "theta",
    ), true);
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
  staticLesson.steps[0].beats[0].actions = staticLesson.steps[0].beats[0].actions.filter(
    (action) => action.do !== "animate",
  );
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
    response.end(vertexPayload(isLessonBriefRequest(parsedBody)
      ? plannedBrief(parsedBody)
      : authorResponses[authorResponseIndex++]));
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
    const authorRequests = modelRequests.filter((request) => !isLessonBriefRequest(request));
    assert.equal(authorRequests.length, 2);
    const schema = authorRequests[0].generationConfig.responseJsonSchema;
    assert.ok(schema.properties.lesson.required.includes("variables"));
    const geometryVariant = schema.$defs.action.anyOf.find(
      (variant) => variant.properties.kind?.enum?.[0] === "geometry",
    );
    const plotVariant = schema.$defs.action.anyOf.find(
      (variant) => variant.properties.kind?.enum?.[0] === "plot",
    );
    assert.ok(geometryVariant.properties.content.required.includes("bindings"));
    assert.ok(plotVariant.properties.content.required.includes("bindings"));
    const repairPrompt = authorRequests[1].contents[0].parts[0].text;
    assert.match(repairPrompt, /OLL_SHARED_VARIABLE_DECLARATION_UNSATISFIED/);
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
    response.end(vertexPayload(isLessonBriefRequest(parsedBody)
      ? plannedBrief(parsedBody)
      : authorResponses[authorResponseIndex++]));
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
    const authorRequests = modelRequests.filter((request) => !isLessonBriefRequest(request));
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
    response.end(vertexPayload(isLessonBriefRequest(parsedBody) ? plannedBrief(parsedBody) : genericCircleLesson));
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
    assert.equal(modelRequests.length, 2);
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
      : vertexPayload(isLessonBriefRequest(parsedBody) ? plannedBrief(parsedBody) : validLesson));
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
    const request = requests.find((candidate) => candidate && !isLessonBriefRequest(candidate));
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
      : vertexPayload(isLessonBriefRequest(parsedBody) ? plannedBrief(parsedBody) : validLesson));
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
    const prompt = requests.find((candidate) => candidate && !isLessonBriefRequest(candidate)).contents[0].parts[0].text;
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
      : vertexPayload(isLessonBriefRequest(parsedBody) ? plannedBrief(parsedBody) : validLesson));
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
    const prompt = requests.find((candidate) => candidate && !isLessonBriefRequest(candidate)).contents[0].parts[0].text;
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
