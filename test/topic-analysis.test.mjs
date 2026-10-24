import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(await readFile(join(root, "data/topic-catalog/metadata.json"), "utf8"));
const slope = "mt_WBdHkc2HTf";
const jobId = "a".repeat(64);
const capability = "c".repeat(43);
const input = {
  schema: 1, input_sha256: "b".repeat(64), source_kind: "question_submitted", taxonomy: metadata,
  units: [{ unit_id: "question", kind: "question", content: "斜率是什么？", media_references: [], missing_media: false }],
};

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
const reply = (value) => JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: typeof value === "string" ? value : JSON.stringify(value) }] } }] });

async function run({ model, history, toolInput = { job_id: jobId, capability, input } }) {
  const prompts = [], callbacks = [];
  const modelServer = await listen(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    prompts.push(JSON.parse(body));
    const next = model[prompts.length - 1];
    response.writeHead(next.status ?? 200, { "content-type": "application/json", "retry-after": "0.001" });
    response.end(next.status ? '{"error":{"message":"fixture outage"}}' : reply(next));
  });
  const historyServer = await listen(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    callbacks.push({ url: request.url, authorization: request.headers.authorization, body: JSON.parse(body) });
    response.writeHead(history?.status ?? 200, { "content-type": "application/json" });
    response.end(JSON.stringify(history?.body ?? { recorded: true }));
  });
  const workDirectory = await mkdtemp(join(tmpdir(), "topic-analysis-"));
  try {
    const env = { ...process.env, OCTOS_PROFILE_LLM_PROVIDER: "google", OCTOS_PROFILE_LLM_MODEL: "gemini-test", GEMINI_API_KEY: "fixture-key",
      GEMINI_BASE_URL: modelServer.url, OLL_MODEL_REQUEST_ATTEMPTS: "1", OCTOS_WORK_DIR: workDirectory, OCTOS_LEARN_HISTORY_URL: historyServer.url };
    const child = spawn(resolve(root, "main"), ["oll_analyze_topics"], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdin.end(JSON.stringify(toolInput));
    const exitCode = await new Promise((done, reject) => { child.once("close", done); child.once("error", reject); });
    return { exitCode, stderr, prompts, callbacks, result: JSON.parse(stdout.trim().split("\n").at(-1)) };
  } finally {
    await new Promise((done) => modelServer.server.close(done));
    await new Promise((done) => historyServer.server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
}

test("searches the bundled catalog, classifies with its candidates and hands the result back with the capability", async () => {
  const outcome = await run({ model: [
    { queries: ["slope of a line", "gradient"] },
    { units: [{ unit_id: "question", status: "mapped", topics: [{ topic_id: slope, quote: "斜率" }], reason: "Asks what slope is." }] },
  ] });
  assert.equal(outcome.exitCode, 0, outcome.stderr);
  assert.equal(outcome.result.success, true);
  assert.equal(outcome.callbacks.length, 1);
  const [callback] = outcome.callbacks;
  assert.equal(callback.url, `/api/learn/history/analysis/callback/${jobId}`);
  assert.equal(callback.authorization, `Bearer ${capability}`);
  assert.deepEqual(callback.body, { result: { schema: 1, input_sha256: input.input_sha256,
    units: [{ unit_id: "question", status: "mapped", topics: [{ topic_id: slope, quote: "斜率" }], reason: "Asks what slope is." }] } });
  // The second call only offers topics the lexical search actually returned.
  const second = JSON.stringify(outcome.prompts[1]);
  assert.ok(second.includes(slope), "the slope topic must be among the candidates");
  assert.ok(!outcome.stderr.includes("fixture-key") && !outcome.stderr.includes(capability), "credentials must not be logged");
});

test("a model outage is reported as a failed turn, which the service may retry once", async () => {
  const outcome = await run({ model: [{ status: 503 }] });
  assert.equal(outcome.result.success, false);
  assert.equal(outcome.callbacks.length, 1);
  assert.equal(outcome.callbacks[0].body.failure, "analysis-turn-failed");
  assert.match(outcome.callbacks[0].body.detail, /^[\x20-\x7e]{1,200}$/);
});

test("a reply that is not JSON is reported as unparseable, which is not retried", async () => {
  const outcome = await run({ model: [{ queries: ["slope"] }, "not json"] });
  assert.equal(outcome.result.success, false);
  assert.equal(outcome.callbacks[0].body.failure, "unparseable-analysis-result");
});

test("a result the service rejects is reported as not accepted", async () => {
  const outcome = await run({
    model: [{ queries: ["slope"] }, { units: [{ unit_id: "question", status: "mapped", topics: [{ topic_id: slope, quote: "不在原文里" }], reason: "x" }] }],
    history: { status: 400, body: { error: "Analysis evidence or catalog reference is invalid" } },
  });
  assert.equal(outcome.result.success, false);
  assert.match(outcome.result.output, /did not accept.*400.*evidence/);
});

test("material for another catalog version is never sent to the model", async () => {
  const outcome = await run({ model: [], toolInput: { job_id: jobId, capability, input: { ...input, taxonomy: { ...metadata, catalog_sha256: "d".repeat(64) } } } });
  assert.equal(outcome.prompts.length, 0);
  assert.equal(outcome.callbacks[0].body.failure, "invalid-analysis-result");
  assert.match(outcome.callbacks[0].body.detail, /different topic catalog/);
});

test("malformed tool input is refused before any request", async () => {
  const outcome = await run({ model: [], toolInput: { job_id: "x", capability, input } });
  assert.equal(outcome.result.success, false);
  assert.equal(outcome.prompts.length + outcome.callbacks.length, 0);
});
