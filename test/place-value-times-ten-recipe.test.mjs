// The place-value times-ten recipe (OLL decision 0028, need 35P-04): the same amount counted in another unit, a
// count (3 tenths = ? thousandths) or a times pair (700 is ? times 70). A trial, off by default. The model writes
// four lesson numbers, the amount, the target and a practice of the same kind, and "counted in" when the question
// names a smaller unit than the amount's own (40 hundredths: 0.01); otherwise the program supplies it (the amount's
// own place). The program binds the card's own variables, plays each value of counted in (the card moves one row
// at a time), makes the learner's task on the practice and the card's answer row after it. Every development case's
// ideal lesson compiles and passes the judge in both languages; each refusal names its reason and the picture it can
// cost, never the lesson.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const api = await import(new URL("../lesson-plan.js", import.meta.url));
const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);
const CASES = JSON.parse(readFileSync(new URL("../testsuite/place-value-times-ten-dev-cases.json", import.meta.url), "utf8")).cases;
const short = (name) => name.replace(/^section_01_moment_01_item_01_/u, "");

/** Runs a script in its own process with the trial on. */
function withTrial(script, trial = "place_value_times_ten") {
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: trial },
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  }));
}

test("place_value_times_ten is a trial, off by default: built, not offered; its guidance and the number it supplies", () => {
  assert.ok(api.TRIAL_RECIPES.includes("place_value_times_ten"));
  assert.equal(api.RECIPE_CATALOG_ORDER.includes("place_value_times_ten"), false);
  assert.equal(api.OFFERED_RECIPES.includes("place_value_times_ten"), false);
  assert.equal(api.LESSON_PLAN_CAPABILITY_NAMES.includes("place_value_times_ten"), false);
  assert.equal(api.RECIPE_PLUGIN.place_value_times_ten, "math");
  const offered = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const entry = api.LESSON_PLAN_CAPABILITY_REGISTRY.place_value_times_ten;
    const [counted] = entry.program_number_inputs;
    console.log(JSON.stringify({ offered: api.OFFERED_RECIPES, names: api.LESSON_PLAN_CAPABILITY_NAMES, guidance: entry.model_guidance, min: entry.min_lesson_numbers,
      starts: [[0.3, 0.001], [700, 70], [70, 700], [1000, 10], [5, 0.01], [0.4, 0.1], [2.5, 0.1]].map((pair) => counted.initial(pair)),
      range: [counted.min, counted.max], many: entry.binds_many_variables, controls: entry.student_controls, inputs: entry.number_inputs }));
  `);
  assert.equal(offered.offered.at(-1), "place_value_times_ten");
  assert.ok(offered.names.includes("place_value_times_ten"));
  // Named by role (35P-04 run 2: PF-11 and PF-01 put the unit asked where the start unit goes).
  assert.deepEqual(offered.inputs, ["amount", "unit_asked", "practice_amount", "practice_unit_asked", "start_unit"]);
  // Counted in starts at the amount's own place (a times pair: the larger number's, in either order). A
  // put-together question (40 hundredths = ? tenths) writes its own: from the amount alone the program has no start
  // (NaN, so it supplies nothing and the card goes at once; below). Numbers the card does not take give none either.
  assert.deepEqual(offered.starts, [0.1, 100, 100, 1000, 1, null, null]);
  assert.deepEqual(offered.range, [0, 1_000_000]);
  assert.deepEqual([offered.min, offered.many, offered.controls], [5, true, []]);
  // Short guidance (tracked, not capped): the numbers by role, a breaking and a put-together example, the
  // demonstration to the unit asked, the practice; no control named.
  assert.equal(Buffer.byteLength(offered.guidance), 1958);
  for (const role of ["amount", "unit_asked", "practice_amount", "practice_unit_asked", "start_unit"]) assert.ok(offered.guidance.includes(role), role);
  // PF-11's question, written as the program wants it: a breaking question with no fifth number.
  assert.ok(offered.guidance.includes("7个十分之一=?个百分之一 写0.7、0.01、练习两个数；"));
  assert.ok(offered.guidance.includes("一直到问的单位"));
  assert.ok(!/滑块|slider|拖|按钮/u.test(offered.guidance), "the guidance names no control");
});

test("counted in moves forward along the problem's path; nothing else moves", () => {
  const moves = api.RECIPE_HOOKS.place_value_times_ten.number_moves;
  const to = (state, ...values) => moves.moves(state, values.map((value) => ({ position: 4, to: value })));
  // The card's state when drawn: the four numbers as written, counted in at the question's unit, then that start
  // (kept while counted in moves, so the problem is always known).
  const start = moves.state([0.3, 0.001, 5, 0.01, 0]);
  assert.deepEqual(start, [0.3, 0.001, 5, 0.01, 0.1, 0.1]);
  assert.deepEqual(to(start, 0.01).steps.at(-1).to, [0.3, 0.001, 5, 0.01, 0.01, 0.1]);
  assert.deepEqual(to(start, 0.01, 0.001).steps.map((step) => step.to[4]), [0.01, 0.001]);
  assert.deepEqual(to(start, 0.001).steps.map((step) => step.to[4]), [0.001], "straight to the target");
  assert.deepEqual(to(start, 0.01, 0.01).steps.map((step) => step.to[4]), [0.01, 0.01], "the same value again changes nothing");
  assert.match(to(start, 0.01, 0.1).refused.reason, /counted in goes forward along 0.1 \(tenths\) -> 0.01 \(hundredths\) -> 0.001 \(thousandths\), never back to 0.1; from 0.01 the next values are 0.001/);
  assert.match(to(start, 0.05).refused.reason, /0.05 is not one of its values; from 0.1 the next values are 0.01 or 0.001/);
  assert.match(to(start, 0.001, 0.0001).refused.reason, /from 0.001 it has reached the unit asked, 0.001/);
  // A put-together question counts from the unit it names, up to the target.
  const together = moves.state([0.4, 0.1, 0.7, 0.1, 0.01]);
  assert.deepEqual(together, [0.4, 0.1, 0.7, 0.1, 0.01, 0.01]);
  assert.deepEqual(to(together, 0.1).steps.map((step) => step.to[4]), [0.1]);
  // Once it has reached the target, the refusal says so (review of #187: it once named the start instead).
  assert.match(to(together, 0.1, 0.01).refused.reason, /never back to 0.01; from 0.1 it has reached the unit asked, 0.1/);
  assert.match(to(together, 0.1, 1).refused.reason, /1 is not one of its values; from 0.1 it has reached the unit asked, 0.1/);
  const far = moves.state([0.5, 0.1, 0.3, 0.1, 0.001]);
  assert.deepEqual(to(far, 0.01, 0.1).steps.map((step) => step.to[4]), [0.01, 0.1], "two places up, one at a time");
  // A times pair: the larger number's unit, then the smaller number (written either way).
  assert.deepEqual(to(moves.state([700, 70, 4000, 400, 0]), 70).steps.map((step) => step.to[4]), [70]);
  assert.deepEqual(moves.state([70, 700, 400, 4000, 0]), [70, 700, 400, 4000, 100, 100]);
  assert.match(to(moves.state([700, 70, 4000, 400, 0]), 10).refused.reason, /100 \(hundreds\) -> 70; 10 is not one of its values; from 100 the next values are 70/);
  // The amount, the target and the practice never move: an animation of one is left out (the compiler records it),
  // the rest of the moment plays (objective run 1, PF-02 and PF-10).
  const fixed = moves.moves(start, [{ position: 0, to: 0.5 }, { position: 4, to: 0.01 }, { position: 3, to: 0.1 }]);
  assert.deepEqual(fixed.steps.map((step) => step.to[4]), [0.01]);
  assert.deepEqual(fixed.ignored.map((each) => each.position), [0, 3]);
  assert.match(fixed.ignored[0].reason, /stay as written: the demonstration moves only the start unit, counted in/);
  assert.equal(moves.moves(start, [{ position: 4, to: 0.01 }]).ignored, undefined);
  assert.deepEqual(moves.moves(start, [{ position: 1, to: 0.001 }]).steps.at(-1).to, start, "a number animated to its own value is no change");
});

// One lesson per entry: [id, timesTenPlan options, language, judge case or null]. Each compiles through the full OLL
// validation; the result keeps the lesson, the program's adjustments and the judge's verdict.
const compileScript = (entries) => `
  const api = await import(${here("../lesson-plan.js")});
  const { timesTenPlan } = await import(${here("./sample-plans.mjs")});
  const { judgePlaceValueTimesTen } = await import(${here("../scripts/place-value-times-ten-judge.mjs")});
  const out = {};
  for (const [id, options, language, item] of ${JSON.stringify(entries)}) {
    try {
      const compiled = api.compileAndValidateLessonPlan(timesTenPlan(options), { language });
      out[id] = { lesson: compiled.lesson, adjustments: compiled.program_adjustments, verdict: item ? judgePlaceValueTimesTen(item, compiled.lesson) : undefined };
    } catch (error) {
      out[id] = { error: error.code, path: error.path, message: error.message, capability: error.capability };
    }
  }
  console.log(JSON.stringify(out));
`;

// A practice per development case: another problem of the card's shape (the same question, direction and places
// apart), never the question's own.
const PRACTICE = {
  "PF-01": [2000, 10], "PF-02": [700, 1], "PF-03": [4000, 100], "PF-04": [500, 100], "PF-05": [0.7, 0.1], "PF-06": [0.3, 0.1],
  "PF-07": [4000, 400], "PF-08": [500, 50], "PF-09": [6000, 600], "PF-10": [0.9, 0.09], "PF-11": [0.3, 0.01], "PF-12": [5, 0.01],
  "PF-13": [0.4, 0.001], "PF-14": [0.6, 0.06], "PF-15": [7, 0.7],
};
// A put-together question writes the unit it names; otherwise the program's own start is written (as the outline
// may leave it out: the stubbed run below).
const optionsOf = (item) => ({
  amount: Number(item.expect.amount), target: Number(item.expect.target), practice: PRACTICE[item.id],
  ...(item.expect.start !== null && Number(item.expect.start) < Number(item.expect.target) ? { start: Number(item.expect.start) } : {}),
});

test("every development case's ideal lesson compiles and passes the judge, in English and in Chinese", () => {
  const served = CASES.filter((item) => !item.expect.forbid);
  assert.equal(served.length, 15);
  const entries = served.flatMap((item) => ["en-US", "zh-CN"].map((language) => [`${item.id} ${language}`, optionsOf(item), language, item]));
  const result = withTrial(compileScript(entries));
  for (const [id, options, language] of entries) {
    assert.ok(!result[id].error, `${id}: ${result[id].message}`);
    assert.deepEqual(result[id].verdict.checks.filter((check) => !check.pass), [], id);
    // The ideal lesson reaches the target, leaves the learner a task on the card and asks the row after it.
    assert.deepEqual(result[id].verdict.notes.filter((note) => !note.pass), [], id);
    assert.deepEqual(result[id].adjustments, [], id);
    const variables = result[id].lesson.lesson.variables;
    // The card's lesson numbers are read, not bound: only its own variables are declared, none with a control.
    assert.deepEqual(variables.filter((variable) => /^number_\d+$/u.test(variable.as)), [], id);
    assert.deepEqual(variables.filter((variable) => variable.control), [], id);
    const write = result[id].lesson.steps[0].beats[0].actions[0];
    assert.equal(write.kind, "place_value_times_ten", id);
    assert.equal(variables.length, write.content.apart === 2 ? 5 : 4, id);
    assert.equal(write.content.language, language === "zh-CN" ? "zh-CN" : undefined, id);
    assert.ok(options.practice, id);
  }
});

test("the demonstration plays in the model's own moments: each value of counted in, forward; a lesson may stop partway", () => {
  const result = withTrial(compileScript([
    ["straight", { amount: 0.3, target: 0.001, practice: [5, 0.01] }, "en-US"],
    ["one-by-one", { amount: 0.3, target: 0.001, practice: [5, 0.01], steps: [0.01, 0.001] }, "zh-CN"],
    ["still", { amount: 0.3, target: 0.001, practice: [5, 0.01], steps: [0.01, 0.01, 0.001] }, "en-US"],
    ["partway", { amount: 0.3, target: 0.001, practice: [5, 0.01], steps: [0.01] }, "en-US"],
    ["times", { amount: 700, target: 70, practice: [4000, 400] }, "en-US"],
    ["together", { amount: 0.4, target: 0.1, start: 0.01, practice: [0.7, 0.1] }, "zh-CN"],
  ]));
  const played = (id) => result[id].lesson.steps[0].beats.map((beat) => beat.actions.map((action) => (action.do === "animate" ? `${short(action.variable)}=${action.value}` : action.do)));
  assert.deepEqual(played("straight"), [["write", "focus"], ["counted_in=1"]]);
  assert.deepEqual(played("one-by-one"), [["write", "focus"], ["counted_in=10"], ["counted_in=1"]]);
  assert.deepEqual(played("still"), [["write", "focus"], ["counted_in=10"], ["focus"], ["counted_in=1"]]);
  assert.deepEqual(played("partway"), [["write", "focus"], ["counted_in=10"]]);
  assert.deepEqual(result.partway.adjustments, []);
  assert.deepEqual(played("times"), [["write", "focus"], ["counted_in=70000"]]);
  assert.deepEqual(played("together"), [["write", "focus"], ["counted_in=100"]]);
  // The card is the program's: the numbers in thousandths, counted in fresh at the question's unit, no row moved,
  // every binding its own variable.
  const write = result["one-by-one"].lesson.steps[0].beats[0].actions[0];
  assert.deepEqual([write.content.question, write.content.toward, write.content.apart, write.content.amount, write.content.target, write.content.counted_in, write.content.moved_once, write.content.moved_twice],
    ["count", "right", 2, 300, 1, 100, 0, 0]);
  assert.deepEqual(write.content.bindings.map((binding) => binding.target), ["amount", "target", "counted_in", "moved_once", "moved_twice"]);
  assert.ok(write.content.bindings.every((binding) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(binding.expression)));
  const ranges = Object.fromEntries(result["one-by-one"].lesson.lesson.variables.map((variable) => [short(variable.as), [variable.initial, variable.min, variable.max]]));
  // Each range spans the lesson's problem and the practice's (counted in: both paths); a row set runs 0 to 511.
  assert.deepEqual(ranges, { amount: [300, 300, 5000], target: [1, 1, 10], counted_in: [100, 1, 1000], moved_once: [0, 0, 511], moved_twice: [0, 0, 511] });
  const times = result.times.lesson.steps[0].beats[0].actions[0].content;
  assert.deepEqual([times.question, times.amount, times.target, times.counted_in, "moved_twice" in times], ["times", 700_000, 70_000, 100_000, false]);
});

test("a demonstration in the card's own moment plays no earlier than the card is written (as #184)", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { timesTenPlan } = await import(${here("./sample-plans.mjs")});
    const { judgePlaceValueTimesTen } = await import(${here("../scripts/place-value-times-ten-judge.mjs")});
    const out = {};
    const item = { id: "PF-12", expect: { need: "35P-04", ask: "count", amount: "0.2", start: "0.1", target: "0.001", result: "200" } };
    // [name, the create's timing, the animate's timing, restart_numbers in the create's moment]
    for (const [name, create, animate, restart] of [["after-during", "after_speech", "during_speech"], ["none-before", undefined, "before_speech"],
      ["same", undefined, "during_speech"], ["restart", undefined, "during_speech", [5]]]) {
      const plan = timesTenPlan({ amount: 0.2, target: 0.001, practice: [5, 0.01], steps: [] });
      const moment = plan.sections[0].moments[0];
      if (create) moment.actions[0].timing = create; else delete moment.actions[0].timing;
      moment.actions.push({ action: "animate", number: 5, end_value: 0.001, duration_intent: "brief", timing: animate });
      if (restart) moment.restart_numbers = restart;
      try {
        const compiled = api.compileAndValidateLessonPlan(plan, { language: "en-US" });
        const beat = compiled.lesson.steps[0].beats[0];
        const verdict = judgePlaceValueTimesTen(item, compiled.lesson);
        out[name] = { beat: beat.actions.map((action) => action.do + "@" + (action.when ?? "during_speech")), start: beat.start ?? null, pass: verdict.pass, failed: verdict.checks.filter((check) => !check.pass) };
      } catch (error) { out[name] = { code: error.code, capability: error.capability, message: error.message }; }
    }
    console.log(JSON.stringify(out));
  `);
  assert.deepEqual(result["after-during"], { beat: ["write@after_speech", "focus@after_speech", "animate@after_speech"], start: null, pass: true, failed: [] });
  assert.deepEqual(result["none-before"], { beat: ["write@during_speech", "focus@after_speech", "animate@during_speech"], start: null, pass: true, failed: [] });
  assert.equal(result.same.pass, true);
  // A replay of the card's own number in the moment that draws it: nothing to restart, the card opens fresh.
  assert.deepEqual(result.restart, { beat: ["write@during_speech", "focus@after_speech", "animate@during_speech"], start: null, pass: true, failed: [] });
});

