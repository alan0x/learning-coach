// Wrong arithmetic in a model-written success message (plan §7 3.6, §10 item 5). The program reads only
// claims written wholly in numerals and operators ("8 + 5 = 13", "9 plus 5 is 14", "8 乘 3 等于 24"), checks
// them with exact fractions, and drops a message whose claim is false (decision 0020: a success message is a
// part nothing else depends on). Anything it cannot read whole is left alone. Nothing drawn changes, and no
// request changes. The expectations below were written before the checker: general arithmetic forms, plus
// messages copied from the probe-case census (PA, PI and SD recordings; never the question set). The cases
// marked "review" were added after review found them read as false.
import assert from "node:assert/strict";
import test from "node:test";

const api = await import(new URL(process.env.COACH_BUILD ? `${process.env.COACH_BUILD}/lesson-plan.js` : "../lesson-plan.js", import.meta.url));
const { completeLessonPlanFixtures } = await import(new URL("./lesson-plan-course-fixtures.mjs", import.meta.url));
const { praiseArithmetic, compileAndValidateLessonPlan } = api;

const verdict = (text) => praiseArithmetic(text).verdict;

test("true claims are kept", () => {
  for (const text of [
    "Great job! 8 plus 2 equals 10.",
    "You made a ten to find 8 + 5 = 13.",
    "很好！当长为8、宽为3时，总面积就是 8 × 3 = 24 平方厘米。",
    "Great job! 9 plus 5 is 14.",
    "从 -3 向右移动 4 个单位到达了 1，即 -3 + 4 = 1。",
    "Perfect! 5 times 3 equals 15.",
    "1/2 + 1/4 = 3/4",
    "0.1 + 0.2 = 0.3",
    "1,245 − 380 = 865",
    "8 加 5 等于 13",
    "12 ÷ 4 = 3",
    "2 + 3 × 4 = 14",
    "5 x 4 = 20",
    "7 − 10 = −3",
    "10 / 3 = 3.33",
    "2 / 3 = 0.667",
    "1/2 + 1/3 + 1/6 = 1",
    "20 divided by 4 is 5.",
    "8 + 5 = 13 and 13 − 5 = 8.",
    // review, round 1: a label before "=" or a colon is not a chain or a clock
    "Answer: 8 + 5 = 13",
    "Step 2: 4 + 4 = 8",
    "第1步：8 + 5 = 13",
    "面积 = 8 × 3 = 24 平方厘米",
    // review, round 2: a value that ends may be rounded when the sentence says so; a decimal comma is one number
    "1 ÷ 8 = 0.13 (rounded)",
    "1 ÷ 8 = 0.13 to 2 decimal places",
    "约 1 ÷ 8 = 0.13",
    "Great! 3 × 4 = 12, and 12 ÷ 4 = 3 with nothing left over.",
    // review, round 3: a quoted mistake is skipped in its own clause only; whole-number rounding said aloud
    "2 + 3 = 5, and 2 + 3 = 6 is the mistake to avoid.",
    "47 ÷ 10 = 5, rounded to the nearest whole number.",
    "Rounded to the nearest whole, 7 ÷ 2 = 4.",
    "8-3=5",
    "8 ＋ 5 ＝ 13",
  ]) assert.equal(verdict(text), "true", text);
});

