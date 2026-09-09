import test from "node:test";
import assert from "node:assert/strict";
import { selectionThinkingOverride, parseSelectionToolInput, parseSelectionModelResponse, selectionResponseSchema } from "../main";
const input = {
  turn_id: "board-test", learner_request: "将其更改为可以绘制函数图像的形式",
  source: { source_id: "a", document_id: "doc", document_version: 1,
    bounds: { x: 0, y: 0, width: 100, height: 50 }, checksum: { algorithm: "sha-256", value: "a".repeat(64) } },
  tool_id: "custom-question", content_hint: "math", recognized_content: "y=x^2+z^3",
  recognition_confidence: "high", board: { board_id: "board", revision: 1, targets: [] },
};
const output = { response_kind: "board_writing", title: "等价整理", text: "原式可表示三维曲面，等价整理为：\nx^2+z^3-y=0" };
test("board writing is accepted only with capability and retains line boundaries", () => {
  const result = parseSelectionModelResponse(JSON.stringify(output), { ...input, capabilities: ["board_writing"] });
  assert.equal(result.response.kind, "board_writing");
  assert.deepEqual(result.response.lines, ["原式可表示三维曲面，等价整理为：", "x^2+z^3-y=0"]);
  assert.equal(result.source.source_id, "a");
  assert.throws(() => parseSelectionModelResponse(JSON.stringify(output), input), /does not support board writing/);
  assert.ok(!selectionResponseSchema(input).properties.response_kind.enum.includes("board_writing"));
  assert.ok(selectionResponseSchema({ ...input, capabilities: ["board_writing"] }).properties.response_kind.enum.includes("board_writing"));
});
test("checking with capability supports handwriting without enabling arbitrary plotting", () => {
  const check = { ...input, tool_id: "check-and-suggest", capabilities: ["board_writing"] };
  assert.deepEqual(selectionResponseSchema(check).properties.response_kind.enum, ["board_writing"]);
  assert.equal(parseSelectionModelResponse(JSON.stringify(output), check).response.kind, "board_writing");
  for (const text of ["x".repeat(501), "a\nb\nc\nd\ne\nf\ng\nh\ni", "abc\u0000def"]) {
    assert.throws(() => parseSelectionModelResponse(JSON.stringify({ ...output, text }), check), /budget/);
  }
});

test("wire input preserves supported capabilities through schema and artifact parsing", () => {
  const parsed = parseSelectionToolInput(JSON.stringify({ ...input, capabilities: ["board_writing", "future"] }));
  assert.deepEqual(parsed.capabilities, ["board_writing"]);
  assert.ok(selectionResponseSchema(parsed).properties.response_kind.enum.includes("board_writing"));
  assert.equal(parseSelectionModelResponse(JSON.stringify(output), parsed).response.kind, "board_writing");
  assert.deepEqual(parseSelectionToolInput(JSON.stringify(input)).capabilities, []);
});

test("wire input freezes the requested answer surface", () => {
  const board = parseSelectionToolInput(JSON.stringify({
    ...input,
    capabilities: ["board_writing"],
    delivery_mode: "board-writing",
  }));
  assert.equal(board.delivery_mode, "board-writing");
  assert.deepEqual(selectionResponseSchema(board).properties.response_kind.enum, ["board_writing"]);

  const card = parseSelectionToolInput(JSON.stringify({
    ...input,
    capabilities: ["board_writing"],
    delivery_mode: "card",
  }));
  assert.equal(card.delivery_mode, "card");
  assert.ok(!selectionResponseSchema(card).properties.response_kind.enum.includes("board_writing"));
  assert.throws(() => parseSelectionToolInput(JSON.stringify({
    ...input,
    tool_id: "generate-plot",
    content_hint: "math",
    delivery_mode: "board-writing",
  })), /invalid for this tool_id/);
  assert.throws(() => parseSelectionToolInput(JSON.stringify({
    ...input,
    delivery_mode: "board-writing",
  })), /requires the board_writing capability/);
});

test("invalid writing cannot silently become a plotting failure card", () => {
  assert.throws(() => parseSelectionModelResponse(JSON.stringify({ ...output, text: "x".repeat(501) }), { ...input, capabilities: ["board_writing"] }), /budget/);
});

test("handwriting thinking default is scoped and preserves explicit configuration", () => {
  const client = { provider: "vertex", model: "gemini-3.6-flash" };
  const capable = { ...input, capabilities: ["board_writing"] };
  const previous = process.env.OLL_SELECTION_THINKING_LEVEL;
  const globalPrevious = process.env.OLL_THINKING_LEVEL;
  try {
    delete process.env.OLL_SELECTION_THINKING_LEVEL; delete process.env.OLL_THINKING_LEVEL;
    assert.equal(selectionThinkingOverride(capable, client), "MINIMAL");
    assert.equal(selectionThinkingOverride(input, client), undefined);
    assert.equal(selectionThinkingOverride({ ...capable, tool_id: "explain" }, client), undefined);
    assert.equal(selectionThinkingOverride({ ...capable, tool_id: "generate-plot" }, client), undefined);
    assert.equal(selectionThinkingOverride(capable, { ...client, model: "another-model" }), undefined);
    process.env.OLL_SELECTION_THINKING_LEVEL = "HIGH";
    assert.equal(selectionThinkingOverride(capable, client), undefined);
  } finally {
    if (previous === undefined) delete process.env.OLL_SELECTION_THINKING_LEVEL; else process.env.OLL_SELECTION_THINKING_LEVEL = previous;
    if (globalPrevious === undefined) delete process.env.OLL_THINKING_LEVEL; else process.env.OLL_THINKING_LEVEL = globalPrevious;
  }
});

test("the parser enforces handwriting for capable check requests", () => {
  assert.throws(() => parseSelectionModelResponse(JSON.stringify({ ...output, response_kind: "explanation" }), { ...input, tool_id: "check-and-suggest", capabilities: ["board_writing"] }), /requires board_writing/);
});
