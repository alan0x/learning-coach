// The fraction model judge (OLL decision 0021): each case's expectations are met by a card built the way a
// correct recipe would build it (the plugin's buildFractionModel), and one mutation per check fails it for
// its own reason. Every case passes once and fails at least once.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFractionModel } from "octos-lesson-language/plugin-math";
import { judgeFractions } from "../scripts/fraction-judge.mjs";

const cases = Object.fromEntries(JSON.parse(readFileSync(new URL("../testsuite/fraction-judge-cases.json", import.meta.url), "utf8")).cases.map((item) => [item.id, item]));

/** A one-section lesson that writes one fraction card, then plays the given animations and offers the tasks. */
function lesson(input, { variables, animations = [], tasks } = {}) {
  const built = buildFractionModel({ as: "model", role: "main_visual", place: { relation: "new_region" }, ...input });
  return {
    dsl: "octos.lesson", version: "0.1", profile: "authoring",
    lesson: { mode: "explain", language: "en-US", title: "Fractions", goals: ["Look at the parts"], ...(variables ? { variables } : {}), ...(tasks ? { tasks } : {}) },
    steps: [{ key: "s", purpose: "Show the parts", beats: [
      { key: "draw", say: "Here it is.", actions: built.actions },
      ...animations.map(([variable, value], index) => ({ key: `a${index}`, say: "Watch.", actions: [{ do: "animate", variable, value }] })),
    ] }],
    close: { summary: "Done.", focus: ["model"] },
  };
}
const noCard = {
  dsl: "octos.lesson", version: "0.1", profile: "authoring",
  lesson: { mode: "explain", language: "en-US", title: "Talk", goals: ["Talk it through"] },
  steps: [{ key: "s", purpose: "Explain", beats: [{ key: "b", say: "Let us think.", actions: [{ do: "write", as: "note", kind: "note", role: "note", content: { text: "Think." }, place: { relation: "new_region" } }] }] }],
  close: { summary: "Done.", focus: ["note"] },
};
const f = (numerator, denominator, more = {}) => ({ numerator, denominator, ...more });
/** A practice task, in the shape Coach's compiler writes, that asks for n = value on the slider. */
const task = (value) => [{
  as: "task", prompt: "Shade it.", availability: { kind: "after_lesson" }, hints: ["Drag the slider."],
  allowed_operations: [{ kind: "variable_change", variable: "n", controls: ["slider"] }],
  completion: { kind: "expression_target", expression: "n", value, tolerance: 0.5 }, start: { kind: "practice", variables: ["n"] },
}];
const verdict = (id, built) => judgeFractions(cases[id], built);
const passes = (id, built, why = "") => assert.deepEqual(verdict(id, built).hard, [], `${id} should pass ${why}: ${verdict(id, built).hard.join(" | ")}`);
const fails = (id, built, pattern) => {
  const hard = verdict(id, built).hard;
  assert.ok(hard.some((miss) => pattern.test(miss)), `${id} should miss ${pattern}: ${hard.join(" | ") || "passed"}`);
};

