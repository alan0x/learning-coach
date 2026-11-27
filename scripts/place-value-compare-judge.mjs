// The place-value compare judge (OLL decision 0029, need 35P-06; plan §5: judge before recipe).
//
// It judges what a lesson's compare card (two numbers on one place-value chart, one row each, lined up by place; the
// learner judges each place from the left, "Same" or "Different", then chooses >, = or <) shows and asks. The model
// writes the meaning (the two numbers as written, the practice pair, how far the demonstration goes); the card
// computes the columns, the deciding place and the true sign, and the task ends only on the learner's true sign.
//
// - Expected values written into each case before any run: the two numbers as written (0.70 keeps its zero), the
//   relation read first to second, and the deciding place (null when every place matches); or `forbid` for a near
//   miss.
// - Checks (objective; owner, 2026-11-24): a near miss that draws a compare card FAILS (0029 §8); a served case that
//   draws none fails (named when it draws the chart, the trade card, the mat or a number line instead); the card's
//   pair is the question's, each number as written (in either order; a written zero kept: 0.70 drawn as 0.7 fails),
//   and the card's own relation and deciding place are the question's; the pair is one the card takes; the card
//   speaks the lesson's language; it opens fresh (nothing compared, judged or signed); the demonstration moves
//   "compared" forward, whole, never past the sign; every task on the card has a goal the learner can reach: its
//   `complete` fact by taps only, its start setting every field the card binds, on a practice pair the card takes that
//   is not the lesson's pair in either order (OLL's `placeValueComparePracticeFault`, decision 0029 revision 1: Coach's
//   check), starting fresh, each practice number drawn as the practice writes it (a practice never inherits the
//   lesson's written decimals: 0.5 drawn as 0.50 fails).
// - Notes (what the lesson chose to teach; the owner judges lessons): one card; whether the demonstration reaches the
//   sign (a lesson may stop partway: no hard rule, owner 2026-11-25); the learner has a task on the card; the task's
//   words name no control.
//
// The card is read from the lesson as written, its bound fields at the variables' values, by 0029's rules (the
// accepted sketch's), so each fault is named; the rules are written here until Coach pins an OLL with the card, as
// #183 and #185 did. Narration is not judged.

const KIND = "place_value_compare";
/** Cards a served case may draw instead, named in its failure. */
const INSTEAD = { place_value_chart: "the place-value chart", place_value_trade: "the trade card", base_ten_trade: "the trading mat", number_line: "a number line" };
const MIN_PLACE = -3, MAX_PLACE = 6, MAX_COLUMNS = 7, MAX_DECIMALS = 3, MAX_VALUE = 9_999_999_999;
const unit = (place) => 10 ** (place + 3);
const PLACE_NAMES = { 6: "millions", 5: "hundred_thousands", 4: "ten_thousands", 3: "thousands", 2: "hundreds", 1: "tens", 0: "ones", [-1]: "tenths", [-2]: "hundredths", [-3]: "thousandths" };

/** "4,530", "0.70", "０.７" -> { value (thousandths), dec (decimals as written) }; undefined when the card cannot hold it. */
export function writtenNumber(text) {
  const written = String(text ?? "").trim().replace(/,/g, "").replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/[．。]/g, ".");
  const match = /^(\d{1,7})(?:\.(\d+))?$/.exec(written);
  if (!match) return undefined;
  const dec = (match[2] ?? "").length;
  if (dec > MAX_DECIMALS) return undefined;
  return { value: Number(match[1]) * 1000 + Number((match[2] ?? "").padEnd(3, "0") || "0"), dec };
}
/** How many decimals a value needs: 0.7 one, 0.625 three. */
export const ownDecimals = (value) => { const frac = value % 1000; return !frac ? 0 : frac % 100 === 0 ? 1 : frac % 10 === 0 ? 2 : 3; };
const digitAt = (value, place) => Math.floor(value / unit(place)) % 10;
const topPlace = (value) => { for (let place = MAX_PLACE; place >= MIN_PLACE; place -= 1) if (digitAt(value, place)) return place; return 0; };
/** The numeral as written (plain digits). */
export const numeral = (n) => (n && Number.isFinite(n.value) ? `${Math.floor(n.value / 1000)}${n.dec ? `.${String(n.value % 1000).padStart(3, "0").slice(0, n.dec)}` : ""}` : String(n?.value));

