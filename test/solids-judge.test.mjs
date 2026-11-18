// The 3D solids judge (OLL decision 0019): each case's expectations are met by a hand-written scene of the
// kind a correct recipe produces (the plugin's buildSolid layout), and one mutation per check fails it for
// its own reason.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { judgeSolids, readLine } from "../scripts/solids-judge.mjs";

const cases = Object.fromEntries(JSON.parse(readFileSync(new URL("../testsuite/solids-judge-cases.json", import.meta.url), "utf8")).cases.map((item) => [item.id, item]));

/** A one-section lesson that writes one 3D scene, then plays the given animations. */
function lesson(content, { variables, animations = [] } = {}) {
  return {
    dsl: "octos.lesson", version: "0.1", profile: "authoring",
    lesson: { mode: "explain", language: "en-US", title: "Solid", goals: ["Look at the solid"], ...(variables ? { variables } : {}) },
    steps: [{ key: "s", purpose: "Show the solid", beats: [
      { key: "draw", say: "Here it is.", actions: [{ do: "write", as: "scene", kind: "scene3d", role: "main_visual", content: { fallback: "A solid.", axes: false, camera: { yaw: 0.72, pitch: 0.55, zoom: 1 }, ...content }, place: { relation: "new_region" } }] },
      ...animations.map(([variable, value], index) => ({ key: `a${index}`, say: "Watch.", actions: [{ do: "animate", variable, value }] })),
    ] }],
    close: { summary: "Done.", focus: ["scene"] },
  };
}
const at = (x = 0, z = 0) => ({ x, y: 0, z });
const slider = (as, min, max, initial = min) => ({ as, initial, min, max, label: as, control: { kind: "slider", step: 0.02 } });
const passes = (id, built) => {
  const verdict = judgeSolids(cases[id], built);
  assert.deepEqual(verdict.hard, [], `${id} should pass: ${verdict.hard.join(" | ")}`);
};
const fails = (id, built, pattern) => {
  const verdict = judgeSolids(cases[id], built);
  assert.ok(verdict.hard.some((miss) => pattern.test(miss)), `${id} should miss ${pattern}: ${verdict.hard.join(" | ") || "passed"}`);
};
const box = (x, y, z, center = at()) => ({ as: "solid", kind: "box", center, size: { x, y, z } });

test("the measures line is read in English and Chinese, exact or rounded", () => {
  assert.deepEqual(readLine("Volume = 24; Surface area = 52"), { volume: { value: 24, tolerance: 1e-6 }, surface_area: { value: 52, tolerance: 1e-6 } });
  assert.equal(readLine("Volume = 4π/3 ≈ 4.19").volume.value, 4.19);
  assert.equal(readLine("体积 = 96π ≈ 301.59；表面积 ≈ 45.51").surface_area.value, 45.51);
  assert.deepEqual(readLine("6 个面，12 条棱，8 个顶点").counts, [6, 12, 8]);
  assert.deepEqual(readLine("Cone: 5 faces, 9 edges, 6 vertices").counts, [5, 9, 6]);
});

