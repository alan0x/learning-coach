// Numbers the program supplies to a card (recipe `program_number_inputs`): a trailing number an outline may leave
// out, whose start and range are fixed (the trade card's columns finished: 0, from 0 to 6) or computed from the
// card's other numbers. The cards these are for (make ten, OLL 0027: a count that starts at the bigger addend;
// times ten, 0028: the unit the question names; compare, 0029: places compared, from 0 to the columns) are built
// separately, so a fake recipe stands for them here. The program supplies a number the way an outline's own is
// lowered and checked; a value it cannot compute, or a number that fails the checks, is not supplied at all.
import assert from "node:assert/strict";
import test from "node:test";

const api = await import(new URL("../lesson-plan.js", import.meta.url));

const number = (initial, label) => ({ initial, min: 0, max: Math.max(1, initial), label, student_control: { kind: "slider", step: Math.max(1, initial) / 200 } });
// Make ten's shape: the two addends, a practice pair, then the demonstration count, from the bigger addend to the sum.
const COUNT_FROM_BIGGER = {
  initial: ([first, second]) => Math.max(first, second),
  min: ([first, second]) => Math.max(first, second),
  max: ([first, second]) => first + second,
  label: "count so far",
};
const fakeOutline = (numbers, capability = "fake_make_ten") => ({ numbers, course_visuals: [{ capability, create_section: 1 }] });
const fakeRecipe = (inputs, limit = 5) => (capability) => capability === "fake_make_ten" ? { inputs, limit } : { inputs: [], limit: 0 };

test("a computed start: the number starts and ranges as the recipe computes from the card's other numbers", () => {
  const declared = [number(8, "first addend"), number(5, "second addend"), number(7, "practice first"), number(6, "practice second")];
  assert.deepEqual(api.programNumberDefinitions([COUNT_FROM_BIGGER], declared, "en-US"), [
    { initial: 8, min: 8, max: 13, label: "count so far", student_control: { kind: "slider", step: 5 / 200 } },
  ]);
  // The other order of the addends starts at the same, bigger, one.
  assert.equal(api.programNumberDefinitions([COUNT_FROM_BIGGER], [declared[1], declared[0], ...declared.slice(2)])[0].initial, 8);
  // Fixed and computed values mix: places compared, from 0 to the columns the pair's larger number has.
  const columns = (value) => String(Math.trunc(Math.abs(value))).length;
  const placesCompared = { initial: 0, min: 0, max: ([first, second]) => Math.max(columns(first), columns(second)), label: "places compared" };
  assert.deepEqual(api.programNumberDefinitions([placesCompared], [number(4127, "a"), number(4172, "b"), number(305, "c"), number(350, "d")]),
    [{ initial: 0, min: 0, max: 4, label: "places compared", student_control: { kind: "slider", step: 4 / 200 } }]);
  // A start that is not a whole number: the unit the question names (3 tenths counted in tenths).
  const countedIn = { initial: ([amount]) => (Number.isInteger(amount) ? 1 : 0.1), min: 0.01, max: 1000, label: "counted in" };
  assert.equal(api.programNumberDefinitions([countedIn], [number(0.3, "amount"), number(3, "target")])[0].initial, 0.1);
});

// The make-ten card (OLL PR #119, decision 0027): a, b, practice a, practice b, then two numbers the program can
// supply. `filled` starts at the bigger of the lesson pair (OLL's makeTenFreshCount(a, b)) and runs up to 10 (from
// 0, since the practice task sets it from the practice pair); `moved` starts at 0 and runs to 4.
const MAKE_TEN_INPUTS = [
  { initial: ([a, b]) => Math.max(a, b), min: 0, max: 10, label: "filled" },
  { initial: 0, min: 0, max: 4, label: "moved" },
];

test("make ten's shape: both trailing numbers supplied, filled from the bigger addend; or only moved, after the model's own filled", () => {
  const recipe = (capability) => capability === "fake_make_ten" ? { inputs: MAKE_TEN_INPUTS, limit: 6 } : { inputs: [], limit: 0 };
  const declared = [number(8, "a"), number(5, "b"), number(7, "practice a"), number(6, "practice b")];
  const shape = (numbers) => numbers.map(({ initial, min, max, label }) => [initial, min, max, label]);
  // Four declared: both supplied, numbers 5 and 6 (a create naming 1 to 4 is bound to both).
  const four = fakeOutline(structuredClone(declared));
  assert.deepEqual(api.supplyProgramNumbers(four, "en-US", recipe), { capability: "fake_make_ten", first: 5, count: 2 });
  assert.deepEqual(shape(four.numbers.slice(4)), [[8, 0, 10, "filled"], [0, 0, 4, "moved"]]);
  // The other order of the pair starts filled at the same, bigger, addend.
  const swapped = fakeOutline(structuredClone([declared[1], declared[0], ...declared.slice(2)]));
  api.supplyProgramNumbers(swapped, "en-US", recipe);
  assert.equal(swapped.numbers[4].initial, 8);
  // Five declared (the model declared filled itself): its own is kept and only moved is supplied.
  const five = fakeOutline(structuredClone([...declared, number(8, "the model's filled")]));
  assert.deepEqual(api.supplyProgramNumbers(five, "en-US", recipe), { capability: "fake_make_ten", first: 6, count: 1 });
  assert.deepEqual(shape(five.numbers.slice(4)), [[8, 0, 8, "the model's filled"], [0, 0, 4, "moved"]]);
  // Six declared, or three: nothing supplied.
  for (const numbers of [[...declared, number(10, "f"), number(0, "m")], declared.slice(0, 3)]) {
    const other = fakeOutline(structuredClone(numbers));
    assert.equal(api.supplyProgramNumbers(other, "en-US", recipe), undefined);
    assert.equal(other.numbers.length, numbers.length);
  }
});