/** Why the card refuses a pair (0029 §5, as OLL's placeValueCompareFault), or undefined. */
export function compareFault(a, b) {
  for (const n of [a, b]) {
    if (!Number.isSafeInteger(n.value) || n.value < 0 || n.value > MAX_VALUE) return "unreadable";
    if (!Number.isInteger(n.dec) || n.dec < ownDecimals(n.value) || n.dec > MAX_DECIMALS) return "decimals";
  }
  const high = Math.max(topPlace(a.value), topPlace(b.value), 0);
  if (high + Math.max(a.dec, b.dec) + 1 > MAX_COLUMNS) return "too_wide";
  if (a.value === b.value && a.dec === b.dec) return "same_numeral";
  return undefined;
}
/** The pair's deciding place (null when every place matches) and relation, read first to second. */
export function comparePair(a, b) {
  const high = Math.max(topPlace(a.value), topPlace(b.value), 0), low = -Math.max(a.dec, b.dec);
  for (let place = high; place >= low; place -= 1) {
    const x = digitAt(a.value, place), y = digitAt(b.value, place);
    if (x !== y) return { deciding: place, relation: x > y ? ">" : "<", end: high - place + 2 };
  }
  return { deciding: null, relation: "=", end: high - low + 2 };
}
/** A practice pair fits when the card takes it and it is not the shown pair in either order (OLL's placeValueComparePracticeFault). */
export function practiceFault(shown, a, b) {
  const fault = compareFault(a, b);
  if (fault) return fault;
  const same = (p, q) => p.value === q.value && p.dec === q.dec;
  return (same(shown[0], a) && same(shown[1], b)) || (same(shown[0], b) && same(shown[1], a)) ? "same_pair" : undefined;
}

/**
 * The card's content with its bound fields at these variable values (every field is bound by its bare name). `set` is
 * what a start sets: a written-decimals field it does not set is inherited (the card's own, or the lesson's).
 */
function cardAt(content, variables, set = new Set(Object.keys(variables))) {
  const bound = new Map((content?.bindings ?? []).map((binding) => [binding.target, String(binding.expression).trim()]));
  const at = (field) => {
    const alias = bound.get(field);
    return alias !== undefined && variables[alias] !== undefined ? variables[alias] : content?.[field];
  };
  const number = (field) => {
    const value = at(field), written = at(`${field}_decimals`), alias = bound.get(`${field}_decimals`);
    return { value, dec: written === undefined ? (Number.isSafeInteger(value) && value >= 0 ? ownDecimals(value) : 0) : written, inherited: written !== undefined && !(alias !== undefined && set.has(alias)) };
  };
  return { language: content?.language ?? "en-US", a: number("a"), b: number("b"), compared: at("compared"), marked: at("marked"), signed: at("signed"), comparedVariable: bound.get("compared") };
}
const pairText = (state) => `${numeral(state.a)} and ${numeral(state.b)}`;
const freshFault = (state) => (state.compared === 0 && state.marked === 0 && state.signed === 0 ? undefined : `compared ${state.compared}, marked ${state.marked}, signed ${state.signed}`);