test("the practice is the learner's own problem, worked by taps; then the card's answer row", () => {
  const result = withTrial(compileScript([
    ["en", { amount: 0.3, target: 0.001, practice: [5, 0.01] }, "en-US"],
    ["zh", { amount: 700, target: 70, practice: [4000, 400] }, "zh-CN"],
    ["together", { amount: 0.4, target: 0.1, start: 0.01, practice: [0.7, 0.1] }, "en-US"],
    // Words that write the practice's count give it away: the task is dropped and recorded, the lesson kept.
    ["leak", { amount: 0.3, target: 0.001, practice: [5, 0.01], prompt: "5 ones are 500 hundredths." }, "en-US"],
    ["leak-hint", { amount: 700, target: 70, practice: [4000, 400], hints: ["4000 里有４０个百。"] }, "zh-CN"],
    // Writing the practice's own numbers, or 10, is fine.
    ["numbers-words", { amount: 0.3, target: 0.001, practice: [5, 0.01], prompt: "Now count 5 in hundredths (0.01): ten of one place make one of the next." }, "en-US"],
    // 10 is the rule's own number: a practice whose count is 10 (1 one = 10 tenths) keeps its task when the words
    // say 10 (review of #187). A times pair's renamed count is never 10 (100 and 10 is a count).
    ["ten-count", { amount: 0.7, target: 0.01, practice: [1, 0.1], prompt: "10 of one place make 1 of the next: count 1 in tenths." }, "en-US"],
    // A model's typed question in a later section stays as written.
    ["typed", { amount: 0.3, target: 0.001, practice: [5, 0.01], typed: { prompt: "How many thousandths are in 0.3?", answer: "300" } }, "en-US"],
  ]));
  const [task, row] = result.en.lesson.lesson.tasks;
  const card = task.completion.node;
  assert.deepEqual(task.allowed_operations, [{ kind: "card_tap", node: card }]);
  assert.deepEqual(task.completion, { kind: "card_fact", node: card, fact: "complete" });
  // The practice starts fresh on its own problem: counted in at its own start unit, no row moved.
  const values = Object.entries(task.start.values).map(([name, value]) => [short(name), value]);
  assert.deepEqual([task.start.kind, values], ["practice", [["amount", 5000], ["target", 10], ["counted_in", 1000], ["moved_once", 0], ["moved_twice", 0]]]);
  // Then the card's own row, anchored on it (OLL ties it to the card): one blank, the count.
  assert.equal(row.as, `${task.as}-2`);
  assert.deepEqual([row.prompt, row.anchor, row.allowed_operations, row.hints], ["Write how many.", card, [{ kind: "row_entry" }], ["Count the target column."]]);
  assert.deepEqual(row.completion.parts.filter((part) => part.blank).map((part) => [part.blank.as, part.blank.answer]), [["count", "500"]]);
  assert.match(row.success_message, /500/u);
  // A times pair: the renamed count, then 10.
  const [zhTask, zhRow] = result.zh.lesson.lesson.tasks;
  assert.deepEqual(Object.values(zhTask.start.values), [4_000_000, 400_000, 1_000_000, 0]);
  assert.deepEqual([zhRow.prompt, zhRow.completion.parts.filter((part) => part.blank).map((part) => [part.blank.as, part.blank.answer]), zhRow.hints],
    ["写出答案。", [["renamed", "40"], ["times", "10"]], ["先数一个小的数里有几个，再数有几个小的数。"]]);
  // A put-together practice starts at its own named unit (0.7 = 70 hundredths, up to tenths).
  const [togetherTask] = result.together.lesson.lesson.tasks;
  assert.deepEqual(Object.values(togetherTask.start.values), [700, 100, 10, 0]);
  for (const id of ["leak", "leak-hint"]) {
    assert.deepEqual(result[id].lesson.lesson.tasks, undefined, id);
    assert.deepEqual(result[id].adjustments.map((adjustment) => [adjustment.kind, adjustment.reason]), [["activity_removed", "practice_answer_in_words"]], id);
  }
  assert.deepEqual(result["numbers-words"].lesson.lesson.tasks.map((each) => each.completion.kind), ["card_fact", "numeric_row"]);
  for (const id of ["ten-count"]) {
    assert.deepEqual(result[id].lesson.lesson.tasks.map((each) => each.completion.kind), ["card_fact", "numeric_row"], id);
    assert.ok(result[id].lesson.lesson.tasks[1].completion.parts.some((part) => part.blank?.answer === "10"), id);
  }
  assert.deepEqual(result.typed.lesson.lesson.tasks.map((each) => [each.completion.kind, each.completion.answer]), [["card_fact", undefined], ["numeric_row", undefined], ["numeric_answer", "300"]]);
});

