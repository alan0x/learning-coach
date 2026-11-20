# Fraction card redesign: cases and audit (2026-11-19)

The owner reopened the fraction card for redesign after three failed probes (`docs/FRACTION_PROBE_2026-11-19.md`, last section). These are the free steps, done before any amendment to OLL decision 0021 and before any paid call.

## Cases
- **Blueprint** (`testsuite/fraction-blueprint.json`): 15 fraction ideas from the Common Core standards (codes checked against thecorestandards.org), plus 3 near misses where a fraction-of-a-whole card would mislead (ratios of two parts, algebraic area models, percent change). Each row says what a teacher draws, independent of the card.
- **Development set** (`testsuite/fraction-dev-cases.json`, FD-01 to FD-24): written by me from the blueprint, each teacher picture before its prompt.
  - Mix: 12 short questions, 7 detailed requests, 5 topic names; 5 in Chinese, against the open questions' 45/30/24% and 20%.
  - All cases are under the case-overlap bars. FD-06 first came out identical to an open question and was rewritten.
  - Used for design and tuning.
- **Scoring set** (`handoff-math-expressiveness/sealed/fraction-scoring-cases.json`, FS-01 to FS-34): written by a fresh Fable agent from the blueprint alone, without the card, its guidance or any other case.
  - Sealed: I read only its IDs, counts, overlap scores and hash until the design is frozen; it is never used for tuning.
  - 2 cases per idea and 4 near misses; 15 questions, 10 detailed, 9 topics; 7 in Chinese.
  - The hash is recorded at freeze (below).

## Audit of the development set against today's card
Each case was hand-encoded as the closest card today's recipe can draw, compiled through Coach with the trial on, and read from OLL's plan of the drawing (wholes, shading, cuts, the marked share, labels, the relation line, the caption) by `handoff-math-expressiveness/tools/fraction-audit.mjs`. No model calls.

| Case | Teacher's picture (short) | Today's best card, as drawn | Verdict | Model must compute the answer? |
|---|---|---|---|---|
| FD-01 | a true half beside an unequal cut | one bar, 1/2 | mostly (no unequal contrast) | no |
| FD-02 | 1/2 and 1/3, two shapes | two circles, plus a line "1/2 > 1/3" nobody asked for | mostly (unasked comparison) | no |
| FD-03 | 5/6 counted as 1/6, 2/6 … | bar 5/6, no unit labels or count | partly | no |
| FD-04 | 4 = 12/3, four wholes in thirds | 4 bars in thirds, label "12/3" only | mostly | **yes** (12) |
| FD-05 | 1/2 = 2/4 = 4/8 stacked | two fractions only, "1/2 = 4/8" | partly | no |
| FD-06 | 3/6 = 5/10 aligned | "3/6 = 5/10" | **fully** | no |
| FD-07 | 5/8 vs 2/3 on pies, re-cut to 24ths | two circles, "5/8 < 2/3", no re-cut | mostly | no |
| FD-08 | 3/4 vs 3/8 | "3/4 > 3/8" | **fully** | no |
| FD-09 | 2/8 + 3/8 joined in two colours | one circle 5/8 | partly | **yes** (5/8) |
| FD-10 | 7/10 − 3/10, 3 crossed out | one bar 7/10 | partly | no |
| FD-11 | 2 1/3 as 3 wholes in thirds, = 7/3 | 3 bars, 7/3, label "7/3" only | partly | **yes** (7/3) |
| FD-12 | five copies of 3/4, regrouped to 3 3/4 | 15/4 on 4 bars, no copies | partly | **yes** (15/4) |
| FD-13 | 5 columns = 50 hundredths = 0.5 = 0.50 | grid 50/100, no decimal label | partly | no |
| FD-14 | one full grid and 25 squares, "1.25" | two grids, label "125/100" | mostly | **yes** (125/100) |
| FD-15 | 2/5 + 1/4 re-cut to twentieths | a line "2/5 > 1/4": contradicts an addition lesson | **misleading** | — |
| FD-16 | 2 sandwiches, a fifth from each | 2 bars in fifths, 2 pieces of the first marked, "Each share is 2/5" | partly (where the share sits) | encoding 2/1 split 5 |
| FD-17 | tape "3 m" in 4 pieces of 3/4 m | — | **not drawable** | — |
| FD-18 | tape of 24 children in 8 parts of 3 | — | **not drawable** | — |
| FD-19 | half of 3/5 (area model) | 3/5 cut in halves, 3 marked, "Each share is 3/10" | mostly (bar, not area) | no |
| FD-20 | 3 cups in quarter scoops, counted to 12 | 3 bars in quarters, "12/4", no count | partly | **yes** (12) |
| FD-21 | 1/3 cut in 2, each 1/6 | as taught, "Each share is 1/6" | **fully** | no |
| FD-22 | 35 squares, "35%" | grid 35/100, no percent label | mostly | no |
| FD-23 (near miss) | two tapes for a ratio | if drawn: "3/5 > 2/5", misleading | must not be drawn | — |
| FD-24 (near miss) | before and after tapes | if drawn on a grid: misleading | must not be drawn | — |

