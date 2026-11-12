# Speed gate for the number line recipe (2026-11-11)

OLL decision 0013, grades 3–8 math first (subject plan S16). Decision E5: an AI lesson adopts a recipe only after it passes the speed gate. The owner approved the spend, and each run was 20 interleaved pairs measured to the first playable section, with the same Coach build in both arms and `LEARNING_COACH_TRIAL_RECIPES=number_line` as the only difference. Half the requests are number-line questions (`NUMBER_LINE_CASES`: integers, fractions, decimals; Chinese and English); the other half are held-out requests from other subjects.

## Three runs

| Run | Model calls | Number-line lessons that never played | Cause | Fixed by |
|---|---|---|---|---|
| 1 | 61 | 6 of 10 | Hops checked against ticks the line did not draw; a slider starting at 0 was rejected | Coach (ticks first); OLL #49 (bound values are starting values) |
| 2 | 60 | 4 of 9, most others retried (+5.8 s) | The model chose `hops` and `subdivisions` it cannot know are drawable | Coach: the model gives only the two numbers |
| 3 | 46 | 0 of 10 | — | — |

Raw rows: `eval/trial-recipe-speed-number-line-2026-11-11-run1.json`, `-run2.json`, `-run3.json`.

## Run 3: speed passes

| | Pairs | p50 first playable, not offered | Offered | Paired median (offered − not) | 95% CI of the mean |
|---|---|---|---|---|---|
| All | 20 | 9.04 s | 8.10 s | −0.52 s | [−2.29, +1.15] |
| Number-line requests | 10 | 9.15 s | 8.04 s | −0.58 s | [−4.55, +1.28] |
| Other subjects | 10 | 8.93 s | 8.65 s | −0.52 s | — |

- No errors. One retry in the whole run, an unrelated missing reusable item.
- Offering the recipe adds 82 prompt tokens (p50 2,484 → 2,566).
- The recipe was chosen for 10 of 10 number-line requests and 0 of 10 others.

## Quality: not ready to adopt

The lines the model produced in run 3 are correct but often do not teach what the lesson is about:

- **Fractions lose their ticks.** "Where is 3/4", "adding 1/4 and 2/4" and "1/3 + 2/3" were drawn with whole-number ticks only. The model writes fractions as decimals (0.33, 0.67) and gives sliders steps that no split of 1–12 parts holds, so the compiler correctly falls back to whole-number ticks.
- **Lines are too wide.** Integer lessons such as 3 + (−5) were drawn on −21 to 21, because the model gives both sliders wide ranges and the line covers every reachable value. With such ranges, hops are off.
- **"Counting by fourths" started with a jump of 0.**

## Decision

The speed gate passes. Adoption in AI lessons waits until the line teaches what the request asks: fraction lessons show their fraction ticks, and integer lessons show a readable line with hops. This needs the recipe to take the teaching intent (for example the denominator) from the model and let the program fit the numbers to it, by snapping slider steps and starting values to the ticks and keeping ranges near the values the lesson uses. It should not reject the model's choices. A further speed run is needed after that change.

## The fit (after run 3)

The program now fits a number line's numbers to what the lesson teaches (`src/plugins/number-line-fit.ts`), during the normalization of program-owned number ranges:
- **Denominator.** The model may give `denominator` (1–12; clamped, never refused). Otherwise the program takes the smallest denominator that puts the start, the end, animation targets and practice targets on its fractions. A clean slider step such as 0.25 is tried first; a fine step such as 0.05 is ignored. 0.33 counts as 1/3, but 1/11 does not count as 1/10.
- **Snapping.** Starting values, ranges and slider steps snap to those ticks. Animation targets and practice targets snap with them; a practice task gets a tolerance of half a tick and a prompt naming the snapped value.
- **Window.** The range a number keeps depends on its role:
  - A number the lesson drives (by an animation or a practice target) shrinks to a window around the values the lesson uses.
  - A number with a slider that nothing drives keeps the model's range. The learner is meant to move it, perhaps to a value only the narration names, so a wider line is better than an unreachable answer.
  - A number with neither keeps a short range around its value.