test("refusals name their reason and the card, so only the picture can be lost; none reaches OLL", () => {
  const result = withTrial(compileScript([
    ["two-digits", { amount: 2.5, target: 0.1, practice: [5, 0.01] }, "en-US"],
    ["too-far", { amount: 1000, target: 0.1, practice: [5, 0.01] }, "en-US"],
    ["same-unit", { amount: 0.4, target: 0.1, start: 0.1, practice: [0.7, 0.1] }, "en-US"],
    ["no-start", { amount: 0.4, target: 0.1, start: 0, practice: [0.7, 0.1] }, "en-US"],
    ["practice-same", { amount: 0.3, target: 0.001, practice: [0.3, 0.001] }, "en-US"],
    ["practice-swapped", { amount: 700, target: 70, practice: [70, 700] }, "en-US"],
    ["practice-shape", { amount: 0.3, target: 0.001, practice: [5, 0.5] }, "en-US"],
    ["back", { amount: 0.3, target: 0.001, practice: [5, 0.01], steps: [0.01, 0.1] }, "en-US"],
    ["off-path", { amount: 0.3, target: 0.001, practice: [5, 0.01], steps: [0.05] }, "en-US"],
  ]));
  const expect = {
    "two-digits": /the question: .*not_one_digit/,
    "too-far": /the question: .*too_far/,
    "same-unit": /the unit asked \(the second number\) is the unit the question asks for and the start unit \(the fifth number\) the unit it counts the amount in: 40 hundredths = \? tenths is 0.4, 0.1, then the practice, then 0.01/,
    "no-start": /the start unit \(the fifth number\) is the unit the question counts the amount in, not the unit asked/,
    "practice-same": /the practice is the learner's own: another amount or unit asked than the question's/,
    "practice-swapped": /the practice is the learner's own/,
    "practice-shape": /the practice is another count two places to the right \(breaking\), like the question's/,
    back: /never back to 0.1; from 0.01 the next values are 0.001/,
    "off-path": /0.05 is not one of its values; from 0.1 the next values are 0.01 or 0.001/,
  };
  for (const [id, pattern] of Object.entries(expect)) {
    assert.match(result[id].message ?? "", pattern, id);
    assert.notEqual(result[id].error, "LESSON_PLAN_OLL_SEMANTIC", id);
    assert.equal(result[id].capability, "place_value_times_ten", id);
  }
});

