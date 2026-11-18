// The 3D solids judge (OLL decision 0019 §5 step 2, plan §5: judge before recipe).
//
// It judges what a lesson's 3D scenes draw, read through OLL itself: the lesson is normalized and each
// scene3d node's objects, sections, bindings and caption are read from the reduced board. Solids are
// recognised by geometry, never by name: objects that touch form one solid (a composite's parts), and
// solids are ordered left to right. Measures are recomputed here from the drawn geometry, independently
// of the plugin's formulas: volume by the divergence theorem over the solid's faces, surface area by
// summing face areas, round solids by their own formulas.
//
// Two kinds of check:
// - Expected values, written into each case before any run (0019 §5): each solid's kind and sizes, the
//   measures its line must show, the slider the lesson must offer (a cut or a net), and what must not
//   appear (`forbid`).
// - Checks needing no expectation, on every scene: the lesson normalizes; every measure the line shows
//   is the drawn solid's (a wrong volume is caught even when no case asks for it); a line per solid when
//   there are two; solids do not overlap; a cutting plane stays within the solids it cuts; a net opens.
//
// Narration is not judged here: what the lesson says is read by hand under the probe's pass rules.

import { normalizeAuthoringLesson, reduceCanonicalEvents } from "octos-lesson-language";

const EPS = 1e-6;
/** An object's name: `as` as authored, `id` once normalized. */
const idOf = (object) => object.as ?? object.id;
const close = (a, b, tolerance = EPS) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
// Four places, or four significant digits for a value too small to show in four (1e-14 is not "0").
const round = (value) => (value !== 0 && Math.abs(value) < 1e-3 ? Number(Number(value).toPrecision(4)) : Number(Number(value).toFixed(4)));
const SOLID_KINDS = new Set(["box", "sphere", "cylinder", "cone", "prism", "pyramid", "frustum", "hemisphere", "torus", "tetrahedron", "octahedron", "dodecahedron", "icosahedron", "ellipsoid"]);

/** The scenes a whole authoring lesson draws, each with its variables and animations in order. */
export function solidScenesIn(lesson) {
  const actions = (lesson?.steps ?? []).flatMap((step) => step.beats ?? []).flatMap((beat) => beat.actions ?? []);
  const writes = actions.filter((action) => action.do === "write" && action.kind === "scene3d");
  if (!writes.length) return [];
  let events;
  try {
    events = normalizeAuthoringLesson(lesson, { lessonId: "judge", boardId: "judge", baseRevision: 0, regionIntent: "new_topic" });
  } catch (error) {
    return [{ as: writes[0].as, error: `${error.code ?? "error"}: ${String(error.message).slice(0, 120)}` }];
  }
  const nodes = Object.values(reduceCanonicalEvents(events).nodes);
  const variables = lesson.lesson?.variables ?? [];
  const animations = actions.filter((action) => action.do === "animate").map((action) => [action.variable, action.value]);
  return writes.map((write) => {
    const node = nodes.find((candidate) => String(candidate.id).endsWith(`:node:${write.as}`));
    return node ? { as: write.as, content: node.content, variables, animations } : { as: write.as, error: "scene3d node not found" };
  });
}

// ---- Geometry, independent of the plugin -------------------------------------------------------------

/** A prism's or pyramid's base corners around its area centroid (the player centres it there). */
function baseOf(object) {
  const corners = Array.isArray(object.base) ? object.base.map((point) => ({ x: point.x, y: point.y }))
    : Array.from({ length: object.sides }, (_, index) => ({ x: object.radius * Math.cos(2 * Math.PI * index / object.sides), y: object.radius * Math.sin(2 * Math.PI * index / object.sides) }));
  let twice = 0, cx = 0, cy = 0;
  corners.forEach((point, index) => {
    const next = corners[(index + 1) % corners.length], k = point.x * next.y - next.x * point.y;
    twice += k; cx += (point.x + next.x) * k; cy += (point.y + next.y) * k;
  });
  const middle = { x: cx / (3 * twice), y: cy / (3 * twice) };
  const centred = corners.map((point) => ({ x: point.x - middle.x, y: point.y - middle.y }));
  return twice < 0 ? centred.reverse() : centred;
}

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a) => Math.hypot(a.x, a.y, a.z);

