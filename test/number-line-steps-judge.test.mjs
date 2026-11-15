// The number-line steps judge (OLL decision 0017): each case's moves are met by a hand-written line of the
// kind a correct recipe produces, and one mutation per check fails it for its own reason.
import test from "node:test";
import assert from "node:assert/strict";
import { NUMBER_LINE_STEPS_CASES, judgeNumberLine } from "../scripts/eval-trial-recipe-speed.mjs";

const cases = Object.fromEntries(NUMBER_LINE_STEPS_CASES.map((item) => [item.id, item]));
const line = (range, points, jumps, extra = {}) => ({
  content: { range, ticks: { step: 1 }, points, jumps, ...(extra.bindings ? { bindings: extra.bindings } : {}), ...(extra.ticks ? { ticks: extra.ticks } : {}) },
  variables: extra.variables ?? [], tasks: [], animations: extra.animations ?? [],
});
const passes = (id, lesson) => assert.deepEqual(judgeNumberLine(cases[id], lesson).hard, [], `${id} should pass`);
const fails = (id, lesson, pattern) => {
  const { hard } = judgeNumberLine(cases[id], lesson);
  assert.ok(hard.some((miss) => pattern.test(miss)), `${id} should miss ${pattern}: ${hard.join(" | ") || "passed"}`);
};

const start = (value) => ({ as: "start", value, label: "start" });
const end = (value) => ({ as: "end", value, label: "end" });

test("ST-01: make ten, 8 → 10 → 13", () => {
  passes("ST-01", line({ min: 0, max: 20 }, [start(8), end(13)], [{ as: "j1", from: "start", by: 2, hops: true }, { as: "j2", from: 10, by: 3, hops: true }]));
  // The same sum in the wrong order: 8 + 3 + 2 never lands on 10.
  fails("ST-01", line({ min: 0, max: 20 }, [start(8), end(13)], [{ as: "j1", from: "start", by: 3 }, { as: "j2", from: 11, by: 2 }]), /wrong steps: expected 8 → 10, 10 → 13, drawn 8 → 11, 11 → 13/u);
  // One move: the make-ten step is missing, and 10 is never shown.
  const single = line({ min: 0, max: 20 }, [start(8), end(13)], [{ as: "j1", from: "start", by: 5 }]);
  fails("ST-01", single, /wrong steps/u);
  fails("ST-01", single, /wrong value: 10 is never shown/u);
  // Ticks of 10 leave the landing numbers on no labelled tick.
  fails("ST-01", line({ min: 0, max: 100 }, [start(8), end(13)], [{ as: "j1", from: "start", by: 2 }, { as: "j2", from: 10, by: 3 }], { ticks: { step: 10 } }), /unreadable: .*jump0\.from at 8/u);
});

// Tens then ones, each move animated from 0, as the recipe's moving card does.
const tensThenOnes = (last) => line({ min: 20, max: 60 }, [start(27), end(27)], [
  { as: "j1", from: "start", by: 0 }, { as: "j2", from: 27, by: 0 }, { as: "j3", from: 27, by: 0, hops: true },
], {
  bindings: [
    { target: "j1.by", expression: "a" }, { target: "j2.from", expression: "27 + a" }, { target: "j2.by", expression: "b" },
    { target: "j3.from", expression: "27 + a + b" }, { target: "j3.by", expression: "c" }, { target: "end.value", expression: "27 + a + b + c" },
  ],
  variables: ["a", "b", "c"].map((as) => ({ as, initial: 0, min: 0, max: 10, control: { kind: "slider", step: 1 } })),
  animations: [["a", 10], ["b", 10], ["c", last]],
});

test("ST-02: tens then ones on a moving card; moves of length 0 are not drawn", () => {
  passes("ST-02", tensThenOnes(5));
  fails("ST-02", tensThenOnes(4), /wrong steps: expected 27 → 37, 37 → 47, 47 → 52/u);
});

test("ST-03 and ST-05: a move that turns back over an earlier one", () => {
  passes("ST-03", line({ min: 0, max: 12 }, [start(5), end(3)], [{ as: "up", from: "start", by: 4 }, { as: "down", from: 9, by: -6 }]));
  fails("ST-03", line({ min: 0, max: 12 }, [start(5), end(4)], [{ as: "up", from: "start", by: 4 }, { as: "down", from: 9, by: -5 }]), /wrong steps/u);
  passes("ST-05", line({ min: -5, max: 8 }, [start(-3), end(2)], [{ as: "right", from: "start", by: 7 }, { as: "left", from: 4, by: -2 }]));
});

test("ST-04 and ST-07: counting back, and adding a ten too many then taking 2 away", () => {
  passes("ST-04", line({ min: 10, max: 35 }, [start(32), end(17)], [{ as: "tens", from: "start", by: -10 }, { as: "ones", from: 22, by: -5 }]));
  passes("ST-07", line({ min: 40, max: 90 }, [start(46), end(84)], [{ as: "add", from: "start", by: 40 }, { as: "back", from: 86, by: -2 }]));
  // Adding 38 in one move shows neither 86 nor the compensation.
  fails("ST-07", line({ min: 40, max: 90 }, [start(46), end(84)], [{ as: "add", from: "start", by: 38 }]), /wrong steps/u);
});

test("ST-06: four moves are a near miss: no line passes, a line is judged on its values", () => {
  assert.deepEqual(judgeNumberLine(cases["ST-06"], undefined).hard, []);
  passes("ST-06", line({ min: 0, max: 32 }, [start(6), end(30)], [
    { as: "j1", from: "start", by: 7 }, { as: "j2", from: 13, by: 8 }, { as: "j3", from: 21, by: 9 },
  ]));
});