test("counted in written where the amount cannot start is read over, never refused: the card opens fresh at the amount's own place", () => {
  const result = withTrial(compileScript([
    ["zero", { amount: 0.3, target: 0.001, start: 0, practice: [5, 0.01] }, "en-US"],
    ["on-the-path", { amount: 0.3, target: 0.001, start: 0.01, practice: [5, 0.01] }, "en-US"],
    ["times", { amount: 700, target: 70, start: 70, practice: [4000, 400] }, "en-US"],
    // A unit the amount can start in decides the problem: 500 thousandths put together into tenths. (The two never
    // compete: a put-together's target is the amount's own place, where the amount's own count has nowhere to go.)
    ["together", { amount: 0.5, target: 0.1, start: 0.001, practice: [0.3, 0.1] }, "en-US"],
    // A breaking question's start is the program's: a breaking start other than the amount's own place is read over
    // (40 hundredths for 0.4 counted to thousandths: drawn as 4 tenths, same count). A fifth number written as the
    // unit asked is not (below: the numbers cannot say which question was meant).
    ["smaller-start", { amount: 0.4, target: 0.001, start: 0.01, practice: [0.6, 0.001] }, "en-US"],
  ]));
  const card = (id) => { const content = result[id].lesson.steps[0].beats[0].actions[0].content; return [content.question, content.toward, content.apart, content.counted_in]; };
  for (const id of ["zero", "on-the-path"]) assert.deepEqual(card(id), ["count", "right", 2, 100], id);
  assert.deepEqual(card("smaller-start"), ["count", "right", 2, 100]);
  assert.deepEqual(card("times"), ["times", "right", 1, 100_000]);
  assert.deepEqual(card("together"), ["count", "left", 2, 1]);
});

