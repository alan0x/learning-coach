// The make-ten judge (OLL decision 0027, need K2N-19; plan §5: judge before recipe).
//
// It judges what a lesson's make-ten card (two ten frames; the smaller addend's counters fill the bigger addend's
// frame, so 8 + 6 becomes 10 + 4) shows and asks. The model writes the meaning (the pair, a different practice
// pair, and how far the demonstration fills the bigger frame); the card computes every counter's move and never
// writes the split, the ones left or the total, so the learner's row of four blanks is the real check.
//
// - Expected values written into each case before any run: the question's two numbers, or `forbid` for a near miss.
// - Checks (objective; owner, 2026-11-24): a near miss that draws a make-ten card FAILS (0027 §10); a served case
//   that draws no make-ten card fails (named when it draws the trading mat or a number line instead); the card's
//   pair is the question's (in either order, 0027 §10), one the card takes (two numbers 1 to 9, sum over ten);
//   the card speaks the lesson's language; it opens fresh (the count in the bigger frame at the bigger addend,
//   nothing moved; 0027 "接进 OLL" 3); and every task on the card has a goal the learner can reach: a task on the
//   card is its `complete` fact by taps, on a practice pair the card takes that is not the lesson's pair (in
//   either order, 0027 §5), starting fresh; and the row that follows a task on the card asks exactly that pair's
//   chain, the part beside the bigger addend first (8 + 6 = 8 + [2] + [4] = 10 + [4] = [14]; the owner's order,
//   2026-11-27), or a typed answer that is its sum.
// - Notes (what the lesson chose to teach; the owner judges lessons): one card; whether the demonstration fills
//   the frame (a lesson may stop partway: no hard rule); the learner has a task on the card; a row follows,
//   anchored to the card; the task's words name no control.
//
// The card is read from the lesson as written, its bound fields at the variables' values. The rules are 0027's
// (the accepted sketch's), written here until Coach pins an OLL that has the card; then the lesson is also played
// through OLL ("the lesson plays") and the card's own rules replace these. Narration is not judged.

const KIND = "make_ten";
/** Cards a served case may draw instead, named in its failure. */
const INSTEAD = { base_ten_trade: "the trading mat", number_line: "a number line", number_line_steps: "a number line" };
const PLACES = 10;

/** Why the card refuses a pair, or undefined: two whole numbers 1 to 9 whose sum is more than ten (0027 §5). */
export function makeTenPairFault(a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return "unreadable";
  if (a < 1 || a > 9 || b < 1 || b > 9) return "not_one_digit";
  if (a + b < PLACES) return "under_ten";
  if (a + b === PLACES) return "exactly_ten";
  return undefined;
}

/**
 * The row's answers for a pair, in the row's order, the part beside the bigger addend making ten with it:
 * 8 + 6 -> [2, 4, 4, 14] (8 + 2 + 4 = 10 + 4 = 14); 3 + 8 -> [1, 2, 1, 11] (1 + 2 + 8 = 1 + 10 = 11).
 */
export function makeTenRowAnswers(a, b) {
  const big = Math.max(a, b), moved = PLACES - big, left = a + b - PLACES;
  return a >= b ? [moved, left, left, a + b] : [left, moved, left, a + b];
}

/** A written whole number ("14", "１４") or undefined. */
function whole(text) {
  const half = String(text ?? "").trim().replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
  return /^\d+$/.test(half) ? Number(half) : undefined;
}

/** The card's content with its bound fields at these variable values (every field is bound by its bare name). */
function cardAt(content, variables) {
  const bound = new Map((content?.bindings ?? []).map((binding) => [binding.target, String(binding.expression).trim()]));
  const at = (field) => {
    const alias = bound.get(field);
    return alias !== undefined && variables[alias] !== undefined ? variables[alias] : content?.[field];
  };
  return { language: content?.language ?? "en-US", a: at("a"), b: at("b"), filled: at("filled"), moved: at("moved"), filledVariable: bound.get("filled") };
}

