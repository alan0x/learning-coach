// The place-value times-ten judge (OLL decision 0028, need 35P-04; plan §5: judge before recipe).
//
// It judges what a lesson's times-ten card (the same amount counted in another unit: a count, "3 tenths = ?
// thousandths", or a times pair, "700 is ? times 70") shows and asks. The model writes the meaning (the amount, the
// target, for a put-together question the unit it names, and how far "counted in" goes); the card computes every
// row's move and never writes the count, so the answer row after a task on the card is the real check.
//
// - Expected values written into each case before any run: the question's amount, start, target and answers, or
//   `forbid` for a near miss.
// - Checks (objective; owner, 2026-11-24): a near miss that draws a times-ten card FAILS (0028 §9); a served case that
//   draws none fails (named when it draws the chart, the trade card, the mat or a number line instead); the card's
//   amount and target are the question's (a question may name a times pair in either order; the card writes it larger
//   first, as OLL takes it), and its shape is (count or times; a count's start unit); the problem is one the card takes;
//   the card speaks the lesson's language; it opens fresh ("counted in" at its start unit, never 0; no row moved); the
//   demonstration moves "counted in" only along its path, forward; every task on the card has a goal the learner can
//   reach: its `complete` fact by taps, on a practice of the card's shape (the same question, direction and places
//   apart; a times pair larger first) that is not the lesson's own (compared as problems, so not the lesson's pair the
//   other way round), its start setting every field the card binds, starting fresh at its own start unit; and the typed
//   task right after a task on the card asks that practice's own answers (a row of blanks exactly: a count's count; a
//   times pair's renamed count, then 10), or one typed answer that is one of them.
// - Notes (what the lesson chose to teach; the owner judges lessons): one card; whether the demonstration reaches
//   the target (a lesson may stop partway: no hard rule); the learner has a task on the card; a row follows,
//   anchored to the card; the task's words name no control.
//
// The card is read from the lesson as written, its bound fields at the variables' values. The rules are 0028's
// (the accepted sketch's), written here until Coach pins an OLL that has the card; then the lesson is also played
// through OLL ("the lesson plays") and the card's own rules replace these. Narration is not judged.

const KIND = "place_value_times_ten";
/** Cards a served case may draw instead, named in its failure. */
const INSTEAD = { place_value_chart: "the place-value chart", place_value_trade: "the trade card", base_ten_trade: "the trading mat", number_line: "a number line" };
const MIN_PLACE = -3, MAX_PLACE = 6, MAX_LINEAGES = 9;
const unit = (place) => 10 ** (place + 3);

/** "0.3", "4,000" -> integer thousandths; undefined when unreadable or finer than thousandths. */
export function thousandths(text) {
  const written = String(text ?? "").trim().replace(/,/g, "").replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/[．。]/g, ".");
  const match = /^(\d{1,8})(?:\.(\d+))?$/.exec(written);
  if (!match) return undefined;
  const frac = (match[2] ?? "").replace(/0+$/u, "");
  if (frac.length > 3) return undefined;
  return Number(match[1]) * 1000 + Number(frac.padEnd(3, "0") || "0");
}
/** A value with exactly one nonzero digit -> { digit, place }. */
function oneDigit(value) {
  if (!Number.isSafeInteger(value) || value <= 0) return undefined;
  for (let place = MAX_PLACE + 3; place >= MIN_PLACE; place -= 1) {
    if (value % unit(place) === 0) { const digit = value / unit(place); return digit <= 9 ? { digit, place } : undefined; }
  }
  return undefined;
}
const placeOfUnit = (value) => { const d = oneDigit(value); return d && d.digit === 1 ? d.place : undefined; };

/**
 * The card's problem from its numbers (thousandths): amount, target and the start unit (or the amount's own place).
 * The sketch's rules (0028 §5): { question, amount, target, s, t, dir, g, n, start, answers } or { fault }.
 */
