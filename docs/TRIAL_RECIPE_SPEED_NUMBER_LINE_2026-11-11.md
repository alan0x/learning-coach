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
- **Hard, as recommended (see the owner decisions below): label format.** A decimal question labelled in fractions ("compare 0.5 and 0.8" showing 8/10) is a hard miss on NL-07, NL-11 and NL-16.

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

### Owner decisions (2026-11-11)

1. **The hard/soft gate:** agreed.
2. **A single model slip:** option B. The program may cause no hard miss. The model may slip once, and never twice on the same request. Whether a miss is the model's is read by hand from its raw reply, so the summary's verdict (`slipVerdict`) for one miss is "review", not "pass". Two misses, or the same request missing twice, fail.
3. **Label format:** the owner asked for a recommendation. The recommendation is to label in the question's notation and count it as a hard check. "Compare 0.5 and 0.8" would otherwise show 5/10 and 8/10, a second notation that assumes the learner already knows 0.8 = 8/10 (grade 4, 4.NF.6), and "−2.5 + 4" would show −5/2. Only the model sees how the question is written, so the recipe gains one optional parameter, `label_style` (`decimal` or `fraction`). It changes labels, never values. The program honours `decimal` only where decimals are exact (halves, quarters, fifths, tenths), so thirds never read 0.333. Because run 4 showed that a parameter can change how the model writes numbers, run 5 tests this with the value checks in force. Pending the owner's confirmation.
4. **Run 5:** approved, with the quality cases repeated three times (`--quality-repeats 3 --max-calls 110`).

## Run 5: fails on quality and on speed

Owner-approved; 107 model calls (about $0.80); `eval/trial-recipe-speed-number-line-2026-11-11-run5.json`. The raw replies are kept locally, and `scripts/replay-trial-recipe.mjs` replays them through the current build. The replay reproduces all 40 recorded verdicts.

**Speed: misses the written criterion.**
- The paired median is **+1.0 s** against the +0.5 s limit (mean −0.3 s, 95% CI [−3.0, +2.3]).
- Requests the number line fits are about even (median +0.16 s). Other-subject requests pay for the larger prompt without using it (median +1.9 s).
- The candidate prompt adds **+200 tokens**, against +84 in runs 3 and 4. The recipe card's worked examples and `label_style` cost about 116 more.

**Recipe choice.** Chosen for 10 of 10 number-line requests. One other-subject request also drew a number line (HO-CH-04, "why do acid and base mix to neutral?"): a pH scale from 0 to 14 with "set pH to 7". Read by hand, it is a sensible use, not a misroute.

**Values: the model writes numbers at their actual size.** Every value check passed. 3/4 is written as 0.75, decimal questions get `label_style: "decimal"`, and a + b starts at a. The premise run 4 left open holds.

**Quality: 29 of 40 pass the hard checks; under the slip rule, fail** (NL-12, NL-15, NL-19 and NL-20 each missed more than once). Classified from the raw replies:
- **Program defects** account for every "unreadable" miss.
  - The model never writes a slider step: `lowerModelOutline` derives one from the range (span/200: 0.02, 0.325, 0.5 …).
  - **Practice targets are rounded onto that derived grid before the fit** (0.75 → 0.76, 50 → 50.05). The fit then misreads them (NL-15: no denominator fits 50.05), or sees a task already met and **discards itself** (NL-03, NL-12).
  - **The fit read the derived step as the lesson's unit.** A 0.5 step on 23 + 48 meant halves, and the compiler, with no step holding halves on a long line, fell back to ticks every 5 or 10 (NL-19, NL-20).
  - The offline tests missed all of this because they compiled plans with hand-written slider steps, skipping the real path from model output to plan. The dry runs and the "faithful" run 4 replay are void on this point.
- **Model slips.**
  - NL-03 and NL-12 set the change to the target and then asked the learner to set it to that same value. This breaks an existing prompt rule, and the shared guard missed it through a floating-point error (0.76 − 0.75 > 0.01).
  - NL-18 (once): 2/3 was written with the wrong decimal scale (66,666,666,666.7). The bad number sits in the outline, which section retries cannot change, so all three attempts failed.
- **Near misses: the model used the number line on 12 of 12, and most are misleading.**
  - NM-01 (compare 2/3 and 3/5): the narration describes fifteenths and two points, but the line shows one point.
  - NM-02 (x > −2): a jump from 0 to −2, with no open circle and no ray.
  - NM-04 (|x − 3| < 2): no interval.
  - Several practice tasks are meaningless ("set the center to −10").
  - NM-03 (rounding 47) is partly sound.
  - The recipe offers one start and one change, and nothing in the card stops it being used for what that cannot show.

**Stop rule.** It fired: near misses are a new kind of hard miss. Narrowing what the recipe offers is the right answer for them. The program defects affect whole-number lessons too, so narrowing would not fix those; they are fixed instead. The recipe stays a trial. A replay pass on run 5 counts as tuning, not as passing the gate. Adoption needs a fresh run.