/** Everything the judge reads about one lesson's compare card. */
export function compareIn(lesson) {
  const actions = (lesson?.steps ?? []).flatMap((step) => step.beats ?? []).flatMap((beat) => beat.actions ?? []);
  const written = actions.filter((action) => action.do === "write");
  const writes = written.filter((action) => action.kind === KIND);
  const instead = [...new Set(written.map((action) => INSTEAD[action.kind]).filter(Boolean))];
  const tasks = lesson?.lesson?.tasks ?? [];
  if (!writes.length) return { cards: 0, instead, tasks };
  const write = writes[0];
  const declared = Object.fromEntries((lesson.lesson?.variables ?? []).map((variable) => [variable.as, variable.initial]));
  const start = cardAt(write.content, declared);
  const shown = [];
  if (start.comparedVariable !== undefined) {
    for (const action of actions) if (action.do === "animate" && action.variable === start.comparedVariable && typeof action.value === "number") shown.push(action.value);
  }
  return { cards: writes.length, instead, as: write.as, content: write.content, declared, start, shown, tasks };
}

/** Judges one case's lesson. Returns { pass, checks: [{ check, pass, detail? }], notes: [...] }. */
export function judgePlaceValueCompare(item, lesson) {
  const checks = [];
  const notes = [];
  const check = (name, pass, detail) => checks.push({ check: name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
  const note = (name, holds, detail) => notes.push({ check: name, pass: Boolean(holds), ...(holds ? {} : { detail }) });
  const done = () => ({ pass: checks.every((each) => each.pass), checks, notes });
  const card = compareIn(lesson);
  if (item.expect?.forbid) {
    if (item.expect.forbid.includes(KIND)) check("no compare card for this question", card.cards === 0, `${card.cards} compare card(s) drawn`);
    return done();
  }
  if (!card.cards) {
    check("a compare card is drawn", false, card.instead.length ? `no compare card; drawn instead: ${card.instead.join(", ")}` : "no compare card");
    return done();
  }
  note("one compare card", card.cards === 1, `${card.cards} compare cards`);

  const { start } = card;
  const expect = item.expect;
  const want = expect.numbers.map(writtenNumber);
  const same = (p, q) => p.value === q.value && p.dec === q.dec;
  const inOrder = same(start.a, want[0]) && same(start.b, want[1]);
  const swapped = same(start.a, want[1]) && same(start.b, want[0]);
  const values = (p, q) => p.value === q.value;
  const lost = !inOrder && !swapped && ((values(start.a, want[0]) && values(start.b, want[1])) || (values(start.a, want[1]) && values(start.b, want[0])));
  check("the card's pair is the question's, each number as written", inOrder || swapped,
    lost ? `card ${pairText(start)}, question ${expect.numbers.join(" and ")}: a written zero is lost or added` : `card ${pairText(start)}, question ${expect.numbers.join(" and ")}`);
  const fault = compareFault(start.a, start.b);
  check("the card's pair is one the card takes", !fault, `${pairText(start)}: ${fault}`);
  if (!fault && (inOrder || swapped)) {
    const pair = comparePair(start.a, start.b);
    const flip = { ">": "<", "<": ">", "=": "=" };
    const relation = inOrder ? pair.relation : flip[pair.relation];
    check("the card's relation and deciding place are the question's", relation === expect.relation && (pair.deciding === null ? null : PLACE_NAMES[pair.deciding]) === expect.deciding_place,
      `card ${pairText(start)}: ${pair.relation} decided at ${PLACE_NAMES[pair.deciding] ?? "no place"}; question ${expect.relation} at ${expect.deciding_place}`);
  }
  const zh = /^zh(?:-|$)/i.test(String(lesson.lesson?.language ?? ""));
  check("the card speaks the lesson's language", start.language === (zh ? "zh-CN" : "en-US"), `card ${start.language}, lesson ${lesson.lesson?.language}`);
  check("the card opens fresh", !freshFault(start), freshFault(start));
  if (!fault) {
    const { end } = comparePair(start.a, start.b);
    const off = card.shown.find((value, k) => !Number.isInteger(value) || value < 0 || value > end || (k > 0 && value < card.shown[k - 1]));
    check("the demonstration moves compared forward, whole, never past the sign", off === undefined, `compared goes to ${JSON.stringify(card.shown)}; 0 to ${end} on this pair`);
    note("the demonstration reaches the sign", card.shown.includes(end), `compared goes to ${JSON.stringify(card.shown)}; the sign is at ${end}`);
  }

  let cardTasks = 0;
  for (const task of card.tasks) {
    const completion = task.completion ?? {};
    if (completion.kind !== "card_fact" || completion.node !== card.as) continue;
    const label = task.as ?? task.prompt ?? "a task";
    cardTasks += 1;
    const ops = (task.allowed_operations ?? []).map((operation) => `${operation.kind}${operation.node && operation.node !== card.as ? `@${operation.node}` : ""}`).sort().join(",");
    check(`${label}: the task on the card is its complete fact, by taps alone`, completion.fact === "complete" && ops === "card_tap", JSON.stringify([task.allowed_operations, completion]));
    const values = task.start?.values;
    if (!values) { check(`${label}: the task on the card starts on its own pair`, false, "no start"); continue; }
    const unset = (card.content?.bindings ?? []).map((binding) => String(binding.expression).trim()).filter((alias) => !Object.hasOwn(values, alias));
    check(`${label}: the practice start sets every field the card binds`, unset.length === 0, `not set: ${unset.join(", ")}`);
    const practice = cardAt(card.content, { ...card.declared, ...values }, new Set(Object.keys(values)));
    const own = practiceFault([start.a, start.b], practice.a, practice.b);
    check(`${label}: the practice pair is one the card takes, not the lesson's pair in either order`, !own, `${pairText(practice)}: ${own}`);
    check(`${label}: the practice starts fresh`, !freshFault(practice), freshFault(practice));
    // A practice number drawn with more decimals than it has, from a written-decimals field its start does not set.
    const inherited = ["a", "b"].filter((field) => practice[field].inherited && practice[field].dec > ownDecimals(practice[field].value) && !same(practice[field], start[field]));
    check(`${label}: each practice number is drawn as the practice writes it, not with the lesson's written decimals`, inherited.length === 0,
      inherited.map((field) => `${field} ${numeral({ value: practice[field].value, dec: ownDecimals(practice[field].value) })} drawn as ${numeral(practice[field])}`).join("; "));
    const words = [task.prompt, ...(task.hints ?? []), task.success_message ?? ""].join(" ");
    note(`${label}: the task's words name no control`, !/滑|拖|按钮|点「|slid|drag|button|tap (?:same|different)/i.test(words), words);
  }
  note("the learner has a task on the card", cardTasks > 0, "no task on the card");
  return done();
}

// node scripts/place-value-compare-judge.mjs <cases.json> <run-directory>: judges <run-directory>/<case id>.json lessons.
if (process.argv[1] && new URL(import.meta.url).pathname === (await import("node:path")).resolve(process.argv[1])) {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const [casesFile, runDirectory] = process.argv.slice(2);
  if (!casesFile || !runDirectory) {
    console.error("usage: node scripts/place-value-compare-judge.mjs <cases.json> <run-directory>");
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
    try { verdict = judgePlaceValueCompare(item, lesson); } catch (error) { console.log(`${item.id}\tFAIL\tjudge error: ${String(error?.message ?? error).slice(0, 160)}`); continue; }
    if (verdict.pass) passed += 1;
    const failed = verdict.checks.filter((each) => !each.pass).map((each) => `${each.check}: ${each.detail}`).join("; ");
    const noted = verdict.notes.filter((each) => !each.pass).map((each) => `note: ${each.check}: ${each.detail}`).join("; ");
    console.log(`${item.id}\t${verdict.pass ? "pass" : "FAIL"}\t${[failed, noted].filter(Boolean).join("; ")}`);
  }
  console.log(`${passed}/${cases.length} pass`);
  process.exitCode = passed === cases.length ? 0 : 1;
}
