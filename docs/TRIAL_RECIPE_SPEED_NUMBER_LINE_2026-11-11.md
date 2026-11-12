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

## Run 5 pass criteria (set before the run)

The run 4 criteria, with value checks added. A formal pass that shows the wrong value counts as a miss.
- **NL-03** draws quarters, and its start or end is 0.75.
- **NL-04** draws quarters, and every point is a quarter.
- **NL-09** draws thirds, and shows 1/3 and 1 (or 1/3 + 2/3).
- **NL-07** draws tenths; **NL-10** draws quarters.
- **NL-01, NL-02, NL-05, NL-06 and NL-08** span at most 24 units with hops on, and reach −5, 7, 8, −9 and −3 respectively.
- At least 8 of the 10 pass, with no wrong values. Speed as before.
- From the replay: if the model writes values again, 8 of 10 is within reach, but only just. Lessons like NL-05 and NL-06, whose own tasks move the start far, still miss on width.

**Stop rule (proposed to the owner).** If run 5 misses these criteria, the number line stays a trial recipe and the work moves to decision 0014. Learners lose nothing, because Studio and CoursePacks already have the number line.