export function timesTenProblem(amount, target, start) {
  let A = amount, T = target, S = start;
  if (![A, T].every((value) => Number.isSafeInteger(value) && value >= 0) || (S !== undefined && !Number.isSafeInteger(S))) return { fault: "unreadable" };
  if (T === 10 * A) {
    [A, T] = [T, A];
    const small = oneDigit(T), large = oneDigit(A);
    if (S !== undefined && small && large && S === unit(small.place)) S = unit(large.place);
  }
  const a = oneDigit(A);
  if (!a) return { fault: "not_one_digit" };
  if (a.place > MAX_PLACE) return { fault: "out_of_range" };
  const t = oneDigit(T);
  if (!t || t.place > MAX_PLACE) return { fault: t ? "out_of_range" : "not_a_pair" };
  if (t.digit !== 1) {
    if (t.digit !== a.digit) return { fault: "not_a_pair" };
    if (t.place !== a.place - 1) return { fault: a.place - t.place > 1 ? "too_far" : "not_a_pair" };
    if (S !== undefined && S !== unit(a.place)) return { fault: "times_start" };
    return { question: "times", amount: A, target: T, s: a.place, t: t.place, dir: -1, g: 1, n: a.digit, start: unit(a.place), answers: [A / unit(t.place), 10] };
  }
  const s = S === undefined ? a.place : placeOfUnit(S);
  if (s === undefined || s > MAX_PLACE || s < MIN_PLACE) return { fault: "start_not_unit" };
  if (A % unit(s) !== 0) return { fault: "not_whole" };
  if (s === t.place) return { fault: "same_unit" };
  const g = Math.abs(s - t.place);
  if (g > 2) return { fault: "too_far" };
  const dir = t.place < s ? -1 : 1;
  if (A % T !== 0) return { fault: "not_whole" };
  const n = dir < 0 ? A / unit(s) : A / T;
  if (n > MAX_LINEAGES) return { fault: "too_many" };
  return { question: "count", amount: A, target: T, s, t: t.place, dir, g, n, start: unit(s), answers: [A / T] };
}

/** The card's shape from its content: question, toward, apart. */
const shapeOf = (content) => ({
  question: content?.question === "times" ? "times" : "count",
  toward: content?.question === "times" ? "right" : content?.toward === "left" ? "left" : "right",
  apart: content?.question === "times" ? 1 : content?.apart === 2 ? 2 : 1,
});
/** The problem a shape and its numbers make (the start unit is the shape's, as OLL's placeValueTimesTenStartUnit). */
export function timesTenProblemOfShape(shape, amount, target) {
  let start;
  if (shape.question === "count") {
    const t = placeOfUnit(target);
    if (t === undefined) return { fault: "start_not_unit" };
    const s = shape.toward === "right" ? t + shape.apart : t - shape.apart;
    if (s < MIN_PLACE || s > MAX_PLACE) return { fault: "out_of_range" };
    start = unit(s);
  }
  const problem = timesTenProblem(amount, target, start);
  if (problem.fault) return problem;
  if (problem.question !== shape.question || (problem.dir < 0 ? "right" : "left") !== shape.toward || problem.g !== shape.apart) return { fault: "not_same_shape" };
  return problem;
}

/** A written whole number ("300", "３００", "1,000") or undefined. */
function whole(text) {
  const value = thousandths(text);
  return value !== undefined && value % 1000 === 0 ? value / 1000 : undefined;
}

/** The card's content with its bound fields at these variable values (every field is bound by its bare name). */
function cardAt(content, variables) {
  const bound = new Map((content?.bindings ?? []).map((binding) => [binding.target, String(binding.expression).trim()]));
  const at = (field) => {
    const alias = bound.get(field);
    return alias !== undefined && variables[alias] !== undefined ? variables[alias] : content?.[field];
  };
  return {
    language: content?.language ?? "en-US", amount: at("amount"), target: at("target"), counted_in: at("counted_in"),
    moved_once: at("moved_once"), moved_twice: at("moved_twice") ?? 0, countedVariable: bound.get("counted_in"),
  };
}

const numeral = (value) => (Number.isFinite(value) ? String(value / 1000) : String(value));
const problemText = (state) => `${numeral(state.amount)} in ${numeral(state.target)}`;
/** Fresh: "counted in" at the problem's start unit (never 0), no row moved. */
const freshFault = (state, problem) => (state.counted_in === problem.start && !state.moved_once && !state.moved_twice
  ? undefined : `counted_in ${state.counted_in} (fresh is ${problem.start}), moved_once ${state.moved_once}, moved_twice ${state.moved_twice}`);

/** The values "counted in" takes, from the start unit to the target (a times pair: the larger unit, then the smaller number). */
const pathOf = (problem) => (problem.question === "times" ? [problem.start, problem.target]
  : Array.from({ length: problem.g + 1 }, (_, k) => unit(problem.s + k * (problem.t < problem.s ? -1 : 1))));