- **No new rejections.** The numbers are left as the model wrote them in three cases: another visual also shows them (counting numbers a plot binds through its formula or sample points), a practice task judged by an expression reads or controls them, or snapping would make a practice task already met.

## Run 4 pass criteria (set before the run)

Speed, as for runs 1–3:
- All 20 pairs complete with no errors.
- The paired median difference shows no slowdown beyond the noise of earlier runs (within +0.5 s).
- The recipe is chosen for the number-line requests and not for the others.

Quality, read from each candidate row's `number_line` summary:
- **Fraction requests get their denominator:** NL-03 (3/4) and NL-04 (1/4 + 2/4) in quarters, NL-09 (1/3 + 2/3) in thirds, NL-10 (counting by fourths) in quarters, and NL-07 (0.5 and 0.8) in tenths.
- **Integer requests get a readable line with hops, and the answer stays reachable:** NL-01, NL-02, NL-05, NL-06 and NL-08 span at most 24 units with hops on. Their change slider (`change_slider` in the row), or an animation, reaches the change the question asks for: −5 (NL-01), 7 (NL-02), 8 (NL-05), −9 (NL-06) and 3 (NL-08). A short line that cannot reach the answer counts as a miss.
- **At least 8 of these 10 checks pass.** A miss is recorded with the line the model and program produced.

## Run 4 (after the fit): speed passes, quality fails

45 model calls (`eval/trial-recipe-speed-number-line-2026-11-11-run4.json`).

**Speed:** 20 of 20 pairs, no errors. The paired median is −0.58 s (95% CI of the mean [−3.29, +0.52]). The recipe was chosen for 10 of 10 number-line requests and 0 of 10 others, and adds 84 prompt tokens.

**Quality** (the criteria above): **6 of 10, below the required 8.** Two of the six formal passes show the wrong value:

| Case | Drawn | Check |
|---|---|---|
| NL-03 "where is 3/4" | quarters, but the jump goes 0 → **3** | passes formally; wrong value |
| NL-04 1/4 + 2/4 | quarters, 0 → 1/4 | pass |
| NL-07 0.5 and 0.8 | tenths | pass |
| NL-09 1/3 + 2/3 | thirds, but 1 + 2 = **3** | passes formally; wrong value |
| NL-10 counting by fourths | quarters, 0 to 2 | pass |
| NL-01 3 + (−5) | 27 units, no hops | fail |
| NL-02 −2 + 7 | 39 units, no hops | fail |
| NL-05 −3 + 8 | 34 units, no hops | fail |
| NL-06 6 − 9 | 39 units, hops | fail (width) |
| NL-08 −4 and −1 | 19 units, hops | pass |

Every asked-for answer was reachable.

**Causes**, read from the rows:
1. **With a `denominator`, the model writes numerators.** For "3/4" it wrote 3, and for 1/3 + 2/3 it wrote 1 and 2. In run 3, which had no such parameter, it wrote values (0.33, 0.75). Asking for a denominator changes what the model means by its numbers, and the program cannot tell 3 wholes from 3 quarters.
2. **Fine slider steps are read as a denominator.** A change slider stepping by 0.1 on an integer lesson (NL-01, NL-02, NL-05) made the program pick tenths, so hops were impossible.
3. **Start sliders keep their whole range.** The rule meant to keep the change's answer reachable also kept the start's −10…10, so integer lines stayed wide.

The recipe stays a trial.

## After run 4: the fix, checked offline

