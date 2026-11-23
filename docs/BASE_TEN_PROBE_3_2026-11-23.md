# Trading mat probe 3 (the mat with a slider; 2026-11-23)

A paid probe of the trading mat after the owner's ruling of 2026-11-23: "I think all interactive components should support slider-based interaction." The owner authorized paid probes in advance (2026-11-22). This record, with its bars, is merged before any call.

## What changed since probe 2, and what this probe must show
Probe 2 failed all four bars. Its main cause was that the model wrote slider tasks and slider words for a mat that had no slider:
- slider targets were 23 of the 33 refusals, and caused all three lost lessons;
- 16 of 19 surviving trading tasks used slider words;
- slider words appeared in 8 of the 13 misleading lessons.

The mat now has the slider the model expects (OLL decision 0023 amendment 4; `docs/BASE_TEN_TRADE_2026-11-22.md`, last section):
- the ones, and the tens on a three-column mat, slide in steps of ten;
- each stop is one trade, made and animated by the card's own rules;
- the model's slider task is the child's task, from the lesson's pile (or that pile with its ones traded), to any value reached by trading down.

Nothing else changed: the model's lesson pipeline, the guidance except one clause about the slider, and the judge except its task check.

This probe answers one question: with the slider, do the refusals and misleading slider words go away, without new faults?

## Setup, fixed before the run
Identical to probe 2 (`docs/BASE_TEN_PROBE_2_2026-11-23.md`) except for the build:
- **Cases:** the same 33 development cases (`testsuite/base-ten-dev-cases.json`): 26 trading questions (16 English, 10 Chinese) and 7 near misses (4 English, 3 Chinese). None comes from the question set. The sealed scoring set is not used.
- **Lessons:** whole lessons.
- **Arms:** candidate (`--trial base_ten_trade`) and baseline (no trial), each case once per arm.
- **Model:** the dev-probe profile (Gemini 3.6 Flash).
- **Build:** Coach main at the commit that merges this record (with OLL at the slider commit): its `main` and `lesson-plan.js`, copied to `handoff-math-expressiveness/runs/base-ten/probe-3/build` and frozen.
- **Smoke first:** BT-07 and BT-27 on the candidate arm. It confirms four things:
  - the mat's ones carry a step-10 slider;
  - the model's slider task compiles to a slider task on the mat;
  - the model's animation plays as trades;
  - the judge reads the saved lesson.
- **Commands and caps:** as in probe 2: smoke 12, then 198 per arm, so 408 calls at most (411 started at most).
- **Reading file:** `handoff-math-expressiveness/runs/base-ten/probe-2/annotate.mjs`, extended to name a slider task and the pile it starts from.

## Pass bar, written before the run (two sides, per language; judged only against this)
The same four bars as probes 1 and 2.

**Must improve:**
1. On the candidate arm, at least **13 of 16** English and **8 of 10** Chinese trading questions pass the judge.

**Must not lose:**

2. **Near misses:** the candidate draws the mat in at most **1 of the 7**.
3. **Lost lessons** (no playable lesson): for each language, the candidate loses no more than the baseline plus 1.
4. **Misleading narration** on a candidate mat, read by hand: at most **1** lesson per language. The pass line is unchanged from probe 1 (probe 2 record, "Narration pass line"). "Slide the ones to 6" is now an action the mat allows; telling the learner to act in a way the mat cannot still counts.

**Stop rule (owner, 2026-11-23):** if any bar fails, the work stops and the result is reported. No further design is tried without the owner.

### What the judge checks (bar 1)
- one mat; the lesson pile is the question's; the columns fit the pile;
- every step keeps the amount, and the lesson ends with no trade left;
- a pile that needs a trade has the learner's own task on the mat: the mat's slider, or tapping until no trade is left. It starts from the lesson's pile, trays empty (a tens slider may start with the ones traded: the same amount);
- a typed question follows;
- the mat speaks the lesson's language.

