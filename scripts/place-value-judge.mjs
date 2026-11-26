// The place-value chart judge (OLL decision 0025, need 35P-05; plan §5: judge before recipe).
//
// It judges what a lesson's place-value chart shows, read through OLL itself: the lesson is normalized and
// reduced, so the demonstration's taps and animations are applied by the card's own rules, as the player
// applies them. The model writes the meaning (the question's number, which form is given, a different
// practice number); every number text on the card is the program's.
//
// - Expected values written into each case before any run: the question's number, the direction
//   (build or pull_apart) and the form the question gives, or `forbid` for a near miss.
// - Checks (objective; owner, 2026-11-24): the lesson plays; one chart shows the question's number; the chart
//   speaks the lesson's language; a task on the chart is the card's own (built, or every place taken out), by
//   taps, on a practice number different from the lesson's, starting empty (build) or whole (pull apart); a
//   build task's words do not write its number's digits (read as the compiler reads them: commas or spaces
//   between thousands, full-width digits); a pull-apart task is followed by its row, one blank per non-zero
//   place of the practice number, each answer that place's value; and a near miss that draws a chart FAILS
//   (decision 0025 §7: the mat's judge only noted it, so BT-31 was never flagged).
// - Notes (what the lesson chose to teach; the owner judges lessons): the chart's task matches the question's
//   direction and form, the demonstration finishes (built, or every place out), the learner has a task on the
//   chart, a typed question or row follows, and the task's words name no control.
//
// Narration is not judged.

import { normalizeAuthoringLesson, reduceCanonicalEvents } from "octos-lesson-language";
import { placeValueChartState, placeValueFacts, placeValueNumeral, placeValueParse, placeValueParts } from "octos-lesson-language/plugin-math";
// The compiler's own reading of a task's words, so the judge and the compiler agree on what leaks the number.
import { placeValueWordsWrite } from "../lesson-plan.js";

const KIND = "place_value_chart";

/** The chart's content with its bound fields at these variable values. */
function contentAt(content, variables) {
  const bound = new Map((content.bindings ?? []).map((binding) => [binding.target, String(binding.expression).trim()]));
  const at = (target, fallback) => {
    const alias = bound.get(target);
    return alias !== undefined && variables[alias] !== undefined ? variables[alias] : fallback;
  };
  return {
    ...content,
    target: at("target", content.target),
    places: (content.places ?? []).map((place) => ({
      ...place,
      count: at(`${place.as}.count`, place.count),
      ...(place.pulled !== undefined ? { pulled: at(`${place.as}.pulled`, place.pulled) } : {}),
    })),
  };
}

/** Everything the judge reads about one lesson's chart, or the reason it cannot. */
export function placeValueChartIn(lesson) {
  const actions = (lesson?.steps ?? []).flatMap((step) => step.beats ?? []).flatMap((beat) => beat.actions ?? []);
  const writes = actions.filter((action) => action.do === "write" && action.kind === KIND);
  let board;
  try {
    board = reduceCanonicalEvents(normalizeAuthoringLesson(lesson, { lessonId: "judge", boardId: "judge", baseRevision: 0, regionIntent: "new_topic" }));
  } catch (error) {
    return { cards: writes.length, error: `${error.code ?? "error"}: ${String(error.message).slice(0, 160)}` };
  }
  if (!writes.length) return { cards: 0 };
  const write = writes[0];
  const declared = Object.fromEntries((lesson.lesson?.variables ?? []).map((variable) => [variable.as, variable.initial]));
  const start = placeValueChartState(contentAt(write.content, declared));
  const node = Object.values(board.nodes).find((candidate) => String(candidate.id).endsWith(`:node:${write.as}`));
  const end = node ? placeValueFacts(placeValueChartState(node.content)) : undefined;
  const tasks = lesson.lesson?.tasks ?? [];
  const cardTask = tasks.find((task) => task.completion?.kind === "card_fact" && task.completion?.node === write.as);
  const practice = cardTask?.start ? placeValueChartState(contentAt(write.content, { ...declared, ...(cardTask.start.values ?? {}) })) : undefined;
  return { cards: writes.length, as: write.as, content: write.content, start, end, cardTask, practice, tasks };
}

