// The place-value trade judge (OLL decision 0026, need 35P-07; plan §5: judge before recipe).
//
// It judges what a lesson's place-value trade card (adding and subtracting on the chart, drawn as the written
// column method) shows and asks. The model writes the meaning (the two numbers, the operation, a different
// practice pair, and how many columns the demonstration finishes); the card computes every disk, trade and
// break, and never writes the answer's digits, so the learner's typed answer is the real check.
//
// - Expected values written into each case before any run: the question's two numbers (in order), the
//   operation and the result, or `forbid` for a near miss.
// - Checks (objective; owner, 2026-11-24): a near miss that draws a trade card FAILS (0026 §8); a served case
//   that draws the place-value chart (0025) instead of the trade card fails, as does one with no card; the card
//   draws the question's operation and two numbers, and they give the question's result; the card speaks the
//   lesson's language; and every task on the card has a goal the learner can reach: a task on the card is its
//   `complete` fact by taps, on a practice pair the card takes (a carry or borrow, no negative difference, at
//   most two decimals and six columns) that is not the lesson's pair, starting fresh (nothing demonstrated, no
//   column worked), on the card's own columns (OLL draws every pair on the content's top_place and low_place);
//   the lesson's pair fits those columns too; and the typed answer that follows a task on the card is exactly
//   the result of that task's pair, read off the finished chart (0026 §4; noted when it is not anchored to the card).
// - Notes (what the lesson chose to teach; the owner judges lessons): one card; how many columns the
//   demonstration finishes (a lesson may stop partway, owner 2026-11-25: no hard rule, 0026 §8); the learner
//   has a task on the card; a typed answer follows; the task's words name no control; a chart drawn beside
//   the trade card.
//
// The lesson plays through OLL itself (normalized and reduced, as the player plays it), and a pair is judged by
// the card's own rules (OLL's fault and column rule). The card is read from the lesson as written, its bound
// fields at the variables' values. A pair the card takes can always be finished by taps (0026 §3: every
// reachable state of every pair the sketch tried can still finish), so reachability is read from the start
// pair, not searched.
//
// Second cards (Coach #199): the first card holds the question and the practice; each later trade card is a
// demonstration on its own example. Checks: one second card at most; its example is neither the question's pair nor a
// practice pair (adding: either order), and stays its example at every state (a revision, a replay, a task's start);
// it speaks the lesson's language at every state; it opens fresh; its demonstration plays forward and finishes every
// column by a move forward (an animation or a revision, not a replay); no task is anchored on it. The verdict lists
// the second cards and their examples (`second_cards`).
//
// Narration is not judged.

import { normalizeAuthoringLesson, reduceCanonicalEvents } from "octos-lesson-language";
import { placeValueTradeColumns, placeValueTradeColumnsFor, placeValueTradeFault } from "octos-lesson-language/plugin-math";
import { cardsIn, judgeSecondCards, secondCardsText } from "./judge-cards.mjs";

const KIND = "place_value_trade";
const CHART = "place_value_chart";

const FULL_WIDTH = /[０-９．，]/g;
const halfWidth = (text) => text.replace(FULL_WIDTH, (ch) => (ch === "．" ? "." : ch === "，" ? "," : String.fromCharCode(ch.charCodeAt(0) - 0xfee0)));

/**
 * A written number ("3,486", "2.75", "4.230", "５") as an exact count of thousandths, or undefined when it is not
 * a plain non-negative decimal or has a non-zero digit past the thousandths. No floats are involved.
 */
export function tradeThousandths(text) {
  const written = halfWidth(String(text ?? "")).trim().replace(/[,\s  ]/g, "");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(written);
  if (!match) return undefined;
  const fraction = match[2] ?? "";
  if (/[1-9]/.test(fraction.slice(3))) return undefined;
  const value = Number(match[1]) * 1000 + Number(fraction.slice(0, 3).padEnd(3, "0"));
  return Number.isSafeInteger(value) ? value : undefined;
}