- **`denominator` removed.** The model gives only the two numbers, at their actual size. The guidance says so explicitly ("3/4 is 0.75, not 3"), and that fractions are shown by the slider step (0.25 for quarters), as in run 3.
- **The values decide the denominator.** Only when they are all whole numbers can a slider step decide it, and only a coarse one (1/2 to 1/6, as in counting by fourths). A 0.1 step on an integer lesson gives whole-number ticks and a whole-number step.
- **A start nothing drives is kept within one unit of its value, even with a slider.** Only a change slider keeps its whole range, because it carries the answer.
- **Offline replay, corrected after review of #62.** The ten run-4 lessons are rebuilt with every recorded input: starting values, slider steps, animations, practice targets, and slider ranges as recorded (after run 4's fitting, so at most as wide as the model wrote). Under the current rules they score **6 of 10**:
  - NL-01, NL-02, NL-04, NL-07, NL-08 and NL-10 pass.
  - NL-03 and NL-09 show wrong values, because the model wrote numerators under the removed `denominator`.
  - NL-05 and NL-06 are 34 and 39 units wide. Their own practice tasks drive the start (to −5 and −10), while the change keeps its range so the answer stays reachable.
  - Separate tests, labelled as a hypothesis, show NL-03 and NL-09 pass if the model writes values as in run 3 (0.75; 0.33 and 0.67). Only a live run can confirm that premise.
  - An earlier version of this replay reported 10 of 10. It had left out NL-05's and NL-06's practice tasks and changed NL-04's values, so that figure was wrong.
- **Steps.** A slider step counts for an integer lesson only when it is 1/2 to 1/6 (0.33 counts as 1/3). Several such steps share their least common denominator (halves and thirds give sixths). When that would exceed 12, the sliders are left as written. Any other step (0.1, 0.4, 1.5) is ignored.
- **Raw output kept.** The harness now keeps every raw model reply beside the compiled parts (`OLL_DEBUG_GENERATION=1`, which now also logs streamed replies), so later fits can be replayed against real model output at no cost.

## Run 5 pass criteria (superseded by the gate below)

The run 4 criteria, with value checks added. A formal pass that shows the wrong value counts as a miss.
- **NL-03** draws quarters, and its start or end is 0.75.
- **NL-04** draws quarters, and every point is a quarter.
- **NL-09** draws thirds, and shows 1/3 and 1 (or 1/3 + 2/3).
- **NL-07** draws tenths; **NL-10** draws quarters.
- **NL-01, NL-02, NL-05, NL-06 and NL-08** span at most 24 units with hops on, and reach −5, 7, 8, −9 and −3 respectively.
- At least 8 of the 10 pass, with no wrong values. Speed as before.
- From the replay: if the model writes values again, 8 of 10 is within reach, but only just. Lessons like NL-05 and NL-06, whose own tasks move the start far, still miss on width.

**Stop rule (proposed to the owner).** If run 5 misses these criteria, the number line stays a trial recipe and the work moves to decision 0014. Learners lose nothing, because Studio and CoursePacks already have the number line.

## Before run 5: rendering the lessons, and a redefined gate

The owner asked for the number line to be reliable in live lessons before decision 0014. Four paid runs had each found a new kind of failure, and every check so far had been numeric. So, before asking for run 5, the run 4 lessons were rendered in the player and the gate was rebuilt. None of this cost anything.

### What rendering showed

Run 4's compiled lessons, played through and drawn with the OLL runtime:
- **A point's number could vanish.** On NL-05 (−3 + 8, 34 units) labels thin to every 3, so the end sits on 5 with no number under it. On NL-08 (19 units, a "pass" under the span criterion) the end at −7 is unlabelled. The learner sees "终点" but cannot read its value. NL-01's and NL-06's ends were labelled only by luck.
- **Point names ran together:** "Start" at 0 and "End" at 1/4 read as "Start End" (NL-04).
- **Width itself is legible.** Once every point keeps its number, a 34- or 39-unit line wastes space but reads correctly.