test("a moment that animates the card's fixed numbers: refused with a fact by default; behind the flag, the rest play and the left-out one is recorded (PF-10)", () => {
  // PF-10's second outline: 6,000 and 600 (a times pair); a section animated the amount to 60,000 with counted in
  // to 600 in one moment, then counted in to 60,000.
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { timesTenPlan } = await import(${here("./sample-plans.mjs")});
    const out = {};
    // Behind the recipe's flag (pilot 1, 2026-11-27: refused by default), the moves are left out as since #188.
    const mode = (each) => { api.LESSON_PLAN_CAPABILITY_REGISTRY.place_value_times_ten.wrong_number_moves = each; };
    mode("refused");
    {
      const plan = timesTenPlan({ amount: 6000, target: 600, practice: [8000, 800], steps: [] });
      plan.numbers[0].max = 60000;
      plan.sections[0].moments.push({ narration: "Now watch.", actions: [{ action: "animate", number: 1, end_value: 60000, duration_intent: "brief", timing: "during_speech" }] });
      try { api.compileAndValidateLessonPlan(plan, { language: "zh-CN" }); out.refused = { compiled: true }; }
      catch (error) { out.refused = { code: error.code, capability: error.capability, message: error.message }; }
    }
    mode("left_out");
    // [name, [number, value, timing]...]
    for (const [name, animations] of [["amount", [[1, 60000], [5, 600]]], ["practice", [[3, 9000]]], ["off-path", [[5, 60000]]],
      ["timing", [[1, 60000, "before_speech"], [5, 600, "after_speech"]]], ["twice", [[1, 60000], [1, 70000], [5, 600]]]]) {
      const plan = timesTenPlan({ amount: 6000, target: 600, practice: [8000, 800], steps: [] });
      for (const [number, value] of animations) plan.numbers[number - 1].max = Math.max(plan.numbers[number - 1].max, value);
      plan.sections[0].moments.push({ narration: "Now watch.", actions: animations.map(([number, value, timing]) => ({ action: "animate", number, end_value: value, duration_intent: "brief", timing: timing ?? "during_speech" })) });
      try {
        const compiled = api.compileAndValidateLessonPlan(plan, { language: "zh-CN" });
        const beat = compiled.lesson.steps[0].beats.at(-1).actions;
        out[name] = { beat: beat.map((action) => action.do === "animate" ? action.value : action.do), when: beat.map((action) => action.when ?? "during_speech"), adjustments: compiled.view_adjustments.map((each) => each.reason + ": " + each.detail) };
      } catch (error) { out[name] = { code: error.code, capability: error.capability, message: error.message }; }
    }
    console.log(JSON.stringify(out));
  `);
  assert.deepEqual([result.refused.code, result.refused.capability], ["LESSON_PLAN_CARD_NUMBER_STAYS", "place_value_times_ten"]);
  assert.match(result.refused.message, /lesson number 1 is the times-ten card's amount 6000, which stays as written; the demonstration moves lesson number 5, the start unit$/u);
  assert.deepEqual(result.amount.beat, [600_000]);
  assert.deepEqual(result.amount.adjustments, ["animation_left_out: $lessonPlan.sections[0].moments[1].actions[0]: the amount, the unit asked and the practice stay as written: the demonstration moves only the start unit, counted in (the card's fifth lesson number); left out"]);
  // Only a fixed number: the moment still looks at the card.
  assert.deepEqual([result.practice.beat, result.practice.adjustments.length], [["focus"], 1]);
  // The moves play at the timing of the first animation that plays, not the left-out one's (review of #188).
  assert.deepEqual([result.timing.beat, result.timing.when], [[600_000], ["after_speech"]]);
  // Each left-out animation is recorded at its own offset.
  assert.deepEqual(result.twice.adjustments.map((each) => /actions\[(\d+)\]/u.exec(each)[1]), ["0", "1"]);
  assert.deepEqual(result.twice.beat, [600_000]);
  // Counted in off its path is still refused, with the card's tag (a section can fix it).
  assert.equal(result["off-path"].capability, "place_value_times_ten");
  assert.match(result["off-path"].message, /1000 \(thousands\) -> 600; 60000 is not one of its values; from 1000 the next values are 600/);
});

test("a replay lays the card fresh again: its own variables only, counted in back at the question's unit", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { timesTenPlan } = await import(${here("./sample-plans.mjs")});
    const plan = timesTenPlan({ amount: 0.3, target: 0.001, practice: [5, 0.01], steps: [0.01, 0.001] });
    plan.sections[0].moments.push({ narration: "Once more from the start.", restart_numbers: [5], actions: [{ action: "animate", number: 5, end_value: 0.01, duration_intent: "brief", timing: "during_speech" }] });
    const compiled = api.compileAndValidateLessonPlan(plan, { language: "en-US" });
    console.log(JSON.stringify({ variables: compiled.lesson.lesson.variables, beat: compiled.lesson.steps[0].beats.at(-1) }));
  `);
  // The replay restarts every variable of the card at its start: counted in at 0.1, no row moved.
  const names = result.variables.map((variable) => variable.as);
  assert.deepEqual(result.beat.start.variables, names);
  assert.deepEqual(result.variables.map((variable) => [short(variable.as), variable.initial]), [["amount", 300], ["target", 1], ["counted_in", 100], ["moved_once", 0], ["moved_twice", 0]]);
  assert.equal(result.beat.start.values, undefined, "each variable back at its initial value");
  assert.deepEqual(result.beat.actions.map((action) => [action.do, action.value]), [["animate", 10]]);
});

test("section facts: the card in its own terms, once it is drawn", () => {
  const facts = api.SECTION_FACTS.place_value_times_ten;
  const numbers = [0.3, 0.001, 5, 0.01, 0.1].map((initial) => ({ initial, min: 0, max: 5 }));
  assert.deepEqual(facts({ section: 1, mode: "create", numbers, state: new Map() }), {});
  const established = { capability: "place_value_times_ten", parameters: {}, numbers: [1, 2, 3, 4, 5] };
  const half = facts({ section: 2, mode: "reuse", established, numbers, state: new Map([[5, 0.01]]), language: "en-US" }).facts;
  assert.deepEqual(half, {
    numbers: [1, 2, 3, 4, 5], question: "count", amount: 0.3, unit_asked: 0.001, answer: { count: 300 },
    counted_in_path: [0.1, 0.01, 0.001], counted_in_now: 0.01,
    // Where the demonstration goes: counted in to the unit asked (owner, 2026-11-27; information only).
    demonstration_to: { counted_in: 0.001 },
    chart_now: [
      { column: "Tenths", disks: 0, rows_of_ten: 0, squares: 0 },
      { column: "Hundredths", disks: 0, rows_of_ten: 3, squares: 0 },
      { column: "Thousandths", disks: 0, rows_of_ten: 0, squares: 0 },
    ],
    next: [{ value: 0.001, does: "Break every hundredth into ten thousandths." }],
    after_class_practice: [5, 0.01],
  });
  const start = facts({ section: 2, mode: "reuse", established, numbers, state: new Map(), language: "zh-CN" }).facts;
  assert.deepEqual([start.counted_in_now, start.next.map((each) => each.value), start.next[0].does], [0.1, [0.01, 0.001], "把每个十分之一拆成十个百分之一。"]);
  const times = facts({ section: 3, mode: "reuse", established, numbers: [700, 70, 4000, 400, 100].map((initial) => ({ initial, min: 0, max: 5000 })), state: new Map([[5, 70]]), language: "en-US" }).facts;
  assert.deepEqual([times.question, times.answer, times.counted_in_path, times.reached_target, "next" in times], ["times", { renamed: 70, times: 10 }, [100, 70], true, false]);
  // Read as the card reads its field: whole steps along the path (between two values is the earlier).
  assert.deepEqual([0.05, 0.001, 7].map((value) => facts({ section: 2, mode: "reuse", established, numbers, state: new Map([[5, value]]), language: "en-US" }).facts.counted_in_now), [0.1, 0.001, 0.1]);
  // Numbers the card does not take: no facts.
  assert.deepEqual(facts({ section: 2, mode: "reuse", established, numbers: [2.5, 0.1, 5, 0.01, 1].map((initial) => ({ initial, min: 0, max: 5 })), state: new Map(), language: "en-US" }), {});
});

