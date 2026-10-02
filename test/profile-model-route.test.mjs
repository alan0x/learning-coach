import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveLessonModelRoute, createStructuredModelClient, createStructuredModelRouter, callStructuredModel } from "../main";

const names = ["OLL_PROVIDER", "OLL_MODEL", "OLL_FALLBACK_PROVIDER", "OLL_HEDGE_DELAY_MS", "GEMINI_API_KEY", "GEMINI_BASE_URL", "OCTOS_PROFILE_LLM_PROVIDER", "OCTOS_PROFILE_LLM_MODEL", "OCTOS_PROFILE_LLM_BASE_URL", "OCTOS_PROFILE_LLM_API_TYPE", "OCTOS_PROFILE_LLM_CONFIG_REVISION", "OLL_MODEL_REQUEST_ATTEMPTS"];
async function withEnv(values, run) {
  const saved = Object.fromEntries(names.map(k => [k, process.env[k]]));
  try {
    for (const k of names) delete process.env[k];
    Object.assign(process.env, values);
    return await run();
  } finally { for (const [k,v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
function profile(extra = {}) { return { OCTOS_PROFILE_LLM_PROVIDER: "google", OCTOS_PROFILE_LLM_MODEL: "gemini-test", ...extra }; }
const request = label => ({ label, turnId: "route-test", prompt: "Return ok", systemPrompt: "JSON only", responseSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } });
async function fixture(run, status = 200, errorBody) {
  const received = [];
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    received.push({ url: req.url, body, key: req.headers["x-goog-api-key"] });
    res.writeHead(status, { "content-type": "application/json", "retry-after": "0.001" });
    res.end(status === 200 ? JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"ok":true}' }] } }] }) : errorBody ?? '{"error":{"message":"fixture rejection"}}');
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try { await run(`http://127.0.0.1:${server.address().port}`, received); }
  finally { await new Promise(r => server.close(r)); }
}

test("profile selection wins atomically and logs only ignored variable names", async t => {
  const logs = []; t.mock.method(process.stderr, "write", chunk => { logs.push(String(chunk)); return true; });
  const route = resolveLessonModelRoute(profile({ OLL_PROVIDER: "ark", OLL_MODEL: "other" }));
  assert.equal(route.source, "profile"); assert.equal(route.provider, "gemini"); assert.equal(route.model, "gemini-test"); assert.ok(Object.isFrozen(route));
  const event = JSON.parse(logs[0].replace("learning-coach: ", ""));
  assert.equal(event.status, "ignored_server_override"); assert.deepEqual(event.variables, ["OLL_PROVIDER", "OLL_MODEL"]);
  assert.ok(!logs.join("").includes("other"));
});

test("missing model, unsupported families and credentials have specific errors", async () => {
  assert.throws(() => resolveLessonModelRoute(profile({ OCTOS_PROFILE_LLM_MODEL: " " })), { code: "LESSON_MODEL_NOT_CONFIGURED" });
  for (const family of ["ark", "volcengine", "bytedance", "openai", "unknown"]) {
    assert.throws(() => resolveLessonModelRoute(profile({ OCTOS_PROFILE_LLM_PROVIDER: family })), e => e.code === "LESSON_MODEL_UNSUPPORTED" && e.message.includes(family));
    assert.throws(() => resolveLessonModelRoute({ OLL_PROVIDER: family }), { code: "LESSON_MODEL_UNSUPPORTED" });
  }
  for (const family of ["google", "gemini", "vertex", "vertex-ai", "vertexai"]) assert.ok(resolveLessonModelRoute(profile({ OCTOS_PROFILE_LLM_PROVIDER: family })));
  await withEnv(profile(), async () => assert.rejects(createStructuredModelClient(), { code: "LESSON_CREDENTIAL_MISSING" }));
  await withEnv(profile({ GEMINI_API_KEY: "fixture-key", OCTOS_PROFILE_LLM_API_TYPE: "responses" }), async () => assert.rejects(createStructuredModelClient(), { code: "LESSON_MODEL_UNSUPPORTED" }));
  assert.equal(resolveLessonModelRoute({}).provider, "vertex");
  assert.equal(resolveLessonModelRoute({}).model, "gemini-3.6-flash");
});

test("profile and env produce identical request bytes for every label and modality", async () => {
  await fixture(async (base, received) => {
    for (const label of ["lesson-plan-bootstrap", "lesson-plan-section", "selection-classification", "selection-enhancement"]) {
      for (const media of [undefined, { mimeType: "image/png", data: "aW1hZ2U=" }]) {
        const req = { ...request(label), ...(media ? { media } : {}) };
        for (const route of [{ OLL_PROVIDER: "gemini", OLL_MODEL: "gemini-test" }, profile()]) {
          await withEnv({ ...route, GEMINI_API_KEY: "fixture-key", GEMINI_BASE_URL: base }, async () => callStructuredModel(await createStructuredModelClient(), req));
        }
        assert.equal(received.at(-1).body, received.at(-2).body);
        assert.equal(received.at(-1).url, "/models/gemini-test:generateContent");
        assert.ok(received.at(-1).key === "fixture-key", "selected credential must be used");
      }
    }
  });
});

test("selected endpoint wins and profile disables both fallback and hedge settings", async t => {
  const logs = []; t.mock.method(process.stderr, "write", chunk => { logs.push(String(chunk)); return true; });
  await fixture(async (base, received) => {
    await withEnv(profile({ GEMINI_API_KEY: "fixture-key", GEMINI_BASE_URL: "http://127.0.0.1:1", OCTOS_PROFILE_LLM_BASE_URL: base, OCTOS_PROFILE_LLM_CONFIG_REVISION: "revision-1", OLL_FALLBACK_PROVIDER: "invalid", OLL_HEDGE_DELAY_MS: "invalid" }), async () => {
      const router = await createStructuredModelRouter();
      assert.equal(router.fallbackClient, undefined);
      // Mutating the selection after client construction must not change this invocation.
      process.env.OCTOS_PROFILE_LLM_MODEL = "later-model";
      process.env.OCTOS_PROFILE_LLM_CONFIG_REVISION = "revision-2";
      await router.call(request("lesson-plan-section"));
    });
    assert.equal(received.length, 1); assert.equal(received[0].url, "/models/gemini-test:generateContent");
    const events = logs.filter(x => x.startsWith("learning-coach: ")).map(x => JSON.parse(x.slice(16)));
    for (const e of events.filter(x => x.stage === "model-call")) { assert.equal(e.route_source, "profile"); assert.equal(e.config_revision, "revision-1"); }
    assert.ok(!logs.join("").includes("fixture-key"));
  });
});

for (const [status, code, attempts] of [[401,"GEMINI_AUTH_FAILED",1],[403,"GEMINI_AUTH_FAILED",1],[404,"GEMINI_MODEL_NOT_FOUND",1],[429,"GEMINI_RATE_LIMITED",2],[400,"GEMINI_SCHEMA_REJECTED",1]]) {
  test(`HTTP ${status} preserves retry policy and exposes ${code}`, async () => {
    await fixture(async (base, received) => withEnv(profile({ GEMINI_API_KEY: "fixture-key", GEMINI_BASE_URL: base, OLL_MODEL_REQUEST_ATTEMPTS: "2" }), async () => {
      await assert.rejects(callStructuredModel(await createStructuredModelClient(), request("lesson-plan-section")), { code });
      assert.equal(received.length, attempts);
    }), status);
  });
}

for (const label of ["lesson-plan-bootstrap", "lesson-plan-section"]) {
  for (const [description, body, code] of [
    ["typed invalid-key reason", JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT", details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID", domain: "googleapis.com" }] } }), "GEMINI_AUTH_FAILED"],
    ["unstructured reason text", JSON.stringify({ error: { message: "API_KEY_INVALID" } }), "GEMINI_SCHEMA_REJECTED"],
    ["other structured reason", JSON.stringify({ error: { details: [{ reason: "SCHEMA_INVALID" }] } }), "GEMINI_SCHEMA_REJECTED"],
    ["malformed body", "API_KEY_INVALID", "GEMINI_SCHEMA_REJECTED"],
  ]) {
    test(`HTTP 400 ${description} for ${label}: ${code}, no retry`, async () => {
      await fixture(async (base, received) => withEnv(profile({ GEMINI_API_KEY: "fixture-key", GEMINI_BASE_URL: base, OLL_MODEL_REQUEST_ATTEMPTS: "2" }), async () => {
        await assert.rejects(callStructuredModel(await createStructuredModelClient(), request(label)), { code });
        assert.equal(received.length, 1);
      }), 400, body);
    });
  }
}