const pairText = (state) => `${state.a} + ${state.b}`;
const samePair = (x, y) => (x.a === y.a && x.b === y.b) || (x.a === y.b && x.b === y.a);
/** Fresh: the count in the bigger frame at the bigger addend, nothing moved. */
const freshFault = (state) => (Number.isInteger(state.a) && Number.isInteger(state.b) && state.filled === Math.max(state.a, state.b) && state.moved === 0
  ? undefined : `filled ${state.filled} (fresh is ${Math.max(state.a, state.b)}), moved ${state.moved}`);

/** Everything the judge reads about one lesson's make-ten card. */
export function makeTenIn(lesson) {
  const actions = (lesson?.steps ?? []).flatMap((step) => step.beats ?? []).flatMap((beat) => beat.actions ?? []);
  const written = actions.filter((action) => action.do === "write");
  const writes = written.filter((action) => action.kind === KIND);
  const instead = [...new Set(written.map((action) => INSTEAD[action.kind]).filter(Boolean))];
  const tasks = lesson?.lesson?.tasks ?? [];
  if (!writes.length) return { cards: 0, instead, tasks };
  const write = writes[0];
  const declared = Object.fromEntries((lesson.lesson?.variables ?? []).map((variable) => [variable.as, variable.initial]));
  const start = cardAt(write.content, declared);
  // How far the demonstration fills the bigger frame: the furthest value the lesson animates its count to.
  let shown = start.filled;
  if (start.filledVariable !== undefined) {
    for (const action of actions) if (action.do === "animate" && action.variable === start.filledVariable && typeof action.value === "number") shown = Math.max(shown, action.value);
  }
  return { cards: writes.length, instead, as: write.as, content: write.content, declared, start, shown, tasks };
}

