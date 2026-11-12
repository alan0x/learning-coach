// Raw model replies (OLL_DEBUG_GENERATION=1) are kept by evaluation harnesses so later fixes can be replayed
// against what the model actually wrote. Review of #62: a pretty-printed reply was cut at its first newline,
// and every reply at 16,000 characters. Each reply is now one framed record, whole.
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const { runTool } = await import(new URL("../scripts/eval-shadow-speed.mjs", import.meta.url));

// A reply as the model streams it: pretty-printed JSON, longer than the old 16,000-character cut.
const longReply = JSON.stringify({ course: { outline: { numbers: [{ initial: 0.75 }], padding: "x".repeat(20_000) } } }, null, 2);

test("a framed reply is one line and comes back whole, multi-line and long", () => {
  const line = api.frameRawReply({ provider: "google", label: "lesson-plan-bootstrap", kind: "content", body: longReply });
  assert.equal(line.endsWith("\n"), true);
  assert.equal(line.slice(0, -1).includes("\n"), false);
  assert.equal(api.modelTextFromRawReply(line.trimEnd()), longReply);
  // A provider envelope gives the text of its candidates.
  const envelope = api.frameRawReply({ provider: "google", label: "lesson-plan-section", kind: "payload", body: { candidates: [{ content: { parts: [{ text: '{"moments":' }, { text: "[]}" }] } }] } });
  assert.equal(api.modelTextFromRawReply(envelope.trimEnd()), '{"moments":[]}');
});

test("the older single-line captures are still read", () => {
  assert.equal(api.modelTextFromRawReply('Gemini API lesson-plan-bootstrap payload: {"candidates":[{"content":{"parts":[{"text":"{\\"a\\":1}"}]}}]}'), '{"a":1}');
  assert.equal(api.modelTextFromRawReply('google lesson-plan-section content: {"moments":[]}'), '{"moments":[]}');
  assert.equal(api.modelTextFromRawReply("something else"), undefined);
});

test("the harness captures a whole reply from the tool's stderr", async () => {
  const dir = await mkdtemp(join(tmpdir(), "raw-reply-"));
  const framed = api.frameRawReply({ provider: "google", label: "lesson-plan-bootstrap", kind: "content", body: longReply });
  await writeFile(join(dir, "framed.txt"), framed);
  await writeFile(join(dir, "main"), `
    const { readFileSync } = await import("node:fs");
    process.stdin.resume();
    process.stdin.on("end", () => {
      process.stderr.write('learning-coach: {"stage":"model-call","status":"started"}\\n');
      process.stderr.write(readFileSync(${JSON.stringify(join(dir, "framed.txt"))}, "utf8"));
      process.stderr.write('learning-coach: {"stage":"lesson-prefix-published","status":"completed"}\\n');
      setInterval(() => {}, 1000);
    });
  `);
  const captured = [];
  await runTool({ build: dir, input: { turn_id: "t" }, env: process.env, maxCalls: 3, onRaw: (line) => captured.push(line) });
  assert.equal(captured.length, 1);
  assert.equal(api.modelTextFromRawReply(captured[0]), longReply);
});