test("the trade card's columns finished is supplied as before: 0, from 0 to OLL's most columns, labelled in the lesson's language", () => {
  const trade = [{ initial: 0, min: 0, max: 6, label: "做完了几列" }];
  const declared = [number(7352, "first number"), number(2618, "second number"), number(8461, "practice first"), number(3729, "practice second")];
  assert.deepEqual(api.programNumberDefinitions(trade, declared, "en-US"), [{ initial: 0, min: 0, max: 6, label: "columns finished", student_control: { kind: "slider", step: 0.03 } }]);
  assert.equal(api.programNumberDefinitions(trade, declared, "zh-CN")[0].label, "做完了几列");
});

test("a supplied number is lowered and checked as the outline's own; one that fails is not supplied, and the outline is kept", () => {
  const declared = [number(8, "first addend"), number(5, "second addend"), number(7, "practice first"), number(6, "practice second")];
  const supplied = (input, numbers = declared) => api.programNumberDefinitions([{ ...COUNT_FROM_BIGGER, ...input }], numbers);
  // As an outline's number: a start outside its range widens the range to it, and a range of one value is padded.
  assert.deepEqual(supplied({ max: () => 7 }).map(({ min, max }) => [min, max]), [[7, 8]]);
  assert.deepEqual(supplied({ max: ([first]) => first }).map(({ min, max }) => [min, max]), [[7, 9]]);
  // Faults: a value that is not a finite number, a computation that throws, a label too long, more than 16 numbers,
  // a start written far outside a sane range (the outline's own scale check).
  assert.equal(supplied({ initial: () => Number.NaN }), undefined);
  assert.equal(supplied({ initial: ([, , , , fifth]) => fifth.toFixed(0) }), undefined);
  assert.equal(supplied({ initial: () => "8" }), undefined);
  assert.equal(supplied({ label: "x".repeat(81) }), undefined);
  assert.equal(supplied({}, Array.from({ length: 16 }, (_, index) => number(index + 1, `n${index}`))), undefined);
  assert.equal(supplied({ initial: () => 1e9, min: () => 0, max: () => 10 }), undefined);

  // supplyProgramNumbers: appends only to an outline that declares exactly the card's other numbers.
  const outline = fakeOutline(structuredClone(declared));
  const recipe = fakeRecipe([COUNT_FROM_BIGGER]);
  assert.deepEqual(api.supplyProgramNumbers(outline, "en-US", recipe), { capability: "fake_make_ten", first: 5, count: 1 });
  assert.deepEqual(outline.numbers.map(({ initial, min, max, label }) => [initial, min, max, label]).at(-1), [8, 8, 13, "count so far"]);
  // Again on the same outline: nothing changes, and the same numbers are reported (the generation run keeps them).
  assert.deepEqual(api.supplyProgramNumbers(outline, "en-US", recipe), { capability: "fake_make_ten", first: 5, count: 1 });
  assert.equal(outline.numbers.length, 5);
  // An outline that declares its own fifth, or another count, gets nothing, and no number is reported as supplied.
  for (const count of [0, 3, 5]) {
    const other = fakeOutline(structuredClone([...declared, number(9, "own")].slice(0, count)));
    assert.equal(api.supplyProgramNumbers(other, "en-US", recipe), undefined, String(count));
    assert.equal(other.numbers.length, count);
  }
  // A number that fails is not supplied: the outline keeps its four numbers (the card alone is lost, by its
  // min_lesson_numbers), and no error reaches the outline.
  const failing = fakeOutline(structuredClone(declared));
  assert.equal(api.supplyProgramNumbers(failing, "en-US", fakeRecipe([{ ...COUNT_FROM_BIGGER, initial: () => Number.NaN }])), undefined);
  assert.equal(failing.numbers.length, 4);
  // The registry's recipes: no default recipe supplies a number.
  assert.equal(api.supplyProgramNumbers(fakeOutline(structuredClone(declared), "number_line")), undefined);
});
