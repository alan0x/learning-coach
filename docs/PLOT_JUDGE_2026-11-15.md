# Function-plot judge (OLL decision 0018), 2026-11-15

Plan §5 puts a judge before the recipe. The function plot had none (0018 question 3). This adds the judge, its cases and its counterexamples. No recipe code and no paid calls.

## What it judges
`scripts/plot-judge.mjs` takes a whole authoring lesson. A lesson's marks may land in a later section, and the speed harness judges only the first playable part.

**How it reads the plot.** It reads what the plot draws through OLL itself:
- the lesson is normalized;
- the plot's bindings are evaluated with OLL's evaluator at each state, and a mark whose value doesn't exist is hidden, as the player hides it;
- curves are evaluated with the player's plot expressions (`sqrt`, `log`, `^`).

Parts are matched by coordinates and intervals, never by name, so a recipe's naming can't satisfy it.

**Expected values.** Written into each case before any run (0018 §4):
- the curve's points;
- marked points;
- guides;
- the slope triangle's Δx and Δy;
- the pieces, with their ends;
- the domain and range bars, with their ends.

An expectation is met when some state the lesson shows draws it: the starting values, then each animation in order. Which ends are included comes only from the case, because sampling can't tell "reaches 0" from "comes close to 0" (0018 §3).
- A marked point is a labelled point other than the slope triangle's two. Reference point A at x = 0 doesn't count as the y-intercept mark.

**Checks that need no expectation.** These run at every state the lesson shows and at every stop of every slider. A number with no slider is swept only over the values its animations pass through, so a state no lesson reaches is never a miss (review). Both review bugs in OLL #62 appeared only mid-slider or at a = 0, and practice invites dragging. Each one is a hard miss:
- a visible point off every drawn curve (skipped when the plot has an implicit curve);
- a number in the label of a part that moves;
- the function undefined somewhere inside the domain bars, or defined outside them, sampled on a grid, at whole numbers and at every bar end;
- a value outside the range bars;
- domain or range bars beside more than one function, where it's ambiguous which function they describe;
- the lesson failing at some stop (a mark without `hide_when_undefined` where its value stops existing).

**Bar ends** are compared with a relative tolerance of 1e-12: enough for rounding, while an asymptote's approach (e^−21 above an open end) still counts as inside (review).

**Not judged:** narration. What a lesson says is read by hand under the probe's pass rules.

## Cases: `testsuite/plot-judge-cases.json`
- 17 cases, written for the judge, none taken from the question set.
- Overlap was scored against all 160 questions, using Jaccard over content words and Chinese bigrams. The script prints only case IDs and scores. Every case scores at most 0.20 against open questions and 0.15 against held-out ones. Three drafts that sat close to an open question (0.33–0.67) were rephrased before any expectation was written.

| Cases | What they cover |
|---|---|
| PJ-01–06 | `marks`: slope triangle, intercepts, vertex and symmetry axis, a parabola with no x-intercept, marks while a or k crosses 0 |
| PJ-07–09 | `pieces`: a constant piece, a curved piece, three constant steps |
| PJ-10–14 | `domain`/`range`: closed and open ends, a point left out of each, a range after a flip |
| PJ-15, PJ-16 | Near misses: cubic and sine ranges, which 0018 leaves out. No plot passes. A plot passes on its curve plus the checks needing no expectation, i.e. no worse than today and nothing wrong drawn |
| PJ-17 | Control: a plain plot |

## Counterexamples: `test/plot-judge.test.mjs`
- Every case is met by a hand-written lesson of the kind a correct recipe should produce; a test checks this.
- Each check fails one mutation of a passing lesson, and the test asserts the miss message, so each counterexample fails for its own reason:
  - a triangle measured on a mark;
  - a reference point off the line;
  - an intercept matched only by reference point A;
  - a misplaced intercept;
  - a wrong axis;
  - a number in a moving label;
  - an unhidden intercept at k = 0;
  - piece ends swapped open and closed;
  - a wrong constant piece;
  - a domain bar across x = −1;
  - a filled end on an open range end;
  - a range bar left on the wrong side after the flip;
  - a closed end where the range or domain is open;
  - a bar that stops short;
  - a domain bar that starts too late;
  - a false range bar on an out-of-scope cubic;
  - bars beside two functions;
  - a wrong curve;
  - a lesson without a plot.

**Run on today's recorded lessons:** 134 recorded lessons from the baseline, the step-2 probe and control, the #78 rerun and the practice-invitation probe. 27 have a plot, and all 27 pass the checks that need no expectation. Only counts were printed.

## For the probe (later, with the owner's approval and call count)
- `eval-math-expressiveness.mjs --cases-file testsuite/plot-judge-cases.json` saves each case's whole lesson.
- `node scripts/plot-judge.mjs testsuite/plot-judge-cases.json <run dir>` then judges each one.
- Pass rules and the control arm are written before that run. The request bytes of the `marks` and `pieces` options are measured on a prototype before recipe code (0017/0018 question 5).