test("every in-scope case has a passing card and at least one failing mutation; every near miss fails with a card", () => {
  const passing = {
    "FM-01": lesson({ model: "bar", fractions: [f(2, 5)] }),
    "FM-02": lesson({ model: "circle", fractions: [f(5, 6)] }),
    "FM-03": lesson({ model: "bar", fractions: [f(4, 9)] }),
    "FM-04": lesson({ model: "circle", fractions: [f(1, 3), f(3, 8)], relation: "compare" }),
    "FM-05": lesson({ model: "bar", fractions: [f(5, 6), f(7, 9)], relation: "compare" }),
    "FM-06": lesson({ model: "bar", fractions: [f(3, 4), f(9, 12)], relation: "equivalent" }),
    "FM-07": lesson({ model: "circle", fractions: [f(10, 12), f(5, 6)], relation: "equivalent" }),
    "FM-08": lesson({ model: "bar", fractions: [f(11, 4)] }),
    "FM-09": lesson({ model: "bar", fractions: [f(12, 3)] }),
    "FM-10": lesson({ model: "grid", grid: { rows: 10, columns: 10 }, fractions: [f(43, 100)] }),
    "FM-11": lesson({ model: "grid", grid: { rows: 10, columns: 10 }, fractions: [f(160, 100)] }),
    "FM-12": lesson({ model: "bar", fractions: [f(3, 4, { split: 2, highlight: 3 })] }),
    "FM-13": lesson({ model: "circle", fractions: [f(3, 5, { split: 4, highlight: 3 })] }),
    "FM-14": lesson({ model: "circle", fractions: [f(3, 1, { split: 4, highlight: 3 })] }),
    "FM-15": lesson({ model: "bar", fractions: [f(2, 1, { split: 3 })] }),
    "FM-16": lesson({ model: "circle", fractions: [{ numerator: { expression: "n", initial: 0 }, denominator: 8, wholes: 1 }] }, {
      variables: [{ as: "n", initial: 0, min: 0, max: 8, label: "parts", control: { kind: "slider", step: 1 } }],
      animations: [["n", 3]],
      tasks: task(5),
    }),
    "FM-17": lesson({ model: "bar", fractions: [f(7, 10)] }),
    "FM-18": lesson({ model: "bar", fractions: [f(2, 3), f(3, 10)], relation: "compare" }),
  };
  for (const [id, built] of Object.entries(passing)) passes(id, built);
  for (const item of Object.values(cases)) {
    if (item.nearMiss) {
      passes(item.id, noCard, "with no card");
      fails(item.id, lesson({ model: "bar", fractions: [f(1, 2)] }), /forbidden fraction card/u);
    } else {
      assert.ok(passing[item.id], `${item.id} has a passing card`);
      fails(item.id, noCard, /no fraction card/u);
    }
  }
});

test("wrong fractions fail: another numerator or denominator, a reduced fraction for an unreduced one, a missing second fraction", () => {
  fails("FM-01", lesson({ model: "bar", fractions: [f(3, 5)] }), /shows 3\/5, expected 2\/5/u);
  fails("FM-01", lesson({ model: "bar", fractions: [f(2, 6)] }), /shows 2\/6/u);
  fails("FM-06", lesson({ model: "bar", fractions: [f(3, 4), f(3, 4)], relation: "equivalent" }), /expected 3\/4, 9\/12/u);
  fails("FM-04", lesson({ model: "circle", fractions: [f(3, 8)] }), /1 fraction\(s\) \(3\/8\), expected 2/u);
  // Order matters unless the case says otherwise.
  passes("FM-04", lesson({ model: "circle", fractions: [f(3, 8), f(1, 3)], relation: "compare" }), "in either order");
  fails("FM-12", lesson({ model: "bar", fractions: [f(3, 8)] }), /shows 3\/8, expected 3\/4/u);
  fails("FM-12", lesson({ model: "bar", fractions: [f(3, 4)] }), /split none, expected 2/u);
  fails("FM-15", lesson({ model: "bar", fractions: [f(2, 1, { split: 2 })] }), /smallest pieces are 1\/2, expected 1\/3/u);
  fails("FM-15", lesson({ model: "bar", fractions: [f(6, 3, { split: 2 })] }), /smallest pieces are 1\/6, expected 1\/3/u);
  passes("FM-15", lesson({ model: "bar", fractions: [f(6, 3)] }), "as 6/3");
  fails("FM-18", lesson({ model: "bar", fractions: [f(2, 3), f(3, 4)], relation: "compare" }), /expected two of/u);
});

