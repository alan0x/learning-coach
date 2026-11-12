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
- **Window.** A start the lesson does not move is kept within one unit of its value. The change keeps the range the model gave, so a learner can still drag it where the narration goes, unless the line would then be wider than 24 units; in that case the change is narrowed to the values the lesson uses.
- **No new rejections.** The numbers are left as the model wrote them if another visual also shows them, or if snapping would make a practice task already met.

## Run 4 pass criteria (set before the run)

Speed, as for runs 1–3:
- All 20 pairs complete with no errors.
- The paired median difference shows no slowdown beyond the noise of earlier runs (within +0.5 s).
- The recipe is chosen for the number-line requests and not for the others.

Quality, read from each candidate row's `number_line` summary:
- **Fraction requests get their denominator:** NL-03 (3/4) and NL-04 (1/4 + 2/4) in quarters, NL-09 (1/3 + 2/3) in thirds, NL-10 (counting by fourths) in quarters, and NL-07 (0.5 and 0.8) in tenths.
- **Integer requests get a readable line with hops:** NL-01, NL-02, NL-05, NL-06 and NL-08 span at most 24 units with hops on.
- **At least 8 of these 10 checks pass.** A miss is recorded with the line the model and program produced.
