import test from "node:test";
import assert from "node:assert/strict";

import { parseSelectionModelResponse, routeSelectionPlot } from "../main";

const baseInput = {
  turn_id: "routing-test",
  learner_request: "请为我选中的公式生成函数图像",
  source: {
    source_id: "a",
    document_id: "doc",
    document_version: 1,
    bounds: { x: 0, y: 0, width: 100, height: 50 },
    checksum: { algorithm: "sha-256", value: "a".repeat(64) },
  },
  tool_id: "generate-plot",
  content_hint: "math",
  recognition_confidence: "high",
  board: { board_id: "board", revision: 1, targets: [] },
};

function parse(recognizedContent, output) {
  return parseSelectionModelResponse(JSON.stringify({
    response_kind: "plot",
    title: "图像",
    text: "所选公式的图像。",
    items: [],
    expression: "",
    scene_kind: "surface",
    level: 0,
    reason_code: "unsupported_representation",
    alternatives: [],
    ...output,
  }), { ...baseInput, recognized_content: recognizedContent });
}

test("routing decision table covers explicit, implicit, and surface forms", () => {
  assert.deepEqual(routeSelectionPlot(["y=x^2"]), { kind: "plot", expression: "x^2" });
  assert.deepEqual(routeSelectionPlot(["x^2"]), { kind: "plot", expression: "x^2" });
  assert.deepEqual(routeSelectionPlot(["x^2=4"]), {
    kind: "implicit_plot", expression: "x^2-4", level: 0,
  });
  assert.deepEqual(routeSelectionPlot(["x^2+y^2=1"]), {
    kind: "implicit_plot", expression: "x^2+y^2-1", level: 0,
  });
  assert.deepEqual(routeSelectionPlot(["x^2+y^2"]), { kind: "surface", expression: "x^2+y^2" });
  assert.deepEqual(routeSelectionPlot(["z = x^2+y^2"]), { kind: "surface", expression: "x^2+y^2" });
  assert.deepEqual(routeSelectionPlot(["x^2+z^3"]), {
    kind: "implicit_surface", expression: "x^2+z^3", level: 0,
  });
  assert.deepEqual(routeSelectionPlot(["y=x^2+z^3"]), {
    kind: "implicit_surface", expression: "(y)-(x^2+z^3)", level: 0,
  });
  assert.deepEqual(routeSelectionPlot(["x^2-y+z^3=0"]), {
    kind: "implicit_surface", expression: "x^2-y+z^3", level: 0,
  });
  assert.deepEqual(routeSelectionPlot(["sin(x)+1"]), { kind: "plot", expression: "sin(x)+1" });
});

test("routing rejects undrawable input with specific reasons", () => {
  const fourVariables = routeSelectionPlot(["w+x+y+z=1"]);
  assert.equal(fourVariables.kind, "unsupported");
  assert.equal(fourVariables.reasonCode, "unsupported_variables");
  assert.match(fourVariables.reason, /w/);
  assert.ok(fourVariables.alternatives.some((item) => /F\(x,y,z\)=0/u.test(item)));
  assert.equal(routeSelectionPlot(["x=y=1"]).reasonCode, "unsupported_representation");
  assert.equal(routeSelectionPlot(["你好"]).kind, "unsupported");
  assert.equal(routeSelectionPlot([undefined, "  "]).reasonCode, "unreadable_expression");
});

test("routing prefers the recognized equation over the model expression", () => {
  const route = routeSelectionPlot(["y=x^2+z^3", "x^2+round(z^3)"]);
  assert.deepEqual(route, {
    kind: "implicit_surface", expression: "(y)-(x^2+z^3)", level: 0,
  });
  // The model expression is still a candidate when recognition is unusable.
  assert.deepEqual(routeSelectionPlot(["并非公式 ((", "x^2"]), { kind: "plot", expression: "x^2" });
});

test("a wrong model response_kind is corrected by the program route", () => {
  const result = parse("y = x^2", {
    response_kind: "scene3d",
    scene_kind: "implicit_surface",
    expression: "x^2",
    level: 2,
  });
  assert.equal(result.response.kind, "plot");
  assert.equal(result.response.plot_kind, "explicit");
  assert.equal(result.response.expression, "x^2");
  assert.deepEqual(result.response.x_range, { min: -4, max: 4 });

  const surface = parse("z = x^2+y^2", {
    response_kind: "implicit_plot",
    expression: "x^2+y^2",
    level: 1,
  });
  assert.equal(surface.response.kind, "scene3d");
  assert.equal(surface.response.content.objects[0].kind, "surface");
  assert.equal(surface.response.content.objects[0].expression, "x^2+y^2");
  assert.deepEqual(surface.response.content.objects[0].x_range, { min: -2, max: 2 });
  assert.deepEqual(surface.response.content.objects[0].y_range, { min: -2, max: 2 });
});

test("a workaround model expression is ignored in favor of the recognized equation", () => {
  const result = parse("y=x^2+z^3", {
    response_kind: "scene3d",
    scene_kind: "surface",
    expression: "x^2+round(z^3)",
  });
  assert.equal(result.response.kind, "scene3d", JSON.stringify(result.response));
  const object = result.response.content.objects[0];
  assert.equal(object.kind, "implicit_surface");
  assert.equal(object.expression, "(y)-(x^2+z^3)");
  assert.equal(object.level, 0);
  for (const field of ["x_range", "y_range", "z_range"]) {
    assert.ok(Number.isFinite(object[field].min), field);
    assert.ok(Number.isFinite(object[field].max), field);
  }
});

test("a model-declared unsupported response is corrected when the content is drawable", () => {
  const result = parse("y=x^2", {
    response_kind: "unsupported",
    reason_code: "unsupported_representation",
    text: "模型认为无法绘制。",
  });
  assert.equal(result.response.kind, "plot");
  assert.equal(result.response.expression, "x^2");
});

test("implicit equations become zero-level implicit plots and surfaces", () => {
  const circle = parse("x^2+y^2=1", {
    response_kind: "implicit_plot",
    expression: "x^2+y^2",
    level: 1,
  });
  assert.equal(circle.response.kind, "plot");
  assert.equal(circle.response.plot_kind, "implicit");
  assert.equal(circle.response.expression, "x^2+y^2-1");
  assert.equal(circle.response.level, 0);
  assert.equal(circle.response.samples, 80);
  assert.ok(Number.isFinite(circle.response.x_range.min));

  const surface = parse("x^2-y+z^3=0", {
    response_kind: "scene3d",
    scene_kind: "implicit_surface",
    expression: "x^2-y+z^3",
  });
  assert.equal(surface.response.kind, "scene3d");
  const object = surface.response.content.objects[0];
  assert.equal(object.kind, "implicit_surface");
  assert.equal(object.expression, "x^2-y+z^3");
  assert.equal(object.level, 0);
});

test("unsupported responses carry reason-specific actionable alternatives", () => {
  const result = parse("w+x+y+z=1", {
    response_kind: "scene3d",
    scene_kind: "implicit_surface",
    expression: "w+x+y+z-1",
  });
  assert.equal(result.response.kind, "unsupported");
  assert.equal(result.response.reason_code, "unsupported_variables");
  assert.match(result.response.text, /w/);
  assert.ok(result.response.alternatives.length > 0);
  assert.ok(result.response.alternatives.some((item) => /具体数值/u.test(item)));
  assert.ok(result.response.alternatives.some((item) => /F\(x,y,z\)=0/u.test(item)));
});