/** A polyhedron's flat faces as corner loops, outward by construction: box, prism, pyramid (or truncated). */
function polyhedronFaces(object) {
  if (object.kind === "box") {
    const { x, y, z } = object.size;
    return polyhedronFaces({ kind: "prism", base: [{ x: 0, y: 0 }, { x, y: 0 }, { x, y }, { x: 0, y }], height: z });
  }
  const base = baseOf(object), h = object.height;
  const bottom = base.map((point) => ({ x: point.x, y: point.y, z: 0 }));
  const k = object.kind === "prism" ? 1 : object.top_scale ?? 0;
  if (k === 0) {
    const apex = { x: 0, y: 0, z: h };
    return [[...bottom].reverse(), ...bottom.map((point, index) => [point, bottom[(index + 1) % bottom.length], apex])];
  }
  const top = base.map((point) => ({ x: point.x * k, y: point.y * k, z: h }));
  return [[...bottom].reverse(), top, ...bottom.map((point, index) => {
    const next = (index + 1) % bottom.length;
    return [point, bottom[next], top[next], top[index]];
  })];
}

function faceArea(loop) {
  let total = { x: 0, y: 0, z: 0 };
  for (let index = 1; index + 1 < loop.length; index += 1) {
    const c = cross(sub(loop[index], loop[0]), sub(loop[index + 1], loop[0]));
    total = { x: total.x + c.x, y: total.y + c.y, z: total.z + c.z };
  }
  return length(total) / 2;
}

/** Volume by the divergence theorem: the sum of signed tetrahedra from the origin to each face's fan. */
function polyhedronVolume(faces) {
  let six = 0;
  for (const loop of faces) for (let index = 1; index + 1 < loop.length; index += 1) six += dot(loop[0], cross(loop[index], loop[index + 1]));
  return Math.abs(six) / 6;
}

/** One object's measures from its drawn geometry; undefined where it has no formula here. */
function objectMeasures(object) {
  const { radius: r, height: h } = object;
  switch (object.kind) {
    case "box": case "prism": case "pyramid": {
      const faces = polyhedronFaces(object);
      const n = object.kind === "box" ? 4 : (Array.isArray(object.base) ? object.base.length : object.sides);
      const apex = object.kind === "pyramid" && !(object.top_scale > 0);
      return {
        volume: polyhedronVolume(faces),
        surface_area: faces.reduce((sum, loop) => sum + faceArea(loop), 0),
        counts: apex ? [n + 1, 2 * n, n + 1] : [n + 2, 3 * n, 2 * n],
      };
    }
    case "cylinder": return { volume: Math.PI * r * r * h, surface_area: 2 * Math.PI * r * r + 2 * Math.PI * r * h };
    case "cone": return { volume: Math.PI * r * r * h / 3, surface_area: Math.PI * r * r + Math.PI * r * Math.sqrt(r * r + h * h) };
    case "sphere": return { volume: 4 / 3 * Math.PI * r ** 3, surface_area: 4 * Math.PI * r * r };
    case "hemisphere": return { volume: 2 / 3 * Math.PI * r ** 3, surface_area: 2 * Math.PI * r * r + Math.PI * r * r };
    case "frustum": {
      const R = object.radius, t = object.top_radius;
      return { volume: Math.PI * h * (R * R + R * t + t * t) / 3, surface_area: Math.PI * (R * R + t * t) + Math.PI * (R + t) * Math.sqrt(h * h + (R - t) ** 2) };
    }
    default: return {};
  }
}

