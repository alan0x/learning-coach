// The judges of the cards that take a second card (make ten, the trade card, times ten; Coach #199): the first card
// holds the question and the practice; one later card of the kind at most, which must show another example than the
// question's and the practice's and keep it at every state (a revision, a replay, a task's start), speak the lesson's
// language, open fresh, play its demonstration forward to its end by a move forward (not a replay), and have no task
// anchored on it. Lessons are made by Coach itself (stubbed replies, no model calls), then changed one fault at a time.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { judgeMakeTen } from "../scripts/make-ten-judge.mjs";
import { judgePlaceValueTrade } from "../scripts/place-value-trade-judge.mjs";
import { judgePlaceValueTimesTen } from "../scripts/place-value-times-ten-judge.mjs";
import { secondCardsText } from "../scripts/judge-cards.mjs";

const here = (path) => JSON.stringify(new URL(path, import.meta.url).href);
/** A three-section lesson Coach makes: the first card in section 1, the second card on `example` in section 2. */
const lessonOf = (kind, example, moves) => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
  const api = await import(${here("../lesson-plan.js")});
  const sp = await import(${here("./sample-plans.mjs")});
  const { modelResponseHelpers } = await import(${here("./model-responses.mjs")});
  const H = modelResponseHelpers(api.LESSON_PLAN_CAPABILITY_REGISTRY);
  const plans = {
    make_ten: () => sp.makeTenPlan({ numbers: [8, 6], practice: [7, 5] }),
    place_value_trade: () => sp.placeValueTradePlan({ operation: "add", numbers: [3486, 2795], practice: [1578, 2645] }),
    place_value_times_ten: () => sp.timesTenPlan({ amount: 0.3, target: 0.001, practice: [5, 0.01] }),
  };
  const plan = plans[${JSON.stringify(kind)}]();
  const card = structuredClone(plan.sections[0].moments[0].actions[0]);
  const demonstration = plan.numbers.length + 1;
  plan.sections[1].reusable_items = [{ kind: "board_item", board_kind: "visual", capability: ${JSON.stringify(kind)} }];
  plan.sections[1].moments.push({ narration: "再看一个例子。", actions: [{ ...card, content: { ...card.content, parameters: { ...(card.content.parameters ?? {}), ...${JSON.stringify(example)} }, numbers: [1, 2] }, reusable_item: 1 }] },
    ...${JSON.stringify(moves)}.map((value) => ({ narration: "看。", actions: [{ action: "animate", number: demonstration, end_value: value, duration_intent: "brief", timing: "during_speech" }] })));
  const compatible = sp.makeSamplePlanModelCompatible(plan);
  const drafts = compatible.sections.map(({ moments, student_activities }, index) => H.toModelSectionDraft({ section: index + 1, version: compatible.version, moments, student_activities }));
  const stage = { outline: H.stagedOutline(compatible, drafts), drafts };
  stage.outline.numbers = stage.outline.numbers.slice(0, plan.numbers.length);
  const generated = await api.generateLessonPlanWithModel(async (request) => request.label === "lesson-plan-bootstrap"
    ? H.bootstrapModelResponse(request, stage.outline, H.bootstrapSectionFromExact(stage.outline, stage.drafts[0]))
    : JSON.stringify(stage.drafts[request.section - 1]), { turn_id: "judges", learner_request: "再讲一个例子", language: "zh-CN" }, { max_attempts_per_part: 3 });
  console.log(JSON.stringify(generated.lesson));
