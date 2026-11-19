// The fraction model judge (OLL decision 0021 §5 step 2, plan §5: judge before recipe).
//
// It judges what a lesson's fraction cards draw, read through OLL itself: the lesson is normalized and
// each fraction_model node's content is read from the reduced board, so bindings and animations are
// applied as the player applies them. The card's content is its meaning (0021, amended): a model, one
// or two fractions over whole parts, and a relation. The relation and equivalence are recomputed here,
// independently of the plugin.
//
// Two kinds of check:
// - Expected values, written into each case before any run (0021 §5): the fractions shown (numerator
//   over denominator as written, so 9/12 is not 3/4), the model, wholes, split, highlight, relation, the
//   smallest piece,
//   the slider a practice task uses, and what must not appear (`forbid`, for near misses).
// - Checks needing no expectation, on every card: the lesson normalizes; two fractions have a relation;
//   fractions shown equivalent are equal; a bound numerator moves in whole parts.
//
// Narration is not judged here: what the lesson says is read by hand under the probe's pass rules.

import { normalizeAuthoringLesson, reduceCanonicalEvents } from "octos-lesson-language";

const sameFraction = (a, b) => a.numerator === b.numerator && a.denominator === b.denominator;
/** A card's fraction shows the wanted one: the same denominator, and the numerator as written or a value it is animated to. */
const showsFraction = (fraction, want) => fraction.denominator === want.denominator && (fraction.values ?? [fraction.numerator]).includes(want.numerator);
const text = (fraction) => `${fraction.numerator}/${fraction.denominator}`;
const relationOf = (a, b) => {
  const left = a.numerator * b.denominator, right = b.numerator * a.denominator;
  return left < right ? "<" : left > right ? ">" : "=";
};

/** The fraction cards a whole authoring lesson draws, each with every numerator value it shows. */
export function fractionCardsIn(lesson) {
  const actions = (lesson?.steps ?? []).flatMap((step) => step.beats ?? []).flatMap((beat) => beat.actions ?? []);
  const writes = actions.filter((action) => action.do === "write" && action.kind === "fraction_model");
  if (!writes.length) return [];
  let events;
  try {
    events = normalizeAuthoringLesson(lesson, { lessonId: "judge", boardId: "judge", baseRevision: 0, regionIntent: "new_topic" });
  } catch (error) {
    return [{ as: writes[0].as, error: `${error.code ?? "error"}: ${String(error.message).slice(0, 120)}` }];
  }
  const nodes = Object.values(reduceCanonicalEvents(events).nodes);
  const variables = lesson.lesson?.variables ?? [];
  const animated = new Map();
  for (const action of actions) if (action.do === "animate") animated.set(action.variable, [...(animated.get(action.variable) ?? []), action.value]);
  return writes.map((write) => {
    const node = nodes.find((candidate) => String(candidate.id).endsWith(`:node:${write.as}`));
    if (!node) return { as: write.as, error: "fraction_model node not found" };
    const bindings = write.content.bindings ?? [];
    // Each fraction as written, then every value its numerator takes: the start, each animation of a
    // variable bound directly, and the end of the lesson (the reduced board).
    const fractions = (write.content.fractions ?? []).map((fraction, index) => {
      const binding = bindings.find((candidate) => candidate.target === `${fraction.as}.numerator`);
      const variable = binding && variables.find((candidate) => candidate.as === String(binding.expression).trim());
      const end = node.content.fractions?.[index]?.numerator ?? fraction.numerator;
      const values = [fraction.numerator, end, ...(variable ? animated.get(variable.as) ?? [] : [])];
      return { ...fraction, values: [...new Set(values)], ...(binding ? { bound: { expression: binding.expression, variable } } : {}) };
    });
    return { as: write.as, model: write.content.model, grid: write.content.grid, relation: write.content.relation, fractions };
  });
}