/** An object's axis-aligned extent. */
function extent(object) {
  const c = object.center ?? { x: 0, y: 0, z: 0 };
  let hx, hy, z0, z1;
  switch (object.kind) {
    case "box": [hx, hy, z0, z1] = [object.size.x / 2, object.size.y / 2, c.z - object.size.z / 2, c.z + object.size.z / 2]; break;
    case "sphere": [hx, hy, z0, z1] = [object.radius, object.radius, c.z - object.radius, c.z + object.radius]; break;
    case "hemisphere": [hx, hy, z0, z1] = [object.radius, object.radius, c.z, c.z + object.radius]; break;
    case "frustum": { const r = Math.max(object.radius, object.top_radius); [hx, hy, z0, z1] = [r, r, c.z - object.height / 2, c.z + object.height / 2]; break; }
    case "prism": case "pyramid": {
      const base = baseOf(object);
      return { x: [c.x + Math.min(...base.map((p) => p.x)), c.x + Math.max(...base.map((p) => p.x))], y: [c.y + Math.min(...base.map((p) => p.y)), c.y + Math.max(...base.map((p) => p.y))], z: [c.z - object.height / 2, c.z + object.height / 2] };
    }
    case "torus": [hx, hy, z0, z1] = [object.radius + object.tube, object.radius + object.tube, c.z - object.tube, c.z + object.tube]; break;
    case "ellipsoid": [hx, hy, z0, z1] = [object.radii.x, object.radii.y, c.z - object.radii.z, c.z + object.radii.z]; break;
    case "tetrahedron": case "octahedron": case "dodecahedron": case "icosahedron": [hx, hy, z0, z1] = [object.radius, object.radius, c.z - object.radius, c.z + object.radius]; break;
    default: [hx, hy, z0, z1] = [object.radius, object.radius, c.z - object.height / 2, c.z + object.height / 2];
  }
  return { x: [c.x - hx, c.x + hx], y: [c.y - hy, c.y + hy], z: [z0, z1] };
}

/** How far two extents overlap on each axis (negative: a gap). */
const overlaps = (a, b) => ["x", "y", "z"].map((axis) => Math.min(a[axis][1], b[axis][1]) - Math.max(a[axis][0], b[axis][0]));
const touching = (a, b) => overlaps(a, b).every((amount) => amount >= -EPS);

/** Objects that touch form one solid; solids from left to right. */
export function solidsOf(content) {
  const objects = (content.objects ?? []).filter((object) => SOLID_KINDS.has(object.kind)).map((object) => ({ object, extent: extent(object) }));
  const groups = [];
  for (const item of objects) {
    const joined = groups.filter((group) => group.some((other) => touching(other.extent, item.extent)));
    const merged = [...joined.flat(), item];
    for (const group of joined) groups.splice(groups.indexOf(group), 1);
    groups.push(merged);
  }
  return groups.map((group) => {
    const xs = group.flatMap((item) => item.extent.x), zs = group.flatMap((item) => item.extent.z);
    const parts = group.map((item) => ({ ...item, measures: objectMeasures(item.object) }));
    const measures = parts.length === 1 ? parts[0].measures
      : { volume: parts.every((part) => part.measures.volume !== undefined) ? parts.reduce((sum, part) => sum + part.measures.volume, 0) : undefined };
    return { parts, x: [Math.min(...xs), Math.max(...xs)], z: [Math.min(...zs), Math.max(...zs)], measures };
  }).sort((a, b) => a.x[0] - b.x[0]);
}

// ---- The measures line -------------------------------------------------------------------------------

const LABELS = { volume: /(?:volume|体积)\s*([=≈])\s*([^;；\n]*)/iu, surface_area: /(?:surface area|表面积)\s*([=≈])\s*([^;；\n]*)/iu };

/** An exact value as written: "24", "3.375", "12π", "4π/3", "π". */
function exactValue(text) {
  const exact = /^\s*(-?\d+(?:\.\d+)?)?\s*(π)?\s*(?:\/\s*(\d+))?\s*$/u.exec(text);
  if (!exact || (exact[1] === undefined && !exact[2])) return undefined;
  return (exact[1] === undefined ? 1 : Number(exact[1])) * (exact[2] ? Math.PI : 1) / (exact[3] ? Number(exact[3]) : 1);
}

/**
 * A shown quantity: the decimal after "≈" (two places) and the exact value before it, each checked on
 * its own ("= π ≈ 502.65" for 160π is wrong though its decimal is right; owner review of #116).
 */
function shownValue(sign, text) {
  const [before, after] = sign === "≈" ? ["", text] : text.split("≈");
  const approx = after === undefined ? undefined : approximation(after);
  const exact = before.trim() ? exactValue(before) : undefined;
  if (after !== undefined && !approx) return undefined;
  if (before.trim() && exact === undefined) return undefined;
  if (approx) return { ...approx, ...(exact !== undefined ? { exact } : {}) };
  // An exact value alone has no shown-digit tolerance: only floating-point noise (owner review of #116: an
  // absolute 1e-6 let "Volume = 0" stand for a cube of side 0.00001).
  return exact === undefined ? undefined : { value: exact, tolerance: 0 };
}

