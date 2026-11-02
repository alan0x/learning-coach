import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reply = (value) => JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: typeof value === "string" ? value : JSON.stringify(value) }] } }] });
// A 1×1 PNG: enough for the workspace media check.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const lesson = { language: "en-US", topic: "Finding slope", topic_type: "on_map_lit", goals: ["Find the slope from two points"] };
const cards = [
  { key: "card-1", title: "Pick two points", said: "Point A is at 1, 2 and B is at 4, 8.", board: ["coordinate grid", "point A (1, 2)", "point B (4, 8)"] },
  { key: "card-2", title: "Rise over run", said: "Rise over run is 3 over 6, so the slope is one half.", board: ["math: m=\\dfrac{8-2}{4-1}=\\dfrac{6}{3}=2"] },
];

async function run(tool, toolInput, modelReplies, files = {}) {
  const prompts = [];
  const server = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    prompts.push(JSON.parse(body));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(reply(modelReplies[prompts.length - 1]));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const workDirectory = await mkdtemp(join(tmpdir(), "learner-teaching-"));
  try {
    for (const [name, data] of Object.entries(files)) await writeFile(join(workDirectory, name), data);
    const env = { ...process.env, OCTOS_PROFILE_LLM_PROVIDER: "google", OCTOS_PROFILE_LLM_MODEL: "gemini-test", GEMINI_API_KEY: "fixture-key",
      GEMINI_BASE_URL: `http://127.0.0.1:${server.address().port}`, OLL_MODEL_REQUEST_ATTEMPTS: "1", OCTOS_WORK_DIR: workDirectory };
    const child = spawn(resolve(root, "main"), [tool], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdin.end(JSON.stringify(toolInput));
    const exitCode = await new Promise((done, reject) => { child.once("close", done); child.once("error", reject); });
    const lines = stdout.trim().split("\n").filter(Boolean);
    return { exitCode, stderr, prompts, result: lines.length ? JSON.parse(lines.at(-1)) : undefined };
  } finally {
    await new Promise((done) => server.close(done));
    await rm(workDirectory, { recursive: true, force: true });
  }
}

const systemText = (prompt) => JSON.stringify(prompt.systemInstruction ?? prompt.system_instruction ?? prompt);

test("Octo asks one question about the card just recorded, as a curious student", async () => {
  const outcome = await run("oll_teach_octo_question", { turn_id: "t1", lesson, cards: cards.slice(0, 1), card_key: "card-1" },
    [{ question: "Why did you pick those two points?" }]);
  assert.equal(outcome.exitCode, 0, outcome.stderr);
  assert.deepEqual(outcome.result.structured_metadata, { teach_octo_question: { question: "Why did you pick those two points?" } });
  assert.match(systemText(outcome.prompts[0]), /curious student/);
  assert.match(systemText(outcome.prompts[0]), /personal details/);
});

test("Octo's question may not carry a link", async () => {
  const outcome = await run("oll_teach_octo_question", { turn_id: "t1", lesson, cards: cards.slice(0, 1), card_key: "card-1" },
    [{ question: "Have you seen https://example.com?" }]);
  assert.notEqual(outcome.exitCode, 0);
  assert.equal(outcome.result?.success, false);
});

test("handwritten math comes back as LaTeX exactly as written", async () => {
  const outcome = await run("oll_teach_ink_to_math", { turn_id: "t2", lesson: { language: "en-US" }, ink_media: "ink.png" },
    [{ latex: "\\dfrac{8-2}{4-1}", confidence: "high", readable: true }], { "ink.png": PNG });
  assert.equal(outcome.exitCode, 0, outcome.stderr);
  assert.deepEqual(outcome.result.structured_metadata, { teach_ink_to_math: { latex: "\\dfrac{8-2}{4-1}", confidence: "high", readable: true } });
  assert.match(systemText(outcome.prompts[0]), /exactly as written/);
});

test("unreadable handwriting is reported, and unsafe LaTeX is refused", async () => {
  const unreadable = await run("oll_teach_ink_to_math", { turn_id: "t2", lesson: { language: "en-US" }, ink_media: "ink.png" },
    [{ latex: "x", confidence: "high", readable: false }], { "ink.png": PNG });
  assert.deepEqual(unreadable.result.structured_metadata.teach_ink_to_math, { latex: "", confidence: "low", readable: false });
  const unsafe = await run("oll_teach_ink_to_math", { turn_id: "t2", lesson: { language: "en-US" }, ink_media: "ink.png" },
    [{ latex: "\\href{javascript:alert(1)}{x}", confidence: "high", readable: true }], { "ink.png": PNG });
  assert.equal(unsafe.result?.success, false);
});

test("the review covers every card and tells a slip from a misconception", async () => {
  const review = { cards: [
    { key: "card-1", status: "good", kind: "none", message: "Clear points to start from." },
    { key: "card-2", status: "check", kind: "slip", message: "Your fraction shows 6 over 3, which is 2, but you said 3 over 6. Say rise over run: 6 over 3." },
  ], overall: "Nearly there: fix how you read the fraction on card 2.", personal_details: [] };
  const outcome = await run("oll_teach_review", { turn_id: "t3", lesson, cards }, [review]);
  assert.equal(outcome.exitCode, 0, outcome.stderr);
  assert.deepEqual(outcome.result.structured_metadata.teach_review, review);
  assert.match(systemText(outcome.prompts[0]), /slip/);
});

test("a review that skips a card or judges facts in a topic that is not math is refused", async () => {
  const partial = await run("oll_teach_review", { turn_id: "t3", lesson, cards },
    [{ cards: [{ key: "card-1", status: "good", kind: "none", message: "Good." }], overall: "Good.", personal_details: [] }]);
  assert.equal(partial.result?.success, false);
  const other = { ...lesson, topic: "Dinosaurs", topic_type: "other" };
  const factual = await run("oll_teach_review", { turn_id: "t3", lesson: other, cards: cards.slice(0, 1) },
    [{ cards: [{ key: "card-1", status: "check", kind: "misconception", message: "T. rex had small teeth." }], overall: "Check facts.", personal_details: [] }]);
  assert.equal(factual.result?.success, false);
  assert.match(systemText(factual.prompts[0]), /never on whether facts are true/);
});

test("the review lists personal details the child said, only as the child's own words on that card", async () => {
  const said = [{ ...cards[0], said: "Hi, I'm Jordan from Lincoln Elementary. Point A is at 1, 2." }, cards[1]];
  const review = { cards: [
    { key: "card-1", status: "good", kind: "none", message: "Clear points." },
    { key: "card-2", status: "good", kind: "none", message: "Nice." },
  ], overall: "Good lesson.", personal_details: [
    { key: "card-1", quote: "Jordan", kind: "name" },
    { key: "card-1", quote: "Lincoln Elementary", kind: "school" },
    { key: "card-2", quote: "Springfield", kind: "place" },
  ] };
  const outcome = await run("oll_teach_review", { turn_id: "t4", lesson, cards: said }, [review]);
  assert.equal(outcome.exitCode, 0, outcome.stderr);
  assert.deepEqual(outcome.result.structured_metadata.teach_review.personal_details, [
    { key: "card-1", quote: "Jordan", kind: "name" },
    { key: "card-1", quote: "Lincoln Elementary", kind: "school" },
  ]);
  assert.match(systemText(outcome.prompts[0]), /personal_details/);
});
