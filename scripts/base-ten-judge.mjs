// The trading mat judge (OLL decision 0023, plan §5: judge before recipe).
//
// It judges what a lesson's trading mat does, read through OLL itself: the lesson is normalized and reduced,
// so the demonstration's taps are applied by the card's own rules, as the player applies them. The model
// writes the meaning (the question's pile and a different practice pile); everything else is the program's,
// so the judge checks the program's work as strictly as the model's:
//
// - Expected values written into each case before any run: the lesson pile as the question states it
//   ([hundreds, tens, loose ones]), or `forbid` for a near miss (a question that is not trading).
// - Checks needing no expectation: one mat; the mat's columns hold both piles and the practice pile has
//   the same number of places as the lesson pile; the demonstration ends with no trade left at the same
//   value; the practice pile is a starting pile, different from the lesson pile, and its card task starts
//   it; the number, the counts row and the parts row answer the practice pile; the parts row asks what each
//   place is worth; no blank's label shows a number; every question sits by the mat.
//
// Narration is not judged here: what the lesson says is read by hand under the probe's pass rules.

import { normalizeAuthoringLesson, reduceCanonicalEvents } from "octos-lesson-language";
import { baseTenFacts, baseTenMat, validateBaseTenTradeContent } from "octos-lesson-language/plugin-math";

const PLACES = ["ones", "tens", "hundreds"];
const valueOf = ([h, t, o]) => h * 100 + t * 10 + o;
const digitsOf = (value) => (value >= 100 ? 3 : value >= 10 ? 2 : 1);

/** The pile a mat starts with when its tap variables hold these values: [hundreds, tens, loose ones]. */
function pileAt(content, variables) {
  const bound = new Map((content.bindings ?? []).map((binding) => [binding.target, String(binding.expression).trim()]));
  const places = content.places ?? [];
  const at = (p, field) => {
    const alias = bound.get(`${PLACES[p]}.${field}`);
    return alias !== undefined && variables[alias] !== undefined ? variables[alias] : places[p]?.[field] ?? 0;
  };
  const columns = content.columns === 3 ? 3 : 2;
  return { pile: [columns === 3 ? at(2, "count") : 0, at(1, "count"), at(0, "count")], trays: [at(0, "tray"), columns === 3 ? at(1, "tray") : 0], columns };
}

/** Everything the judge reads about one lesson's mat, or the reason it cannot. */
export function tradingMatIn(lesson) {
  const actions = (lesson?.steps ?? []).flatMap((step) => step.beats ?? []).flatMap((beat) => beat.actions ?? []);
  const writes = actions.filter((action) => action.do === "write" && action.kind === "base_ten_trade");
  if (!writes.length) return { cards: 0 };
  let events;
  try {
    events = normalizeAuthoringLesson(lesson, { lessonId: "judge", boardId: "judge", baseRevision: 0, regionIntent: "new_topic" });
  } catch (error) {
    return { cards: writes.length, error: `${error.code ?? "error"}: ${String(error.message).slice(0, 160)}` };
  }
  const write = writes[0];
  const declared = Object.fromEntries((lesson.lesson?.variables ?? []).map((variable) => [variable.as, variable.initial]));
  const lessonStart = pileAt(write.content, declared);
  const board = reduceCanonicalEvents(events);
  const node = Object.values(board.nodes).find((candidate) => String(candidate.id).endsWith(`:node:${write.as}`));
  const end = node ? baseTenFacts(baseTenMat(node.content)) : undefined;
  const tasks = lesson.lesson?.tasks ?? [];
  const cardTask = tasks.find((task) => task.completion?.kind === "card_fact");
  const practice = cardTask?.start ? pileAt(write.content, { ...declared, ...(cardTask.start.values ?? {}) }) : undefined;
  const taps = actions.filter((action) => action.do === "tap" && action.target === write.as).length;
  return { cards: writes.length, as: write.as, content: write.content, lessonStart, end, cardTask, practice, tasks, taps };
}

