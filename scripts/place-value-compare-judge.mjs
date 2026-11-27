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
// - The lesson is followed as OLL plays it: steps and beats in order, a beat's replay start first (each listed variable
//   set to its value, or its starting value when listed without one), then its actions phase by phase (before, during,
//   after speech). Every compare card is judged, each state it shows: when written, and after each revision, each
//   animation of a variable it binds and each replay (review of #195).
// - Checks (objective; owner, 2026-11-24): a near miss that draws a compare card FAILS (0029 §8); a served case that
//   draws none fails (named when it draws the chart, the trade card, the mat or a number line instead); the first
//   card's pair is the question's, each number as written (in either order; a written zero lost or added is named:
//   0.70 drawn as 0.7), with the question's relation and deciding place; another card shows another pair than the
//   question's and the other cards' practice pairs; every card's pair is one the card takes, every field bound to a
//   lesson variable by name, in the lesson's language throughout; it opens fresh (nothing compared, judged or signed);
//   its pair stays as written (a replay may lay it the other way round), and the lesson never judges or signs for the
//   learner; the demonstration moves "compared" forward, whole, never past the sign (a replay shows it again, so it may
//   set any value up to the sign); every task on a card has a goal the learner can reach: its `complete` fact by taps
//   only, its start listing every field the card binds (OLL reads `start.variables`), on a practice pair the card takes
//   that is neither the card's pair nor the question's in either order (OLL's `placeValueComparePracticeFault`,
//   decision 0029 revision 1: Coach's check), starting fresh, each practice number drawn as the practice writes it (a
//   written-decimals field its start does not set with a value of its own is inherited: 0.5 drawn as 0.50 fails).
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
 * The card's content with its bound fields at these variable values. `set` is what a start sets with a value of its
 * own: a written-decimals field it does not set (unbound, or listed without a value) is inherited, the card's own or
 * the lesson's starting one.
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
  const plain = [...bound.entries()].filter(([, expression]) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(expression)).map(([target, expression]) => `${target}: ${expression}`);
  return { language: content?.language ?? "en-US", a: number("a"), b: number("b"), compared: at("compared"), marked: at("marked"), signed: at("signed"), plain };
}
const pairText = (state) => `${numeral(state.a)} and ${numeral(state.b)}`;
const freshFault = (state) => (state.compared === 0 && state.marked === 0 && state.signed === 0 ? undefined : `compared ${state.compared}, marked ${state.marked}, signed ${state.signed}`);
const sameNumber = (p, q) => p.value === q.value && p.dec === q.dec;
/** Two pairs are the same pair: the same numerals, in either order. */
const samePair = (x, y) => (sameNumber(x[0], y[0]) && sameNumber(x[1], y[1])) || (sameNumber(x[0], y[1]) && sameNumber(x[1], y[0]));
const PHASES = ["before_speech", "during_speech", "after_speech"];

/**
 * Every compare card of a lesson as the lesson plays it (OLL's order: steps, beats, a beat's replay start, then its
 * actions phase by phase): each card's states, one when it is written and one each time a revision, an animation of a
 * variable it binds or a replay changes what it shows, with what changed it.
 */
export function compareIn(lesson) {
  const variables = lesson?.lesson?.variables ?? [];
  const declared = Object.fromEntries(variables.map((variable) => [variable.as, variable.initial]));
  const values = { ...declared };
  const cards = new Map();
  const written = [];
  const boundTo = (card, alias) => (card.content?.bindings ?? []).some((binding) => String(binding.expression).trim() === alias);
  const show = (card, via) => card.states.push({ via, ...cardAt(card.content, values) });
  for (const step of lesson?.steps ?? []) for (const beat of step.beats ?? []) {
    if (beat.start?.kind === "replay") {
      const listed = beat.start.variables ?? Object.keys(beat.start.values ?? {});
      // A replay sets each listed variable: its value, or its starting value when listed without one.
      for (const alias of listed) values[alias] = Object.hasOwn(beat.start.values ?? {}, alias) ? beat.start.values[alias] : declared[alias];
      for (const card of cards.values()) if (listed.some((alias) => boundTo(card, alias))) show(card, "replay");
    }
    for (const phase of PHASES) for (const action of beat.actions ?? []) {
      if ((action.when ?? "during_speech") !== phase) continue;
      if (action.do === "write") {
        written.push(action.kind);
        if (action.kind !== KIND) continue;
        const card = { as: action.as, content: action.content, states: [] };
        cards.set(action.as, card);
        show(card, "write");
      } else if (action.do === "revise" && cards.has(action.target) && action.content && typeof action.content === "object") {
        const card = cards.get(action.target);
        card.content = action.content;
        show(card, "revise");
      } else if (action.do === "animate" && typeof action.variable === "string") {
        values[action.variable] = action.value;
        for (const card of cards.values()) if (boundTo(card, action.variable)) show(card, `animate ${action.variable}`);
      }
    }
  }
  const instead = [...new Set(written.map((kind) => INSTEAD[kind]).filter(Boolean))];
  return { cards: [...cards.values()], instead, declared, tasks: lesson?.lesson?.tasks ?? [] };
}

