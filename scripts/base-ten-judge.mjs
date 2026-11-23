// The trading mat judge (OLL decision 0023, plan §5: judge before recipe).
//
// It judges what a lesson's trading mat does, read through OLL itself: the lesson is normalized and reduced,
// so the demonstration's taps are applied by the card's own rules, as the player applies them. The model
// writes the meaning (the question's pile and a different practice pile); everything else is the program's,
// so the judge checks the program's work as strictly as the model's:
//
// - Expected values written into each case before any run: the lesson pile as the question states it
//   ([hundreds, tens, loose ones]), or `forbid` for a near miss (a question that is not trading).
// - Checks needing no expectation: one mat; the mat's columns hold the pile; every step of the lesson keeps
//   the amount, and the lesson ends with no trade left; a pile that needs a trade has the learner's own
//   task on the mat, starting from the lesson's pile (since 0023 amendment 4, 2026-11-23: the mat's slider,
//   each stop one trade, to the value the model named; or tapping until no trade is left); a typed question
//   follows; the mat speaks the lesson's language (0023 amendment 3).
// - Since the rebuild of 2026-11-23 the pile is lesson numbers and the model writes the trades and the
//   practice, so the judge no longer checks a separate practice pile or the wording of prompts.
//
// Narration is not judged here: what the lesson says is read by hand under the probe's pass rules.

import { normalizeAuthoringLesson, reduceCanonicalEvents } from "octos-lesson-language";
import { applyBaseTenTap, baseTenFacts, baseTenMat } from "octos-lesson-language/plugin-math";

const PLACES = ["ones", "tens", "hundreds"];
const valueOf = ([h, t, o]) => h * 100 + t * 10 + o;

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
  if (!writes.length) {
    // A near miss must still be a lesson that plays (review of #155).
    try { normalizeAuthoringLesson(lesson, { lessonId: "judge", boardId: "judge", baseRevision: 0, regionIntent: "new_topic" }); }
    catch (error) { return { cards: 0, error: `${error.code ?? "error"}: ${String(error.message).slice(0, 160)}` }; }
    return { cards: 0 };
  }
  let board;
  try {
    board = reduceCanonicalEvents(normalizeAuthoringLesson(lesson, { lessonId: "judge", boardId: "judge", baseRevision: 0, regionIntent: "new_topic" }));
  } catch (error) {
    return { cards: writes.length, error: `${error.code ?? "error"}: ${String(error.message).slice(0, 160)}` };
  }
  const write = writes[0];
  const declared = Object.fromEntries((lesson.lesson?.variables ?? []).map((variable) => [variable.as, variable.initial]));
  const lessonStart = pileAt(write.content, declared);
  const node = Object.values(board.nodes).find((candidate) => String(candidate.id).endsWith(`:node:${write.as}`));
  const end = node ? baseTenFacts(baseTenMat(node.content)) : undefined;
  const tasks = lesson.lesson?.tasks ?? [];
  // The learner's task on the mat: tapping until no trade is left, or the mat's own slider on one of its
  // counts (0023 amendment 4), each started from a pile of its own.
  const countVariables = new Set((write.content.bindings ?? []).filter((binding) => /\.count$/.test(binding.target)).map((binding) => String(binding.expression).trim()));
  const cardTask = tasks.find((task) => task.completion?.kind === "card_fact")
    ?? tasks.find((task) => (task.allowed_operations ?? []).some((operation) => operation.kind === "variable_change" && countVariables.has(operation.variable) && (operation.controls ?? []).includes("slider")));
  const practice = cardTask?.start ? pileAt(write.content, { ...declared, ...(cardTask.start.values ?? {}) }) : undefined;
  const taps = actions.filter((action) => action.do === "tap" && action.target === write.as).length;
  // The mat's value after each demonstration action, in order: a tap by the card's rules, an animation by its
  // end value. Each must keep the value: two animated counts play one after the other, so a trade written as
  // two animations shows a wrong amount in between (Learn playback, 2026-11-22).
  const bound = new Map((write.content.bindings ?? []).map((binding) => [String(binding.expression).trim(), binding.target]));
  const steps = [];
  let current = { columns: lessonStart.columns, counts: [lessonStart.pile[2], lessonStart.pile[1], lessonStart.pile[0]].slice(0, lessonStart.columns), trays: lessonStart.trays.slice(0, lessonStart.columns - 1) };
  for (const action of actions.slice(actions.indexOf(write) + 1)) {
    if (action.do === "tap" && action.target === write.as) {
      const result = applyBaseTenTap(current, { kind: action.tap, place: PLACES.indexOf(action.at) });
      if (result.ok) current = result.mat;
    } else if (action.do === "animate" && bound.has(action.variable)) {
      const [place, field] = bound.get(action.variable).split(".");
      const p = PLACES.indexOf(place);
      current = field === "count" ? { ...current, counts: current.counts.map((n, i) => (i === p ? action.value : n)) } : { ...current, trays: current.trays.map((n, i) => (i === p ? action.value : n)) };
    } else continue;
    steps.push({ action: action.do === "tap" ? `${action.tap}:${action.at}` : `${action.variable}=${action.value}`, value: current.counts.reduce((sum, n, i) => sum + n * 10 ** i, 0) });
  }
  // A change to one of the mat's variables before the mat is drawn: the pile would start at another amount
  // than the lesson's numbers say (review of #160).
  const early = actions.slice(0, actions.indexOf(write)).find((action) => action.do === "animate" && bound.has(action.variable));
  const countOf = Object.fromEntries((write.content.bindings ?? []).filter((binding) => /\.count$/.test(binding.target)).map((binding) => [binding.target.split(".")[0], String(binding.expression).trim()]));
  return { cards: writes.length, as: write.as, content: write.content, lessonStart, end, cardTask, practice, tasks, taps, steps, early, countOf };
}