/** A count of thousandths written as a learner writes it: 6225000 -> "6225", 4230 -> "4.23". */
export function tradeNumeral(value) {
  const whole = Math.floor(value / 1000);
  const fraction = String(value % 1000).padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

const resultOf = (operation, a, b) => (operation === "subtract" ? a - b : a + b);

/** The columns a pair needs, highest first, by the card's own rule (a pair below 1 has no ones column). */
function columnsFor(operation, a, b) {
  const { top_place, low_place } = placeValueTradeColumnsFor(operation, a, b);
  return placeValueTradeColumns(top_place, low_place);
}

/**
 * Why the card would refuse a pair (decision 0026 §5), by its own rules, or undefined when it takes it: not a whole
 * number of thousandths from 0 to 999,999.99 (`unreadable`), more than two decimals, a difference below zero,
 * more than six columns, or no column that carries (adding) or borrows (subtracting).
 */
export function tradePairFault(operation, a, b) {
  if (!["add", "subtract"].includes(operation)) return "operation";
  return placeValueTradeFault(operation, a, b);
}

/**
 * The card's content with its bound fields at these variable values: the two numbers and "columns finished"
 * (bound by their bare names) and each column's status (`<place>.status`). The one place the card's fields are
 * read, so a field OLL renames is changed here.
 */
function cardAt(content, variables) {
  const bound = new Map((content?.bindings ?? []).map((binding) => [binding.target, String(binding.expression).trim()]));
  const at = (target, fallback) => {
    const alias = bound.get(target);
    return alias !== undefined && variables[alias] !== undefined ? variables[alias] : fallback;
  };
  return {
    language: content?.language ?? "en-US",
    operation: content?.operation,
    // The card's columns are fixed by its content: every pair it holds is drawn on them (OLL 0026).
    top_place: content?.top_place,
    low_place: content?.low_place,
    a: at("a", content?.a),
    b: at("b", content?.b),
    finished: at("finished", content?.finished ?? 0),
    statuses: (content?.places ?? []).map((place) => at(`${place.as}.status`, place.status ?? 0)),
    finishedVariable: bound.get("finished"),
  };
}

/**
 * Why a pair cannot be worked on the card's own columns, or undefined: OLL draws every pair on the content's
 * `top_place`/`low_place` and refuses a practice of another shape, so a pair needing other columns (a sum that
 * gains a place, a pair below 1 on a whole-number card) has no finished chart to reach.
 */
function columnsFault(state) {
  if (!Number.isSafeInteger(state.a) || !Number.isSafeInteger(state.b) || !["add", "subtract"].includes(state.operation)) return "unreadable";
  const columns = columnsFor(state.operation, state.a, state.b);
  if (columns[0] === state.top_place && columns.at(-1) === state.low_place) return undefined;
  return `the pair needs places ${columns[0]} to ${columns.at(-1)}, the card draws ${state.top_place} to ${state.low_place}`;
}

/** Everything the judge reads about one lesson's trade card. */
export function placeValueTradeIn(lesson) {
  const beats = (lesson?.steps ?? []).flatMap((step) => step.beats ?? []);
  const actions = beats.flatMap((beat) => beat.actions ?? []);
  const writes = actions.filter((action) => action.do === "write" && action.kind === KIND);
  const charts = actions.filter((action) => action.do === "write" && action.kind === CHART).length;
  const tasks = lesson?.lesson?.tasks ?? [];
  // The lesson plays as the player plays it. A lesson OLL refuses is still read, so each fault is named too.
  let error;
  try {
    reduceCanonicalEvents(normalizeAuthoringLesson(lesson, { lessonId: "judge", boardId: "judge", baseRevision: 0, regionIntent: "new_topic" }));
  } catch (caught) {
    error = `${caught.code ?? "error"}: ${String(caught.message).slice(0, 160)}`;
  }
  if (!writes.length) return { cards: 0, charts, tasks, ...(error ? { error } : {}) };
  // The card played first (a beat plays its actions phase by phase) is the question card.
  const write = cardsIn(lesson, KIND).cards[0]?.write ?? writes[0];
  const declared = Object.fromEntries((lesson.lesson?.variables ?? []).map((variable) => [variable.as, variable.initial]));
  const start = cardAt(write.content, declared);
  // How far the demonstration goes: the furthest value the lesson animates "columns finished" to.
  let shown = start.finished;
  if (start.finishedVariable !== undefined) {
    for (const action of actions) {
      if (action.do === "animate" && action.variable === start.finishedVariable && typeof action.value === "number") shown = Math.max(shown, action.value);
    }
  }
  return { cards: writes.length, charts, as: write.as, content: write.content, declared, start, shown, tasks, ...(error ? { error } : {}) };
}

/** Judges one case's lesson. Returns { pass, checks: [{ check, pass, detail? }], notes: [...] }. */
export function judgePlaceValueTrade(item, lesson) {
  const checks = [];
  const notes = [];
  const check = (name, pass, detail) => checks.push({ check: name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
  const note = (name, holds, detail) => notes.push({ check: name, pass: Boolean(holds), ...(holds ? {} : { detail }) });
  let seconds = [];
  const done = () => ({ pass: checks.every((each) => each.pass), checks, notes, second_cards: seconds });
  const card = placeValueTradeIn(lesson);
  check("the lesson plays", !card.error, card.error);
  if (item.expect?.forbid) {
    // Decision 0026 §8: a near miss that draws this card fails (the mat's judge only noted it).
    if (item.expect.forbid.includes(KIND)) check("no place-value trade card for this question", card.cards === 0, `${card.cards} trade card(s) drawn`);
    return done();
  }
  if (!card.cards) {
    // Decision 0026 §8: the chart (0025) is not for adding and subtracting; drawing it instead fails.
    if (card.charts) check("adding and subtracting is not drawn on the place-value chart", false, `${card.charts} place-value chart(s) and no trade card`);
    else check("a place-value trade card is drawn", false, "no trade card");
    return done();
  }
  // A second card is judged by its own checks (at most one, below).
  note("one place-value trade card", card.cards <= 2, `${card.cards} trade cards`);
  note("no place-value chart beside the trade card", card.charts === 0, `${card.charts} place-value chart(s) as well`);

  const { start } = card;
  const want = { operation: item.expect.operation, a: tradeThousandths(item.expect.numbers?.[0]), b: tradeThousandths(item.expect.numbers?.[1]), result: tradeThousandths(item.expect.result) };
  const shownPair = (state) => `${typeof state.a === "number" ? tradeNumeral(state.a) : state.a} ${state.operation === "subtract" ? "−" : "+"} ${typeof state.b === "number" ? tradeNumeral(state.b) : state.b}`;
  check("the card's operation is the question's", start.operation === want.operation, `card ${start.operation}, question ${want.operation}`);
  check("the card's two numbers are the question's, in order", start.a === want.a && start.b === want.b,
    `card ${shownPair(start)}, question ${item.expect.numbers?.join(want.operation === "subtract" ? " − " : " + ")}`);
  const result = Number.isSafeInteger(start.a) && Number.isSafeInteger(start.b) ? resultOf(start.operation, start.a, start.b) : undefined;
  check("the card's pair gives the question's result", result !== undefined && result === want.result,
    `card ${shownPair(start)} = ${result === undefined ? "?" : tradeNumeral(result)}, question ${item.expect.result}`);
  const zh = /^zh(?:-|$)/i.test(String(lesson.lesson?.language ?? ""));
  const language = zh ? "zh-CN" : "en-US";
  check("the card speaks the lesson's language", start.language === language, `card ${start.language}, lesson ${lesson.lesson?.language}`);
  const lessonColumns = columnsFault(start);
  check("the card's columns are its pair's", !lessonColumns, `${shownPair(start)}: ${lessonColumns}`);

  const columns = Number.isInteger(start.top_place) && Number.isInteger(start.low_place) ? start.top_place - start.low_place + 1 : undefined;
  note("the demonstration finishes every column", columns !== undefined && card.shown >= columns, `columns finished ${card.shown} of ${columns}`);

  // Every task on the card has a goal the learner can reach, and so does the typed answer that follows it.
  let holds = { ...start }; // the card, with the pair it holds when the next task opens
  let cardTasks = 0;
  let afterCard = false; // the task before this one was a task on the card
  for (const task of card.tasks) {
    const completion = task.completion ?? {};
    const label = task.as ?? task.prompt ?? "a task";
    const follows = afterCard;
    afterCard = false;
    if (completion.kind === "card_fact" && completion.node === card.as) {
      cardTasks += 1;
      afterCard = true;
      const ops = (task.allowed_operations ?? []).map((operation) => `${operation.kind}${operation.node && operation.node !== card.as ? `@${operation.node}` : ""}`).sort().join(",");
      check(`${label}: the task on the card is its complete fact, by taps`, completion.fact === "complete" && ops === "card_tap",
        JSON.stringify([task.allowed_operations, completion]));
      const values = task.start?.values;
      if (!values) {
        check(`${label}: the task on the card starts on its own pair`, false, "no start");
        continue;
      }
      const practice = cardAt(card.content, { ...card.declared, ...values });
      const fault = tradePairFault(practice.operation, practice.a, practice.b);
      check(`${label}: the practice pair is one the card takes`, !fault, `${shownPair(practice)}: ${fault}`);
      // The practice is drawn on the card's own columns: a pair of another shape can never be completed there.
      if (!fault) {
        const shape = columnsFault(practice);
        check(`${label}: the practice pair fits the card's columns`, !shape, `${shownPair(practice)}: ${shape}`);
      }
      check(`${label}: the practice pair is not the lesson's`, practice.a !== start.a || practice.b !== start.b, `both ${shownPair(practice)}`);
      check(`${label}: the practice starts fresh`, practice.finished === 0 && practice.statuses.every((status) => status === 0),
        JSON.stringify({ finished: practice.finished, statuses: practice.statuses }));
      holds = practice;
      const words = [task.prompt, ...(task.hints ?? []), task.success_message ?? ""].join(" ");
      note(`${label}: the task's words name no control`, !/滑|拖|slid|drag|按钮|button/i.test(words), words);
    } else if (completion.kind === "numeric_answer" && (task.anchor === card.as || follows)) {
      // A pair the card refuses, or one off its columns, has no finished chart to read the answer from.
      const reachable = !tradePairFault(holds.operation, holds.a, holds.b) && !columnsFault(holds);
      const expected = reachable ? resultOf(holds.operation, holds.a, holds.b) : undefined;
      const answer = tradeThousandths(completion.answer);
      const detail = `answer ${completion.answer}, card ${shownPair(holds)} = ${expected === undefined ? "?" : tradeNumeral(expected)}`;
      if (follows) {
        // The answer typed after a task on the card is read off that finished chart (0026 §4): exactly the pair's
        // result, which the card holds exactly, so no tolerance applies.
        check(`${label}: the typed answer after the card's task is the result of its pair`, expected !== undefined && answer === expected, detail);
        note(`${label}: the typed answer after the card's task is anchored to the card`, task.anchor === card.as, `anchor ${task.anchor}`);
      } else {
        // Another typed question placed by the card may ask anything its own words say: noted, not judged.
        const tolerance = Math.round((Number(completion.tolerance) || 0) * 1000);
        note(`${label}: a typed question by the card asks the result of the pair on it`,
          expected !== undefined && answer !== undefined && Math.abs(answer - expected) <= tolerance, detail);
      }
    }
  }
  note("the learner has a task on the card", cardTasks > 0, "no task on the card");
  note("a typed answer follows", card.tasks.some((task) => ["numeric_answer", "numeric_row"].includes(task.completion?.kind)), "no typed question in the lesson");

  // Second cards: each a demonstration on its own example (Coach #199).
  const practices = card.tasks.filter((task) => task.completion?.kind === "card_fact" && task.completion.node === card.as && task.start?.values)
    .map((task) => cardAt(card.content, { ...card.declared, ...task.start.values }));
  const samePair = (x, y) => (x.a === y.a && x.b === y.b) || (x.operation !== "subtract" && x.a === y.b && x.b === y.a);
  seconds = judgeSecondCards({
    cards: cardsIn(lesson, KIND).cards, tasks: card.tasks, question: { ...want, operation: start.operation }, practices, read: cardAt, check, language: zh ? "zh-CN" : "en-US",
    kind: {
      example: shownPair, same: samePair,
      fresh: (state) => (state.finished === 0 && state.statuses.every((status) => status === 0) ? undefined : JSON.stringify({ finished: state.finished, statuses: state.statuses })),
      position: (state) => state.finished,
      end: (state) => (Number.isInteger(state.top_place) && Number.isInteger(state.low_place) ? state.top_place - state.low_place + 1 : undefined),
    },
  });
  return done();
}

// node scripts/place-value-trade-judge.mjs <cases.json> <run-directory>: judges <run-directory>/<case id>.json lessons.
if (process.argv[1] && new URL(import.meta.url).pathname === (await import("node:path")).resolve(process.argv[1])) {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const [casesFile, runDirectory] = process.argv.slice(2);
  if (!casesFile || !runDirectory) {
    console.error("usage: node scripts/place-value-trade-judge.mjs <cases.json> <run-directory>");
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
    try { verdict = judgePlaceValueTrade(item, lesson); } catch (error) { console.log(`${item.id}\tFAIL\tjudge error: ${String(error?.message ?? error).slice(0, 160)}`); continue; }
    if (verdict.pass) passed += 1;
    const failed = verdict.checks.filter((each) => !each.pass).map((each) => `${each.check}: ${each.detail}`).join("; ");
    const noted = verdict.notes.filter((each) => !each.pass).map((each) => `note: ${each.check}: ${each.detail}`).join("; ");
    console.log(`${item.id}\t${verdict.pass ? "pass" : "FAIL"}\t${[failed, noted, secondCardsText(verdict.second_cards)].filter(Boolean).join("; ")}`);
  }
  console.log(`${passed}/${cases.length} pass`);
  process.exitCode = passed === cases.length ? 0 : 1;
}