/** Judges one case's lesson. Returns { pass, checks: [{ check, pass, detail? }], notes: [...] }. */
export function judgeMakeTen(item, lesson) {
  const checks = [];
  const notes = [];
  const check = (name, pass, detail) => checks.push({ check: name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
  const note = (name, holds, detail) => notes.push({ check: name, pass: Boolean(holds), ...(holds ? {} : { detail }) });
  const done = () => ({ pass: checks.every((each) => each.pass), checks, notes });
  const card = makeTenIn(lesson);
  if (item.expect?.forbid) {
    if (item.expect.forbid.includes(KIND)) check("no make-ten card for this question", card.cards === 0, `${card.cards} make-ten card(s) drawn`);
    return done();
  }
  if (!card.cards) {
    check("a make-ten card is drawn", false, card.instead.length ? `no make-ten card; drawn instead: ${card.instead.join(", ")}` : "no make-ten card");
    return done();
  }
  note("one make-ten card", card.cards === 1, `${card.cards} make-ten cards`);

  const { start } = card;
  const want = { a: whole(item.expect.numbers?.[0]), b: whole(item.expect.numbers?.[1]) };
  check("the card's pair is the question's (either order)", samePair(start, want), `card ${pairText(start)}, question ${item.expect.numbers?.join(" + ")}`);
  const fault = makeTenPairFault(start.a, start.b);
  check("the card's pair is one the card takes", !fault, `${pairText(start)}: ${fault}`);
  const zh = /^zh(?:-|$)/i.test(String(lesson.lesson?.language ?? ""));
  check("the card speaks the lesson's language", start.language === (zh ? "zh-CN" : "en-US"), `card ${start.language}, lesson ${lesson.lesson?.language}`);
  if (!fault) check("the card opens fresh", !freshFault(start), `${pairText(start)}: ${freshFault(start)}`);
  note("the demonstration fills the bigger frame", card.shown >= PLACES, `filled reaches ${card.shown} of ${PLACES}`);

  // Every task on the card has a goal the learner can reach, and so does the row that follows it.
  let holds = { ...start };
  let cardTasks = 0;
  let afterCard = false;
  for (const task of card.tasks) {
    const completion = task.completion ?? {};
    const label = task.as ?? task.prompt ?? "a task";
    const follows = afterCard;
    afterCard = false;
    if (completion.kind === "card_fact" && completion.node === card.as) {
      cardTasks += 1;
      afterCard = true;
      const ops = (task.allowed_operations ?? []).map((operation) => `${operation.kind}${operation.node && operation.node !== card.as ? `@${operation.node}` : ""}`).sort().join(",");
      check(`${label}: the task on the card is its complete fact, by taps`, completion.fact === "complete" && ops === "card_tap", JSON.stringify([task.allowed_operations, completion]));
      const values = task.start?.values;
      if (!values) {
        check(`${label}: the task on the card starts on its own pair`, false, "no start");
        holds = undefined;
        continue;
      }
      const practice = cardAt(card.content, { ...card.declared, ...values });
      const practiceFault = makeTenPairFault(practice.a, practice.b);
      check(`${label}: the practice pair is one the card takes`, !practiceFault, `${pairText(practice)}: ${practiceFault}`);
      check(`${label}: the practice pair is not the lesson's (either order)`, !samePair(practice, start), `both ${pairText(practice)}`);
      if (!practiceFault) check(`${label}: the practice starts fresh`, !freshFault(practice), `${pairText(practice)}: ${freshFault(practice)}`);
      holds = practiceFault ? undefined : practice;
      const words = [task.prompt, ...(task.hints ?? []), task.success_message ?? ""].join(" ");
      note(`${label}: the task's words name no control`, !/滑|拖|slid|drag|按钮|button/i.test(words), words);
    } else if (follows && completion.kind === "numeric_row") {
      // The row after a task on the card asks that pair's chain, in the owner's order (0027).
      const expected = holds ? makeTenRowAnswers(holds.a, holds.b) : undefined;
      const answers = (completion.parts ?? []).filter((part) => part?.blank).map((part) => whole(part.blank.answer));
      check(`${label}: the row after the card's task asks its pair's chain`, expected !== undefined && JSON.stringify(answers) === JSON.stringify(expected),
        `row answers ${JSON.stringify(answers)}, ${holds ? `${pairText(holds)} gives ${JSON.stringify(expected)}` : "no pair the card takes"}`);
      note(`${label}: the row is anchored to the card`, task.anchor === card.as, `anchor ${task.anchor}`);
    } else if (follows && completion.kind === "numeric_answer") {
      const expected = holds ? holds.a + holds.b : undefined;
      check(`${label}: the typed answer after the card's task is its pair's sum`, expected !== undefined && whole(completion.answer) === expected,
        `answer ${completion.answer}, ${holds ? `${pairText(holds)} = ${expected}` : "no pair the card takes"}`);
      note(`${label}: the typed answer is anchored to the card`, task.anchor === card.as, `anchor ${task.anchor}`);
    }
  }
  note("the learner has a task on the card", cardTasks > 0, "no task on the card");
  note("a row of blanks follows", card.tasks.some((task) => task.completion?.kind === "numeric_row"), "no row of blanks in the lesson");
  return done();
}

// node scripts/make-ten-judge.mjs <cases.json> <run-directory>: judges <run-directory>/<case id>.json lessons.
if (process.argv[1] && new URL(import.meta.url).pathname === (await import("node:path")).resolve(process.argv[1])) {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const [casesFile, runDirectory] = process.argv.slice(2);
  if (!casesFile || !runDirectory) {
    console.error("usage: node scripts/make-ten-judge.mjs <cases.json> <run-directory>");
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
    try { verdict = judgeMakeTen(item, lesson); } catch (error) { console.log(`${item.id}\tFAIL\tjudge error: ${String(error?.message ?? error).slice(0, 160)}`); continue; }
    if (verdict.pass) passed += 1;
    const failed = verdict.checks.filter((each) => !each.pass).map((each) => `${each.check}: ${each.detail}`).join("; ");
    const noted = verdict.notes.filter((each) => !each.pass).map((each) => `note: ${each.check}: ${each.detail}`).join("; ");
    console.log(`${item.id}\t${verdict.pass ? "pass" : "FAIL"}\t${[failed, noted].filter(Boolean).join("; ")}`);
  }
  console.log(`${passed}/${cases.length} pass`);
  process.exitCode = passed === cases.length ? 0 : 1;
}
