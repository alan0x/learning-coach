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
      response.end(JSON.stringify({
        candidates: [{
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(validLesson) }] },
        }],
      }));
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
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, "/token");
    assert.match(requests[0].body.assertion, /^[^.]+\.[^.]+\.[^.]+$/);
    assert.equal(requests[0].body.grant_type, "urn:ietf:params:oauth:grant-type:jwt-bearer");
    assert.equal(
      requests[1].url,
      "/v1/projects/test-project/locations/global/publishers/google/models/gemini-3.5-flash:generateContent",
    );
    assert.equal(requests[1].authorization, "Bearer vertex-test-token");
    assert.equal(requests[1].body.generationConfig.responseMimeType, "application/json");
    assert.equal(requests[1].body.generationConfig.temperature, 0);
    const systemPrompt = requests[1].body.systemInstruction.parts[0].text;
    assert.match(systemPrompt, /混合文字与公式/);
    assert.match(systemPrompt, /kind="math".*content\.latex/);
    assert.match(systemPrompt, /say.*自然语言.*LaTeX/);
    assert.match(systemPrompt, /每个 Beat 必须包含.*after_speech.*focus/);
    const generationPrompt = requests[1].body.contents[0].parts[0].text;
    assert.match(generationPrompt, /request_source 已经确定本轮题目的唯一来源/);
    assert.match(generationPrompt, /"request_source": "self_contained"/);
    assert.match(generationPrompt, /"existing_board": null/);
    const requestSchema = requests[1].body.generationConfig.responseJsonSchema;
    assert.equal(requests[1].body.generationConfig.responseSchema, undefined);
    assert.equal(requestSchema.type, "object");
    assert.deepEqual(requestSchema.properties.dsl.enum, ["octos.lesson"]);
    assert.equal(requestSchema.properties.dsl.type, undefined);
    assert.equal(requestSchema.properties.lesson.properties.title.type, "string");
    assert.equal(requestSchema.properties.steps.type, "array");
    assert.equal(requestSchema.properties.steps.items.$ref, "#/$defs/step");
    assert.equal(requestSchema.$defs.action.anyOf.length, 8);
    assert.deepEqual(
      requestSchema.$defs.action.anyOf[0].required,
      ["do", "as", "kind", "role", "content", "place"],
    );
    assert.deepEqual(requestSchema.$defs.action.anyOf[0].properties.do.enum, ["write"]);
    assert.deepEqual(requestSchema.$defs.action.anyOf[0].properties.content.required, ["text"]);
    assert.equal(requestSchema.$defs.action.anyOf[0].properties.content.properties.latex.type, "string");
    assert.equal(requestSchema.$defs.action.anyOf[5].properties.content, undefined);
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
    generationRequests.push(JSON.parse(body));
    const lesson = responses[generationRequests.length - 1];
    response.end(JSON.stringify({
      candidates: [{
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(lesson) }] },
      }],
    }));
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
    assert.equal(generationRequests.length, 2);
    assert.match(
      generationRequests[1].contents[0].parts[0].text,
      /OLL_MISSING_BEAT_FOCUS/,
    );
    const protocol = JSON.parse(result.stdout);
    assert.deepEqual(JSON.parse(await readFile(protocol.files_to_send[0], "utf8")), validLesson);
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
    requests.push(request.url === "/token" ? null : JSON.parse(body));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(request.url === "/token"
      ? JSON.stringify({ access_token: "vertex-test-token" })
      : JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(validLesson) }] } }] }));
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
    const request = requests.find(Boolean);
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
    requests.push(request.url === "/token" ? null : JSON.parse(body));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(request.url === "/token"
      ? JSON.stringify({ access_token: "vertex-test-token" })
      : JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(validLesson) }] } }] }));
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
    const prompt = requests.find(Boolean).contents[0].parts[0].text;
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
    requests.push(request.url === "/token" ? null : JSON.parse(body));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(request.url === "/token"
      ? JSON.stringify({ access_token: "vertex-test-token" })
      : JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(validLesson) }] } }] }));
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
    const prompt = requests.find(Boolean).contents[0].parts[0].text;
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