test("false claims are found", () => {
  for (const text of [
    "Great job! 8 + 5 = 14.",
    "Great job! 9 plus 5 is 15.",
    "6 × 7 = 48",
    "1/2 + 1/3 = 2/5",
    "0.1 + 0.2 = 0.4",
    "-3 + 4 = -1",
    "12 ÷ 4 = 4",
    "7 减 2 等于 4",
    "10 / 3 = 3.4",
    "10 / 3 = 3",
    "2 + 3 × 4 = 20",
    "8 + 5 = 13 and 13 − 5 = 9.",
    "6 multiplied by 7 equals 42, and 6 plus 7 equals 14.",
    // review, round 1: a value that ends must be written exactly; labelled claims are read
    "0.5 + 0.25 = 0.8",
    "2.5 + 1.25 = 3.8",
    "0.15 + 0.2 = 0.3",
    "1/8 + 1/8 = 0.3",
    "Answer: 8 + 5 = 14",
    "Great job: 8 + 5 = 14!",
    "第1步：8 + 5 = 14",
    "面积 = 8 × 3 = 25",
    // review, round 2: common praise words are not negations; "其余" or "nothing left over" is not a remainder
    "没错，8 + 5 = 14。",
    "做得不错，8 × 3 = 25。",
    "非常棒，8 × 3 = 25 平方厘米，没错！",
    "其余部分：6 ÷ 2 = 4",
    "15 ÷ 3 = 6, nothing left over.",
    // review, round 3: words that only contain "round", "about" or 约; negation outside the claim's clause;
    // full-width operators
    "You went around the shape: 0.5 + 0.25 = 0.8",
    "Think about it: 1/8 + 1/8 = 0.3",
    "节约用水，0.5 + 0.25 = 0.8",
    "That is not easy, but 6 × 7 = 48.",
    "You did not give up: 8 + 5 = 14!",
    "Nothing wrong here, 8 + 5 = 14.",
    "Instead of counting on, you made a ten: 8 + 5 = 14.",
    "做得不错了，8 + 5 = 14",
    "8 ＋ 5 ＝ 14",
    "8 － 3 = 4",
  ]) assert.equal(verdict(text), "false", text);
});

test("anything not written wholly in numerals is not read", () => {
  for (const text of [
    "Great job! 4 rows of 7 columns equals 28 total squares.",
    "Great job! At x = 2, y = 0, confirming (2, 0) is an x-intercept.",
    "At r = 8 units, the circumference is 16π units.",
    "2x + 3 = 7",
    "x + 3 + 4 = 8",
    "(2 + 3) × 4 = 21",
    "8 + 2 = 10 + 3 = 13",
    "|k| = 4",
    "At n = 96, the lower bound is approximately 3.1410.",
    "3 + 4 ≈ 7.1",
    "5 ÷ 0 = 0",
    "3 + 4 is 2 more than 5.",
    "7 ÷ 2 = 3 remainder 1",
    "7 ÷ 2 = 3 余 1",
    "3² + 4² = 5²",
    "90 + 45 = 136°",
    "50% + 25% = 80%",
    "Great job! A 5 by 4 garden bed is covered by 5 times 4, which equals 21 squares.",
    "8 + 5 = 13x",
    // review: a fraction is a number, not a division; a mixed number or a clock time is not one result
    "3/4 is 3 out of 4 equal parts.",
    "3/4 + 3/4 = 1 1/2",
    "3:30 + 15 = 3:45",
    "10/3 = 3.33",
    // review, round 1: repeating decimals, remainders in any form, ranges and dates, quoted mistakes
    "2 ÷ 3 = 0.666...",
    "2 ÷ 3 = 0.666…",
    "1 ÷ 6 = 0.1666...",
    "2 ÷ 3 = 0.6̇",
    "2 ÷ 3 = 0.6̅",
    "7 ÷ 2 = 3……1",
    "17 ÷ 5 = 3……2，余数是2",
    "18 ÷ 4 = 4 (remainder 2)",
    "18 ÷ 4 = 4, remainder 2",
    "18 ÷ 4 = 4 rem 2",
    "18 ÷ 4 = 4 with 2 left over",
    "Ages 3-5 is 2 years",
    "Pages 1-3 is 3 pages",
    "1–2 是 1",
    "2024-11-18 is 1 day",
    "Not 8 + 5 = 14, but 13!",
    "不是 8 + 5 = 14，而是 13。",
    // review, round 2: questions, conditions, label numbers and decimal commas
    "Is 8 + 5 = 14? No!",
    "Check: is 8 + 5 = 14? Nope, it's 13.",
    "If 8 + 5 = 14, the bar would be longer.",
    "8 + 5 等于 14 吗？",
    "Step 2 - 4 + 4 = 8",
    "Step 2 – 8 + 5 = 13",
    "Question 3 - 6 × 2 = 12",
    "1,5 + 2 = 3,5",
    // review, round 3: a range with a spaced "="
    "Pages 1-3 = 3 pages",
    "正确，θ=π/2 时 sin θ 取得最大值 1。",
    "现在 x=2，对应 y=4。",
    "Done: Slope (m) is now -5.",
    "",
  ]) assert.equal(verdict(text), "none", text);
});