**In-scope cases (22):** fully 3, mostly 7, partly 9, not drawable or misleading 3. Split by 0021's scope (one fraction, compare, equivalent, split, several wholes, grids):
- **Inside 0021's scope (16 cases):** fully 3, mostly 7, partly 6, none misleading.
- **Outside it (6 cases; adding, subtracting, copies, quantities):** partly 3, not drawable or misleading 3. **In 7, the model has to compute the answer to the question just to write the card**, against decision 0020 (the program writes the logic).

Gaps, by type:
1. **Quantity (tape) view** with a total, a unit and a value on each part: FD-17, FD-18, and FD-16 and FD-20 naturally. Earlier: FM-14, FM-15, FM-N2.
2. **Number forms the program converts and labels:**
   - mixed numbers ("2 1/3 = 7/3"): FD-11;
   - decimals ("1.25", "0.5 = 0.50"): FD-13, FD-14, earlier FM-11;
   - percents: FD-22;
   - whole numbers ("4 = 12/3"): FD-04.
3. **Operation views:**
   - joining in two colours: FD-09, FD-15;
   - crossing out: FD-10;
   - copies (n × a/b): FD-12;
   - re-cutting to a common denominator: FD-07, FD-15;
   - three fractions: FD-05.
4. **A relation line the program adds when nothing is being compared:** FD-02, FD-15, FD-23, earlier FM-11 and FM-17.
5. **Unit parts labelled or counted:** FD-03, FD-20.
6. **Where a share sits** (one piece from each whole when sharing): FD-16, earlier FM-13 in probe 1.
7. **A two-way area model:** FD-19, where the bar is an acceptable alternative.