test("all five tool entry paths use the same profile route", async () => {
  const dir = await mkdtemp(join(tmpdir(), "coach-profile-route-"));
  await writeFile(join(dir, "image.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=", "base64"));
  const common = { turn_id: "profile-entry", learner_request: "解释一次函数", request_source: "self_contained", language: "zh-CN" };
  const selection = { source: { source_id: "s", document_id: "d", document_version: 1, bounds: { x: 0, y: 0, width: 20, height: 20 }, checksum: { algorithm: "sha-256", value: "a".repeat(64) } }, board: { board_id: "b", revision: 1, targets: [] }, selection_media: "image.png", tool_id: "explain", content_hint: "math" };
  try {
    await fixture(async (base, received) => {
      for (const [tool, input] of [
        ["oll_generate_lesson", {}],
        ["oll_generate_lesson", { request_source: "current_image", camera_media: "image.png" }],
        ["oll_generate_lesson", { request_source: "ink_selection", selection_media: "image.png" }],
        ["oll_classify_selection", selection], ["oll_enhance_selection", selection],
      ]) {
        const env = { ...process.env }; for (const k of names) delete env[k];
        Object.assign(env, profile({ GEMINI_API_KEY: "fixture-key", GEMINI_BASE_URL: base, OLL_PROVIDER: "ark", OLL_MODEL: "other", OLL_MODEL_REQUEST_ATTEMPTS: "1", OCTOS_WORK_DIR: dir, OCTOS_SESSION_WORKSPACE: dir }));
        const child = spawn(resolve("main"), [tool], { env, stdio: ["pipe","pipe","pipe"] });
        let out = "", err = ""; child.stdout.on("data", x => out += x); child.stderr.on("data", x => err += x);
        child.stdin.end(JSON.stringify({ ...common, ...input }));
        await new Promise((r,j) => { child.on("close", r); child.on("error", j); });
        const events = err.split("\n").filter(x => x.startsWith("learning-coach: {")).map(x => JSON.parse(x.slice(16)));
        assert.ok(events.some(x => x.stage === "model-call" && x.route_source === "profile" && x.model === "gemini-test"), `route missing for ${tool}/${input.request_source ?? "text"}`);
        assert.ok(!err.includes("fixture-key"));
        assert.ok(received.at(-1).key === "fixture-key");
        const result = JSON.parse(out.trim().split("\n").at(-1));
        assert.equal(result.error_code, "GEMINI_AUTH_FAILED");
        assert.equal(result.structured_metadata.error_code, "GEMINI_AUTH_FAILED");
      }
    }, 401);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