test("with the trial on, the model's first request describes the card; without it, nothing changes", () => {
  const capture = `
    const api = await import(${here("../lesson-plan.js")});
    let request;
    await api.generateLessonPlanWithModel(async (next) => { request = next; throw new Error("capture"); },
      { turn_id: "times-ten", learner_request: "How many thousandths are in 3 tenths?", language: "en-US" }, { max_attempts_per_part: 1 }).catch(() => {});
    console.log(JSON.stringify({ text: JSON.stringify(request), bytes: Buffer.byteLength(request.prompt) }));
  `;
  const on = withTrial(capture), off = withTrial(capture, "");
  assert.ok(on.text.includes("count_in_another_unit"));
  assert.ok(on.text.includes("换一个单位来数"));
  assert.equal(off.text.includes("place_value_times_ten"), false);
  console.log(`times-ten trial: first request prompt (UTF-8 bytes) +${on.bytes - off.bytes} B (${off.bytes} -> ${on.bytes})`);
});

// A stubbed generation run, the outline declaring only the card's four numbers (or also counted in): the program
// supplies counted in at the amount's own place, the section draws the card and counts in thousandths.
const stubbedRun = ({ outlineNumbers = 4, language = "en-US", steps = [0.01, 0.001] } = {}) => withTrial(`
  const api = await import(${here("../lesson-plan.js")});
  const { timesTenPlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
  const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
  const { judgePlaceValueTimesTen } = await import(${here("../scripts/place-value-times-ten-judge.mjs")});
  const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
  const plan = makeSamplePlanModelCompatible(timesTenPlan({ amount: 0.2, target: 0.001, practice: [5, 0.01], steps: ${JSON.stringify(steps)} }));
  const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
  const outline = stagedOutline(plan, drafts);
  outline.numbers = outline.numbers.slice(0, ${outlineNumbers});
  const requests = [], adjustments = [];
  let generated, error;
  try {
    generated = await api.generateLessonPlanWithModel(async (request) => {
      requests.push(request);
      if (requests.length > 6) throw new Error("unexpected extra model request");
      if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
      if (request.label === "lesson-plan-outline") throw new Error("replacement outline asked");
      return JSON.stringify(drafts[request.section - 1]);
    }, { turn_id: "times-ten", learner_request: "2个十分之一等于几个千分之一？女儿说是20个。", language: ${JSON.stringify(language)} }, {
      max_attempts_per_part: 3, on_program_adjustment: (adjustment) => adjustments.push(adjustment),
    });
  } catch (caught) { error = caught.message; }
  const item = { id: "PF-12", expect: { need: "35P-04", ask: "count", amount: "0.2", start: "0.1", target: "0.001", result: "200" } };
  console.log(JSON.stringify(generated ? {
    beats: generated.lesson.steps[0].beats.map((beat) => beat.actions.map((action) => action.do === "animate" ? action.value : action.do)),
    card: generated.lesson.steps[0].beats[0].actions[0].content, tasks: generated.lesson.lesson.tasks, plugins: generated.plugins,
    later: requests.slice(1).map((request) => request.prompt).join("\\n"), verdict: judgePlaceValueTimesTen(item, generated.lesson),
    adjustments: adjustments.map(({ kind, reason }) => ({ kind, reason })),
  } : { error }));
`);

test("a stubbed generation run: the outline's four numbers, the program's counted in, the card counted to thousandths, the practice and its row", () => {
  for (const outlineNumbers of [4, 5]) {
    const result = stubbedRun({ outlineNumbers });
    assert.ok(!result.error, `${outlineNumbers}: ${result.error}`);
    assert.deepEqual(result.beats, [["write", "focus"], [10], [1]], `${outlineNumbers}`);
    assert.deepEqual([result.card.amount, result.card.target, result.card.counted_in, result.card.moved_once, result.card.moved_twice], [200, 1, 100, 0, 0], `${outlineNumbers}`);
    assert.deepEqual(result.tasks.map((task) => [task.completion.kind, task.completion.fact]), [["card_fact", "complete"], ["numeric_row", undefined]], `${outlineNumbers}`);
    assert.deepEqual(result.plugins, { math: "0.11.0", shared: "0.1.0" });
    assert.deepEqual(result.verdict.checks.filter((check) => !check.pass), [], `${outlineNumbers}`);
    assert.deepEqual(result.verdict.notes.filter((note) => !note.pass), [], `${outlineNumbers}`);
    assert.deepEqual(result.adjustments, [], `${outlineNumbers}`);
    // Section 2 is told where the demonstration stands.
    for (const fact of ['"reached_target":true', '"counted_in_now":0.001', '"after_class_practice":[5,0.01]']) assert.ok(result.later.includes(fact), `${outlineNumbers}: ${fact}`);
  }
});