/** Judges one case's lesson. Returns { pass, checks: [{ check, pass, detail? }], notes: [...] }. */
export function judgePlaceValueCompare(item, lesson) {
  const checks = [];
  const notes = [];
  const check = (name, pass, detail) => checks.push({ check: name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
  const note = (name, holds, detail) => notes.push({ check: name, pass: Boolean(holds), ...(holds ? {} : { detail }) });
  const done = () => ({ pass: checks.every((each) => each.pass), checks, notes });
  const read = compareIn(lesson);
  if (item.expect?.forbid) {
    if (item.expect.forbid.includes(KIND)) check("no compare card for this question", read.cards.length === 0, `${read.cards.length} compare card(s) drawn`);
    return done();
  }
  if (!read.cards.length) {
    check("a compare card is drawn", false, read.instead.length ? `no compare card; drawn instead: ${read.instead.join(", ")}` : "no compare card");
    return done();
  }
  note("one compare card", read.cards.length === 1, `${read.cards.length} compare cards`);

  const expect = item.expect;
  const want = expect.numbers.map(writtenNumber);
  const zh = /^zh(?:-|$)/i.test(String(lesson.lesson?.language ?? ""));
  const language = zh ? "zh-CN" : "en-US";
  // Every practice pair of the lesson, as each task starts its card (a second card shows another pair than these).
  const startOf = (task, card) => {
    const listed = new Set(task.start?.variables ?? Object.keys(task.start?.values ?? {}));
    const own = new Set([...listed].filter((alias) => Object.hasOwn(task.start?.values ?? {}, alias)));
    const at = { ...read.declared };
    for (const alias of listed) at[alias] = own.has(alias) ? task.start.values[alias] : read.declared[alias];
    return { listed, state: cardAt(card.content, at, own) };
  };
  const practices = read.tasks.flatMap((task) => {
    const card = read.cards.find((each) => each.as === task.completion?.node);
    return task.completion?.kind === "card_fact" && card && task.start ? [{ card: card.as, state: startOf(task, card).state }] : [];
  });

  read.cards.forEach((card, index) => {
    const label = read.cards.length > 1 ? `${card.as}: ` : "";
    const [first, ...later] = card.states;
    const pair = [first.a, first.b];
    if (index === 0) {
      const inOrder = sameNumber(first.a, want[0]) && sameNumber(first.b, want[1]);
      const swapped = sameNumber(first.a, want[1]) && sameNumber(first.b, want[0]);
      const values = (p, q) => p.value === q.value;
      const lost = !inOrder && !swapped && ((values(first.a, want[0]) && values(first.b, want[1])) || (values(first.a, want[1]) && values(first.b, want[0])));
      check("the card's pair is the question's, each number as written", inOrder || swapped,
        lost ? `card ${pairText(first)}, question ${expect.numbers.join(" and ")}: a written zero is lost or added` : `card ${pairText(first)}, question ${expect.numbers.join(" and ")}`);
      const fault = compareFault(first.a, first.b);
      if (!fault && (inOrder || swapped)) {
        const result = comparePair(first.a, first.b);
        const flip = { ">": "<", "<": ">", "=": "=" };
        const relation = inOrder ? result.relation : flip[result.relation];
        check("the card's relation and deciding place are the question's", relation === expect.relation && (result.deciding === null ? null : PLACE_NAMES[result.deciding]) === expect.deciding_place,
          `card ${pairText(first)}: ${result.relation} decided at ${PLACE_NAMES[result.deciding] ?? "no place"}; question ${expect.relation} at ${expect.deciding_place}`);
      }
    } else {
      // Another card shows another example: not the question's pair, nor a practice pair, in either order.
      const repeats = [want, ...practices.filter((each) => each.card !== card.as).map(({ state }) => [state.a, state.b])].find((other) => samePair(pair, other));
      check(`${label}another card shows another pair than the question's and the practice's`, !repeats, `card ${pairText(first)} repeats ${repeats ? `${numeral(repeats[0])} and ${numeral(repeats[1])}` : ""}`);
    }
    const fault = compareFault(first.a, first.b);
    check(`${label}the card's pair is one the card takes`, !fault, `${pairText(first)}: ${fault}`);
    check(`${label}each field is bound to a lesson variable by name`, first.plain.length === 0, first.plain.join("; "));
    check(`${label}the card speaks the lesson's language`, card.states.every((state) => state.language === language), `card ${card.states.map((state) => state.language).join(" then ")}, lesson ${lesson.lesson?.language}`);
    check(`${label}the card opens fresh`, !freshFault(first), freshFault(first));
    // What the card shows never changes but by the demonstration: the pair as written, in either order (a replay
    // may lay it the other way round); the learner's own fields stay 0.
    const changed = later.find((state) => !samePair([state.a, state.b], pair));
    check(`${label}the card's pair stays as written`, !changed, changed ? `${changed.via}: ${pairText(changed)} after ${pairText(first)}` : "");
    const judged = later.find((state) => state.marked !== 0 || state.signed !== 0);
    check(`${label}the lesson never judges or signs for the learner`, !judged, judged ? `${judged.via}: marked ${judged.marked}, signed ${judged.signed}` : "");
    if (!fault) {
      const { end } = comparePair(first.a, first.b);
      // Forward, whole, never past the sign; a replay shows the demonstration again, so it may set any value up to it.
      const off = later.find((state, k) => {
        const before = (k === 0 ? first : later[k - 1]).compared;
        return !Number.isInteger(state.compared) || state.compared < 0 || state.compared > end || (state.via !== "replay" && state.compared < before);
      });
      check(`${label}the demonstration moves compared forward, whole, never past the sign`, !off, off ? `${off.via}: compared ${card.states.map((state) => state.compared).join(" -> ")}; 0 to ${end} on this pair` : "");
      note(`${label}the demonstration reaches the sign`, card.states.some((state) => state.compared === end), `compared goes ${card.states.map((state) => state.compared).join(" -> ")}; the sign is at ${end}`);
    }
  });

  let cardTasks = 0;
  for (const task of read.tasks) {
    const completion = task.completion ?? {};
    const card = read.cards.find((each) => each.as === completion.node);
    if (completion.kind !== "card_fact" || !card) continue;
    const label = task.as ?? task.prompt ?? "a task";
    cardTasks += 1;
    const ops = (task.allowed_operations ?? []).map((operation) => `${operation.kind}${operation.node && operation.node !== card.as ? `@${operation.node}` : ""}`).sort().join(",");
    check(`${label}: the task on the card is its complete fact, by taps alone`, completion.fact === "complete" && ops === "card_tap", JSON.stringify([task.allowed_operations, completion]));
    if (!task.start) { check(`${label}: the task on the card starts on its own pair`, false, "no start"); continue; }
    const { listed, state: practice } = startOf(task, card);
    // OLL reads a start's variables: a field the card binds that the start does not list keeps whatever the lesson left.
    const unset = (card.content?.bindings ?? []).map((binding) => String(binding.expression).trim()).filter((alias) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(alias) && !listed.has(alias));
    check(`${label}: the practice start sets every field the card binds`, unset.length === 0, `not set: ${unset.join(", ")}`);
    const shown = card.states[0];
    const own = practiceFault([shown.a, shown.b], practice.a, practice.b);
    const question = !own && samePair([practice.a, practice.b], want) ? "same_pair" : own;
    check(`${label}: the practice pair is one the card takes, not the lesson's pair in either order`, !question, `${pairText(practice)}: ${question}`);
    check(`${label}: the practice starts fresh`, !freshFault(practice), freshFault(practice));
    // What the card draws: a number drawn with more decimals than it has, from a written-decimals field the start
    // does not set itself (0.7 drawn as 0.70), is the lesson's written zero inherited.
    const inherited = ["a", "b"].filter((field) => practice[field].inherited && practice[field].dec > ownDecimals(practice[field].value));
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