/**
 * A rounded value as the producer writes it ("502.65", "0.000100", "1.00e-15"), with the tolerance its
 * shown digits allow: half a unit of the last digit (owner review of #116: "1.00e-15" was unreadable, and a
 * fixed 0.006 would let "0.000100" stand for 0.003).
 */
function approximation(text) {
  const match = /^\s*(-?\d+)(?:\.(\d+))?(?:e([+-]?\d+))?\s*$/u.exec(text);
  if (!match) return undefined;
  const value = Number(text.trim());
  if (!Number.isFinite(value)) return undefined;
  const unit = 10 ** (Number(match[3] ?? 0) - (match[2]?.length ?? 0));
  return { value, tolerance: unit / 2 * (1 + 1e-9) };
}

/** What one line shows: volume, surface area (values) and counts. */
export function readLine(line) {
  const shown = {};
  for (const [key, pattern] of Object.entries(LABELS)) {
    const match = pattern.exec(line);
    if (match) shown[key] = shownValue(match[1], match[2]) ?? { unreadable: match[0] };
  }
  const counts = /(\d+)\s*(?:faces|个面)\D+(\d+)\s*(?:edges|条棱)\D+(\d+)\s*(?:vertices|个顶点)/iu.exec(line);
  if (counts) shown.counts = counts.slice(1, 4).map(Number);
  return shown;
}

// Floating-point noise between the judge's own computation and the value shown: 64 units in the last place.
const noise = (a, b) => 64 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
// A rounded value: its shown digits' tolerance, or noise if larger (a relative 1e-6 let a large value be off by
// millions, 1881672302290.56 ± 1.9 million). An exact value, alone or before "≈": noise only (owner review of
// #116: the relative 1e-6 let "1000001π ≈ 3141592.65" pass for 1000000π).
const matchesValue = (shown, value) => shown && shown.value !== undefined
  && Math.abs(shown.value - value) <= Math.max(shown.tolerance, noise(shown.value, value))
  && (shown.exact === undefined || Math.abs(shown.exact - value) <= noise(shown.exact, value));
const expectedValue = (want) => (typeof want === "object" && want !== null ? want.pi * Math.PI : want);
// An exact value alone is described in full: rounded, "= 96.0000001" would read as the 96 it is not.
const describe = (shown) => (shown.unreadable ? `"${shown.unreadable}"` : shown.exact !== undefined ? `${round(shown.exact)} ≈ ${shown.value}` : shown.tolerance === 0 ? String(shown.value) : String(round(shown.value)));

// ---- Sliders -----------------------------------------------------------------------------------------

/** The values a variable takes: its range when it has a control, its start, and every animation's end. */
function variableValues(scene, name) {
  const variable = scene.variables.find((item) => item.as === name);
  const values = [variable?.initial, ...scene.animations.filter(([target]) => target === name).map(([, value]) => value)];
  if (variable?.control) values.push(variable.min, variable.max);
  return values.filter((value) => typeof value === "number" && Number.isFinite(value));
}
const expressionVariable = (scene, expression) => scene.variables.find((variable) => String(expression).trim() === variable.as)?.as;

function sliders(scene) {
  const bindings = scene.content.bindings ?? [];
  const cuts = (scene.content.sections ?? []).map((section) => {
    const binding = bindings.find((item) => item.target === `${section.as ?? section.id}.value`);
    const name = binding && expressionVariable(scene, binding.expression);
    const variable = scene.variables.find((item) => item.as === name);
    // What a learner can do with it: a slider's own range (animation ends count only toward the bounds check).
    const slider = variable?.control ? [variable.min, variable.max] : undefined;
    return { section, values: name ? variableValues(scene, name) : [section.value], moves: Boolean(name), slider };
  });
  const nets = bindings.filter((binding) => String(binding.target).endsWith(".unfold")).map((binding) => {
    const name = expressionVariable(scene, binding.expression);
    const variable = scene.variables.find((item) => item.as === name);
    // A learner can open it: a slider that reaches both closed (0) and flat (1).
    const learner = Boolean(variable?.control) && variable.min <= EPS && variable.max >= 1 - EPS;
    return { object: String(binding.target).slice(0, -".unfold".length), values: name ? variableValues(scene, name) : [], learner };
  });
  const opened = (scene.content.objects ?? []).filter((object) => Number(object.unfold) > 0).map((object) => ({ object: object.as, values: [object.unfold] }));
  return { cuts, nets: [...nets, ...opened] };
}

