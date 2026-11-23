# Trading mat probe (OLL decision 0023, step 4; 2026-11-22)

A small paid probe of the `base_ten_trade` trial recipe (Coach #157), quality only. The owner authorized paid probes in advance (2026-11-22); this record, with its pass bar, is merged before any call, as plan §5 requires.

## Setup, fixed before the run
- **Cases:** the development cases BT-01–33 (`testsuite/base-ten-dev-cases.json`).
  - English BT-01–20: 16 trading questions and 4 near misses (BT-17–20).
  - Chinese BT-21–33, new in this PR: 10 trading questions and 3 near misses (BT-31–33). They are written from the blueprint's rows T1–T5, with piles of their own (two and three columns, a zero place, 100 as ten tens).
  - None comes from the question set. `scripts/case-overlap.mjs` passes: highest scores 0.20 open and 0.10 held-out. BT-31 and BT-32 were over the bar at first and were reworded with more context of their own.
  - The sealed scoring set is not used.
- **Arms:** candidate (`LEARNING_COACH_TRIAL_RECIPES=base_ten_trade`) and baseline (the trial off). Each case runs once on each arm (`--both-arms`), alternating which goes first.
- **Build:** Coach main at the commit that merges this record, copied to `handoff-math-expressiveness/runs/base-ten/probe-1/build` (`main`, `lesson-plan.js`, `COMMIT`) and frozen. It pins OLL 728c279.
- **Model:** the dev-probe profile (`~/.octos/profiles/dev-probes.json`, Gemini 3.6 Flash, the app's lesson model on its own key).
- **Smoke first:** BT-01 and BT-21 on the candidate arm only, to confirm that the mat is drawn in the lesson's language and the judge reads the part. The smoke counts toward the cap. If the smoke shows a runner or build fault, the batch does not start.
- **Command (smoke):** `node scripts/eval-trial-recipe-speed.mjs --build <frozen build> --octos-profile ~/.octos/profiles/dev-probes.json --pairs 0 --recipes base_ten_trade --cases BT-01,BT-21 --lesson-calls 4 --max-calls 10 --keep-parts <run>/smoke-parts --out <run>/smoke.json`. Its parts go in a folder of their own: its file names match the batch's.
- **Command (batch):** `node scripts/eval-trial-recipe-speed.mjs --build <frozen build> --octos-profile ~/.octos/profiles/dev-probes.json --pairs 0 --recipes base_ten_trade --both-arms --quality-repeats 1 --lesson-calls 4 --max-calls 280 --keep-parts <run>/parts --out <run>/report.json`
- **Calls:** 66 lessons at the 4-call limit, which is 264: English 40 lessons (160), Chinese 26 (104).
  - A lesson stopped at its limit has already started a 5th call, which counts (review of #158). The batch cap is therefore **280**, which leaves room for 16 such lessons.
  - The smoke's cap is 10 (2 lessons). The total cap is **290**.
  - A missing or bad number among the six costs one re-ask, inside the 4-call limit.
  - A lesson that starts with fewer than 4 calls left runs with what is left. One stopped at that smaller limit is a hard miss ("not judged: call_cap"). Lessons the budget never reaches are reported as not run.
- **Judged:** the first playable part of each lesson, by `scripts/base-ten-judge.mjs` (inside the runner). Every candidate lesson that draws the mat is also read by hand for its narration (below).

## Pass bar, written before the run (plan §5: two sides, per language; judged only against this)
Read from the report's rows, not from the runner's summary.

**Must improve:**
1. On the candidate arm, at least **13 of 16** English and **8 of 10** Chinese trading questions pass the judge (no hard miss).

**Must not lose:**

2. **Near misses:** the candidate draws the mat in at most **1 of the 7**, both languages together. This is stricter than one per language.
3. **Lost lessons** (no playable first part): for each language, the candidate loses no more than the baseline plus 1.
4. **Misleading narration** on a candidate mat, read by hand: at most **1** lesson per language.

A near pass is reported as a miss. A second probe after a fix is allowed under the owner's authorization, but it gets its own record and the same bars.

## Narration pass line (the hand reading, fixed before the run)
The program speaks the trade steps. The model writes the narration around them. A lesson's narration is **misleading** when it does any of the following:
- states a count, number or trade that contradicts the mat at that moment (for example, "four tens" while the mat shows three, or a trade the mat does not make);
- teaches a different pile from the one the mat draws;
- states the practice pile's number, counts or place values, which are the answers the child is about to type;
- tells the child to act in a way the mat cannot (drag, a slider, writing on the mat).

These are **not** misleading:
- restating the question's own numbers;
- naming the result of the lesson pile's trade after the demonstration has shown it.

## Known risks, recorded before the run
- **The six numbers are optional in the first reply's schema** (fraction probe 2's cause). A missing one is refused and re-asked with all six required, which costs time and calls.
- **The mat in a later section:** the judge sees only the first part. A mat drawn only in section 2 counts as a miss. The runner flags it for reading by hand.
- **Practice start:** in Learn the mat animates from the lesson pile to the practice pile, showing wrong amounts for about a second (OLL, open). The probe does not judge playback.
- **Request cost** with the trial on: prompt 279 B, schema 382 B (661 B).

## Result
Not run yet.
