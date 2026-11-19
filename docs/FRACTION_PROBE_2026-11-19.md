# Fraction model probe 1 (planned 2026-11-19; not run)

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