test("relation, wholes, grid, split and highlight are checked when a case gives them", () => {
  // OLL itself refuses unequal fractions shown equivalent; the judge reports the refusal.
  fails("FM-04", lesson({ model: "circle", fractions: [f(3, 8), f(1, 3)], relation: "equivalent" }), /Fractions shown equivalent are equal/u);
  // An equal pair compared is the same card ("10/12 = 5/6", computed); an unequal pair compared is not (review of #130).
  passes("FM-07", lesson({ model: "circle", fractions: [f(10, 12), f(5, 6)], relation: "compare" }), "an equal pair compared");
  fails("FM-07", lesson({ model: "circle", fractions: [f(10, 12), f(4, 6)], relation: "compare" }), /expected 5\/6, 10\/12/u);
  fails("FM-08", lesson({ model: "bar", fractions: [f(11, 4, { wholes: 4 })] }), /4 whole\(s\), expected 3/u);
  fails("FM-10", lesson({ model: "grid", grid: { rows: 4, columns: 25 }, fractions: [f(43, 100)] }), /grid 4×25|grid count|grid/u);
  fails("FM-13", lesson({ model: "circle", fractions: [f(3, 5, { split: 4, highlight: 1 })] }), /highlight 1, expected 3/u);
  fails("FM-14", lesson({ model: "circle", fractions: [f(3, 1, { split: 3, highlight: 3 })] }), /smallest pieces are 1\/3, expected 1\/4/u);
  // Eighths or twelfths with three marked are 3/8 or 3/12 of a whole, not 3/4 (review of #130, round 2).
  fails("FM-14", lesson({ model: "circle", fractions: [f(12, 4, { split: 2, highlight: 3 })] }), /smallest pieces are 1\/8, expected 1\/4/u);
  fails("FM-14", lesson({ model: "circle", fractions: [f(12, 4, { split: 3, highlight: 3 })] }), /smallest pieces are 1\/12, expected 1\/4/u);
  // Three wholes cut into quarters is the same picture written as 12/4 (review of #130).
  passes("FM-14", lesson({ model: "circle", fractions: [f(12, 4, { highlight: 3 })] }), "as 12/4 in quarters");
  fails("FM-14", lesson({ model: "circle", fractions: [f(12, 4, { highlight: 4 })] }), /highlight 4, expected 3/u);
});

test("what a case does not ask for is a miss, on the fraction the case is about (review of #130, round 4)", () => {
  // A pie of sixths cut into twelfths; eighths cut into sixteenths on the slider; an unasked share.
  fails("FM-02", lesson({ model: "circle", fractions: [f(5, 6, { split: 2 })] }), /split into 2, which the case does not ask for/u);
  fails("FM-01", lesson({ model: "bar", fractions: [f(2, 5, { highlight: 1 })] }), /marks 1 piece\(s\) as a share/u);
  passes("FM-15", lesson({ model: "bar", fractions: [f(6, 3, { highlight: 1 })] }), "one cup marked");
  fails("FM-15", lesson({ model: "bar", fractions: [f(2, 1, { split: 3, highlight: 4 })] }), /marks 4 piece\(s\) as a share/u);
  // The slider fraction second on a compare card, over two wholes: its wholes are checked, not the first's.
  const variables = [{ as: "n", initial: 0, min: 0, max: 16, label: "parts", control: { kind: "slider", step: 1 } }];
  const second = lesson({ model: "circle", fractions: [f(5, 8, { wholes: 1 }), { numerator: { expression: "n", initial: 0 }, denominator: 8, wholes: 2 }], relation: "compare" }, { variables, tasks: task(5) });
  fails("FM-16", second, /2 whole\(s\), expected 1/u);
  // A pair equal at an animated value, compared: the same card as one shown equivalent.
  passes("FM-07", lesson({ model: "circle", fractions: [f(5, 6), { numerator: { expression: "n", initial: 0 }, denominator: 12, wholes: 1 }], relation: "compare" }, {
    variables: [{ as: "n", initial: 0, min: 0, max: 12, label: "parts", control: { kind: "slider", step: 1 } }], animations: [["n", 10]],
  }), "animated to 10/12");
  // Both fractions of FM-17 on one card.
  passes("FM-17", lesson({ model: "bar", fractions: [f(3, 10), f(7, 10)], relation: "compare" }), "used and left on one card");
  fails("FM-17", lesson({ model: "bar", fractions: [f(3, 10), f(3, 10)], relation: "compare" }), /expected one of/u);
});