`], { env: { ...process.env, LEARNING_COACH_TRIAL_RECIPES: "make_ten,place_value_trade,place_value_times_ten" }, cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" }));

const SECOND = /\(a second card\)/u;
const secondFailures = (verdict) => verdict.checks.filter((check) => !check.pass && SECOND.test(check.check)).map((check) => check.check.replace(/^.*\(a second card\): /u, ""));
const KINDS = [
  { kind: "make_ten", judge: judgeMakeTen, item: { id: "two", expect: { numbers: ["8", "6"] } }, example: { example_first_addend: 9, example_second_addend: 4 }, moves: [10], shown: "9 + 4",
    practice: { example_first_addend: 5, example_second_addend: 7 }, other: { a: 7, b: 5, filled: 7 }, end: { filled: 10 }, at: 10 },
  { kind: "place_value_trade", judge: judgePlaceValueTrade, item: { id: "two", expect: { operation: "add", numbers: ["3486", "2795"], result: "6281" } },
    example: { example_first_number: 4527, example_second_number: 1396 }, moves: [2, 4], shown: "4527 + 1396", practice: { example_first_number: 2645, example_second_number: 1578 },
    other: { a: 1578000, b: 2645000 }, end: { finished: 4 }, at: 4 },
  { kind: "place_value_times_ten", judge: judgePlaceValueTimesTen, item: { id: "two", expect: { amount: "0.3", target: "0.001", ask: "count" } },
    example: { example_amount: 0.7, example_unit_asked: 0.001 }, moves: [0.01, 0.001], shown: "0.7 in 0.001", other: { amount: 300 }, end: { counted_in: 1 }, at: 1 },
];
const secondCard = (lesson) => lesson.steps.flatMap((step) => step.beats.flatMap((beat) => beat.actions)).filter((action) => action.do === "write" && action.kind === lesson.__kind)[1];

for (const { kind, judge, item, example, moves, shown } of KINDS) {
  test(`${kind}: a second card on its own example passes; the verdict counts it with its example`, () => {
    const lesson = lessonOf(kind, example, moves);
    const verdict = judge(item, lesson);
    assert.deepEqual(secondFailures(verdict), []);
    assert.deepEqual(verdict.second_cards.map((each) => each.example), [shown]);
    assert.equal(secondCardsText(verdict.second_cards), `second cards: 1 (${shown})`);
  });

  test(`${kind}: a second card that stops short, opens played, or has a task on it fails`, () => {
    const short = lessonOf(kind, example, moves.slice(0, -1));
    assert.deepEqual(secondFailures(judge(item, short)), ["its demonstration plays to its end"]);
    const played = lessonOf(kind, example, moves);
    played.__kind = kind;
    const card = secondCard(played);
    const alias = card.content.bindings[0].expression;
    const variable = played.lesson.variables.find((each) => each.as === alias);
    variable.initial = moves.at(-1) === 10 ? 10 : kind === "place_value_trade" ? 4 : 1;
    assert.ok(secondFailures(judge(item, played)).includes("its demonstration opens fresh"), JSON.stringify(secondFailures(judge(item, played))));
    const tasked = lessonOf(kind, example, moves);
    tasked.__kind = kind;
    tasked.lesson.tasks.push({ ...structuredClone(tasked.lesson.tasks[0]), as: "on-second", allowed_operations: [{ kind: "card_tap", node: secondCard(tasked).as }], completion: { ...tasked.lesson.tasks[0].completion, node: secondCard(tasked).as } });
    assert.ok(secondFailures(judge(item, tasked)).includes("no task is anchored on it"));
  });
}

for (const { kind, judge, item, example, moves, practice } of KINDS.filter((each) => each.practice)) {
  test(`${kind}: a second card on the practice pair (the other order) or the question's pair fails`, () => {
    // Coach refuses such an example, so the lesson is changed after it is made: the card shows the pair written over.
    const lesson = lessonOf(kind, example, moves);
    lesson.__kind = kind;
    const card = secondCard(lesson);
    const [x, y] = Object.values(practice);
    const scale = kind === "place_value_trade" ? 1000 : 1;
    Object.assign(card.content, { a: x * scale, b: y * scale });
    if (kind === "make_ten") card.content.filled = Math.max(x, y);
    assert.ok(secondFailures(judge(item, lesson)).includes("its example differs from the question and the practice"), JSON.stringify(secondFailures(judge(item, lesson))));
  });
}

// Review of #201: the second card is read at every state the lesson gives it, as the compare judge reads its cards.
const beatsOf = (lesson) => lesson.steps.flatMap((step) => step.beats);
/** The lesson without the second card's animations (and, `unbind`, without its variable and bindings). */
const still = (lesson, card, unbind) => {
  const alias = card.content.bindings[0].expression;
  for (const step of lesson.steps) {
    for (const beat of step.beats) beat.actions = beat.actions.filter((action) => !(action.do === "animate" && action.variable === alias));
    step.beats = step.beats.filter((beat) => beat.actions.length);
  }
  if (unbind) { delete card.content.bindings; lesson.lesson.variables = lesson.lesson.variables.filter((variable) => variable.as !== alias); }
  return alias;
};
const after = (lesson, beat) => lesson.steps[1].beats.push({ key: `extra-${beatsOf(lesson).length}`, say: "看。", ...beat });