/** Everything the judge reads about one lesson's times-ten card. */
export function timesTenIn(lesson) {
  const actions = (lesson?.steps ?? []).flatMap((step) => step.beats ?? []).flatMap((beat) => beat.actions ?? []);
  const written = actions.filter((action) => action.do === "write");
  const writes = written.filter((action) => action.kind === KIND);
  const instead = [...new Set(written.map((action) => INSTEAD[action.kind]).filter(Boolean))];
  const tasks = lesson?.lesson?.tasks ?? [];
  if (!writes.length) return { cards: 0, instead, tasks };
  const write = writes[0];
  const declared = Object.fromEntries((lesson.lesson?.variables ?? []).map((variable) => [variable.as, variable.initial]));
  const start = cardAt(write.content, declared);
  // How far the demonstration goes: the values the lesson animates "counted in" to.
  const shown = [];
  if (start.countedVariable !== undefined) {
    for (const action of actions) if (action.do === "animate" && action.variable === start.countedVariable && typeof action.value === "number") shown.push(action.value);
  }
  return { cards: writes.length, instead, as: write.as, content: write.content, shape: shapeOf(write.content), declared, start, shown, tasks };
}

/** Judges one case's lesson. Returns { pass, checks: [{ check, pass, detail? }], notes: [...] }. */
export function judgePlaceValueTimesTen(item, lesson) {
  const checks = [];
  const notes = [];
  const check = (name, pass, detail) => checks.push({ check: name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
  const note = (name, holds, detail) => notes.push({ check: name, pass: Boolean(holds), ...(holds ? {} : { detail }) });
  const done = () => ({ pass: checks.every((each) => each.pass), checks, notes });
  const card = timesTenIn(lesson);
  if (item.expect?.forbid) {
    if (item.expect.forbid.includes(KIND)) check("no times-ten card for this question", card.cards === 0, `${card.cards} times-ten card(s) drawn`);
    return done();
  }
  if (!card.cards) {
    check("a times-ten card is drawn", false, card.instead.length ? `no times-ten card; drawn instead: ${card.instead.join(", ")}` : "no times-ten card");
    return done();
  }
  note("one times-ten card", card.cards === 1, `${card.cards} times-ten cards`);

  const { start, shape } = card;
  const expect = item.expect;
  const want = { amount: thousandths(expect.amount), target: thousandths(expect.target) };
  const sameNumbers = (x, y) => (x.amount === y.amount && x.target === y.target) || (expect.ask === "times" && x.amount === y.target && x.target === y.amount);
  check("the card's amount and target are the question's", sameNumbers(start, want), `card ${problemText(start)}, question ${expect.amount} in ${expect.target}`);
  check("the card's question is the question's (count or times)", shape.question === expect.ask, `card ${shape.question}, question ${expect.ask}`);
  const problem = timesTenProblemOfShape(shape, start.amount, start.target);
  check("the card's problem is one the card takes, of its shape", !problem.fault, `${problemText(start)}: ${problem.fault}`);
  // OLL refuses a times card written smaller first (decision 0028: the larger number is the amount).
  if (!problem.fault && problem.question === "times") check("the times pair is written larger first", start.amount === problem.amount, `card ${problemText(start)}`);
  if (!problem.fault && expect.ask === "count" && expect.start !== undefined) {
    check("the card counts from the question's unit", problem.start === thousandths(expect.start), `card starts at ${numeral(problem.start)}, question at ${expect.start}`);
  }
  const zh = /^zh(?:-|$)/i.test(String(lesson.lesson?.language ?? ""));
  check("the card speaks the lesson's language", start.language === (zh ? "zh-CN" : "en-US"), `card ${start.language}, lesson ${lesson.lesson?.language}`);
  if (!problem.fault) {
    check("the card opens fresh, at its start unit", !freshFault(start, problem), `${problemText(start)}: ${freshFault(start, problem)}`);
    // The demonstration moves counted in along its path, forward (OLL refuses any other value or a step back).
    const path = pathOf(problem);
    const off = card.shown.find((value, k) => !path.includes(value) || (k > 0 && path.indexOf(value) < path.indexOf(card.shown[k - 1])));
    check("the demonstration moves counted in along its path, forward", off === undefined, `counted_in goes to ${JSON.stringify(card.shown)}; the path is ${JSON.stringify(path)}`);
    note("the demonstration reaches the target", card.shown.includes(problem.target), `counted_in goes to ${JSON.stringify(card.shown)}; the target is ${problem.target}`);
  }

  // Every task on the card has a goal the learner can reach, and so does the typed task that follows it.
  let holds = problem.fault ? undefined : problem;
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
        check(`${label}: the task on the card starts on its own problem`, false, "no start");
        holds = undefined;
        continue;
      }
      // A practice start sets every field the card binds (OLL: the practice pile is whole).
      const unset = (card.content?.bindings ?? []).map((binding) => String(binding.expression).trim()).filter((alias) => !Object.hasOwn(values, alias));
      check(`${label}: the practice start sets every field the card binds`, unset.length === 0, `not set: ${unset.join(", ")}`);
      const practice = cardAt(card.content, { ...card.declared, ...values });
      const own = timesTenProblemOfShape(shape, practice.amount, practice.target);
      check(`${label}: the practice is a problem of the card's shape`, !own.fault, `${problemText(practice)}: ${own.fault}`);
      // Compared as problems: a times pair written the other way round is the lesson's own (OLL's same_as_example).
      const same = !own.fault && !problem.fault ? own.amount === problem.amount && own.target === problem.target : practice.amount === start.amount && practice.target === start.target;
      check(`${label}: the practice is not the lesson's own problem`, !same, `both ${problemText(practice)}`);
      if (!own.fault && own.question === "times") check(`${label}: the practice's times pair is written larger first`, practice.amount === own.amount, `practice ${problemText(practice)}`);
      if (!own.fault) check(`${label}: the practice starts fresh, at its own start unit`, !freshFault(practice, own), `${problemText(practice)}: ${freshFault(practice, own)}`);
      holds = own.fault ? undefined : own;
      const words = [task.prompt, ...(task.hints ?? []), task.success_message ?? ""].join(" ");
      note(`${label}: the task's words name no control`, !/滑|拖|slid|drag|按钮|button/i.test(words), words);
    } else if (follows && completion.kind === "numeric_row") {
      const answers = (completion.parts ?? []).filter((part) => part?.blank).map((part) => whole(part.blank.answer));
      check(`${label}: the row after the card's task asks its problem's answers`, holds !== undefined && JSON.stringify(answers) === JSON.stringify(holds.answers),
        `row answers ${JSON.stringify(answers)}, ${holds ? `${problemText(holds)} gives ${JSON.stringify(holds.answers)}` : "no problem the card takes"}`);
      note(`${label}: the row is anchored to the card`, task.anchor === card.as, `anchor ${task.anchor}`);
    } else if (follows && completion.kind === "numeric_answer") {
      check(`${label}: the typed answer after the card's task is one of its problem's answers`, holds !== undefined && holds.answers.includes(whole(completion.answer)),
        `answer ${completion.answer}, ${holds ? `${problemText(holds)} gives ${JSON.stringify(holds.answers)}` : "no problem the card takes"}`);
      note(`${label}: the typed answer is anchored to the card`, task.anchor === card.as, `anchor ${task.anchor}`);
    }
  }
  note("the learner has a task on the card", cardTasks > 0, "no task on the card");
  note("a row of blanks follows", card.tasks.some((task) => task.completion?.kind === "numeric_row"), "no row of blanks in the lesson");
  return done();
}

// node scripts/place-value-times-ten-judge.mjs <cases.json> <run-directory>: judges <run-directory>/<case id>.json lessons.
if (process.argv[1] && new URL(import.meta.url).pathname === (await import("node:path")).resolve(process.argv[1])) {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const [casesFile, runDirectory] = process.argv.slice(2);
  if (!casesFile || !runDirectory) {
    console.error("usage: node scripts/place-value-times-ten-judge.mjs <cases.json> <run-directory>");
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
    try { verdict = judgePlaceValueTimesTen(item, lesson); } catch (error) { console.log(`${item.id}\tFAIL\tjudge error: ${String(error?.message ?? error).slice(0, 160)}`); continue; }
    if (verdict.pass) passed += 1;
    const failed = verdict.checks.filter((each) => !each.pass).map((each) => `${each.check}: ${each.detail}`).join("; ");
    const noted = verdict.notes.filter((each) => !each.pass).map((each) => `note: ${each.check}: ${each.detail}`).join("; ");
    console.log(`${item.id}\t${verdict.pass ? "pass" : "FAIL"}\t${[failed, noted].filter(Boolean).join("; ")}`);
  }
  console.log(`${passed}/${cases.length} pass`);
  process.exitCode = passed === cases.length ? 0 : 1;
}