## After run 5: fixes, and owner decisions

**Owner decisions.**
1. A target the number already starts at: option (a). The line goes back to where it starts before the learner tries.
2. Narrow the recipe to one start plus one move.
3. Trim the prompt cost.

**Program fixes.** The model never writes a slider step, so all of these are tested through the real path from a model reply to a lesson:
- **Targets stay as the model wrote them.** For a number this section's number line shows, lowering the model's reply no longer rounds the practice target onto the derived step (0.75 stays 0.75). The tolerance (half a step) gains a floating-point margin. Every other number is handled exactly as before; the digests of all 920 recorded lessons for other recipes are unchanged.
  - Limit: a number line created in an earlier section is not seen when a later section is lowered. Its targets are rounded as for any slider, and the fit's own snapping recovers small rounding errors.
- **Option (a) at compile time.** OLL rejects a task the starting values already meet, so the number:
  - starts at 0 (or the end of its range farthest from the target);
  - moves to the value the lesson shows as soon as the line appears;
  - returns after the last moment.

  Animations are appended, never inserted, because references are recorded by position.
- **The fit reads values only.** A slider step is never evidence, so `wholeLessonDenominator` is removed. The fit no longer discards itself: a window the numbers do not fit keeps the model's ranges, with values and sliders still on the lesson's ticks.
- **Compiler ticks, in order:**
  1. a whole step of 1, 2, 5 or 10 with at most 60 ticks;
  2. one-unit ticks split into the fewest parts that hold the values, within OLL's 240-tick limit.

  It tries the full grid first (ranges, starting values, steps), then the values the lesson itself shows.
- **Recipe card**, 602 → 331 bytes:
  - "one start plus one move";
  - not for inequalities, absolute value, rounding, comparing two numbers, or graphs;
  - for counting by a fraction, the move is one step (0.25);
  - the slider-step sentence is removed, since the model cannot write a step.

  The candidate request now adds 430 bytes (run 5: 701; just after run 4: 340), an estimated +120 tokens (run 5: +200; runs 3–4: about +84).

