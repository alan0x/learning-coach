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
// The lesson is read as written (its authoring JSON), not through OLL, so the judge runs on the pinned OLL,
// which does not know the card yet. A pair the card takes can always be finished by taps (0026 §3: every
// reachable state of every pair the sketch tried can still finish), so reachability is read from the start
// pair, not searched. Columns are counted, not compared with the lesson's: OLL's own column rule (and its
// "lesson plays" check, through the normalizer and reducer) joins the judge with the recipe.
//
// Narration is not judged.

const KIND = "place_value_trade";
const CHART = "place_value_chart";
const MAX_COLUMNS = 6;
const MAX_PLACE = 5; // hundred thousands
const MAX_DECIMALS = 2;

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
const digitAt = (value, place) => Math.floor(value / 10 ** (place + 3)) % 10;
const decimalsOf = (value) => (value % 1000 === 0 ? 0 : value % 100 === 0 ? 1 : value % 10 === 0 ? 2 : 3);
/** The highest place with a digit: 3 for 3,486, -1 for 0.35, -2 for 0.05 (-3 for 0, which no column needs). */
const topPlaceOf = (value) => (value >= 1000 ? String(Math.floor(value / 1000)).length - 1 : value >= 100 ? -1 : value >= 10 ? -2 : -3);

/**
 * The columns a pair needs, highest first: from the lower decimal place up to the highest place of a, b or the
 * answer. A pair below 1 has no ones column (0.35 + 0.48: tenths and hundredths), as OLL #115 draws it.
 */
function columnsFor(operation, a, b) {
  const low = -Math.min(MAX_DECIMALS, Math.max(decimalsOf(a), decimalsOf(b)));
  const top = Math.max(topPlaceOf(a), topPlaceOf(b), topPlaceOf(Math.max(0, resultOf(operation, a, b))), low);
  const columns = [];
  for (let place = top; place >= low; place -= 1) columns.push(place);
  return columns;
}

/**
 * Why the card would refuse a pair (decision 0026 §5), or undefined when it takes it: not a whole number of
 * hundredths from 0 to 999,999.99, a difference below zero, more than six columns, or no column that carries
 * (adding) or borrows (subtracting).
 */
export function tradePairFault(operation, a, b) {
  if (!["add", "subtract"].includes(operation)) return "operation";
  if (![a, b].every((value) => Number.isSafeInteger(value) && value >= 0)) return "unreadable";
  if (a % 10 || b % 10) return "decimals";
  if (operation === "subtract" && b > a) return "negative";
  const columns = columnsFor(operation, a, b);
  if (columns[0] > MAX_PLACE || columns.length > MAX_COLUMNS) return "too_wide";
  const trades = operation === "add"
    ? columns.some((place) => digitAt(a, place) + digitAt(b, place) >= 10)
    : columns.some((place) => digitAt(a, place) < digitAt(b, place));
  return trades ? undefined : "no_trade";
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
  if (!writes.length) return { cards: 0, charts, tasks };
  const write = writes[0];
  const declared = Object.fromEntries((lesson.lesson?.variables ?? []).map((variable) => [variable.as, variable.initial]));
  const start = cardAt(write.content, declared);
  // How far the demonstration goes: the furthest value the lesson animates "columns finished" to.
  let shown = start.finished;
  if (start.finishedVariable !== undefined) {
    for (const action of actions) {
      if (action.do === "animate" && action.variable === start.finishedVariable && typeof action.value === "number") shown = Math.max(shown, action.value);
    }
  }
  return { cards: writes.length, charts, as: write.as, content: write.content, declared, start, shown, tasks };
}

/** Judges one case's lesson. Returns { pass, checks: [{ check, pass, detail? }], notes: [...] }. */
export function judgePlaceValueTrade(item, lesson) {
  const checks = [];
  const notes = [];
  const check = (name, pass, detail) => checks.push({ check: name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
  const note = (name, holds, detail) => notes.push({ check: name, pass: Boolean(holds), ...(holds ? {} : { detail }) });
  const done = () => ({ pass: checks.every((each) => each.pass), checks, notes });
  const card = placeValueTradeIn(lesson);
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
  note("one place-value trade card", card.cards === 1, `${card.cards} trade cards`);
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
    console.log(`${item.id}\t${verdict.pass ? "pass" : "FAIL"}\t${[failed, noted].filter(Boolean).join("; ")}`);
  }
  console.log(`${passed}/${cases.length} pass`);
  process.exitCode = passed === cases.length ? 0 : 1;
}