test("a split to common pieces, a whole marked when counting wholes, and a fixed fraction beside a slider (review of #130, round 5)", () => {
  passes("FM-06", lesson({ model: "bar", fractions: [f(3, 4, { split: 3 }), f(9, 12)], relation: "equivalent" }), "3/4 in twelfths beside 9/12");
  passes("FM-05", lesson({ model: "bar", fractions: [f(5, 6, { split: 3 }), f(7, 9, { split: 2 })], relation: "compare" }), "both in eighteenths");
  passes("FM-18", lesson({ model: "bar", fractions: [f(1, 2, { split: 5 }), f(3, 10)], relation: "compare" }), "1/2 in tenths beside 3/10");
  // A split that does not bring the two to the same pieces is still a miss.
  fails("FM-06", lesson({ model: "bar", fractions: [f(3, 4), f(9, 12, { split: 2 })], relation: "equivalent" }), /9\/12 split into 2, which the case does not ask for/u);
  // One whole marked where the case counts wholes.
  passes("FM-09", lesson({ model: "circle", fractions: [f(12, 3, { highlight: 3 })] }), "one cake marked");
  fails("FM-09", lesson({ model: "circle", fractions: [f(12, 3, { highlight: 4 })] }), /marks 4 piece\(s\)/u);
  // The two full laps of 11/4 marked; a mark of 3 is three quarters of lap 1, which counts nothing (round 6).
  passes("FM-08", lesson({ model: "bar", fractions: [f(11, 4, { highlight: 8 })] }), "two full laps marked");
  fails("FM-08", lesson({ model: "bar", fractions: [f(11, 4, { highlight: 3 })] }), /marks 3 piece\(s\)/u);
  fails("FM-08", lesson({ model: "bar", fractions: [f(11, 4, { highlight: 12 })] }), /marks 12 piece\(s\)|highlight/u);
  // Both fractions split finer than their common pieces: sixteenths beside sixteenths, twentieths (round 6).
  fails("FM-17", lesson({ model: "bar", fractions: [f(3, 10, { split: 2 }), f(7, 10, { split: 2 })], relation: "compare" }), /split into 2, which the case does not ask for/u);
  fails("FM-07", lesson({ model: "circle", fractions: [f(5, 6, { split: 4 }), f(10, 12, { split: 2 })], relation: "equivalent" }), /split into/u);
  // A fixed fraction beside the slider must be one the case expects.
  const variables = [{ as: "n", initial: 0, min: 0, max: 8, label: "parts", control: { kind: "slider", step: 1 } }];
  const beside = (fixed) => lesson({ model: "circle", fractions: [f(fixed, 8, { wholes: 1 }), { numerator: { expression: "n", initial: 0 }, denominator: 8, wholes: 1 }], relation: "compare" }, { variables, tasks: task(5) });
  fails("FM-16", beside(3), /3\/8 beside the slider, which the case does not ask for/u);
  passes("FM-16", beside(5), "a fixed 5/8 to match");
  const halves = lesson({ model: "circle", fractions: [f(5, 8, { wholes: 1, split: 2 }), { numerator: { expression: "n", initial: 0 }, denominator: 8, wholes: 1, split: 2 }], relation: "compare" }, { variables, tasks: task(5) });
  fails("FM-16", halves, /split into 2, which the case does not ask for/u);
});

test("a model a teacher would not choose is a soft miss, not a hard one, whatever the order of the cards", () => {
  const verdictFor = verdict("FM-02", lesson({ model: "bar", fractions: [f(5, 6)] }));
  assert.deepEqual(verdictFor.hard, []);
  assert.deepEqual(verdictFor.soft, ["model bar, expected circle"]);
  // A wrong circle first, then a right bar (review of #130: the first card's miss used to decide).
  const two = lesson({ model: "circle", fractions: [f(1, 6)] });
  two.steps[0].beats.push({ key: "more", say: "And now.", actions: buildFractionModel({ as: "second", role: "main_visual", place: { relation: "new_region" }, model: "bar", fractions: [f(5, 6)] }).actions });
  assert.deepEqual(verdict("FM-02", two), { hard: [], soft: ["model bar, expected circle"] });
});

test("a fraction compared with itself orders nothing; an empty extra whole is a miss; an animated numerator counts", () => {
  fails("FM-18", lesson({ model: "bar", fractions: [f(1, 2), f(1, 2)], relation: "compare" }), /expected two of/u);
  fails("FM-06", lesson({ model: "bar", fractions: [f(3, 4, { wholes: 2 }), f(9, 12)], relation: "equivalent" }), /2 wholes drawn for 3\/4, which fills 1/u);
  // A numerator bound and animated from 0 to 2 shows 2/5.
  passes("FM-01", lesson({ model: "bar", fractions: [{ numerator: { expression: "n", initial: 0 }, denominator: 5, wholes: 1 }] }, {
    variables: [{ as: "n", initial: 0, min: 0, max: 5, label: "parts", control: { kind: "slider", step: 1 } }], animations: [["n", 2]],
  }), "animated to 2/5");
});

