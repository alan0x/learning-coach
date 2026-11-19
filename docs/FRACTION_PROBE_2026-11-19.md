# Fraction model probe 1 (run 2026-11-19: fails bars 2 and 4)

Decision 0021 §5 step 4: a small paid probe of the `fraction_model` trial recipe (Coach #131, with #132's runner and caption fix), quality only. **It needs the owner's approval of the call cap before it runs**, and it waits for the owner's answer on how a fraction's slider is made (FM-16 is left out until then).

## Setup, fixed before the run
- **Cases:** the fraction judge's 23 cases without FM-16 (`testsuite/fraction-judge-cases.json`): 17 in scope (FM-01–15, 17, 18) and 6 near misses (FM-N1–N6). All are new; none comes from the question set (`scripts/case-overlap.mjs` passes).
- **Arms:** candidate (the trial on) and baseline (the trial off), each case once on each arm (`--both-arms`), alternating which goes first.
- **Build and runner:** Coach main at the commit that merges this record, frozen; its `lesson-plan.js` and `main` are the build, and its runner is the one that holds the fraction cases (#132).
- **Command:** `node scripts/eval-trial-recipe-speed.mjs --build <that checkout> --octos-profile <owner's profile> --pairs 0 --recipes fraction_model --both-arms --quality-repeats 1 --lesson-calls 4 --max-calls 180 --out <report.json>`. Without `--max-calls` the runner stops at 60 calls.
- **Calls:** 46 lessons. At about 3 calls each (the solids probes averaged 3.4 per lesson) that is about 140; the cap asked for is **180**, a little under the 184 that 46 lessons at the 4-call limit could use. A lesson that starts with fewer than 4 calls left is reported as not run, never judged.
- **Judged:** the first playable section of each lesson by `scripts/fraction-judge.mjs`. Every candidate lesson that draws a fraction card is also read by hand for narration that contradicts the card (a wrong share, "equal" for unequal fractions, parts the card does not show).

## Pass bar, written before the run (plan §5 rule: two sides; judged only against this)
The bars are read from the report's rows. The runner's own summary counts near misses with the in-scope cases and applies the older slip rule, so it is not the verdict.
**Must improve:**
1. At least **12 of the 17** in-scope cases pass the fraction judge (no hard miss) on the candidate arm.

**Must not lose:**

2. **Near misses:** the candidate draws a forbidden fraction card in at most **1 of 6**.
3. **Lost lessons** (no playable first section): the candidate loses no more than the baseline plus 1, over all 23 cases.
4. **Misleading narration** on a candidate fraction card, read by hand: at most **1** lesson.

A near pass is reported as a miss. Another probe is a new paid step that the owner approves like any other.

## Known risks, recorded before the run
- **"How many 1/3s in 2" (FM-15):** the recipe marks one share whenever parts are split. If the model writes 2/1 split into 3 instead of 6/3, two pieces are marked and the judge fails it. The card does not say which form to use.
- **A split view always marks a share and names it** (review of #131). A model that uses split only to count pieces (4 ÷ 1/5 written as 4/1 split 5) or to show 3/4 = 6/8 gets a share it did not ask for; the judge counts an unasked share as a miss, and the hand reading watches for it.
- **A fault in section 2 or later** (a value the card cannot hold) is retried as a section; if every retry fails, the lesson is lost after section 1 has played, the 3.8 pattern. Bar 3 counts these.
- **Request cost** with the trial on: card 220 B and schema 292 B on the first request, within 0021's 700 B.

## Result (run 2026-11-19, approved by the owner; slider left out of v1 by the owner the same day)
Build Coach `98d3938` (frozen copy), Gemini 3.6 Flash via the owner's profile, 46 lessons, **102 calls** of the 180 cap, none not run. Report and lessons: `handoff-math-expressiveness/runs/fractions/probe-1/`.

| Bar | Result | Verdict |
|---|---|---|
| 1. In-scope judge passes | **14 / 17** (misses FM-11, FM-14, FM-15) | pass |
| 2. Near misses with a fraction card | **3 / 6** (FM-N1, FM-N2, FM-N5) | **fail** |
| 3. Lost lessons | candidate 1 (FM-N6), baseline 2 (FM-10, FM-N5) | pass |
| 4. Misleading narration, read by hand | **2** (FM-11, FM-15) | **fail** |

**Probe 1 fails.** No switch-on; another probe is a new paid step.

What the rows and raw replies show:
- **Near misses (bar 2).** The model drew the card for an unequal "half" (N1: an equal 1/2 bar beside narration that says the halves are unequal), a fraction of a set (N2: a 1/4 bar for 1/4 of 12 marbles) and a ratio tape (N5: 4/5 and 1/5 compared, so the card reads "4/5 > 1/5"). None draws a wrong value, but each is a card the case forbade. N6 (5/37) asked for a bar of 37 parts, was refused three times, and the lesson was lost; the baseline played it.
- **FM-11 (1.6 on hundred grids).** The model wrote two fractions, 100/100 and 60/100, as *compare*. The card draws "100/100 > 60/100" while the narration adds them to make 1.6. Counted as misleading. One fraction, 160/100, draws the two grids correctly.
- **FM-15 (cups of 1/3 in 2 litres).** The model wrote 1/3 in one whole; the narration counts six cups across two litres that the card does not show. Counted as misleading. This is the risk recorded above, in a different form.
- **FM-14** used the number line, as allowed by the case but without a fraction card; a judge miss, not a fault.
- **A runaway `split` (new, not foreseen).** In 11 of 23 candidate lessons the first reply filled the optional `split` with a degenerate integer of more than 70 digits, mostly when the view was not *split*. The section was refused (`expected a finite number`) and asked again. This is why the candidate arm used more calls: 47 for the 17 in-scope lessons against 28 on the baseline. Other refusals: a view with the wrong number of fractions (4), `split` beside a view other than *split* (2), a grid split again, hundredths on a bar.
- FM-N2 used 5 calls under `--lesson-calls 4`: the limit is checked before a retry starts, so one lesson can go one over. The cap arithmetic above holds within one call per lesson.
- The bar script first read only `quality` rows and missed the `near_miss` rows; fixed before the verdict above.