**Checked offline (this is tuning on run 5's own replies, not a gate pass).**
- All 40 recorded run 5 turns replay through the real path (`test/number-line-replay.test.mjs`, fixture `test/fixtures/number-line-run5-replies.json`, model text only). 39 pass the hard checks. The 40th is NL-18's scale slip, which belongs to the model.
- Renders confirm whole-number lines draw one-unit ticks with labels every 5, and that the reset leaves a readable starting line.

**Known soft findings.**
- "Count by fourths" with whole values only (NL-10) draws whole ticks. The card now asks for a one-step move, which run 6 measures.
- Quarter labels are unreduced by design (decision 0013), so −1/2 reads −2/4.

**Reported separately, affecting every recipe:**
- the shared already-met guard's floating-point comparison (0.76 − 0.75 > 0.01);
- section retries cannot repair a bad number in the outline (NL-18).

**Run 6** needs the owner's approval. It runs the same cases and repeats, with the same gate and slip rule.

### Before run 6: what Fable's review of the fixes found

- **The card and the cases disagreed.** "Not for comparing two numbers" would have turned NL-07 ("compare 0.5 and 0.8") and NL-08 into misses.
  - A comparison that fits a start plus a move stays in. The card instead excludes fractions over twelfths, which is what made "compare 2/3 and 3/5" unreadable.
  - NM-01 to NM-04 now have a mechanical expectation: drawing a number line for one is a hard miss.
  - NL-10 ("count by fourths") must show 0.25.
- **A task met at the end of the lesson.**
  - Option (a) first covered only a target equal to the starting value. In 4 of run 5's 40 turns (NL-10, NL-17 twice, NL-19), the lesson animated the number to the target and then asked for it. Every one passed silently.
  - The reset now applies whenever the lesson ends on the target: once per number, after the last moment.
  - The judge gains the hard check "practice task already met when it starts".
  - A two-section lesson is tested through every partial compile.
- **The speed criterion is noisy.**
  - Bootstrapping the saved pairs, a version with no real cost exceeds the +0.5 s median about 1 time in 8 with 20 pairs (4–14% across runs 3–5), and still 10% with 60, because the pairs have heavy tails (−16.8 s to +9.6 s).
  - Run 5's median of +1.0 s has a 95% interval of [−0.9 s, +2.1 s]: inconclusive, not evidence of a slowdown.
  - The earlier claim that other-subject requests were slower *because of* the bigger prompt is withdrawn; ten pairs cannot show it.
  - Runs 3 to 5 pooled (60 pairs): median −0.36 s.


### Run 6 rules (owner, set before the run)

- **Quality:** the hard checks above and the slip rule (option B). Near misses that draw a number line are hard misses.
- **Speed (option a):** the paired median must be at most +0.5 s. If run 6 misses only on speed and the 95% interval of its median includes zero, the 20 speed pairs are repeated once, without quality cases (about $0.35), and speed is judged on all 40 pairs. No further repeats.
- Approved: about $0.95, `--pairs 20 --quality-repeats 3 --max-calls 130`.

## Run 6: speed passes; quality fails

Owner-approved; 111 model calls (about $0.95); `eval/trial-recipe-speed-number-line-2026-11-11-run6.json`. Raw replies are kept locally.

**Speed: passes by the rule set before the run.**
- Paired median −2.8 s, 95% interval [−5.9, −0.6]; the candidate prompt adds +107 tokens.
- The gain is not a recipe effect: the baseline's median moved from 7.7 s to 10.0 s on an identical prompt, and retries were similar on both arms (6 and 5 turns).
- Honest reading: no sign of a slowdown.
- Recipe chosen for 10 of 10 number-line requests and 0 of 10 others.

**Number-line requests: 39 of 40 pass every hard check.**
- The 40th is NL-18 hitting the call cap: the same decimal-scale slip as in run 5 (2/3 written as mantissa 666666666667, scale 1). That is 2 of 6 NL-18 turns across the two runs.
- The reset (option a) fired in **22 of 40** lessons. "Show it, then ask the learner to do it" is the model's normal pattern.
- Rendering the reset step by step found a flaw: when the reset applied to the *start*, the line appeared as 0 − 8 while the teacher said "we start at 5", before moving. Fixed: the start now moves before the speech; the change still moves during it, as the demonstration.
- The judge treated a practice target as something the lesson shows, so it could not have caught a line that showed a wrong problem throughout. It now checks values only against what the lesson shows (starting values, then each animation in order). No run 5 or run 6 lesson fails the stricter check.

**Near misses: 7 hard misses on 5 requests; fails the slip rule.**
- NM-01 ("compare 2/3 and 3/5") drew a number line 3 of 3 times, each misleading: one point on whole ticks while the narration describes fifteenths. The card's "fractions over twelfths" didn't exclude it, because 2/3 and 3/5 have small denominators; their common one, 15, is the problem.
- NM-02 (x > −2) once, misleading.
- NM-03 (rounding 47) once: a point at 47, never showing 50.
- NM-04 (|x − 3| < 2) once hit the call cap through a *function plot*, not a number line. Judging near misses as "recipe not used" was too coarse: it charged NM-04's plot failure to the number line and missed that NM-03's line was partly sound.
- Twice the narration said a component "does not support" something. That is the existing rule (line 147 of the generation prompt: when the visual form isn't possible, teach with another and say in one sentence what was substituted), phrased technically. No new rule added.

**Fixes after run 6 (offline).**
- **Card text is not a control; the compiler is.** When no ticks can hold the lesson's own values, the number line is now refused with a message the model can act on ("at most 12 equal parts … use another visual …"), instead of being drawn unreadable. This reverses "nothing here rejects" for lines that would be unreadable anyway; the cost is a retry. On run 6's replies, NM-01 is refused; only a live run shows what the model chooses next.
- **A number at the wrong scale is refused where a retry can fix it.** Widening a range to fit a starting value is refused when it would exceed the 1,000,000 span no lesson can draw. The error goes to the outline retry (tested on NL-18's reply), not to section retries that cannot change it. The other recipes' 920 recorded lesson digests are unchanged.
- **Near misses for the next run:**
  - a lesson that avoids the number line passes;
  - one that draws it gets the ordinary hard checks against the values the request needs (2/3 and 0.6; −2; 47 and 50; 1 and 5), plus a hand read;
  - near misses run on both arms, so a lesson can be compared with what the request gets today.
- **When generation gives up,** the learner sees "课程生成失败，请重试。" ("lesson generation failed, please try again").


### Run 7 rules (owner-approved, set before the run)

The run 6 rules are unchanged: the hard checks, the slip rule (option B), and speed option (a). Near misses run on both arms; a candidate near miss that draws a number line gets the ordinary hard checks plus a hand read. About $1.05: `--pairs 20 --quality-repeats 3 --max-calls 140`.

## Run 7 (2026-11-12): speed passes; quality fails; stop rule fires a third time

Owner-approved; about $1.05; `eval/trial-recipe-speed-number-line-2026-11-12-run7.json`. Three candidate runs did not fit the 140-call budget: the counter also counts a call started as a run stops, and the near-miss baseline arm cost more than estimated.

- **Speed: passes.** Paired median −0.27 s; +107 prompt tokens. Recipe chosen for 10 of 10 number-line requests and 0 of 10 others.
- **Outline retry for a wrong-scale number works.** NL-18 passed 3 of 3. Two turns (pairs 41 and 55) had the 2/3 scale slip and were fixed by one outline retry, confirmed by replay. The slip appeared in 3 of the 4 turns involving 2/3, and the retry costs about 7 s to first playable (16.3–16.5 s against 9.6 s).
- **Hard misses:**
  - **NM-01 ("compare 2/3 and 3/5"): no lesson, 3 of 3 times.** The compiler's refusal (fifteenths) went to section retries, which cannot change the visual the outline chose. The baseline arm produced a lesson (a plot) 3 of 3 times. **The refusal made this request worse than today**; I had applied it on Fable's advice, which Fable has since withdrawn.
  - **NL-11 (0.3 + 0.4): an empty number line.** The outline declared no numbers, the first section was rejected for referencing number 1, and the retry passed validation by dropping its numbers. A number line with no numbers compiled.
  - **NL-03 ("where is 3/4"): wrong value.** The model moved by one quarter (0.25), kept a third number "target 3/4" off the line, and narrated counting three quarters. The card was unchanged since run 6, where NL-03 passed, and NL-01 to NL-10 get one sample per run, so the cause is unclassified. The card's "counting by a fraction: one step" is a hypothesis.
- **Near misses against the baseline arm.** The baseline (today) gave every near miss a plot-based lesson, except one call cap on NM-03. The candidate gave:
  - no lesson for NM-01;
  - a misleading line for NM-02 once (a jump 0 → 3);
  - flow charts for NM-03 that tell the learner "the tool doesn't support rounding" (the existing substitution rule);
  - fine lessons for NM-04.

  The card's exclusion list seems to push the model away from the plot it uses today.

**The common defect.** NL-18 (runs 5 and 6), NM-01 and NL-11 are one problem: the outline is accepted, and the first section then finds a fault only the outline can fix. Section retries can't fix it.

**Process.** Every run since run 5 carried model-facing changes (card text, a parameter, refusal messages) that had never been seen live, so each gate run was also the first experiment with those changes. The stop rule has now fired three times.

## After run 7 (owner: option A): one fix for faults the outline owns, then probes before any gate

**The fix.** A fault only the outline can fix now goes back to the outline (`LESSON_PLAN_OUTLINE_VISUAL`).
- **Sources:** values no ticks can hold; a number line with no lesson number; an outline using an excluded capability.
- **At bootstrap,** section 1 is compiled before the outline is accepted.
- **From the fallback path,** section 1 restarts the outline once.
- **The new outline is asked without the number line,** both in the recipe list and in the schema's feature enum, so the worst case is the lesson the request gets today.
- Run 7's recorded turns (NM-01 ×3, NL-11) now all lead to that request. No regressions on replay of runs 5–7, and other recipes' schemas and digests are unchanged.

**Probe 1** (candidate arm only, 7 lessons, 14 counted calls):
- NL-03 2/2, NL-10 2/2 (now shows 0.25) and NL-11 1/1 pass. Run 7's NL-03 miss looks like a one-off, not the card.
- NM-01: one turn drew a readable line showing only 2/3 (never 3/5).
- NM-01: one turn hit the cap, because the fallback outline still picked the number line through the schema's feature enum. Fixed: excluded capabilities' features are removed from the fallback schema.
- The card now says how a comparison maps to the line: start at the smaller number, move by the difference. Then 2/3 versus 3/5 needs fifteenths, is refused, and falls back. Probe 2 checks this.

**Probe 2** (candidate arm only, 13 lessons, 34 counted calls):
- **Number-line requests: 8 of 8 pass every hard check:** NL-07 and NL-08 (comparisons that fit a start plus a difference) 2/2 each, NL-03 2/2, NL-10 2/2.
- **NM-01 ("compare 2/3 and 3/5"):**
  - 1 of 5 got a lesson without the number line through the new path: fifteenths refused at bootstrap, outline asked again without the number line, a lesson in 19 s.
  - 4 of 5 hit the harness's 3-call cap. Each started with **2/3 written at the wrong scale**, so the outline retry, section 1's fifteenths refusal and the outline restart needed a 4th and 5th call. Live, those would continue, but about 25–30 s to first playable is too slow.

**The wrong-scale slip, measured.** Across runs 5–7 and both probes, 9 of the 24 turns that wrote a repeating third wrote it at the wrong scale (37%).
- The cause is the shared number schema: a mantissa of up to 12 digits, but a scale of only 0–6. The model writes 2/3 to 12 places (666666666667) and, unable to give scale 12, picks a smaller one.
- It affects any visual given a third, but only number-line lessons write thirds here.
- Fixing it changes the schema every lesson request uses, so it is put to the owner as a separate change. One option: allow scale up to 12, consistent with the mantissa.

### Model-number scale fix (owner-approved 2026-11-12; branch `fix/model-number-scale`)

**The fix.** The shared schema now allows a decimal scale up to 12, as many places as the mantissa's 12 digits allow.
- Request digests are re-recorded; every produced lesson digest is unchanged.
- The schema grows by 15–30 B on the fallback-outline, section-retry, section-repair and later-section paths, which exceeds their payload ceilings.
- Decision S6 requires a plan change and a live speed comparison to raise a ceiling. The raise is therefore a separate commit, pending the owner.

**Probe 3** (fix build; thirds only; 9 lessons, 21 counted calls):
- **No wrong-scale thirds:** 0 of the 8 turns that wrote a third (before: 9 of 24). 2/3 is written as 666666666667 with scale 12, and 1/15 correctly as 66666666667 with scale 12.
- **NL-09 3/3 and NL-18 3/3 pass every hard check.** NL-18 needed no outline retry.
- **NM-01:** a lesson without the number line 2/3 times, through the new path (about 19 s). The third hit the harness's 3-call cap: after the restart, the new lesson's section 1 met OLL's generic "task already satisfied" rule (the shared already-met guard's floating-point error, reported separately). Live, it would retry.

**Not done overnight.** The gate run waits for the owner's decision on the ceilings, since its request sizes depend on it.

**Probe 3, NM-01's cap, classified.** The fallback outline (no number line) chose the unit-square array, with 15 squares (range 1–20) and a task "set it to 20".
- That visual's program-owned range clamps both the starting value and the target to its own limit, after the already-met guard has run.
- With both clamped to the same value, OLL rejects the task as already met.
- This is a defect in the shared range clamping, not in the number line; it would affect this request without the number line too. It is reported to the owner, not fixed, since the fix changes other visuals' lessons.


### Run 8 rules (owner-approved 2026-11-12, set before the run)

- **Frozen code:** `fix/clamped-met-target`, which includes #63, #64 (model-number scale up to 12, with the owner-accepted ceiling raise) and #65 (clamped targets). Every model-facing change since run 7 has had a clean probe (probes 1–3).
- **Rules unchanged from runs 6 and 7:**
  - the hard checks;
  - the slip rule (option B);
  - speed option (a);
  - near misses on both arms, with a hand read when a number line is drawn;
  - the harness's 3-call cap per turn.
- **Speed comparison:** run 8 was also meant to be the live speed comparison for the ceiling raise (decision S6). **Correction:** both of its arms ran the same build, so it cannot measure that change. The raise is pending the owner again.
- **Budget:** about $1.15, `--pairs 20 --quality-repeats 3 --max-calls 160` (run 7 lost three runs at 140).

## Run 8 (2026-11-12): fails under the rules set before it

Owner-approved; 148 calls (about $1.10); `eval/trial-recipe-speed-number-line-2026-11-12-run8.json`. All planned runs ran.

**Speed: passes by the rule, narrowly.** The paired median is +0.39 s against +0.5 s, and the candidate prompt adds +121 tokens. The baseline's median moved from 7.5 s (run 7) to 11.3 s on an identical prompt, so this is not a clean measurement. It is not a comparison for the ceiling raise either: both arms ran the same build.

**Number-line requests: 40 of 40 pass every hard check.** Step-by-step renders confirm what learners see:
- 3 + (−5) with hops;
- 0.5 → 0.8 with decimal labels;
- 1/3 + 2/3 = 1 in thirds;
- 0 → 3/4 in quarters;
- the reset returns before the learner's turn.

A DOM probe settled run 6's puzzling screenshot: the board does redraw a point as its number animates (the start moves to 5 at step 11, then back). The earlier frame-capture script was at fault.

**Pooled across run 8 and probes 1–3:** every number-line request passed the hard checks, 59 of 59 lessons (run 8: 40; probes: 5, 8 and 6).

**Near misses: 3 hard misses on 3 requests, so the slip rule fails.**
- **NM-02 (x > −2), pair 45:** a filled dot at −2 and a jump, while the narration says "open circle" and "ray". Misleading.
- **NM-03 (round 47), pair 46:** a point at 47 on a line from 0 to 49. 50 is not on it, although the narration uses 40, 45 and 50. Misleading.
- **NM-01, pair 30:** the outline was refused for fifteenths and asked again without the number line. The new lesson (a unit-square rectangle) then missed its column and row numbers and hit the harness's 3-call cap; live, a section retry would follow. A model slip in the fallback lesson, not the number line.
- **NM-04, pair 47:** drew a number line (3, then ±2 to 5 and 1) consistent with its narration. Acceptable.

**Against the baseline arm (today, without the number line), read to the same standard:**
- Today's lessons fake a number line as a plot of y = 0 with dots, and often mislead:
  - NM-01: "3/5" placed at 0.2, and a lesson with no points;
  - NM-02: a filled dot at −2 with no ray, twice;
  - NM-04: a point at 2 where the narration says 1 and 5.
- Two baseline turns produced no lesson.
- NM-03 is sound in all three baseline turns.
- The candidate is roughly level with today on these requests, misleading in different ways, but 12 lessons against 12 is thin.
- Across runs 6–8, 6 of 27 inequality, rounding and absolute-value turns drew a number line, and about 4–5 of those misled.

**Design note.** The baseline arm was added so "worse than today" could be measured, but near misses were still judged by the same one-slip rule as in-scope lessons. Whether out-of-scope requests must never mislead, or only be no worse than today, is the owner's question. It was not settled before the run.

### Owner decisions after run 8 (2026-11-12)

1. **Requests the number line cannot show yet must never mislead** (option b). The recipe is extended to show them (inequalities, intervals, comparing two numbers, rounding) through a decision record before any code, then probes and a gate run. The recipe stays a trial until then.
2. **The model-number scale fix's payload ceiling raise** (+15–30 B schema) is a one-off exception to decision S6, with no live comparison (option a).

## Decision 0016, type 1 of 3: comparing two numbers

**Recipe:** `number_line_compare` (trial). The outline asks for `number_line` plus `number_comparison`, and the model gives the two numbers at their actual size. Each number is a point labelled with its name, on ticks that hold both: their common denominator, up to 24 parts per unit (OLL #53). The line covers only the whole units the values span, widened to include 0 when 0 is within 2 units. All of the family's safeguards apply.

**Cases written before the recipe:** CMP-01 to CMP-05 (3/4 vs 2/3; −1.5 vs −2; 5/6 vs 7/8, which needs 24ths; 0.35 vs 0.4, twentieths with decimal labels; −3 vs 2).

**Probe 1** (offering `number_line` and `number_line_compare`; 12 lessons, 21 counted calls, about $0.20): **the model chose the compare recipe 12 of 12 times, and all 12 pass every hard check, with no retries.**
- That includes NM-01 ("compare 2/3 and 3/5"), twice. It failed every gate run before.
- The two older comparisons (NL-07 0.5 vs 0.8; NL-08 −4 vs −1) also moved to the new recipe; NL-08's "no hops" is a soft note, as expected for a comparison.
- The renders were correct, but the first version kept the number line's margins: 5/6 and 7/8 crowded on −1 to 2. Comparisons now use a tight frame (0 to 1). On replay of the probe's recorded replies, all 12 still pass, and the renders read clearly.

## Decision 0016, type 2 of 3: solution sets

**Recipe:** `number_line_solution` (trial). The outline asks for `number_line` plus `solution_set`. The model solves for the boundaries and names the relation: one of 12 forms, from `x>a` to `x<=a|x>b`; |x − 3| < 2 is written `a<x<b` with a = 1 and b = 5. The program draws every end, open or filled, and every ray or interval from the relation. With two boundaries, the fit keeps their slider ranges apart, so the lower can never pass the upper.

**Judge:** a new hard check. Some state the lesson shows must draw exactly the expected pieces, each end open or included as expected, and no filled point may sit on an open end. Interval ends count as shown values and must be readable.

**Cases written before the recipe:** SOL-01 to SOL-06 (x > −2; x ≤ 3; 1 < x ≤ 4; |x − 3| < 2; x < −1 or x ≥ 2; solve 2x + 1 > 7 first).

**Probe 1** (offering all three number-line recipes; 11 lessons, 17 counted calls, about $0.15): **10 of 11 drew the solution set and pass every hard check, including the exact ends and rays.** That includes NM-02 (x > −2) and NM-04 (|x − 3| < 2), which misled in every earlier gate run. The 11th (SOL-06, "solve 2x + 1 > 7") solves the inequality in section 1 and plans the number line with `solution_set` for section 2. The harness flagged it for hand review, and it is correct as a lesson. Renders checked: x > −2; 1 < x ≤ 4; x < −1 or x ≥ 2.

## Decision 0016, type 3 of 3: rounding

**Recipe:** `number_line_rounding` (trial). The outline asks for `number_line` plus `rounding`; the model gives the number and the place (hundreds to hundredths).
- **Drawing:** the program draws the two neighbours, the halfway point (open), and a jump from the number to the result, with halves rounding up. All of these are OLL `floor` expressions of the number's variable, so a slider moves them together.
- **Ticks:** a tenth of the place, split to a hundredth only when the number needs it (362 to hundreds is drawn in ones).
- **The number is never moved,** and a name that only repeats its value is left off.

**Judge:** a new hard rounding check. A jump from the number must end at the expected result in some state the lesson shows. One shared expression evaluator now handles `floor`, `round`, `ceil` and `abs`.

**Cases written before the recipe:** RND-01 to RND-05 (47 to tens; 362 to hundreds; 3.6 to ones; 1.24 to tenths; 85 to tens, the halfway case).

**Renders.** The first renders were correct but left a large gap under the line. A moving card reserved a label row for each of its four points and its jump. OLL #54 caps the reserve at two rows. A name that only repeated the number's value ("362") is now left off.

**Probe 1** (offering all four number-line recipes; 10 lessons, 20 counted calls, about $0.20): **the model chose the rounding recipe 10 of 10 times, and all 10 pass every hard check**, including 85 → 90 and 1.24 → 1.2. NM-03 ("round 47"), which misled in earlier gate runs, now draws 40, 45, 47 and 50 with the jump to 50.

**All three types are now built and probed.** Pooled first probes: compare 12/12, solution sets 11/11 by hand (10 by the judge, plus one with its number line in section 2), rounding 10/10. The remaining step is the gate run on frozen code (the owner's approval needed), with near misses outside the new scope judged "no worse than today".


**Review fixes (#68, #69).** Solution sets: the split between the two boundaries' slider ranges now falls between every value the lesson gives them (an animation to a = 4 in 1 < x < 5 stays 4), each boundary keeps a usable range when the boundaries are adjacent ticks (1 < x < 2), and a lesson that moves a past b is refused as a section fault instead of being redrawn with changed values. Rounding: the judge requires a jump from the rounded number itself to the result (a 40 → 50 jump beside 47 fails). Replaying the recorded probes under these checks gives the same results: rounding 10/10, solution sets 10/11 (SOL-06 shows its line in section 2, as before).

### Run 9 rules: the gate on frozen code (owner-approved 2026-11-12, set before the run)

- **Frozen code:** Coach main 3242238 (#68 and #69 merged, with their review fixes). All four number-line recipes offered: `number_line`, `number_line_compare`, `number_line_solution`, `number_line_rounding`.
- **Speed:** 20 pairs on NL-01..10, speed option (a): the paired median must stay within +0.5 s, with one repeat if inconclusive.
- **Quality:** every quality case twice (NL-11..20, CMP-01..05, SOL-01..06, RND-01..05, NM-01..04): 60 candidate lessons.
  - In scope (NL, CMP, SOL, RND, and NM-01..04, which decision 0016 now covers as compare, solution and rounding requests): **never mislead**, by the hard checks, with the one-slip rule (option B: at most one model slip, never twice on the same request).
  - NM-01..04 also run on the baseline arm, read by hand against today.
  - A lesson whose number line appears only in a later section is read by hand.
- **Budget:** `--pairs 20 --quality-repeats 2 --max-calls 190`, about $1.25 expected (at most about $1.40). Three repeats would cost about $1.65, above the approved figure.

## Run 9 (2026-11-12): incomplete — the comparing, solution-set and rounding cases did not run

Owner-approved; 110 calls (about $0.80); `eval/trial-recipe-speed-number-line-2026-11-12-run9.json`.

**A harness defect, found after the run.** The harness took the quality cases of the first recipe named only, so CMP-01..05, SOL-01..06 and RND-01..05 never ran, although the rules above list them. The run is therefore incomplete, not passed. Fixed: `qualityCasesFor` takes every named recipe's cases, with a test.

**What did run:**
- **Quality: 38 of 38 pass every hard check** (NL-11..20 twice, NM-01..04 twice, and the 10 NL speed pairs that used the recipe). One soft miss: NL-08 without hops.
- **NM-01..04, re-judged for free with the full checks** (the comparing, solution-set and rounding expectations, through `scripts/replay-trial-recipe.mjs`): **8 of 8 pass**. In runs 6–8 these requests misled 4–5 times in 6. Read by hand: each final picture agrees with its narration (open circle and ray from −2; the open interval 1 to 5; 40, 45, 47, 50 and the jump to 50; 3/5 left of 2/3). Each line starts at the reset value for the learner's task and animates to the taught value while the lesson speaks (option a).
- **Speed: inconclusive under option (a).** Paired median +1.09 s against +0.5 s, 95% interval [−3.3, +4.1] s, which includes zero. The rule allows one repeat of the 20 speed pairs.

**A speed signal across runs.** Pooling the speed pairs of runs 5–9 (50 per group):
- requests that use the number line: −3.7 s (95% interval −6.7 to −0.4 s);
- the other held-out requests, which the candidate's larger prompt (+107 to +252 tokens) reaches without the recipe being used: **+1.7 s (95% interval +0.7 to +2.8 s)**, slower in 72% of pairs.
- Part of this is retries: 5 of 50 candidate turns made extra calls against 1 of 50 baseline turns. None involved the number line (for example, a unit circle drawn for an Earth-science request). The cause is not established. Eight of the ten held-out requests are science, which is now paused.

### Run 9b rules: completing run 9 (owner-approved 2026-11-12, set before the run)

- **Same frozen product code** as run 9 (Coach main 3242238); only the harness fix differs. All four number-line recipes offered.
- **Quality:** the cases run 9 missed, twice each: CMP-01..05, SOL-01..06, RND-01..05 (32 lessons). In scope: never mislead, by the hard checks. The slip rule (option B) applies to runs 9 and 9b together.
- **Speed (option a, its one allowed repeat):** 20 more speed pairs on NL-01..10. Speed is judged on all 40 pairs of runs 9 and 9b: the paired median must be at most +0.5 s. No further repeats.
- **Budget:** `--pairs 20 --cases <the 16 cases> --quality-repeats 2 --max-calls 120`, about $0.75.

## Run 9b (2026-11-12): quality passes; speed fails, so the number line stays a trial

Owner-approved; 109 calls (about $0.80); `eval/trial-recipe-speed-number-line-2026-11-12-run9b.json`. Every planned run ran.

**Quality: no misleading first section across runs 9 and 9b.**
- Run 9b: 41 of 42 pass every hard check (CMP, SOL and RND twice each, and the 10 speed pairs that used the recipe).
- The one miss, SOL-06 (2x + 1 > 7), solves the inequality step by step in section 1, and its outline puts the solution-set number line (boundary 3) in section 2. The harness stops after section 1, so that line was never generated or judged; the first section is sound, as in the solution-set probe.

**Speed: fails under the rule set before the run.** On all pairs of runs 9 and 9b, the paired median is **+0.77 s** against +0.5 s (39 complete pairs; +0.76 s counting the pair whose baseline hit the call cap as a candidate win). This was the one allowed repeat. By the rules, the number line stays a trial; the switch-on change is not made.

**The split behind the median.** The mixed median hides two opposite effects (runs 9 and 9b):
- requests that use the number line: −3.0 s;
- the other held-out requests: **+2.8 s** (95% interval +1.4 to +5.0 s). Pooled over runs 5–9b the same pattern holds.
- Of the other requests, only two are math: HO-MA-04 was slower in 5 of 6 pairs (median +2.3 s); HO-MA-01 was mixed. Eight of ten are science, now paused. The sample is thin.

**Probable cause: more thinking, not size** (free analysis of the providers' usage records):
- On the other requests, the first call thinks in 35 of 60 candidate turns against 24 of 60 baseline turns (runs 5–9b), and a turn that thinks takes about 3–6 s longer. Number-line requests think slightly less with the recipe (16 of 60 against 19 of 59).
- In single-call pairs only (17 of 20 in runs 9 and 9b), the other requests are still +2.7 s, so retries are not the cause.
- Size alone does not explain it: the 2026-11-11 payload experiment added +1,331 prompt tokens of cards marked unavailable with no measurable cost, and the physics pilot's other requests were 1.5 s faster. The number-line additions are about +250 tokens.
- The likely mechanism is that the number-line guidance gives the model more to weigh on requests it does not fit. Not established: thought text is not recorded.

## After run 9b: rewriting the number-line instructions (2026-11-12)

**Owner decisions (2026-11-12).**
- Rewrite the number-line instructions.
- **Speed rule from now on:** requests the new recipe fits and requests it does not are judged separately, each by its paired median at most +0.5 s. The harness reports this as `speed` (`speedVerdict`), and records each turn's thinking tokens.

**Where the extra thinking appeared.** On the held-out requests, runs 5–8 (the base card only) thought in 19 of 40 candidate turns against 15 of 40 baseline turns. Runs 9 and 9b, which added the three new types, thought in 16 of 20 against 9 of 20. What came with the new types:
- three new cards;
- the feature names `number_comparison`, `solution_set` and `rounding`;
- the `relation` (12 forms) and `place` (5 places) options in the response schema.

The base card also kept "not for inequalities, absolute value, rounding" while two new cards said to use a number line for exactly those.

**The rewrite (deleting, not adding):**
- **Contradiction:** the base card's stale "not for…" clause is gone.
- **Compare path:** the base card no longer teaches comparing two numbers, which now has its own card.
- **Scope:** each card states its use in its opening words (数轴加减, 数轴比较两个数, 数轴画不等式解集, 数轴四舍五入), as the physics card does.
- **Kept:** the clauses that fixed real failures (actual values such as 0.75, decimal labels, the |x−3|<2 example).
- **Size:** the four cards fall from 1,203 to 524 bytes; math's footprint falls from 5,760 to 5,602. The payload test passes with the four types on (with #72's ceilings).
- **Not changed:** feature names and schema options, so a result can be traced to the wording.

Free replays cannot test this change: they reuse replies written under the old wording.

### Run 10 rules: does the rewrite remove the slowdown? (diagnostic; set before the run, needs the owner's approval)

- **Arms, interleaved in all six orders:**
  - *off:* no number line;
  - *current:* the four types with the wording of main `3242238`, built separately;
  - *rewrite:* the four types with the new wording.
- **Requests:** only requests the number line does not fit, chosen now. The 10 held-out cases (`OTHER_CASE_IDS`, 2 math, 8 science) and 10 high-school math questions from the natural set: `M01-linear-system-question` to `M10-binomial-probability-question`. One trio each, 20 trios.
- **Primary:** rewrite against off, paired median at most +0.5 s.
- **Secondary:** thinking rate per arm, and rewrite against current.
- **Diagnostic only:** this run does not switch anything on. The rewrite is new model-facing text, so switching on still needs a gate run on the frozen rewrite: quality on every number-line case, and speed under the new rule. That is a separate approval, about $1.30.
- **No repeat.** At 20 trios, a change with no real cost exceeds +0.5 s about 1 time in 8; the result is read with that in mind.
- **Budget:** `--other-cases … --previous-build <main build> --pairs 20 --quality-repeats 0 --max-calls 80`, about $0.50. (Run 10 was started with `--quality-repeats 0`; the review of #73 found that without it the harness would have run the quality cases after the trios. Other-only mode now defaults to none.)
- **Verdict:** if every pair of a planned group is missing an arm, the verdict is incomplete, not a pass (review of #73).