## Reported, not bars
- **Refusals by kind,** set against probe 2's (slider targets were 23 of 33).
- **Slider tasks** and their targets: fully traded, or partly.
- **Trades left unmade,** and calls per lesson against the baseline.
- **Probe 2's other causes:** a later section re-explaining the starting pile while the mat shows it traded, and a reset for the child's turn. Counted again to see whether they remain.

## Known risks, recorded before the run
- The mat's slider shows the count of one place. A typed question asking for that count would be on the screen; reading by hand catches that under bar 4's "states the answer" only if the narration says it. This is reported, not a bar.

## Result: probe 3 fails bars 1 and 4; stopped (run 2026-11-23)
**Build and calls.** The build is 81ca1e9, frozen in `handoff-math-expressiveness/runs/base-ten/probe-3/build`. Calls: smoke 5, candidate 73, baseline 85, so 163 in all. The smoke showed no build or runner fault.

| Bar | Need | Result |
|---|---|---|
| 1. Trading questions pass the judge | EN ≥ 13 of 16, ZH ≥ 8 of 10 | **Fail:** EN 9, ZH 5 |
| 2. Mat drawn on near misses | at most 1 of 7 | Pass: 1 (BT-32, 46 + 37) |
| 3. Lost lessons | candidate ≤ baseline + 1 | Pass: EN 0 vs 1, ZH 1 vs 1 |
| 4. Misleading narration | at most 1 per language | **Fail:** EN 6 (4 firm), ZH 6 (4 firm) |

### What the slider fixed
- **Refusals** fell from 33 (probe 2) to 7. Slider targets the mat could not reach fell from 23 to 6; the 6 left are targets that would change the total ("the loose ones to 15"). The seventh is an animation upward.
- **Lost lessons** fell from 3 to 1 (BT-26).
- **Slider tasks on the mat:** 17 of the 26 trading lessons have one, against 19 card tasks in probe 2. 16 of the 17 slide to the fully traded count; BT-25 slides to a partial count.

### Why bar 1 fails (EN: BT-01, 03, 05, 07, 09, 10, 13; ZH: BT-22, 24, 26, 27, 29)
- **The model uses the slider to set a count, not to make a trade: 9 lessons** (BT-01, 05, 10, 12, 13, 24, 25, 27, 32). Their slider tasks ask to go "back to 13" or "调回 23根": the starting pile, which the task already opens on. The program drops each such task ("the loose ones are already 13"). In five of these lessons (BT-01, 05, 13, 24, 27) the only task on the mat was dropped. The model writes this in the same way it uses every other component's slider: move a number, and the picture follows.
- **No typed question: 4 lessons** (BT-03, 10, 22, 29).
- **Trades left unmade: 2 lessons.** BT-07 never trades its tens; BT-09 ends with ten tens.
- **Lost: BT-26.**

### Why bar 4 fails (blind reading of `candidate-narration.txt`)
- **A later part retells the starting pile or the trade while the mat shows the finished pile: 6 lessons** (BT-12, 13, 22, 25, 27, 32). This is the main source of firm faults, and the same cause as in probe 2 (BT-02, 09, 11, 27 there).
- **A tens trade narrated but never made on the mat: 2 lessons** (BT-07, 09).
- **An invitation to trade "these 10" when the mat no longer holds them: 2 lessons** (BT-03, 28).
- **A faulty task prompt: 2 lessons.** BT-23 asks the trade backwards; in BT-15 the lesson's own example states the typed answer.
- **Read as not misleading:** 10 lessons end by inviting the learner to slide to a value the mat already shows at that moment. The slider task starts from the lesson's pile, where the move is real, so the reader scored these as not misleading under rule 4. Read the other way, more lessons would fail.

### What this means
The slider removed probe 2's main cause: refused slider targets and the lessons they lost. What is left is the model's writing, not the mat:
- the model treats a slider as "set this count";
- the model loses track of what the mat shows across sections.

The second appeared in all three probes. Under the stop rule no further design is tried without the owner.