/** Misses needing no expectation, for one card. */
function cardMisses(card) {
  const misses = [];
  if (card.fractions.length === 2 && !card.relation) misses.push("two fractions with no relation");
  if (card.relation === "equivalent") {
    const [a, b] = card.fractions;
    if (relationOf(a, b) !== "=") misses.push(`shown equivalent but ${text(a)} ${relationOf(a, b)} ${text(b)}`);
  }
  for (const fraction of card.fractions) {
    // A whole drawn past what a fixed numerator fills stands empty, and reads as part of the fraction's whole.
    const fills = Math.max(1, Math.ceil(fraction.numerator / fraction.denominator));
    if (!fraction.bound && fraction.wholes !== undefined && fraction.wholes > fills) misses.push(`${fraction.as}: ${fraction.wholes} wholes drawn for ${text(fraction)}, which fills ${fills}`);
    if (!fraction.bound) continue;
    const { variable } = fraction.bound;
    if (!variable) { misses.push(`${fraction.as}: numerator bound to an expression, not a slider variable`); continue; }
    const step = variable.control?.step;
    if (variable.control && step !== undefined && !Number.isInteger(step)) misses.push(`${fraction.as}: the slider steps by ${step}, not whole parts`);
    if (!Number.isInteger(variable.min) || !Number.isInteger(variable.max)) misses.push(`${fraction.as}: the slider runs ${variable.min} to ${variable.max}, not whole parts`);
  }
  return misses;
}

/** A fraction a card shows at some point: as written, or a value its numerator reaches. */
const shows = (card, want) => card.fractions.some((fraction) => fraction.denominator === want.denominator && fraction.values.includes(want.numerator));

/** Expected-value misses for one card. */
function expectationMisses(expect, card, lesson) {
  const misses = [];
  if (expect.models && !expect.models.includes(card.model)) misses.push(`model ${card.model}, expected ${expect.models.join(" or ")}`);
  if (expect.grid && (card.grid?.rows !== expect.grid.rows || card.grid?.columns !== expect.grid.columns)) misses.push(`grid ${card.grid ? `${card.grid.rows}×${card.grid.columns}` : "none"}, expected ${expect.grid.rows}×${expect.grid.columns}`);
  const drawn = card.fractions.map((fraction) => text(fraction)).join(", ");
  if (expect.fractions) {
    if (expect.fractions.length !== card.fractions.length && !expect.slider) misses.push(`${card.fractions.length} fraction(s) (${drawn}), expected ${expect.fractions.length}`);
    else if (expect.slider) {
      // The learner reaches the target with the slider (the task below); the card shows the denominator.
      if (!expect.fractions.every((want) => shows(card, want) || card.fractions.some((fraction) => fraction.denominator === want.denominator && fraction.bound))) {
        misses.push(`shows ${drawn}, expected ${expect.fractions.map(text).join(", ")}`);
      }
    } else {
      const inOrder = expect.fractions.every((want, index) => showsFraction(card.fractions[index], want));
      const anyOrder = expect.fractions.every((want) => card.fractions.some((fraction) => showsFraction(fraction, want)));
      if (!(inOrder || (expect.anyOrder && anyOrder))) misses.push(`shows ${drawn}, expected ${expect.fractions.map(text).join(", ")}`);
    }
  }
  if (expect.fractionsAnyOf && !expect.fractionsAnyOf.some((set) => set.length === card.fractions.length && set.every((want) => card.fractions.some((fraction) => showsFraction(fraction, want))))) {
    misses.push(`shows ${drawn}, expected one of ${expect.fractionsAnyOf.map((set) => set.map(text).join(" and ")).join("; ")}`);
  }
  // Two different fractions from the list: one compared with itself orders nothing (review of #130).
  if (expect.fractionsFrom && !(card.fractions.length === 2 && !sameFraction(card.fractions[0], card.fractions[1])
    && card.fractions.every((fraction) => expect.fractionsFrom.some((want) => showsFraction(fraction, want))))) {
    misses.push(`shows ${drawn}, expected two of ${expect.fractionsFrom.map(text).join(", ")}`);
  }
  if (expect.relation && card.relation !== expect.relation) misses.push(`relation ${card.relation ?? "none"}, expected ${expect.relation}`);
  const first = card.fractions[0];
  if (expect.wholes !== undefined && first) {
    const wholes = first.wholes ?? Math.max(1, Math.ceil(first.numerator / first.denominator));
    if (wholes !== expect.wholes) misses.push(`${wholes} whole(s), expected ${expect.wholes}`);
  }
  if (expect.split !== undefined && first?.split !== expect.split) misses.push(`split ${first?.split ?? "none"}, expected ${expect.split}`);
  if (expect.highlight !== undefined && first?.highlight !== expect.highlight) misses.push(`highlight ${first?.highlight ?? "none"}, expected ${expect.highlight}`);
  // Each smallest piece is 1/smallestPart of a whole: 3 wholes in quarters as 3/1 split 4 or 12/4, never
  // 12/4 split 2 (eighths; review of #130).
  if (expect.smallestPart !== undefined && first && first.denominator * (first.split ?? 1) !== expect.smallestPart) {
    misses.push(`smallest pieces are 1/${first.denominator * (first.split ?? 1)}, expected 1/${expect.smallestPart}`);
  }
  if (expect.slider) {
    const bound = card.fractions.find((fraction) => fraction.bound?.variable && fraction.denominator === expect.slider.denominator);
    if (!bound) misses.push(`no slider on a numerator over ${expect.slider.denominator}`);
    else {
      const tasks = (lesson.lesson?.tasks ?? []).filter((task) => task.completion?.kind === "expression_target" && String(task.completion.expression).trim() === bound.bound.variable.as);
      if (!tasks.some((task) => task.completion.value === expect.slider.target)) misses.push(`no practice task setting the numerator to ${expect.slider.target} (tasks: ${tasks.map((task) => task.completion.value).join(", ") || "none"})`);
    }
  }
  return misses;
}

