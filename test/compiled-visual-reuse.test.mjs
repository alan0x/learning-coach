import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const result = await build({ entryPoints: ["src/compiled-visual-reuse.ts"], bundle: true, format: "esm", platform: "node", write: false });
const { CompiledVisualRegistry } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
const invalid = () => { throw new Error("invalid comparison"); };
function visual(id, kind, content, fragment = "part") {
  return { whole: id, parts: new Map([["whole", id], ["feature", `${id}#${fragment}`]]),
    actions: [{ do: "write", as: id, kind, role: "visual", content, place: { relation: "new_region" } }] };
}

test("local fragment names do not determine identity; references use the retained fragment", () => {
  const registry = new CompiledVisualRegistry();
  registry.reuse(visual("original", "geometry", { points: [{ as: "p", x: 1, y: 2 }],
    bindings: [{ target: "p.x", expression: "number_01" }] }, "p"), false, invalid);
  const next = registry.reuse(visual("later", "geometry", { points: [{ as: "q", x: 1, y: 2 }],
    bindings: [{ target: "q.x", expression: "number_01" }] }, "q"), false, invalid);
  assert.equal(next.whole, "original");
  assert.equal(next.parts.get("feature"), "original#p");
  assert.equal(next.actions[0].do, "focus");
});

test("units and direct manipulation contracts are retained in rendered-card identity", () => {
  for (const change of [{ unit: "m" }, { interaction: { kind: "drag_point", variable: "number_01" } }]) {
    const registry = new CompiledVisualRegistry();
    const content = { curves: [{ as: "part", expression: "x^2" }] };
    registry.reuse(visual("first", "plot", content), false, invalid);
    assert.equal(registry.reuse(visual("second", "plot", { ...content, ...change }), false, invalid).actions[0].do, "write");
  }
});

test("diagram labels and additional 3D objects are content rather than presentation", () => {
  for (const [kind, first, second] of [
    ["diagram", { nodes: [{ as: "part", label: "Condensation" }] }, { nodes: [{ as: "part", label: "Evaporation" }] }],
    ["scene3d", { objects: [{ as: "part", kind: "cube" }] }, { objects: [{ as: "part", kind: "cube" }, { as: "extra", kind: "sphere" }] }],
  ]) {
    const registry = new CompiledVisualRegistry();
    registry.reuse(visual("first", kind, first), false, invalid);
    assert.equal(registry.reuse(visual("second", kind, second), false, invalid).actions[0].do, "write");
  }
});

test("cross-component explicit comparisons cannot recreate identical rendered teaching content", () => {
  const registry = new CompiledVisualRegistry();
  const content = { curves: [{ as: "part", expression: "x^3" }] };
  registry.reuse(visual("first", "plot", content), false, invalid);
  assert.throws(() => registry.reuse(visual("second", "plot", { ...content, title: "New title" }), true, invalid), /invalid comparison/);
});