// ---- Matching expected solids ------------------------------------------------------------------------

const sameSizes = (a, b) => [...a].sort((p, q) => p - q).every((value, index) => close(value, [...b].sort((p, q) => p - q)[index]));
const edgeOf = (object) => { const base = baseOf(object); return Math.hypot(base[1].x - base[0].x, base[1].y - base[0].y); };

/** Whether a drawn solid is the expected one; the reason when it is not. */
function solidMatches(want, solid) {
  const objects = solid.parts.map((part) => part.object);
  if (want.kind === "two_boxes") {
    if (objects.length !== 2 || objects.some((object) => object.kind !== "box")) return `not two boxes joined (${objects.map((object) => object.kind).join(" + ")})`;
    const sizes = objects.map((object) => [object.size.x, object.size.y, object.size.z]);
    const [a, b] = want.boxes;
    if (!((sameSizes(sizes[0], a) && sameSizes(sizes[1], b)) || (sameSizes(sizes[0], b) && sameSizes(sizes[1], a)))) {
      return `boxes ${sizes.map((size) => size.join("×")).join(" and ")}, expected ${a.join("×")} and ${b.join("×")}`;
    }
    // One block: on one floor, sharing part of a side face (owner review: blocks meeting at a corner passed).
    const [first, second] = solid.parts.map((part) => part.extent);
    if (!close(first.z[0], second.z[0])) return `boxes not on one floor (bottoms at ${round(first.z[0])} and ${round(second.z[0])})`;
    const [ox, oy, oz] = overlaps(first, second);
    const sideFace = oz > EPS && ((Math.abs(ox) <= EPS && oy > EPS) || (Math.abs(oy) <= EPS && ox > EPS));
    return sideFace ? undefined : "boxes do not share a side face";
  }
  if (objects.length !== 1) return `a composite (${objects.map((object) => object.kind).join(" + ")}), expected a ${want.kind}`;
  const [object] = objects;
  if (object.kind !== want.kind) return `a ${object.kind}, expected a ${want.kind}`;
  const wrong = [];
  if (want.size && !sameSizes([object.size.x, object.size.y, object.size.z], want.size)) wrong.push(`size ${object.size.x}×${object.size.y}×${object.size.z}, expected ${want.size.join("×")}`);
  for (const key of ["radius", "height", "top_radius"]) {
    if (want[key] !== undefined && !(typeof object[key] === "number" && close(object[key], want[key]))) wrong.push(`${key} ${round(object[key])}, expected ${want[key]}`);
  }
  if (want.sides !== undefined) {
    const sides = Array.isArray(object.base) ? object.base.length : object.sides;
    if (sides !== want.sides) wrong.push(`${sides} sides, expected ${want.sides}`);
    else if (want.side !== undefined && !close(edgeOf(object), want.side)) wrong.push(`base edge ${round(edgeOf(object))}, expected ${want.side}`);
  }
  return wrong.length ? wrong.join(", ") : undefined;
}

// ---- The judge ---------------------------------------------------------------------------------------

