// The judges of the cards that take a second card (make ten, the trade card, times ten; Coach #199): the first card
// holds the question and the practice; each later card of the kind must show another example than the question's and
// the practice's, open fresh, play its demonstration forward to its end, and have no task anchored on it. Lessons are
// made by Coach itself (stubbed replies, no model calls), then changed one fault at a time.
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
    practice: { example_first_addend: 5, example_second_addend: 7 } },
  { kind: "place_value_trade", judge: judgePlaceValueTrade, item: { id: "two", expect: { operation: "add", numbers: ["3486", "2795"], result: "6281" } },
    example: { example_first_number: 4527, example_second_number: 1396 }, moves: [2, 4], shown: "4527 + 1396", practice: { example_first_number: 2645, example_second_number: 1578 } },
  { kind: "place_value_times_ten", judge: judgePlaceValueTimesTen, item: { id: "two", expect: { amount: "0.3", target: "0.001", ask: "count" } },
    example: { example_amount: 0.7, example_unit_asked: 0.001 }, moves: [0.01, 0.001], shown: "0.7 in 0.001" },
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
