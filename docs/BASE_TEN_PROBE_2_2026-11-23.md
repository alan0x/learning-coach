# Trading mat probe 2 (the rebuilt recipe; 2026-11-23)

A paid probe of the trading mat as rebuilt on lesson numbers (Coach #160, `docs/BASE_TEN_TRADE_2026-11-22.md`, last section). The owner authorized paid probes in advance (2026-11-22). This record, with its bars, is merged before any call.

## What changed since probe 1, and what this probe must show
Probe 1 failed bars 2 and 4. The rebuild changes who writes what: the pile is lesson numbers, the model writes the trades in its own moments and writes the practice. So this probe answers three questions the tests cannot:
1. Does the model move the blocks when it explains a trade, or only talk about it?
2. Do its words and the mat now agree at every moment?
3. Does it write the learner's trading task and a typed question?

## Setup, fixed before the run
- **Cases:** the same 33 development cases as probe 1 (`testsuite/base-ten-dev-cases.json`): 26 trading questions (16 English, 10 Chinese) and 7 near misses (4 English, 3 Chinese). None comes from the question set. The sealed scoring set is not used.
- **Whole lessons, not first parts.** The model's practice can sit in a later section or in the practice request that follows a one-section lesson, so the judge needs the whole lesson. This is the main difference from probe 1's setup.
- **Arms:** candidate (`--trial base_ten_trade`) and baseline (no trial), each case once per arm, each arm in its own run folder.
- **Build:** Coach main at the commit that merges this record: its `main` and `lesson-plan.js`, copied to `handoff-math-expressiveness/runs/base-ten/probe-2/build` and frozen.
- **Only a row whose outcome is a whole lesson is judged.** The runner saves no lesson for a case that failed or was stopped, and the judge reports it missing.
- **Model:** the dev-probe profile (`~/.octos/profiles/dev-probes.json`, Gemini 3.6 Flash).
- **Smoke first:** BT-07 and BT-27 on the candidate arm (a trade of ones then tens, English and Chinese). It confirms that `report.json` names the trial recipe, the mat is drawn from lesson numbers, the model's animation plays as trades, and the judge reads the saved lesson. If the smoke shows a build or runner fault, the batch does not start.
- **Commands:**
  - smoke: `node scripts/eval-math-expressiveness.mjs --build <build> --octos-profile ~/.octos/profiles/dev-probes.json --cases-file testsuite/base-ten-dev-cases.json --ids BT-07,BT-27 --trial base_ten_trade --lesson-calls 6 --max-calls 12 --out <run>/smoke`
  - candidate: the same with no `--ids`, `--max-calls 198 --out <run>/candidate`
  - baseline: the same without `--trial`, `--max-calls 198 --out <run>/baseline`
  - judge: `node scripts/base-ten-judge.mjs testsuite/base-ten-dev-cases.json <run>/candidate`
- **Calls:** in the two earlier whole-lesson runs a lesson took 2.3 and 2.4 calls on average, and 4 at most. That makes about 80 per arm and about 165 in all. The caps are 12 for the smoke and 198 per arm (33 lessons at a 6-call limit), so **408**. The runner stops before a lesson that would start with fewer than 6 calls left, and says so. A lesson is stopped as its 7th call starts, so each run can start one call past its cap: 411 started at most.

## Pass bar, written before the run (two sides, per language; judged only against this)
The same four bars as probe 1. Bar 1 uses the rebuilt judge, whose checks are listed below.

**Must improve:**
1. On the candidate arm, at least **13 of 16** English and **8 of 10** Chinese trading questions pass the judge.

**Must not lose:**

2. **Near misses:** the candidate draws the mat in at most **1 of the 7**.
3. **Lost lessons** (no playable lesson): for each language, the candidate loses no more than the baseline plus 1.
4. **Misleading narration** on a candidate mat, read by hand: at most **1** lesson per language.

**Stop rule (owner, 2026-11-23):** if any bar fails, the work stops and the result is reported. No further design is tried without the owner.

### What the judge checks (bar 1)
- one mat; the lesson pile is the question's; the columns fit the pile;
- every step keeps the amount, and the lesson ends with no trade left;
- a pile that needs a trade has the learner's own task on the mat, starting from the lesson's pile and ending when no trade is left;
- a typed question follows;
- the mat speaks the lesson's language.

It no longer checks a separate practice pile or the wording of prompts: those were the program's work in probe 1 and are the model's now.

### Narration pass line (bar 4), unchanged from probe 1
A lesson's narration is **misleading** when it:
- states a count, number or trade that contradicts the mat at that moment;
- teaches a different pile from the one the mat draws;
- states the answer to a question the learner is about to type;
- tells the learner to act in a way the mat cannot.

Restating the question's numbers, and naming a trade's result in or after the moment that makes it, are not misleading. The reading is done by a fresh agent, blind to the arm where that is possible, from a file that shows the pile on the mat beside every sentence.

## Reported, not bars
- **Trades left unmade:** lessons where the pile needs a trade and the model never animates it (the paper test found 3 of 26 that only said "can").
- **Refusals by kind,** and calls per lesson against the baseline.
- **Typed questions, read by hand:** is the answer absent from the screen and the narration, and is the arithmetic right?
- **Time to the first playable part,** both arms.

## Known risks, recorded before the run
- **The model may not animate.** Nothing forces a moment that says "trade" to carry an animation. Bar 1's "ends with no trade left" fails for such a lesson.
- **The model may write the wrong target** for the trading task. It is refused with the right value and asked again, which costs a call.
- **The model may declare one number** (the total) instead of ones and tens. It is refused with the reason.
- **Comparison questions** have no component of their own. The feature is now `trade_ten_for_one`, so they should not reach the mat, but the model may still ask for it.

## Result: probe 2 fails all four bars; stopped (run 2026-11-23)
Build Coach `78a5267` (frozen copy), Gemini 3.6 Flash via the dev-probe profile. **190 calls:** smoke 5, candidate 97, baseline 88; nothing was left unrun. Reports, lessons and the hand-reading file: `handoff-math-expressiveness/runs/base-ten/probe-2/`.

| Bar | English | Chinese | Verdict |
|---|---|---|---|
| 1. Trading questions pass the judge | **10 / 16** (needed 13) | **7 / 10** (needed 8) | **fail** |
| 2. Near misses that draw the mat (at most 1 of 7) | none | BT-31, BT-32 | **fail (2 of 7)** |
| 3. Lost lessons (candidate vs baseline) | 1 vs 1 | **2 vs 0** | **fail (Chinese)** |
| 4. Misleading narration (at most 1 per language) | **8** of 15 (6 firm) | **5** of 10 (4 firm) | **fail** |

Under the stop rule, no further design is tried without the owner.

### What worked
- **Every trade the model made played in its own moment, with its own sentence.** The hand reading found the trades narrated correctly in almost every lesson. That is the fault probe 1 failed on.
- **The English comparison and other near misses no longer reach the mat.**
- **All 26 trading questions asked for the mat,** and all 37 typed questions have the right answer for the pile they state.
- **Speed:** median time to the first playable part 9.7 s with the mat, 11.1 s without.

### The main cause: the model thinks the mat's numbers have sliders
Every earlier component lets the child slide its lesson numbers, and the model's general instructions for practice describe a slider. The mat has none: the child trades by tapping. The model was told so only in the mat's one line.
- **The child's task was written as a slider task with a new target:** "Adjust the loose straws slider to 14", 「把散落的弹珠数量滑动调整到 23 颗」. The mat refuses a target that is not the fully traded count.
  - That refusal was **23 of the 33 refusals** in the candidate arm.
  - It lost **all three lost lessons** (BT-06, BT-26, BT-28), after the retries were used up.
- **16 of the 19 trading tasks that survived use slider words** ("adjust", "set", 调到, 滑动), although the child can only tap.
- **Slider words in the narration are 8 of the 13 misleading lessons** ("Now try setting the loose ones to 6 yourself").

### The other causes
- **Bar 1, lessons that end with a trade to make (4):**
  - in three (BT-02, BT-05, BT-22) the model made the trade, then put the mat back to its starting pile for the child's turn. The judge reads the end of the lesson, so it fails them. The reset is unnecessary, since the task restarts the mat itself;
  - in one (BT-04) it made three of five trades and handed the rest to the child.
- **Bar 1, no trading task (2):** BT-01 and BT-12.
- **Bar 2:** BT-31 compares two numbers and BT-32 adds 46 and 37. Both asked for `trade_ten_for_one`. BT-32's mat shows a real trade (7 tens and 13 ones), so calling it a near miss is arguable; the case was fixed before the run and counts.
- **Bar 4, a later section explains the pile from the start again** while the mat shows it traded (BT-02, BT-09, BT-11, BT-27): "Right now, we have 2 hundred squares, 14 ten sticks…" with 3 hundreds and 4 tens on the mat.
- **Bar 4, a note written a moment before its trade** (BT-04, BT-13; counted, though doubtful), **and one lesson whose notes state both typed answers** (BT-10).

### A fault in the reading file, found and fixed during the reading
The first file ignored replay steps, where a lesson puts the mat back to its start. The reader noticed an impossible pile (−7 ones). The file was corrected, and the four lessons it affected were read again; no verdict changed.

### Reported, not bars
- **Refusals in the candidate arm:** 33, in 18 of the 33 lessons:
  - 23 the task's target;
  - 5 a move the mat cannot make;
  - 2 a number line sharing the mat's numbers;
  - 2 a typed answer that did not equal its own check;
  - 1 another.
- **Calls per lesson:** 2.9 with the mat, 2.7 without.
- **Three static mats:** BT-14, BT-15 and BT-29 drew the mat for expanded form, with nothing to trade. They pass the judge and match what is taught.