/** Misses needing no expectation, for one scene. */
function sceneMisses(scene, solids, lines) {
  const misses = [];
  // Every measure the line shows is the drawn solid's.
  if (lines.length && solids.length > 1 && lines.length < solids.length) misses.push(`one measures line for ${solids.length} solids: it does not say which solid`);
  solids.forEach((solid, index) => {
    const shown = lines.length === 1 && solids.length === 1 ? readLine(lines[0]) : lines[index] !== undefined ? readLine(lines[index]) : {};
    for (const key of ["volume", "surface_area"]) {
      if (!shown[key]) continue;
      const truth = solid.measures[key];
      if (truth === undefined) misses.push(`${key.replace("_", " ")} shown for solid ${index + 1}, which has no ${key.replace("_", " ")} here`);
      else if (!matchesValue(shown[key], truth)) misses.push(`wrong ${key.replace("_", " ")} shown: ${describe(shown[key])}, the drawn solid's is ${shown[key].tolerance === 0 ? truth : round(truth)}`);
    }
    if (shown.counts && (!solid.measures.counts || shown.counts.join() !== solid.measures.counts.join())) {
      misses.push(`wrong counts shown: ${shown.counts.join("/")}, the drawn solid's are ${solid.measures.counts?.join("/") ?? "none"}`);
    }
  });
  // Solids do not overlap (touching parts are one solid already, so any overlap is between parts).
  const parts = solids.flatMap((solid) => solid.parts);
  for (let i = 0; i < parts.length; i += 1) for (let j = i + 1; j < parts.length; j += 1) {
    if (overlaps(parts[i].extent, parts[j].extent).every((amount) => amount > 1e-3)) misses.push(`objects overlap: ${parts[i].object.kind} and ${parts[j].object.kind}`);
  }
  // A cutting plane stays within the solids it cuts, and a net opens.
  const { cuts, nets } = sliders(scene);
  const bottom = Math.min(...solids.map((solid) => solid.z[0])), top = Math.max(...solids.map((solid) => solid.z[1]));
  for (const { section, values } of cuts) {
    // Along the plane's own axis, within the objects it cuts (all solids when it names none).
    const axis = section.axis ?? "z";
    const cut = parts.filter((part) => !(section.targets ?? []).length || section.targets.includes(idOf(part.object)));
    const [low, high] = cut.length ? [Math.min(...cut.map((part) => part.extent[axis][0])), Math.max(...cut.map((part) => part.extent[axis][1]))] : [bottom, top];
    const outside = values.find((value) => value < low - EPS || value > high + EPS);
    if (outside !== undefined) misses.push(`cutting plane at ${axis} = ${round(outside)}, outside the solids (${round(low)} to ${round(high)})`);
  }
  for (const net of nets) if (!net.values.some((value) => value >= 1 - EPS)) misses.push(`net of ${net.object} never opens flat (reaches ${net.values.length ? round(Math.max(...net.values)) : "nothing"})`);
  return misses;
}

/** Expected-value misses for one scene: every expected solid matched, its measures shown, the slider offered. */
function expectationMisses(expect, scene, solids, lines) {
  const misses = [];
  const wanted = expect.solids ?? [];
  const used = new Set();
  const matched = [];
  wanted.forEach((want, wantIndex) => {
    const reasons = [];
    const found = solids.findIndex((solid, index) => {
      if (used.has(index)) return false;
      const reason = solidMatches(want, solid);
      if (reason) reasons.push(reason);
      return !reason;
    });
    if (found < 0) { misses.push(`wrong solid: expected ${want.kind}${wanted.length > 1 ? ` (${wantIndex + 1} of ${wanted.length})` : ""}: ${reasons.join("; ") || "none drawn"}`); return; }
    used.add(found);
    matched.push(solids[found]);
    const shown = lines.length === 1 && solids.length === 1 ? readLine(lines[0]) : lines[found] !== undefined ? readLine(lines[found]) : {};
    for (const key of ["volume", "surface_area"]) {
      if (want[key] === undefined) continue;
      if (!shown[key]) misses.push(`missing ${key.replace("_", " ")}: not shown for the ${want.kind}`);
      else if (!matchesValue(shown[key], expectedValue(want[key]))) misses.push(`wrong ${key.replace("_", " ")}: shown ${describe(shown[key])}, expected ${round(expectedValue(want[key]))}`);
    }
    if (want.counts && (!shown.counts || shown.counts.join() !== want.counts.join())) misses.push(`missing counts: expected ${want.counts.join("/")}, shown ${shown.counts?.join("/") ?? "none"}`);
  });
  const { cuts, nets } = sliders(scene);
  // The slider acts on the expected solid (the first one matched, or any drawn when none is expected).
  const targets = matched.length ? matched : solids;
  const names = new Set(targets.flatMap((solid) => solid.parts.map((part) => idOf(part.object))));
  if (expect.interaction === "cut") {
    // A horizontal plane (axis z) cutting the expected solid and moving through ≥ 90% of its height,
    // never beyond it (owner review of #116: an x-axis plane on [-3, 3] passed against a cylinder of radius 2).
    // The learner moves it: a slider whose own range covers the travel (second review: an animation-only
    // cut, with no slider, passed).
    const ok = cuts.some((cut) => {
      if (!cut.slider || (cut.section.axis ?? "z") !== "z" || !(cut.section.targets ?? []).some((target) => names.has(target))) return false;
      const solid = targets.find((each) => each.parts.some((part) => (cut.section.targets ?? []).includes(idOf(part.object))));
      const [low, high] = solid.z;
      const [min, max] = cut.slider;
      return min >= low - EPS && max <= high + EPS && max - min >= 0.9 * (high - low);
    });
    if (!ok) misses.push("missing cut: no horizontal plane that a learner moves through the solid");
  }
  // A net the learner opens: a slider bound to the expected solid, from closed to flat (owner review: a
  // static cube already set to unfold 1 passed).
  if (expect.interaction === "unfold" && !nets.some((net) => net.learner && names.has(net.object))) misses.push("missing net: no slider that opens the solid from closed to flat");
  return misses;
}

