import test from "node:test";
import assert from "node:assert/strict";
import { selectionSystemPrompt } from "../main";

test("custom questions distinguish preparing an equation from drawing it", () => {
  const custom = selectionSystemPrompt("custom-question");
  assert.match(custom, /默认 response_kind=explanation/u);
  assert.match(custom, /改成可以绘图的形式/u);
  assert.match(custom, /不主动绘图/u);
  assert.match(custom, /等价整理不是纠错/u);
  assert.match(custom, /仅明确要求现在绘图时/u);
  for (const kind of ["plot", "implicit_plot", "surface", "implicit_surface"]) {
    assert.ok(custom.includes(kind), kind);
  }
  // Auxiliary budget only; real token counts and latency remain an eval gate.
  assert.ok(Buffer.byteLength(custom) <= Buffer.byteLength(selectionSystemPrompt("generate-plot")));
});

test("explanation and checking retain their compact, non-visual prompt", () => {
  const explanation = selectionSystemPrompt("explain");
  assert.equal(selectionSystemPrompt("check-and-suggest"), explanation);
  assert.doesNotMatch(explanation, /implicit_surface/u);
});

test("selection output language never changes recognized source or execution instructions", async () => {
  const { selectionRequestSystemPrompt } = await import("../main");
  const request = { tool_id: "explain", language: "en-US" };
  const english = selectionRequestSystemPrompt(request);
  const legacy = selectionRequestSystemPrompt({ tool_id: "explain" });
  assert.ok(english.startsWith(legacy));
  assert.match(english, /Output language: English/);
  assert.match(english, /Preserve formulas, identifiers, and original quoted or recognized text/);
  assert.equal(selectionRequestSystemPrompt({ ...request, language: "zh-CN" }), legacy);
});