/** Judges one case's lesson. Returns { pass, checks: [{ check, pass, detail? }] }. */
export function judgeTradingMat(item, lesson) {
  const checks = [];
  const check = (name, pass, detail) => checks.push({ check: name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
  const mat = tradingMatIn(lesson);
  if (item.expect?.forbid) {
    check("no trading mat for this question", mat.cards === 0, `${mat.cards} mat(s) drawn`);
    return { pass: checks.every((each) => each.pass), checks };
  }
  check("one trading mat", mat.cards === 1, `${mat.cards} mats`);
  if (mat.cards !== 1) return { pass: false, checks };
  check("the lesson plays", !mat.error, mat.error);
  if (mat.error) return { pass: false, checks };
  const want = item.expect.lesson_pile;
  const { pile, columns } = mat.lessonStart;
  check("the lesson pile is the question's", JSON.stringify(pile) === JSON.stringify(want), `drawn ${JSON.stringify(pile)}, question ${JSON.stringify(want)}`);
  check("the mat has the columns the pile needs", columns === (valueOf(want) >= 100 || want[0] > 0 ? 3 : 2), `${columns} columns for ${JSON.stringify(want)}`);
  check("the demonstration ends with no trade left", mat.end?.no_trade_left === true, `the lesson ends at ${JSON.stringify(mat.end)}`);
  check("the demonstration keeps the value", mat.end?.value === valueOf(pile), `ends at ${mat.end?.value}, starts at ${valueOf(pile)}`);
  const needsTrade = pile[2] >= 10 || pile[1] >= 10;
  check("the demonstration trades when the pile needs it", !needsTrade || mat.taps > 0, "no taps in the lesson");
  // The practice pile is the model's; it is checked by rule.
  check("a card task with a practice pile", mat.cardTask && mat.practice, "no card_fact task with a start");
  if (!mat.practice) return { pass: false, checks };
  const practice = mat.practice.pile;
  let practiceValid = true;
  try {
    validateBaseTenTradeContent({ columns, places: [{ as: "ones", count: practice[2], tray: mat.practice.trays[0] }, { as: "tens", count: practice[1], ...(columns === 3 ? { tray: mat.practice.trays[1] } : {}) }, ...(columns === 3 ? [{ as: "hundreds", count: practice[0] }] : [])] }, "$", (path, message) => { throw new Error(`${path}: ${message}`); });
  } catch (error) { practiceValid = String(error.message); }
  check("the practice pile is a starting pile", practiceValid === true, practiceValid);
  check("the practice pile differs from the lesson's", JSON.stringify(practice) !== JSON.stringify(pile), `both ${JSON.stringify(pile)}`);
  check("the practice pile has as many places as the lesson's", digitsOf(valueOf(practice)) === digitsOf(valueOf(pile)), `${valueOf(practice)} for a lesson about ${valueOf(pile)}`);
  // The questions answer the practice pile.
  const value = valueOf(practice), digits = digitsOf(value);
  const places = Array.from({ length: digits }, (_, i) => digits - 1 - i);
  const counts = places.map((p) => Math.floor(value / 10 ** p) % 10);
  const parts = places.map((p) => counts[digits - 1 - p] * 10 ** p);
  const number = mat.tasks.find((task) => task.completion?.kind === "numeric_answer");
  const rows = mat.tasks.filter((task) => task.completion?.kind === "numeric_row");
  const blanks = (task) => task.completion.parts.flatMap((part) => ("blank" in part ? [part.blank] : []));
  const answers = (task) => blanks(task).map((blank) => Number(blank.answer));
  check("the number question answers the practice pile", number && Number(number.completion.answer) === value, `${number?.completion.answer} for ${value}`);
  check("a counts row answers the practice pile", rows.some((row) => JSON.stringify(answers(row)) === JSON.stringify(counts)), `rows ${JSON.stringify(rows.map(answers))}, counts ${JSON.stringify(counts)}`);
  check("a parts row answers the practice pile", rows.some((row) => JSON.stringify(answers(row)) === JSON.stringify(parts)), `rows ${JSON.stringify(rows.map(answers))}, parts ${JSON.stringify(parts)}`);
  // The parts row is the one that writes the number by places ("37 = __ + __"), whatever its answers.
  const partsRow = rows.find((row) => "text" in (row.completion.parts[0] ?? {}) && /=\s*$/.test(row.completion.parts[0].text));
  check("the parts row asks what each place is worth", partsRow && /\bworth\b/i.test(`${partsRow.prompt} ${blanks(partsRow).map((blank) => blank.label ?? "").join(" ")}`), partsRow?.prompt ?? "no row writes the number by places");
  check("no label shows a number", rows.every((row) => blanks(row).every((blank) => !/\d/.test(blank.label ?? ""))), "a label has a digit");
  check("every question sits by the mat", [number, ...rows].filter(Boolean).every((task) => task.anchor === mat.as), "a question anchored elsewhere");
  return { pass: checks.every((each) => each.pass), checks };
}

// node scripts/base-ten-judge.mjs <cases.json> <run-directory>: judges <run-directory>/<case id>.json lessons.
if (process.argv[1] && new URL(import.meta.url).pathname === (await import("node:path")).resolve(process.argv[1])) {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const [casesFile, runDirectory] = process.argv.slice(2);
  if (!casesFile || !runDirectory) {
    console.error("usage: node scripts/base-ten-judge.mjs <cases.json> <run-directory>");
    process.exit(2);
  }
  const { cases } = JSON.parse(await readFile(casesFile, "utf8"));
  let passed = 0;
  for (const item of cases) {
    let lesson;
    try { lesson = JSON.parse(await readFile(join(runDirectory, `${item.id}.json`), "utf8")); } catch { console.log(`${item.id}\tmissing`); continue; }
    const verdict = judgeTradingMat(item, lesson);
    if (verdict.pass) passed += 1;
    console.log(`${item.id}\t${verdict.pass ? "pass" : "FAIL"}\t${verdict.checks.filter((each) => !each.pass).map((each) => `${each.check}: ${each.detail}`).join("; ")}`);
  }
  console.log(`${passed}/${cases.length} pass`);
}