test("SD-01: a box with its volume and surface area; a wrong number or a wrong box fails", () => {
  passes("SD-01", lesson({ objects: [box(30, 20, 12)], caption: "Volume = 7200; Surface area = 2400" }));
  passes("SD-01", lesson({ objects: [box(12, 30, 20)], caption: "Volume = 7200; Surface area = 2400" }), "a box matches in any orientation");
  fails("SD-01", lesson({ objects: [box(30, 20, 12)], caption: "Volume = 7300; Surface area = 2400" }), /wrong volume shown: 7300, the drawn solid's is 7200/u);
  fails("SD-01", lesson({ objects: [box(30, 20, 10)], caption: "Volume = 6000; Surface area = 2200" }), /wrong solid: expected box: size 30×20×10, expected 30×20×12/u);
  fails("SD-01", lesson({ objects: [box(30, 20, 12)], caption: "Volume = 7200" }), /missing surface area/u);
  fails("SD-01", lesson({ objects: [box(30, 20, 12)] }), /missing volume/u);
});

test("SD-02 and SD-15: π values; the wrong round solid fails", () => {
  passes("SD-02", lesson({ objects: [{ as: "solid", kind: "cylinder", center: at(), radius: 4, height: 10 }], caption: "Volume = 160π ≈ 502.65" }));
  fails("SD-02", lesson({ objects: [{ as: "solid", kind: "cone", center: at(), radius: 4, height: 10 }], caption: "Volume = 160π/3 ≈ 167.55" }), /wrong solid: expected cylinder: a cone, expected a cylinder/u);
  fails("SD-02", lesson({ objects: [{ as: "solid", kind: "cylinder", center: at(), radius: 4, height: 10 }], caption: "Volume = 502" }), /wrong volume shown: 502/u);
  passes("SD-15", lesson({ objects: [{ as: "solid", kind: "hemisphere", center: at(0, -1.5), radius: 3 }], caption: "Volume = 18π ≈ 56.55" }));
});

const pair = (left, right, caption) => lesson({ objects: [{ ...left, as: "solid" }, { ...right, as: "beside" }], ...(caption ? { caption } : {}) });

test("SD-03: a cone and a cylinder side by side, one line each; one line for both, or overlapping solids, fail", () => {
  const cone = { kind: "cone", center: at(-3.75), radius: 3, height: 5 }, cylinder = { kind: "cylinder", center: at(3.75), radius: 3, height: 5 };
  passes("SD-03", pair(cone, cylinder, "Cone: Volume = 15π ≈ 47.12\nCylinder: Volume = 45π ≈ 141.37"));
  fails("SD-03", pair(cone, cylinder, "Volume = 15π ≈ 47.12"), /one measures line for 2 solids/u);
  fails("SD-03", pair(cone, cylinder, "Cone: Volume = 45π ≈ 141.37\nCylinder: Volume = 15π ≈ 47.12"), /wrong volume shown: 141.3717 ≈ 141.37, the drawn solid's is 47.1239/u);
  fails("SD-03", pair({ ...cone, center: at() }, { ...cylinder, center: at() }), /objects overlap: cone and cylinder/u);
  fails("SD-03", pair(cone, { ...cylinder, height: 6 }, "Cone: Volume = 15π ≈ 47.12\nCylinder: Volume = 54π ≈ 169.65"), /wrong solid: expected cylinder \(2 of 2\)/u);
});

test("SD-04 and SD-12: a sphere by its radius; a diameter written as the radius fails", () => {
  passes("SD-04", lesson({ objects: [{ as: "solid", kind: "sphere", center: at(), radius: 6 }], caption: "Volume = 288π ≈ 904.78; Surface area = 144π ≈ 452.39" }));
  const cube = box(4, 4, 4, at(-3.5)), ball = { kind: "sphere", center: at(2.5, -1), radius: 2 };
  passes("SD-12", pair(cube, ball, "Cube: Volume = 64\nSphere: Volume = 32π/3 ≈ 33.51"));
  fails("SD-12", pair(cube, { ...ball, radius: 4, center: at(5.5) }, "Cube: Volume = 64\nSphere: Volume = 256π/3 ≈ 268.08"), /wrong solid: expected sphere \(2 of 2\): .*radius 4, expected 2/u);
});

test("SD-05, SD-11 and SD-14: counts and a regular base by its edge", () => {
  passes("SD-05", lesson({ objects: [{ as: "solid", kind: "prism", center: at(), sides: 3, radius: 1, height: 2 }], caption: "5 faces, 9 edges, 6 vertices" }));
  fails("SD-05", lesson({ objects: [{ as: "solid", kind: "prism", center: at(), sides: 3, radius: 1, height: 2 }], caption: "5 faces, 8 edges, 6 vertices" }), /wrong counts shown: 5\/8\/6, the drawn solid's are 5\/9\/6/u);
  fails("SD-05", lesson({ objects: [{ as: "solid", kind: "pyramid", center: at(), sides: 3, radius: 1, height: 2 }], caption: "4 faces, 6 edges, 4 vertices" }), /a pyramid, expected a prism/u);
  passes("SD-11", lesson({ objects: [box(3, 2, 1)], caption: "6 个面，12 条棱，8 个顶点" }));
  fails("SD-11", lesson({ objects: [box(3, 2, 1)] }), /missing counts/u);
  // A regular hexagon's circumradius is its edge.
  passes("SD-14", lesson({ objects: [{ as: "solid", kind: "prism", center: at(), sides: 6, radius: 2, height: 5 }], caption: "体积 ≈ 51.96" }));
  fails("SD-14", lesson({ objects: [{ as: "solid", kind: "prism", center: at(), sides: 5, radius: 2, height: 5 }], caption: "体积 ≈ 47.55" }), /5 sides, expected 6/u);
});

test("SD-06 and SD-09: nets; the pyramid's edge, not its circumradius, is the 6", () => {
  const pyramid = (radius, extra = {}) => lesson({ objects: [{ as: "solid", kind: "pyramid", center: at(), sides: 4, radius, height: 4 }], caption: "Surface area = 96", bindings: [{ target: "solid.unfold", expression: "u" }], ...extra }, { variables: [slider("u", 0, 1)] });
  passes("SD-06", pyramid(6 / Math.SQRT2));
  passes("SD-06", lesson({ objects: [{ as: "solid", kind: "pyramid", center: at(), base: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }], height: 4 }], caption: "Surface area = 96", bindings: [{ target: "solid.unfold", expression: "u" }] }, { variables: [slider("u", 0, 1)] }), "a square base by its corners");
  fails("SD-06", lesson({ objects: [{ as: "solid", kind: "pyramid", center: at(), sides: 4, radius: 6, height: 4 }], caption: "Surface area ≈ 189.8" }, {}), /base edge 8.4853, expected 6/u);
  fails("SD-06", lesson({ objects: [{ as: "solid", kind: "pyramid", center: at(), sides: 4, radius: 6 / Math.SQRT2, height: 4 }], caption: "Surface area = 96" }), /missing net/u);
  fails("SD-06", lesson({ objects: [{ as: "solid", kind: "pyramid", center: at(), sides: 4, radius: 6 / Math.SQRT2, height: 4 }], caption: "Surface area = 96", bindings: [{ target: "solid.unfold", expression: "u" }] }, { variables: [slider("u", 0, 0.5)] }), /never opens flat/u);
  passes("SD-09", lesson({ objects: [box(5, 5, 5)], caption: "Surface area = 150", bindings: [{ target: "solid.unfold", expression: "u" }] }, { variables: [slider("u", 0, 1)] }));
});

test("SD-07: two boxes joined into an L; two separate boxes fail", () => {
  const joined = (secondX) => lesson({ objects: [box(6, 4, 3, at(-1, -2)), { ...box(2, 4, 7, at(secondX, 0)), as: "solid-side" }], caption: "Volume = 128" });
  passes("SD-07", joined(3));
  fails("SD-07", joined(4), /wrong solid: expected two_boxes: .*not two boxes joined/u);
  fails("SD-07", lesson({ objects: [box(6, 4, 3, at(-1, -2)), { ...box(2, 4, 7, at(3, 0)), as: "solid-side" }], caption: "Volume = 72" }), /wrong volume shown: 72, the drawn solid's is 128/u);
});

test("SD-08: a plane that moves bottom to top; a short or overreaching slider fails", () => {
  const cut = (min, max) => lesson({ objects: [{ as: "solid", kind: "cylinder", center: at(), radius: 2, height: 6 }],
    sections: [{ as: "cut", axis: "z", value: 0, targets: ["solid"], display: "plane_and_intersection" }], bindings: [{ target: "cut.value", expression: "h" }] }, { variables: [slider("h", min, max, 0)] });
  passes("SD-08", cut(-3, 3));
  fails("SD-08", cut(-1, 1), /missing cut/u);
  fails("SD-08", cut(-5, 5), /cutting plane at z = -5, outside the solids/u);
});

test("SD-10 and SD-13: a cone in Chinese, a frustum", () => {
  passes("SD-10", lesson({ objects: [{ as: "solid", kind: "cone", center: at(), radius: 6, height: 8 }], caption: "体积 = 96π ≈ 301.59；表面积 = 96π ≈ 301.59" }));
  fails("SD-10", lesson({ objects: [{ as: "solid", kind: "cone", center: at(), radius: 6, height: 8 }], caption: "体积 = 96π ≈ 301.59；表面积 = 60π ≈ 188.5" }), /wrong surface area shown: 188.4956 ≈ 188.5/u);
  passes("SD-13", lesson({ objects: [{ as: "solid", kind: "frustum", center: at(), radius: 10, top_radius: 6, height: 8 }], caption: "Volume = 1568π/3 ≈ 1642.01" }));
});

test("near misses: no scene passes, a scene passes unless it draws what the case forbids; the control", () => {
  for (const id of ["SD-N1", "SD-N2", "SD-N3", "SD-N4", "SD-N5", "SD-N6"]) passes(id, { ...lesson({ objects: [box(1, 1, 1)] }), steps: [{ key: "s", purpose: "Talk", beats: [{ key: "b", say: "No picture.", actions: [] }] }] });
  passes("SD-N4", lesson({ objects: [box(3, 2, 2)], caption: "Volume = 12" }));
  fails("SD-N5", lesson({ objects: [box(2, 2, 2)], sections: [{ as: "cut", axis: "z", value: 0, targets: ["solid"] }] }), /forbidden cut/u);
  fails("SD-N6", lesson({ objects: [box(10, 8, 5)], caption: "Volume = 400; Surface area = 340" }), /forbidden surface area shown/u);
  passes("SD-N6", lesson({ objects: [box(10, 8, 5)], caption: "Volume = 400" }));
  fails("SD-N2", lesson({ objects: [box(2, 2, 2)], caption: "Volume = 9" }), /wrong volume shown/u);
  passes("SD-C1", lesson({ objects: [{ as: "solid", kind: "cylinder", center: at(), radius: 1, height: 3 }] }));
  fails("SD-C1", lesson({ objects: [{ as: "solid", kind: "cone", center: at(), radius: 1, height: 3 }] }), /a cone, expected a cylinder/u);
  fails("SD-C1", { ...lesson({}), steps: [{ key: "s", purpose: "Talk", beats: [{ key: "b", say: "No picture.", actions: [] }] }] }, /no 3D scene/u);
});

test("owner review of #116: four false passes now fail, each for its own reason", () => {
  // 1. Both values on the line are checked: "π ≈ 502.65" is not 160π.
  fails("SD-02", lesson({ objects: [{ as: "solid", kind: "cylinder", center: at(), radius: 4, height: 10 }], caption: "Volume = π ≈ 502.65" }), /wrong volume shown: 3.1416 ≈ 502.65/u);
  passes("SD-02", lesson({ objects: [{ as: "solid", kind: "cylinder", center: at(), radius: 4, height: 10 }], caption: "Volume = 160π ≈ 502.65" }));
  // 2. A cut is horizontal, on the expected solid, within its height: an x-axis plane on [-3, 3] fails.
  const cylinder = { as: "solid", kind: "cylinder", center: at(), radius: 2, height: 6 };
  const vertical = lesson({ objects: [cylinder], sections: [{ as: "cut", axis: "x", value: 0, targets: ["solid"] }], bindings: [{ target: "cut.value", expression: "h" }] }, { variables: [slider("h", -3, 3, 0)] });
  fails("SD-08", vertical, /missing cut: no horizontal plane/u);
  fails("SD-08", vertical, /cutting plane at x = -3, outside the solids \(-2 to 2\)/u);
  // 3. A net the learner opens: a static cube already at unfold 1 fails.
  fails("SD-09", lesson({ objects: [{ ...box(5, 5, 5), unfold: 1 }], caption: "Surface area = 150" }), /missing net: no slider that opens the solid/u);
  fails("SD-09", lesson({ objects: [box(5, 5, 5)], caption: "Surface area = 150", bindings: [{ target: "solid.unfold", expression: "u" }] }, { variables: [{ as: "u", initial: 0, min: 0, max: 1, label: "u" }], animations: [["u", 1]] }), /missing net: no slider/u, "animated only: the learner cannot open it");
  // 4. The L's blocks share a side face on one floor: blocks meeting at a corner fail.
  fails("SD-07", lesson({ objects: [box(6, 4, 3, at(0, 0)), { ...box(2, 4, 7, { x: 4, y: 4, z: 5 }), as: "solid-side" }], caption: "Volume = 128" }), /wrong solid: expected two_boxes: boxes not on one floor|boxes do not share a side face/u);
  fails("SD-07", lesson({ objects: [box(6, 4, 3, at(-1, -2)), { ...box(2, 4, 7, { x: 3, y: 4, z: 0 }), as: "solid-side" }], caption: "Volume = 128" }), /boxes do not share a side face/u);
});