test("a replay before a card is drawn is left out and recorded, never the lesson (times ten and make ten; review of #187)", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { timesTenPlan, makeTenPlan } = await import(${here("./sample-plans.mjs")});
    // A moment before the card's own that replays the card's fifth number.
    const early = (plan) => {
      const moments = plan.sections[0].moments;
      for (const action of moments[0].actions) for (const ref of action.references ?? []) if (ref.source === "local_board_item") ref.moment = 2;
      moments.unshift({ narration: "Before the card.", restart_numbers: [5], actions: [{ action: "teacher_expression", expression: "neutral" }] });
      return plan;
    };
    const out = {};
    for (const [name, plan] of [["times", early(timesTenPlan({ amount: 0.3, target: 0.001, practice: [5, 0.01] }))], ["make", early(makeTenPlan({ numbers: [8, 6], practice: [7, 5] }))]]) {
      try {
        const compiled = api.compileAndValidateLessonPlan(plan, { language: "en-US" });
        out[name] = { first: compiled.lesson.steps[0].beats[0], adjustments: compiled.view_adjustments.map((adjustment) => adjustment.reason), tasks: compiled.lesson.lesson.tasks.length };
      } catch (error) { out[name] = { code: error.code, capability: error.capability, message: error.message }; }
    }
    console.log(JSON.stringify(out));
  `, "place_value_times_ten,make_ten");
  for (const name of ["times", "make"]) {
    assert.deepEqual(result[name].first, { key: "moment-01", say: "Before the card.", actions: [{ do: "expression", expression: "neutral" }] }, name);
    assert.deepEqual(result[name].adjustments, ["restart_before_card"], name);
    assert.equal(result[name].tasks, 2, name);
  }
});

test("the card's numbers keep their own ranges: a picture on its amount gets a copy, one on its practice is refused with a fact (review of #187)", () => {
  // The fit: each of the four numbers from 0 to its value; counted in over the problem's path.
  const fit = (values) => {
    const plan = { numbers: values.map((initial) => ({ initial, min: -5, max: 9_999_999, student_control: { kind: "slider", step: 1 } })) };
    api.RECIPE_HOOKS.place_value_times_ten.fit_numbers({ capability: "place_value_times_ten", parameters: {}, numbers: [1, 2, 3, 4, 5] }, plan);
    return plan.numbers.map((number) => [number.min, number.max, "student_control" in number]);
  };
  assert.deepEqual(fit([0.3, 0.001, 5, 0.01, 0.1]), [[0, 0.3, false], [0, 0.001, false], [0, 5, false], [0, 0.01, false], [0.001, 0.1, false]]);
  assert.deepEqual(fit([0.4, 0.1, 0.7, 0.1, 0.01]), [[0, 0.4, false], [0, 0.1, false], [0, 0.7, false], [0, 0.1, false], [0.01, 0.1, false]]);
  assert.deepEqual(fit([700, 70, 4000, 400, 100]), [[0, 700, false], [0, 70, false], [0, 4000, false], [0, 400, false], [70, 100, false]]);
  assert.deepEqual(fit([0.3, 0.001, 5, 0.01, 0]).at(-1), [0, 0.1, false], "a start read over still lies in the range");
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { timesTenPlan } = await import(${here("./sample-plans.mjs")});
    const out = {};
    for (const number of [1, 3]) {
      const plan = timesTenPlan({ amount: 0.3, target: 0.001, practice: [5, 0.01] });
      plan.sections[0].moments.unshift({ narration: "A line first.", actions: [{ action: "create", kind: "visual", role: "main_visual", content: { capability: "number_line", parameters: {}, numbers: [number] }, placement: { relation: "new_region" } }] });
      for (const action of plan.sections[0].moments[1].actions) for (const ref of action.references ?? []) if (ref.source === "local_board_item") ref.moment = 2;
      try {
        const compiled = api.compileAndValidateLessonPlan(plan, { language: "en-US" });
        out[number] = { compiled: true, line: compiled.lesson.lesson.variables.find((variable) => variable.as === "number_01"), copied: compiled.view_adjustments.filter((each) => each.reason === "number_copied").length };
      } catch (error) { out[number] = { code: error.code, capability: error.capability, message: error.message }; }
    }
    console.log(JSON.stringify(out));
  `);
  // The line drew first and keeps number 1 with the outline's range; the card reads a copy of its own.
  assert.equal(result[1].compiled, true, JSON.stringify(result[1]));
  assert.equal(result[1].copied, 1);
  assert.ok(result[1].line, "the line's number 1 is declared, for the line");
  // The practice is the learner's: never copied, refused with a fact. The fault names the other picture (it is in the
  // card's section), which goes at once, as on the other cards (failSharedTapCardNumbers).
  assert.deepEqual([result[3].code, result[3].capability], ["LESSON_PLAN_SHARED_NUMBER", "number_line"]);
  assert.match(result[3].message, /lesson number 3 is the times-ten card's practice number, which the learner works after class; the number_line visual shows it too/);
});