test("a slider: the numerator must be bound over the right denominator, step in whole parts, and a task must target it", () => {
  const variables = (step) => [{ as: "n", initial: 0, min: 0, max: 8, label: "parts", control: { kind: "slider", step } }];
  const bound = (denominator = 8) => ({ model: "circle", fractions: [{ numerator: { expression: "n", initial: 0 }, denominator, wholes: 1 }] });
  fails("FM-16", lesson(bound(), { variables: variables(1), animations: [["n", 3]], tasks: task(4) }), /no practice task setting the numerator to 5 \(tasks: 4\)/u);
  fails("FM-16", lesson({ model: "circle", fractions: [f(5, 8)] }), /no slider on a numerator over 8/u);
  fails("FM-16", lesson(bound(), { variables: variables(0.5), tasks: task(5), animations: [["n", 5]] }), /steps by 0.5, not whole parts/u);
  // Two circles for a slider that stops at 8/8: the second is always empty (review of #130).
  const twoWholes = { model: "circle", fractions: [{ numerator: { expression: "n", initial: 0 }, denominator: 8, wholes: 2 }] };
  fails("FM-16", lesson(twoWholes, { variables: variables(1), tasks: task(5) }), /the last whole is always empty/u);
  // A task that accepts 4/8 or 6/8 as 5/8.
  const loose = task(5);
  loose[0].completion.tolerance = 1.5;
  fails("FM-16", lesson(bound(), { variables: variables(1), tasks: loose }), /accepts ±1.5 parts around 5/u);
});

test("a card drawn plain and then revised with its cuts is judged at each step (0021 amendment 2)", async () => {
  const { fractionCardsIn } = await import("../scripts/fraction-judge.mjs");
  const stepped = (revised) => {
    const built = lesson({ model: "bar", fractions: [f(3, 5)] });
    built.steps[0].beats.push({ key: "cut", say: "Cut each fifth.", actions: [{ do: "revise", target: "model", reason: "cut each fifth", content: revised }] });
    return built;
  };
  const cut = stepped({ title: "Fractions", model: "bar", fractions: [{ as: "a", numerator: 3, denominator: 5, split: 4, highlight: 3 }], caption: "Each share is 3/20" });
  const cards = fractionCardsIn(cut);
  assert.deepEqual(cards.map((card) => [card.step, card.fractions[0].split]), [[0, undefined], [1, 4]]);
  // FM-13 asks for 3/5 in four portions: the revised step meets it; the plain step alone would not.
  passes("FM-13", cut, "with the cut in the second step");
  fails("FM-13", lesson({ model: "bar", fractions: [f(3, 5)] }), /split none, expected 4/);
  // Checks needing no expectation hold at every step: a revised step that draws an empty extra whole is a miss there.
  const extra = stepped({ model: "bar", fractions: [{ as: "a", numerator: 3, denominator: 5, wholes: 2 }] });
  assert.match(judgeFractions(cases["FM-13"], extra).hard.join(" | "), /card model step 2: a: 2 wholes drawn for 3\/5/);
  // A lesson with no revision keeps one entry and no step.
  assert.deepEqual(fractionCardsIn(lesson({ model: "bar", fractions: [f(3, 5)] })).map((card) => card.step), [undefined]);
});