/** Judges one case's lesson. Returns { pass, checks: [{ check, pass, detail? }], notes: [...] }. */
export function judgePlaceValueChart(item, lesson) {
  const checks = [];
  const notes = [];
  const check = (name, pass, detail) => checks.push({ check: name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
  const note = (name, holds, detail) => notes.push({ check: name, pass: Boolean(holds), ...(holds ? {} : { detail }) });
  const done = () => ({ pass: checks.every((each) => each.pass), checks, notes });
  const chart = placeValueChartIn(lesson);
  check("the lesson plays", !chart.error, chart.error);
  if (item.expect?.forbid) {
    check("no place-value chart for this question", chart.cards === 0, `${chart.cards} chart(s) drawn`);
    return done();
  }
  note("one place-value chart", chart.cards === 1, `${chart.cards} charts`);
  if (!chart.cards || chart.error) {
    check("a place-value chart is drawn", chart.cards > 0, "no chart");
    return done();
  }
  const want = placeValueParse(item.expect.number);
  const zh = /^zh(?:-|$)/i.test(String(lesson.lesson?.language ?? ""));
  const language = zh ? "zh-CN" : "en-US";
  check("the chart shows the question's number", chart.start.target === want,
    `chart ${placeValueNumeral(chart.start.target, language)}, question ${item.expect.number}`);
  check("the chart speaks the lesson's language", (chart.content.language ?? "en-US") === language, `chart ${chart.content.language ?? "en-US"}, lesson ${lesson.lesson?.language}`);
  const mode = item.expect.direction === "pull_apart" ? "apart" : "build";
  note("the chart's task is the question's direction", chart.content.mode === mode, `chart ${chart.content.mode}, question ${item.expect.direction}`);
  note("the chart gives the question's form", chart.content.given === item.expect.given, `chart ${chart.content.given}, question ${item.expect.given}`);
  note("the demonstration finishes", chart.end && (chart.content.mode === "build" ? chart.end.built : chart.end.pulled_all), JSON.stringify(chart.end));
  note("the learner has a task on the chart", Boolean(chart.cardTask && chart.practice), "no task on the chart with a start");
  if (chart.cardTask) {
    const ops = (chart.cardTask.allowed_operations ?? []).map((operation) => operation.kind).sort().join(",");
    const fact = chart.content.mode === "build" ? "built" : "pulled_all";
    check("the task on the chart is the card's own, by taps", ops === "card_submit,card_tap" && chart.cardTask.completion?.fact === fact,
      JSON.stringify([chart.cardTask.allowed_operations, chart.cardTask.completion]));
    if (chart.practice) {
      check("the practice number differs from the lesson's", chart.practice.target !== chart.start.target,
        `both ${placeValueNumeral(chart.start.target, language)}`);
      const fresh = chart.content.mode === "build"
        ? chart.practice.counts.every((count) => count === 0)
        : chart.practice.pulled.every((pulled) => pulled === 0) && chart.practice.columns.every((place, i) => chart.practice.counts[i] === Math.floor(chart.practice.target / 10 ** (place + 3)) % 10);
      check("the task starts empty (build) or whole (pull apart)", fresh, JSON.stringify({ counts: chart.practice.counts, pulled: chart.practice.pulled }));
      if (chart.content.mode === "build") {
        const leaked = [chart.cardTask.prompt, ...(chart.cardTask.hints ?? [])].find((text) => placeValueWordsWrite(String(text ?? ""), chart.practice.target));
        check("a build task's words do not write its number", !leaked, leaked);
      } else {
        // The row after pulling apart: anchored on the chart, one blank per non-zero place, each worth its place.
        const row = chart.tasks.find((task) => task.completion?.kind === "numeric_row" && task.anchor === chart.as);
        const blanks = (row?.completion.parts ?? []).filter((part) => part.blank).map((part) => placeValueParse(String(part.blank.answer)));
        const parts = placeValueParts(chart.practice.target).map((part) => part.value);
        check("a pull-apart task is followed by the row of its parts", row && JSON.stringify(blanks) === JSON.stringify(parts),
          JSON.stringify({ row: blanks, parts }));
      }
    }
    const words = [chart.cardTask.prompt, ...(chart.cardTask.hints ?? []), chart.cardTask.success_message ?? ""].join(" ");
    note("the task's words name no control", !/滑|拖|slid|drag|按钮|button/i.test(words), words);
  }
  note("a typed question follows", chart.tasks.some((task) => ["numeric_answer", "numeric_row"].includes(task.completion?.kind)), "no typed question in the lesson");
  return done();
}

// node scripts/place-value-judge.mjs <cases.json> <run-directory>: judges <run-directory>/<case id>.json lessons.
if (process.argv[1] && new URL(import.meta.url).pathname === (await import("node:path")).resolve(process.argv[1])) {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const [casesFile, runDirectory] = process.argv.slice(2);
  if (!casesFile || !runDirectory) {
    console.error("usage: node scripts/place-value-judge.mjs <cases.json> <run-directory>");
    process.exit(2);
  }
  const { cases } = JSON.parse(await readFile(casesFile, "utf8"));
  let passed = 0;
  for (const item of cases) {
    let found;
    for (const path of [join(runDirectory, `${item.id}.json`), join(runDirectory, item.id, "lesson.json")]) {
      try { found = await readFile(path, "utf8"); break; } catch (error) { if (error.code !== "ENOENT") { found = null; break; } }
    }
    if (found === undefined) { console.log(`${item.id}\tmissing`); continue; }
    let lesson;
    try { lesson = JSON.parse(found); } catch { console.log(`${item.id}\tunreadable`); continue; }
    let verdict;
    try { verdict = judgePlaceValueChart(item, lesson); } catch (error) { console.log(`${item.id}\tFAIL\tjudge error: ${String(error?.message ?? error).slice(0, 160)}`); continue; }
    if (verdict.pass) passed += 1;
    const failed = verdict.checks.filter((each) => !each.pass).map((each) => `${each.check}: ${each.detail}`).join("; ");
    const noted = verdict.notes.filter((each) => !each.pass).map((each) => `note: ${each.check}: ${each.detail}`).join("; ");
    console.log(`${item.id}\t${verdict.pass ? "pass" : "FAIL"}\t${[failed, noted].filter(Boolean).join("; ")}`);
  }
  console.log(`${passed}/${cases.length} pass`);
  process.exitCode = passed === cases.length ? 0 : 1;
}