## Free checks
1. **What lessons show today without the card** (all three probes, the card off; read from the drawn content, not only the narration):
   - **FM-14 (3 m cut into 4):** number lines whose jump goes 3 → 3.25, 0 → 0.25, and 0 → 0. None shows 3 m cut into 4, and each contradicts narration about pieces of 3/4 m.
   - **FM-15 (1/3-litre cups):** jumps 0 → 1/3 and 0 → 0, and once a 2 × 3 array whose fixed caption says "each square has an area of 1 square unit", under a cups problem.
   - **FM-13:** a 5-column area array (a fair picture), with the same area caption.
   - **FM-10:** no picture, with narration that shades a grid that is not on the board.
   - **FM-11:** lost.

   Today, these quantity problems get a wrong number line, an area array captioned for area, or nothing. "No worse than card-off" is a low bar for them, and the card-off arm needs its own reading in any future probe. (An earlier draft of this record, from the narration only, said today's pictures sometimes beat the card; the drawn content does not support that.)
2. **Can the narration see the card?** Not in the same call: each section's reply carries its narration and its card's values together (seen in every saved reply). Three options:
   - a second call per section, which costs time and changes every request with the trial on;
   - a check after compiling that compares numerals in the narration with the card's computed facts and asks again on a contradiction. Decision 0020 allows a re-ask on wording, and the praise check (Coach #120) is the numerals-only precedent; no word lists;
   - program-written labels and captions that state the facts, as "Each share is 3/20" does now.

   Gaps 2 and 4 are partly this third kind.
3. **Saved replies fewer than calls** (19 of 46 rows in probe 3):
   - In 16, the missing reply is a call started after the first section was published, which the runner stops (first playable reached). Nothing judged is lost.
   - Two (FM-10 baseline, FM-12 candidate) are one short with no later call: unexplained.
   - One (FM-N6 baseline) hit the call cap.
   - Rejected first-section cards are inside the saved bootstrap reply, so free re-compiles of saved replies cover every judged attempt.

## Checks of the sealed set
- A fresh agent checked the arithmetic of all 34 cases without revealing any text: every result, equation and picture fits its prompt.
- A second copy is kept outside the repository.

## Scoring set hash at freeze
Eight sealed cases were first over the overlap bars and were reworded by the same agent, which saw only IDs and scores. All 34 are now under the bars; the file is read-only.

**SHA-256 `1fbcdcc098630c5a1b6830059c9ce7f3f6b404bdb27984ea89bff070f38d4468`.** Any edit changes it; it is checked again before scoring.

## Gaps ranked by gain
Ranked by open M1 questions completed, as 0021's table did, and by probe misleads removed. Not ranked by development-case counts: the set has one or two cases per row by construction.

| Gap | Open M1 questions it would complete | Probe misleads it would have removed |
|---|---|---|
| Quantity (tape) view | 4: G35-31, G68-08, G68-12, G68-38, all tagged for the planned tape-diagram component (`tape_diagram_ratio_table`: "bars of labelled parts and totals"), not the fraction card | FM-14 (probes 2, 3), FM-15 (probes 1, 2) |
| Where the split view marks the share: one small piece in each shaded part, not a run from the start | 1: G35-40 (two sandwiches in thirds, a third from each: with a denominator of 1, one piece per whole) | FM-13 (probe 1: narration took one piece from each shaded fifth; the card marked three pieces inside the first fifth) |
| A two-fraction view that is not a comparison, or an input that needs only one fraction (1.6 as a decimal) | 0 | FM-11 (probes 1 and 3: the model chose compare because no other view takes two fractions; dropping the line alone would not have helped) |
| Decimal and mixed-number input, converted and labelled by the program | 0 | FM-11 (probes 1 and 3; in probe 2 it failed on a re-ask that lost 160/100), FM-10's labels |
| Operation views (join, cross out, copies, re-cut) | 0 tagged | none |
| Area model (two-way) | 0 for fractions (G912-06 is algebraic, kept for its own decision) | none |

## Paid diagnostic on the development set (registered before the run)
The owner approved (2026-11-19) the four recommendations: the labelled-quantity picture becomes its own tape-diagram card, built before the fraction card is switched on; the fraction fixes and the tape card come first, then counters (OLL decision 0022 stays on hold); the scoring method below; and this diagnostic, run before the views of a smaller first version are chosen.

**Purpose.** To see how the model uses today's card on natural questions and to separate the model's choices from the card's gaps. One run per case and arm, so there are no rates and no pass or fail. Not one of the two scoring runs, and the sealed set is untouched.

**Run.**
- Build: probe 3's frozen build, Coach 420695d. Main (0ef1c50) differs from it only in docs and testsuite. `lesson-plan.js` SHA-256 `f8981f19…81ef`, `main` `5acc24ff…d711`.
- Cases: `testsuite/fraction-dev-cases.json` (SHA-256 `631acd12…850c`), reordered in the run directory (`dev-cases-ordered.json`, `e40a6a42…3f77`) so that a call cap cuts the least informative cases:
  - first the tape and near-miss cases: FD-17, 18, 23, 24;
  - then operations and number forms: FD-15, 16, 20, 09, 10, 12, 11, 04, 14, 13, 22, 19;
  - then FD-03, 05, 01, 02, 07;
  - last the three cases today's card draws fully: FD-06, 08, 21.
- Model and limits: Gemini 3.6 Flash on the dev key (`~/.octos/profiles/dev-probes.json`), with the card on and off, alternating which goes first. 48 lessons at about 2.2 calls each (probes 1–3: 2.22, 2.26, 2.20), 4 calls per lesson, a cap of **130** calls, not raised.
- Command: `--pairs 0 --recipes fraction_model --cases-file <dev-cases-ordered.json> --both-arms --quality-repeats 1 --lesson-calls 4 --max-calls 130`.
- The cases carry no expectations, so the runner judges nothing. Checks before the run continues:
  - the header names `trial_recipes: fraction_model`;
  - the first in-scope lesson with the card on lists `fraction_model`, or the run is stopped.

**Reading, fixed now.**
1. **Each lesson with the card on.** Its card is read from OLL's plan of the drawing (`describe` in `tools/fraction-audit.mjs`) and set beside that case's best card in the audit above. The lesson goes in one of three groups:
   - **reached:** the model drew the best card today's card allows;
   - **short:** it fell short of that card. This is the model's choice.
   - **gap:** it reached that card, but the card is poor. This is the card's gap.
2. **Each lesson with the card off.** Read from what it draws (not the narration): what it showed instead, and whether that picture is right.
3. **Counted across the run:**
   - whether a card was drawn on FD-17 and FD-18 (no card fits), and on FD-23 and FD-24 (no card should be drawn);
   - how many first replies lack `fractions`;
   - in the 7 cases where the answer would have to go on the card, whether the model computed it and whether it was right;
   - calls and re-asks per arm.
4. **The use.** The groups decide which views and inputs the 0021 amendment's first version gets: a gap that recurs earns a view; a short that recurs earns guidance or a refusal; no amount of either changes the cases.