test("a put-together question whose outline leaves out counted in loses the card at once, never a section's attempts", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { timesTenPlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
    const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
    const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
    const plan = makeSamplePlanModelCompatible(timesTenPlan({ amount: 0.4, target: 0.1, start: 0.01, practice: [0.7, 0.1], steps: [0.1] }));
    const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
    const outline = stagedOutline(plan, drafts);
    outline.numbers = outline.numbers.slice(0, 4);
    const requests = [], adjustments = [];
    await api.generateLessonPlanWithModel(async (request) => {
      requests.push(request.label);
      if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
      throw new Error("stop");
    }, { turn_id: "times-ten", learner_request: "40个百分之一合起来是几个十分之一？为什么？", language: "zh-CN" }, {
      max_attempts_per_part: 3, on_program_adjustment: (adjustment) => adjustments.push(adjustment),
    }).catch(() => {});
    console.log(JSON.stringify({ requests, adjustments: adjustments.map(({ kind, reason, capability }) => ({ kind, reason, capability })) }));
  `);
  // The card goes as the outline is read (it starts on five numbers, the outline declares four), so no section is
  // asked for a number it cannot add; the program then asks for the outline again, as for any lost picture.
  assert.deepEqual(result.adjustments, [{ kind: "visual_removed", reason: "outline_numbers_missing", capability: "place_value_times_ten" }]);
  assert.deepEqual(result.requests.filter((label) => label === "lesson-plan-section"), []);
});

// An outline whose numbers the card cannot start on (objective run 1): [plan options, numbers the outline keeps, the
// request]. The stub answers the first request and stops at the next, recording which parts were asked for.
const outlineRun = (cases) => withTrial(`
  const api = await import(${here("../lesson-plan.js")});
  const { timesTenPlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
  const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
  const { bootstrapModelResponse, bootstrapSectionFromExact, stagedOutline, toModelSectionDraft } = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
  const out = {};
  // A leading lesson number the card does not bind (written first), then the card's five (review of #188).
  const shift = (plan) => {
    plan.numbers = [{ initial: 2, min: 0, max: 9, label: "a number" }, ...plan.numbers];
    for (const section of plan.sections) for (const moment of section.moments) for (const action of moment.actions) {
      if (action.action === "animate") action.number += 1;
      if (action.action === "create" && action.kind === "visual" && action.content.numbers) action.content.numbers = action.content.numbers.map((n) => n + 1);
    }
    for (const section of plan.sections) for (const activity of section.student_activities ?? []) for (const control of activity.number_controls ?? []) control.number += 1;
    return plan;
  };
  for (const [name, options, keep, learnerRequest, shifted] of ${JSON.stringify(cases)}) {
    const written = timesTenPlan(options);
    const plan = makeSamplePlanModelCompatible(shifted ? shift(written) : written);
    const drafts = plan.sections.map(({ moments, student_activities }, index) => toModelSectionDraft({ section: index + 1, version: plan.version, moments, student_activities }));
    const outline = stagedOutline(plan, drafts);
    outline.numbers = outline.numbers.slice(0, keep);
    const requests = [], adjustments = [];
    await api.generateLessonPlanWithModel(async (request) => {
      requests.push(request.label);
      if (request.label === "lesson-plan-bootstrap") return bootstrapModelResponse(request, outline, bootstrapSectionFromExact(outline, drafts[0]));
      throw new Error("stop");
    }, { turn_id: "times-ten-" + name, learner_request: learnerRequest, language: "zh-CN" }, {
      max_attempts_per_part: 3, on_program_adjustment: (adjustment) => adjustments.push(adjustment),
    }).catch(() => {});
    out[name] = { requests, adjustments: adjustments.map(({ kind, reason, capability, detail }) => ({ kind, reason, capability, detail })) };
  }
  console.log(JSON.stringify(out));
`);

test("numbers the card cannot start on take it out as the outline is read, before any section call (PF-05, PF-15, PF-17)", () => {
  const result = outlineRun([
    // PF-05: the unit asked written as the unit the question names (40 hundredths = ? tenths as 0.4, 0.01, ..., 0.01).
    // Read over, it would draw the reverse question (4 tenths = ? hundredths), so a fifth number equal to the unit
    // asked is refused, the refusal stating both readings (review of #192).
    ["PF-05", { amount: 0.4, target: 0.01, start: 0.01, practice: [0.6, 0.01], steps: [0.1] }, 5, "40个百分之一合起来是几个十分之一？为什么？"],
    // PF-01 (35P-04 run 2): how many tens in 1,000, the fifth number written as the unit asked: the same signature,
    // refused the same way (the breaking reading needs no fifth number).
    ["PF-01", { amount: 1000, target: 10, start: 10, practice: [2000, 10], steps: [100, 10] }, 5, "How many tens are in one thousand? My kid insists it's ten."],
    // Numbers no start can fix: a put-together question with the start unit written as the unit asked.
    ["same-unit", { amount: 0.4, target: 0.1, start: 0.1, practice: [0.7, 0.1], steps: [0.1] }, 5, "40个百分之一合起来是几个十分之一？为什么？"],
    // PF-15: the card chosen with no outline numbers at all.
    ["PF-15", { amount: 0.4, target: 0.04, practice: [7, 0.7], steps: [0.04] }, 0, "0.4 里的 4 和 0.04 里的 4 差多少倍？哪个是哪个的十分之一？"],
    // PF-17 (a near miss): a whole numeral, 4.37 and 437.
    ["PF-17", { amount: 4.37, target: 437, start: 1, practice: [2.5, 250], steps: [437] }, 5, "4.37 乘 100 以后，孩子不明白为什么数字整体往左挪了两格。"],
    // A put-together question written right: kept, and section 1 is asked for.
    ["kept", { amount: 0.4, target: 0.1, start: 0.01, practice: [0.7, 0.1], steps: [0.1] }, 5, "40个百分之一合起来是几个十分之一？为什么？"],
    // An outline with a number of its own before the card's five ([2, 0.3, 0.001, 5, 0.01, 0.1]): the card's numbers
    // are not surely the first five, so it is not judged at the outline; it is kept (review of #188).
    ["shifted", { amount: 0.3, target: 0.001, practice: [5, 0.01], steps: [0.01, 0.001] }, 6, "3个十分之一是几个千分之一？", true],
  ]);
  const removed = (name) => result[name].adjustments.map(({ kind, reason, capability }) => ({ kind, reason, capability }));
  for (const name of ["same-unit", "PF-17", "PF-05", "PF-01"]) {
    assert.deepEqual(removed(name), [{ kind: "visual_removed", reason: "outline_numbers_refused", capability: "place_value_times_ten" }], name);
    assert.deepEqual(result[name].requests, ["lesson-plan-bootstrap", "lesson-plan-outline"], name);
  }
  assert.match(result["same-unit"].adjustments[0].detail, /cannot start on the outline's numbers: .*the unit asked \(the second number\) is the unit the question asks for/);
  assert.match(result["PF-17"].adjustments[0].detail, /not_one_digit/);
  // Both readings, in the roles' words.
  assert.match(result["PF-05"].adjustments[0].detail, /the start unit 0.01 is the unit asked 0.01: a question that breaks 0.4 into hundredths starts at the amount's own place \(0.1\) and needs no fifth number; a question that puts 0.4 of hundredths together asks for a larger unit \(0.1\) and starts at 0.01/);
  assert.match(result["PF-01"].adjustments[0].detail, /the start unit 10 is the unit asked 10: a question that breaks 1000 into tens starts at the amount's own place \(1000\) and needs no fifth number/);
  assert.deepEqual(removed("PF-15"), [{ kind: "visual_removed", reason: "outline_numbers_missing", capability: "place_value_times_ten" }]);
  assert.deepEqual(result["PF-15"].requests, ["lesson-plan-bootstrap", "lesson-plan-outline"]);
  for (const name of ["kept", "shifted"]) {
    assert.deepEqual(result[name].adjustments, [], name);
    assert.ok(!result[name].requests.includes("lesson-plan-outline"), `${name}: ${JSON.stringify(result[name].requests)}`);
  }
});

test("the fixed sample (used for request hashes with the trial on) compiles through the full OLL validation", () => {
  const result = withTrial(`
    const api = await import(${here("../lesson-plan.js")});
    const { samplePlan, makeSamplePlanModelCompatible } = await import(${here("./sample-plans.mjs")});
    const compiled = api.compileAndValidateLessonPlan(makeSamplePlanModelCompatible(samplePlan("place_value_times_ten")), { language: "en-US" });
    console.log(JSON.stringify({ kinds: compiled.lesson.lesson.tasks.map((task) => task.completion.kind), adjustments: compiled.program_adjustments }));
  `);
  assert.deepEqual(result, { kinds: ["card_fact", "numeric_row"], adjustments: [] });
});
