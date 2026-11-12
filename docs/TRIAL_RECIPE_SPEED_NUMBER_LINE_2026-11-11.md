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