/** What a case forbids, anywhere in the lesson's scenes. */
function forbidMisses(forbid, scene, lines) {
  const misses = [];
  const { cuts, nets } = sliders(scene);
  if (forbid.includes("cut") && cuts.length) misses.push("forbidden cut: a horizontal section is drawn");
  if (forbid.includes("unfold") && nets.length) misses.push("forbidden net");
  for (const key of ["volume", "surface_area", "counts"]) {
    if (forbid.includes(key) && lines.some((line) => readLine(line)[key])) misses.push(`forbidden ${key.replace("_", " ")} shown`);
  }
  return misses;
}

/**
 * Judges a lesson's 3D scenes against one case (expectations set before any run). The expectations are
 * met by any one scene; the checks needing no expectation and `forbid` hold for every scene. A near
 * miss (a family 0019 leaves out) passes with no scene. Returns { hard, soft }, empty when it passes.
 */
export function judgeSolids(item, lesson) {
  const hard = [], soft = [];
  const scenes = solidScenesIn(lesson);
  const expect = item.expect ?? {};
  if (!scenes.length) return item.nearMiss ? { hard, soft } : { hard: ["no 3D scene"], soft };
  const perScene = [];
  for (const scene of scenes) {
    if (scene.error) { hard.push(`scene ${scene.as}: ${scene.error}`); continue; }
    const solids = solidsOf(scene.content);
    if (!solids.length) { perScene.push(["no solid in the scene"]); continue; }
    const lines = typeof scene.content.caption === "string" && scene.content.caption.trim() ? scene.content.caption.split("\n") : [];
    for (const miss of sceneMisses(scene, solids, lines)) hard.push(`scene ${scene.as}: ${miss}`);
    for (const miss of forbidMisses(expect.forbid ?? [], scene, lines)) hard.push(`scene ${scene.as}: ${miss}`);
    perScene.push(expectationMisses(expect, scene, solids, lines));
  }
  if ((expect.solids?.length || expect.interaction) && !perScene.some((misses) => !misses.length)) {
    hard.push(...(perScene.sort((a, b) => a.length - b.length)[0] ?? ["no scene to judge"]));
  }
  return { hard, soft };
}

// node scripts/solids-judge.mjs <cases.json> <run dir>: judges each case's saved lesson.json (written by
// eval-math-expressiveness.mjs --cases-file) and prints one JSON line per case. A case with no saved
// lesson is a hard miss unless it is a near miss.
if (process.argv[1] && new URL(import.meta.url).pathname === (await import("node:path")).resolve(process.argv[1])) {
  const { readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const [casesFile, runDirectory] = process.argv.slice(2);
  if (!casesFile || !runDirectory) throw new Error("Usage: node scripts/solids-judge.mjs <cases.json> <run dir>");
  for (const item of JSON.parse(readFileSync(casesFile, "utf8")).cases) {
    const file = join(runDirectory, item.id, "lesson.json");
    const verdict = existsSync(file) ? judgeSolids(item, JSON.parse(readFileSync(file, "utf8")))
      : item.nearMiss ? { hard: [], soft: [] } : { hard: ["no lesson"], soft: [] };
    console.log(JSON.stringify({ id: item.id, pass: !verdict.hard.length, ...verdict }));
  }
}
