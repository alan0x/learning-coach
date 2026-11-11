// The payload experiment harness (subject plan P2), without a live model.
import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { padRequest, paddingText, runOnce, summarize } from "../scripts/eval-payload-padding.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = await build({
  stdin: { contents: `export { generateLessonPlanWithModel } from "./src/lesson-plan-api.ts";`, resolveDir: root, loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
});
const { generateLessonPlanWithModel } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

const outline = {
  version: "0.1", title: "为什么负负得正", goals: ["解释符号规则"], teaching_strategies: [], numbers: [],
  request_coverage: [{ request_part: 1, treatment: "teach", sections: [1] }], course_visuals: [],
  sections: [{ purpose: "解释符号规则", allowed_capabilities: [], reusable_items: [{ kind: "board_item", board_kind: "math" }] }],
  close: { summary: "负数乘负数得到正数。", focus: [{ source: "reusable", section: 1, item: 1 }] },
};
const sectionDraft = (section) => ({
  version: "0.1", section,
  moments: [{ narration: "我们用分配律检查这个符号规则。", delivery: "patient", math_creates: [], note_creates: [],
    focuses: [{ intent: "观察等式", timing: "after_speech" }], points: [] }],
  reusable_board_creates: { item_1: { moment: 1, timing: "during_speech", role: "derivation",
    content: { latex: "(-1)\\\\times(-1)=1" }, placement: { relation: "new_region" } } },
});
const fakeModel = (sent) => async (request) => {
  sent.push(request);
  const schema = request.response_schema;
  if (schema.properties?.course) {
    return JSON.stringify({ disposition: "generate_lesson", learner_response: "",
      course: schema.properties.course.properties?.outline ? { outline, first_section: sectionDraft(1) } : outline });
  }
  if (schema.properties?.first_section) return JSON.stringify({ outline, first_section: sectionDraft(1) });
  return JSON.stringify(schema.properties?.title ? outline : sectionDraft(request.section ?? 1));
};

test("padding adds about the requested bytes without changing the schema's choices", () => {
  assert.ok(Buffer.byteLength(paddingText(4096, "header")) >= 4096);
  assert.equal(paddingText(4096, "h"), paddingText(4096, "h"), "deterministic");
  const request = { system_prompt: "规则", prompt: "请求", response_schema: { type: "object", properties: { a: { enum: ["x"] } } } };
  const { request: padded, added_bytes } = padRequest(request, 8192);
  assert.ok(added_bytes >= 8192 && added_bytes < 8192 + 400, String(added_bytes));
  assert.deepEqual(padded.response_schema.properties, request.response_schema.properties);
  assert.match(padded.system_prompt, /本次请求未开放/);
  assert.equal(padded.prompt, request.prompt);
});

test("a run stops at the first playable section and pads only the first request", async () => {
  for (const padBytes of [0, 8192]) {
    const sent = [];
    const budget = { remaining: 10 };
    const row = await runOnce({ generate: generateLessonPlanWithModel, call: fakeModel(sent),
      item: { id: "neg", learner_request: "请解释为什么负负得正" }, padBytes, turnId: `t-${padBytes}`, budget });
    assert.equal(row.outcome, "first_playable", JSON.stringify(row.calls));
    assert.equal(row.calls_before_first_playable, 1);
    assert.equal(row.local_rejections, 0);
    assert.equal(sent.length, 1, "no section request after the first playable section");
    assert.equal(budget.remaining, 9);
    assert.equal(sent[0].part, "bootstrap");
    assert.equal(/本次请求未开放/.test(sent[0].system_prompt), padBytes > 0);
    assert.ok(row.first_playable_ms >= 0);
  }
});

test("the summary pairs padded and unpadded runs", () => {
  const row = (pair, padded, ms) => ({ pair, padded, outcome: "first_playable", first_playable_ms: ms, bootstrap_ms: ms - 10, calls_before_first_playable: 1 });
  const summary = summarize([row(0, false, 9000), row(0, true, 9400), row(1, true, 10000), row(1, false, 10200), { pair: 2, padded: true, outcome: "error" }]);
  assert.equal(summary.complete_pairs, 2);
  assert.equal(summary.paired_difference_ms.mean, 100);
  assert.deepEqual(summary.p50_first_playable_ms, { plain: 9600, padded: 9700 });
  assert.equal(summary.errors, 1);
});