/**
 * Judges a lesson's fraction cards against one case (expectations set before any run). The expectations
 * are met by any one card; the checks needing no expectation hold for every card. A near miss passes
 * with no card, and fails with one it forbids. Returns { hard, soft }, empty when it passes.
 */
export function judgeFractions(item, lesson) {
  const hard = [], soft = [];
  const cards = fractionCardsIn(lesson);
  const expect = item.expect ?? {};
  const forbid = item.forbid ?? expect.forbid ?? [];
  if (forbid.includes("fraction_model") && cards.length) hard.push(`forbidden fraction card: ${cards.map((card) => card.fractions?.map(text).join(", ") ?? card.error).join("; ")}`);
  if (!cards.length) return item.nearMiss ? { hard, soft } : { hard: ["no fraction card"], soft };
  const perCard = [];
  for (const card of cards) {
    if (card.error) { hard.push(`card ${card.as}: ${card.error}`); continue; }
    for (const miss of cardMisses(card)) hard.push(`card ${card.as}: ${miss}`);
    if (!item.nearMiss) perCard.push(expectationMisses(expect, card, lesson));
  }
  if (!item.nearMiss && !perCard.some((misses) => !misses.length)) {
    // The model is a teacher's choice among good ones: a card right in every other way is a soft miss,
    // whichever card it is (review of #130: the order of the cards decided it).
    const modelOnly = perCard.find((misses) => misses.length === 1 && misses[0].startsWith("model "));
    if (modelOnly) soft.push(modelOnly[0]);
    else hard.push(...([...perCard].sort((a, b) => a.length - b.length)[0] ?? ["no card to judge"]));
  }
  return { hard, soft };
}

// node scripts/fraction-judge.mjs <cases.json> <run dir>: judges each case's saved lesson.json (written by
// eval-math-expressiveness.mjs --cases-file) and prints one JSON line per case. A case with no saved
// lesson is a hard miss unless it is a near miss.
if (process.argv[1] && new URL(import.meta.url).pathname === (await import("node:path")).resolve(process.argv[1])) {
  const { readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const [casesFile, runDirectory] = process.argv.slice(2);
  if (!casesFile || !runDirectory) throw new Error("Usage: node scripts/fraction-judge.mjs <cases.json> <run dir>");
  for (const item of JSON.parse(readFileSync(casesFile, "utf8")).cases) {
    const file = join(runDirectory, item.id, "lesson.json");
    const verdict = existsSync(file) ? judgeFractions(item, JSON.parse(readFileSync(file, "utf8")))
      : item.nearMiss ? { hard: [], soft: [] } : { hard: ["no lesson"], soft: [] };
    console.log(JSON.stringify({ id: item.id, pass: !verdict.hard.length, ...verdict }));
  }
}