const withPraise = (success_message) => {
  const plan = structuredClone(completeLessonPlanFixtures.square_function);
  const activity = plan.sections.flatMap((section) => section.student_activities ?? []).find((item) => item.kind === "number_target");
  assert.ok(activity, "fixture has a number target");
  activity.success_message = success_message;
  return plan;
};
const praiseDrops = (compiled) => compiled.program_adjustments.filter((item) => item.reason === "praise_false_arithmetic");
const taskMessages = (compiled) => (compiled.lesson.lesson.tasks ?? []).map((task) => task.success_message);

test("the compiler drops a false message and records why; a true one is kept", () => {
  const kept = compileAndValidateLessonPlan(withPraise("Great job! 2 + 2 = 4."));
  assert.deepEqual(taskMessages(kept), ["Great job! 2 + 2 = 4."]);
  assert.equal(kept.program_adjustments.filter((item) => item.reason === "praise_false_arithmetic").length, 0);

  const dropped = compileAndValidateLessonPlan(withPraise("Great job! 2 + 2 = 5."));
  assert.deepEqual(taskMessages(dropped), [undefined]);
  const records = dropped.program_adjustments.filter((item) => item.reason === "praise_false_arithmetic");
  assert.equal(records.length, 1);
  assert.match(records[0].detail, /2 \+ 2 = 5/);
  assert.equal(records[0].kind, "success_message_removed");
  assert.match(records[0].detail, new RegExp(`^${dropped.lesson.lesson.tasks[0].as} \\(`), "the record names the task, for the eval");
  const plan = withPraise("x");
  const taskSection = plan.sections.findIndex((section) => (section.student_activities ?? []).some((item) => item.kind === "number_target")) + 1;
  assert.equal(records[0].section, taskSection, "sections are counted from 1, as in the other adjustments");
});

test("the lesson is otherwise unchanged when a message is dropped", () => {
  const strip = (compiled) => JSON.stringify(compiled.lesson, (key, value) => (key === "success_message" ? undefined : value));
  assert.equal(
    strip(compileAndValidateLessonPlan(withPraise("Great job! 2 + 2 = 5."))),
    strip(compileAndValidateLessonPlan(withPraise("Great job! 2 + 2 = 4."))),
  );
});

test("a duplicate task's true message fills in a kept task whose message was dropped", () => {
  // review, round 3: the first copy was kept with no message although a later copy had a true one.
  const plan = withPraise("Great job! 2 + 2 = 5.");
  const section = plan.sections.find((item) => (item.student_activities ?? []).some((activity) => activity.kind === "number_target"));
  const twin = structuredClone(section.student_activities.find((activity) => activity.kind === "number_target"));
  twin.success_message = "Great job! 2 + 2 = 4.";
  section.student_activities.push(twin);
  const compiled = compileAndValidateLessonPlan(plan);
  assert.deepEqual(taskMessages(compiled), ["Great job! 2 + 2 = 4."]);
  assert.equal(praiseDrops(compiled).length, 1, "the drop still happened, on the first copy");
});

test("plot and view adjustments stay separate from text adjustments", () => {
  const compiled = compileAndValidateLessonPlan(withPraise("Great job! 2 + 2 = 5."));
  assert.equal(compiled.view_adjustments.some((item) => item.reason === "praise_false_arithmetic"), false);
});

test("a duplicate task that is thrown away records no drop", () => {
  // review, round 1: the drop was recorded before the compiler threw the duplicate task away.
  const plan = withPraise("Great job! 2 + 2 = 4.");
  const section = plan.sections.find((item) => (item.student_activities ?? []).some((activity) => activity.kind === "number_target"));
  const twin = structuredClone(section.student_activities.find((activity) => activity.kind === "number_target"));
  twin.success_message = "Great job! 2 + 2 = 5.";
  section.student_activities.push(twin);
  const compiled = compileAndValidateLessonPlan(plan);
  assert.deepEqual(taskMessages(compiled), ["Great job! 2 + 2 = 4."]);
  assert.equal(praiseDrops(compiled).length, 0);
});