/** Judges one case's lesson. Returns { pass, checks: [{ check, pass, detail? }] }. */
export function judgeTradingMat(item, lesson) {
  const checks = [];
  const check = (name, pass, detail) => checks.push({ check: name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
  const mat = tradingMatIn(lesson);
  if (item.expect?.forbid) {
    check("no trading mat for this question", mat.cards === 0, `${mat.cards} mat(s) drawn`);
    check("the lesson plays", !mat.error, mat.error);
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
  check("nothing changes the pile before the mat is drawn", !mat.early, mat.early && `${mat.early.variable} is animated to ${mat.early.value} before the mat is drawn`);
  const moved = mat.steps.find((step) => step.value !== valueOf(pile));
  check("every demonstration step keeps the value", !moved, moved && `after ${moved.action} the mat shows ${moved.value}, not ${valueOf(pile)}`);
  const needsTrade = pile[2] >= 10 || pile[1] >= 10;
  check("the demonstration trades when the pile needs it", !needsTrade || mat.taps > 0, "no taps in the lesson");
  // The child's own trading: a pile that needs a trade has a task on the mat that starts again from the
  // lesson's pile, trays empty: the mat's slider to the value the model named (one trade or all of them), or
  // tapping until no trade is left. A pile with nothing to trade has no such task.
  if (needsTrade) {
    check("the learner trades the lesson's pile on the mat", mat.cardTask && mat.practice, "no task on the mat with a start");
    const onSlider = mat.cardTask?.completion?.kind === "expression_target";
    check("the task on the mat is the card's trading or its slider", onSlider
      ? mat.cardTask.allowed_operations.length === 1 && String(mat.cardTask.completion.expression).trim() === mat.cardTask.allowed_operations[0].variable
      : mat.cardTask?.completion?.fact === "no_trade_left" && mat.cardTask?.completion?.node === mat.as, JSON.stringify(mat.cardTask?.completion));
    // A slider task on the tens may start with the ones already traded: the same amount, trays empty. A ones
    // slider starts from the lesson's pile itself (review of #163: a traded start sliding up un-trades).
    const tensSlider = onSlider && String(mat.cardTask.allowed_operations[0].variable) === mat.countOf?.tens;
    const sameStart = mat.practice && (JSON.stringify(mat.practice.pile) === JSON.stringify(pile) || (tensSlider && valueOf(mat.practice.pile) === valueOf(pile) && mat.practice.pile[2] < 10));
    check("the task starts from the lesson's pile, trays empty", sameStart && mat.practice.trays.every((tray) => tray === 0),
      `starts at ${JSON.stringify(mat.practice?.pile)} trays ${JSON.stringify(mat.practice?.trays)}, the lesson's pile is ${JSON.stringify(pile)}`);
  } else {
    check("no trading task on a pile with nothing to trade", !mat.cardTask, "a task on the mat on a pile that needs no trade");
  }
  // A typed question, which the model writes about a pile it states in words: that it exists is checked
  // here; what it asks, and that its answer is not on the screen, is read by hand.
  check("a typed question follows", mat.tasks.some((task) => task.completion?.kind === "numeric_answer"), "no typed question in the lesson");
  const zh = /^zh(?:-|$)/i.test(String(lesson.lesson?.language ?? ""));
  check("the mat speaks the lesson's language", (mat.content.language ?? "en-US") === (zh ? "zh-CN" : "en-US"), `mat ${mat.content.language ?? "en-US"}, lesson ${lesson.lesson?.language}`);
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
    // A lesson is <run>/<id>.json, or <run>/<id>/lesson.json as eval-math-expressiveness.mjs saves it. A
    // near miss with no lesson is not judged; a trading question with none fails.
    let found;
    for (const path of [join(runDirectory, `${item.id}.json`), join(runDirectory, item.id, "lesson.json")]) {
      try { found = await readFile(path, "utf8"); break; } catch (error) { if (error.code !== "ENOENT") { found = null; break; } }
    }
    if (found === undefined) { console.log(`${item.id}\tmissing`); continue; }
    if (found === null) { console.log(`${item.id}\tunreadable`); continue; }
    try { lesson = JSON.parse(found); } catch { console.log(`${item.id}\tunreadable`); continue; }
    let verdict;
    try { verdict = judgeTradingMat(item, lesson); } catch (error) { console.log(`${item.id}\tFAIL\tjudge error: ${String(error?.message ?? error).slice(0, 160)}`); continue; }
    if (verdict.pass) passed += 1;
    console.log(`${item.id}\t${verdict.pass ? "pass" : "FAIL"}\t${verdict.checks.filter((each) => !each.pass).map((each) => `${each.check}: ${each.detail}`).join("; ")}`);
  }
  console.log(`${passed}/${cases.length} pass`);
  process.exitCode = passed === cases.length ? 0 : 1;
}