test("review of #145: a revision of one fraction, animations by step, a dropped slider, and what is not asked for at every step", () => {
  const revised = (built, content, target = "model", after = []) => {
    built.steps[0].beats.push({ key: "cut", say: "Change it.", actions: [{ do: "revise", target, reason: "change it", content }] }, ...after);
    return built;
  };
  // A revision aimed at one fraction ("model#a") replaces the whole card, and is read like one aimed at the card.
  passes("FM-13", revised(lesson({ model: "circle", fractions: [f(3, 5)] }), { model: "circle", fractions: [{ as: "a", numerator: 3, denominator: 5, split: 4, highlight: 3 }] }, "model#a"), "revised through model#a");
  fails("FM-01", revised(lesson({ model: "bar", fractions: [f(2, 5)] }), { model: "bar", fractions: [{ as: "a", numerator: 2, denominator: 5, wholes: 2 }] }, "model#a"), /step 2: a: 2 wholes drawn for 2\/5/u);
  // An animation after the revision moves nothing on the card, so the written step never showed 2/5.
  const slider = { variables: [{ as: "n", initial: 0, min: 0, max: 5, label: "parts", control: { kind: "slider", step: 1 } }] };
  const late = revised(lesson({ model: "bar", fractions: [{ numerator: { expression: "n", initial: 0 }, denominator: 5, wholes: 1 }] }, slider),
    { model: "bar", fractions: [{ as: "a", numerator: 0, denominator: 5 }] }, "model", [{ key: "move", say: "Watch.", actions: [{ do: "animate", variable: "n", value: 2 }] }]);
  fails("FM-01", late, /shows 0\/5, expected 2\/5/u);
  // The same animation before the revision does show 2/5 on the written step.
  const early = lesson({ model: "bar", fractions: [{ numerator: { expression: "n", initial: 0 }, denominator: 5, wholes: 1 }] }, { ...slider, animations: [["n", 2]] });
  passes("FM-01", revised(early, { model: "bar", fractions: [{ as: "a", numerator: 2, denominator: 5 }] }), "animated to 2/5 before the revision");
  // A revision after the slider lesson drops its binding: the practice slider moves nothing.
  const practice = lesson({ model: "circle", fractions: [{ numerator: { expression: "n", initial: 0 }, denominator: 8, wholes: 1 }] }, {
    variables: [{ as: "n", initial: 0, min: 0, max: 8, label: "parts", control: { kind: "slider", step: 1 } }], animations: [["n", 3]], tasks: task(5),
  });
  passes("FM-16", practice);
  fails("FM-16", revised(practice, { model: "circle", fractions: [{ as: "a", numerator: 3, denominator: 8 }] }), /drops the slider's binding/u);
  // Another card still bound to the slider keeps the practice working (review of #145, round 2).
  const second = buildFractionModel({ as: "m2", role: "main_visual", place: { relation: "new_region" }, model: "circle", fractions: [{ numerator: { expression: "n", initial: 0 }, denominator: 8, wholes: 1 }] });
  const kept = revised(lesson({ model: "circle", fractions: [{ numerator: { expression: "n", initial: 0 }, denominator: 8, wholes: 1 }] }, {
    variables: [{ as: "n", initial: 0, min: 0, max: 8, label: "parts", control: { kind: "slider", step: 1 } }], animations: [["n", 3]], tasks: task(5),
  }), { model: "circle", fractions: [{ as: "a", numerator: 3, denominator: 8 }] }, "model", [{ key: "again", say: "Again.", actions: second.actions }]);
  assert.doesNotMatch(verdict("FM-16", kept).hard.join(" | "), /drops the slider's binding/u);
  // What a case does not ask for holds at every step: a cut revised onto 2/5 is a miss, as the same cut written directly is.
  fails("FM-01", revised(lesson({ model: "bar", fractions: [f(2, 5)] }), { model: "bar", fractions: [{ as: "a", numerator: 2, denominator: 5, split: 3, highlight: 2 }] }), /split into 3, which the case does not ask for/u);
  fails("FM-01", lesson({ model: "bar", fractions: [f(2, 5, { split: 3, highlight: 2 })] }), /split into 3, which the case does not ask for/u);
});

test("checks needing no expectation: a lesson that does not normalize is a hard miss", () => {
  // Fractions shown equivalent that are not: the card refuses it, so the lesson does not normalize.
  const broken = lesson({ model: "bar", fractions: [f(2, 3), f(3, 4)], relation: "compare" });
  broken.steps[0].beats[0].actions[0].content.relation = "equivalent";
  fails("FM-06", broken, /OLL_INVALID_OPERATION_PAYLOAD|Fractions shown equivalent are equal/u);
});