This was a runtime defect, which Studio and CoursePack lines share, so it is fixed in OLL (octos-lesson-language #51). When labels thin, the ticks under visible points and jump ends keep their numbers, and these follow animations and drags. Their labelled neighbours give way, and names that would overlap go on further rows. A hidden (`when_emphasized`) answer is not revealed. Coach, Learn and the course library must pin that commit before adoption.

### The gate: hard and soft (proposed to the owner)

A single "8 of 10" let a wrong value through as a formal pass. The gate is now split:
- **Hard: every case must pass.** Any miss blocks adoption.
  - Speed, as in runs 1–4.
  - The recipe is chosen for number-line requests and not for the others.
  - The lesson compiles.
  - **Right values:** every number the question names is shown by a point in some state the lesson reaches. These values are written into the harness for each case before the run.
  - **Reachable:** the asked-for change is reachable by a slider or an animation.
  - **Readable:** every visible point, in every state the lesson reaches, sits on a tick the label policy labels, so its number is drawn.
  - **Near misses:** for a request the recipe cannot express, if the model uses the recipe anyway, the line is read by hand, and a misleading line is a hard miss.
- **Soft: reported, not blocking.** An integer line spans more than 24 units or has no hops, or a fraction line uses different parts than expected (sixths for thirds).
- **Awaiting the owner's decision: label format.** A decimal question gets fraction labels: "compare 0.5 and 0.8" shows 8/10 under the end. Run 5 records this as a soft miss on NL-07, NL-11 and NL-16. If the owner makes it hard, the recipe would let the model choose decimal or fraction labels, which it can see in the question.

The judge is `judgeNumberLine` in the harness. The offline replay test uses the same function and the same expectations, so the live and offline checks cannot drift apart.

### Run 4 rescored under the hard gate: 7 of 10

- NL-03 and NL-09 show wrong values (numerators written under the removed `denominator`).
- **NL-04 never shows the sum 3/4.** The model started at 0 and moved by 1/4 instead of starting at the first addend. The earlier criteria checked only the parts and passed it.
- NL-05 and NL-06 pass the hard checks. They were 34 and 39 units wide; with the narrowing below, NL-05 fits and NL-06 is 28 units wide (its own task moves the start to −10, and −10 − 9 = −19).
- NL-07 passes the hard checks, with a soft miss on format: 0.8 reads 8/10.

The recipe card now maps the question to the two numbers explicitly: for a + b, start at a and move by b (1/4 + 2/4: start 0.25, move 0.5; 6 − 9: start 6, move −9); for "where is x", start at 0 and move by x.

**Evidence correction.** Earlier notes said run 3 showed the model writing actual values (0.75; 0.33 and 0.67). Nothing records that: run 3's rows have no number line summary, and its work directory is gone. The premise that the model writes actual values once `denominator` is gone is untested, and only run 5 can test it.

### Dry run of the cases, before paying for them

Each held-out case, and NL-04, was compiled offline from the input a model following the recipe card would write (start = the first number, change = the second, slider step = the fraction). Then it was judged.

**NL-15** ("from 35, count on 40, on a 0–100 line") failed on this ideal input. The line ran −1 to 201 with ticks every 10, so 35 and 75 sat on no tick. That was a program defect, now fixed in two places:
- **Fit:** a whole-number lesson too wide to count in ones counts in the smallest of 2, 5 or 10 that divides every value it uses. Snapping, the slider step and the window then use that unit, the way a fraction lesson counts in its parts. A short lesson still counts in ones, even when its values share a factor: −6 + 6 keeps steps of 1.
- **Compiler:** the tick step is the finest of 1, 2, 5 or 10 that keeps at most 60 ticks and holds every value.

**Two-digit addition** (NL-19, 23 + 48, and NL-20, 17 + 26 on an open number line) failed the same way when Fable's review added them. Their values share no factor of 2, 5 or 10, and the change slider kept its 0–100 range, so the line ran 0–200 with ticks every 10. Three changes fixed it:
- **Compiler, by construction:** when no step with at most 60 ticks holds every value, the finest step that holds them all within OLL's 240-tick limit is used, before any step that does not.
- **Fit, change slider:** an undriven change slider that **starts at a value other than 0** states the change the lesson is about, and narrows to the window (which always keeps that value). One that **starts at 0** is for the learner to set, perhaps to an answer only the narration names ("6 − 9"), and keeps its range.
- **Fit, window:** 0 is left out of the window when including it would make the window too wide (23 + 48 is shown around 23 to 71), and the window grows to 58 units, which still gives one tick per unit.

A rendered 23 + 48 line was readable on values but still looked like a comb, with labels every 13. That is fixed in OLL #51: labels thin on strides people count by (every 2, 5, 10, 20 …).

**Shapes.** Every case is dry-run twice: once with the card's ideal input, and once in the shape run 4's model actually wrote (sliders −10 to 10 by 0.1, or −100 to 100 by 1 for larger numbers). All 22 pass the hard checks. This is a test (`dry run …`), not a prediction of what the model will write.

### Cases for run 5 (written before the run)

- **Speed pairs:** NL-01 to NL-10 against ten other-subject requests, unchanged.
- **Quality cases,** once each on the candidate arm only:
  - ten held-out number-line requests: tenths, negative fractions, mixed numbers, 5 − 8, a 0–100 line, −2.5 + 4, a walk to 0, 2/3 − 1/3, and two-digit addition (23 + 48; 17 + 26). The fixes above were checked against these cases offline, using inputs I wrote, but never against model output;
  - four near misses the recipe cannot express: comparing 2/3 with 3/5, x > −2, rounding 47, |x − 3| < 2.
- **Cost:**
  - One pass of the quality cases: about 60 model calls, roughly $0.55.
  - Repeating them three times (`--quality-repeats 3`): about 90 calls, roughly $0.85. Run with `--max-calls 110`.
- **What a clean run proves.** One sample per case leaves a lot open. With 20 number-line samples and no failures, a true failure rate of up to about 1 in 7 (15%) is still plausible at 95% confidence. With the held-out cases repeated three times (40 samples), it is about 1 in 13 (7.5%). Recommended: three repeats.
- **A single model slip (owner to decide before the run).** At 40 samples written by the model, a single slip like NL-04's (start at 0 instead of the first addend) would fail a zero-tolerance gate. The choice: zero tolerance, which means narrowing the recipe after any slip, or a stated allowance for misses caused by the model (for example, at most one, and not twice on the same case). Misses caused by the program are allowed nowhere.
- **NL-08** expects −4 and −1 but no particular change, since moving either way answers "why is −4 less than −1".
- Expected values for every case are in `NUMBER_LINE_CASES` and `NUMBER_LINE_QUALITY_CASES`.

### Run 5 procedure and stop rule

- **Nothing is passed over silently:**
  - A case with expectations that produced no judged first part is a hard miss ("not judged").
  - A budget that ran out is reported as `not_run`.
  - The run stops at the first playable part, so the judge sees only the first section. A hard miss on a lesson whose outline has more than one section is marked for hand review.
  - "Reachable" means on the slider's grid from its minimum, not just inside its range, since the fit may coarsen a step.
  - The harness itself is tested end to end against a stub build: raw replies kept, every case judged, multi-section misses flagged, an exhausted budget reported.
- The run keeps every raw model reply. The work directory is copied out of the system temp folder straight after the run (kept locally, not committed), so later fixes can be replayed against real output for free.
- **Pass:** every hard check holds on all number-line cases (with the slip allowance the owner sets) and on any near miss the model draws. Then adoption goes in a separate change, after the OLL pin bumps. Before that change lands, one real lesson is played in the installed app at phone width.
- **Stop rule:** a hard miss of a kind already fixed is a defect to fix and re-check offline. A hard miss of a new kind means narrowing what the recipe offers, for example to integers only, or dropping a request type. It does not mean another patch.