for (const { kind, judge, item, example, moves, other, end, at } of KINDS) {
  const made = () => { const lesson = lessonOf(kind, example, moves); lesson.__kind = kind; return [lesson, secondCard(lesson)]; };
  const failures = (lesson) => secondFailures(judge(item, lesson));

  test(`${kind}: a second card whose pair a replay changes fails; a replay that jumps it to its end does not play it there`, () => {
    const [swapped, card] = made();
    for (const [field, value] of Object.entries(other)) {
      swapped.lesson.variables.push({ as: `second_${field}`, initial: card.content[field], min: 0, max: 10_000_000, label: field });
      card.content.bindings.push({ target: field, expression: `second_${field}` });
      after(swapped, { start: { kind: "replay", variables: [`second_${field}`], values: { [`second_${field}`]: value } }, actions: [{ do: "point", target: card.as }] });
    }
    assert.ok(failures(swapped).includes("its pair stays its example"), JSON.stringify(failures(swapped)));
    const [jumped, again] = made();
    const alias = still(jumped, again);
    after(jumped, { start: { kind: "replay", variables: [alias], values: { [alias]: at } }, actions: [{ do: "point", target: again.as }] });
    assert.deepEqual(failures(jumped), ["its demonstration plays to its end"]);
  });

  test(`${kind}: a revision on the example to its end plays it there; a revision to another pair fails`, () => {
    const [forward, card] = made();
    still(forward, card, true);
    after(forward, { actions: [{ do: "revise", target: card.as, reason: "demonstrate", content: { ...structuredClone(card.content), ...end } }] });
    assert.deepEqual(failures(forward), []);
    const [elsewhere, second] = made();
    still(elsewhere, second, true);
    after(elsewhere, { actions: [{ do: "revise", target: second.as, reason: "another", content: { ...structuredClone(second.content), ...other, ...end } }] });
    assert.ok(failures(elsewhere).includes("its pair stays its example"), JSON.stringify(failures(elsewhere)));
  });

  test(`${kind}: a second card in another language fails; a third card of the kind fails the lesson`, () => {
    const [english, card] = made();
    card.content.language = "en-US";
    assert.deepEqual(failures(english), ["it speaks the lesson's language"]);
    const [three, second] = made();
    after(three, { actions: [{ ...structuredClone(second), as: "third-card" }] });
    const verdict = judge(item, three);
    assert.ok(verdict.checks.some((check) => check.check === "at most one second card of the kind" && !check.pass), JSON.stringify(verdict.checks.filter((check) => !check.pass)));
    assert.equal(verdict.second_cards.length, 2);
  });
}

test("make_ten: the first card's practice start that sets the second card's pair fails it", () => {
  const lesson = lessonOf("make_ten", { example_first_addend: 9, example_second_addend: 4 }, [10]);
  lesson.__kind = "make_ten";
  const card = secondCard(lesson);
  for (const [field, value] of [["a", 9], ["b", 4]]) {
    lesson.lesson.variables.push({ as: `second_${field}`, initial: value, min: 1, max: 9, label: field });
    card.content.bindings.push({ target: field, expression: `second_${field}` });
  }
  const task = lesson.lesson.tasks[0];
  task.start.variables.push("second_a", "second_b");
  Object.assign(task.start.values, { second_a: 7, second_b: 5 });
  assert.deepEqual(secondFailures(judgeMakeTen({ id: "two", expect: { numbers: ["8", "6"] } }, lesson)), ["its pair stays its example"]);
});

test("make_ten: the question card is the card played first, for its own checks and the second card's alike", () => {
  const lesson = lessonOf("make_ten", { example_first_addend: 9, example_second_addend: 4 }, [10]);
  const [first, second] = beatsOf(lesson).flatMap((beat) => beat.actions).filter((action) => action.do === "write" && action.kind === "make_ten");
  // Both cards in the first card's beat: the second listed after it, but before the speech.
  for (const step of lesson.steps) { for (const beat of step.beats) beat.actions = beat.actions.filter((action) => action !== second); step.beats = step.beats.filter((beat) => beat.actions.length); }
  const beat = beatsOf(lesson).find((each) => each.actions.includes(first));
  first.when = "after_speech";
  beat.actions.push({ ...second, when: "before_speech" });
  const verdict = judgeMakeTen({ id: "two", expect: { numbers: ["8", "6"] } }, lesson);
  assert.ok(verdict.checks.some((check) => check.check === "the card's pair is the question's (either order)" && !check.pass));
  assert.deepEqual(verdict.second_cards, [{ as: first.as, example: "8 + 6" }]);
});
