# Trial of the function-plot options and number-line steps (2026-11-15)

Owner-approved reduced trial of the trial option `function_plot_extensions` (marks, the slope triangle,
pieces, domain and range: Coach #89–#92) and the trial recipe `number_line_steps` (#88).

**Verdict: fail.** Neither should be turned on yet. Default requests are unchanged (both stay off).

## Run

- **Route:** Gemini API, `gemini-3.6-flash` (the owner's profile; no key printed or stored).
- **Build:** Coach main `0462cb8` with the harness change in #93.
- **Schema check first:** one lesson on PJ-07 (pieces, the first array-of-objects parameter). The provider
  accepted the schema; the model used pieces, and the lesson passed the plot judge in 2 calls.
- **Trial:** `--recipes number_line_steps,function_plot_extensions --pairs 0 --quality-repeats 2 --max-calls 168`.
  - 24 cases (ST-01–07, PJ-01–17) × 2 repeats with the options on.
  - The near misses (ST-06, PJ-15, PJ-16) × 2 also without them.
  - 54 lessons.
- **Calls:** 128 started in the trial and 2 in the schema check, so 130 of the 170 approved.
- **Tokens, over the 79 + 2 replies recorded:**
  - prompt 197,830;
  - output 98,534;
  - thinking 15,131.

  Calls stopped at the first playable section have no recorded reply. No price is claimed.
- **Data:** `handoff-math-expressiveness/runs/plot-trial/` (`schema-check-pj07.json`, `trial.json`,
  `trial-progress.log`). Raw replies are in the run's `work_dir`.

## Results against the pass rules

| Rule | Result |
|---|---|
| In-scope cases pass the judge in both repeats | **fail**: 14 of 21 cases pass both; 31 of 42 lessons pass |
| No narration of anything undrawn (hand read) | pass in the lessons that passed the judge (keyword scan plus reading each hit) |
| Near misses no worse than without the options | **fail**: PJ-15 and PJ-16 reached no playable section within the harness's 3 calls in either repeat; without the options both drew a plain plot in 2 |
| Not using the option is a miss | applied |
| Refusals and extra calls reported | below: the census replays every saved reply offline (the harness did not keep refusal reasons) |

**Passed in both repeats:**
- number-line steps: ST-01, ST-03, ST-04, ST-05;
- slope triangle: PJ-01;
- vertex, axis and intercepts: PJ-04, PJ-05, PJ-06;
- pieces: PJ-07, PJ-08, PJ-09;
- domain and range: PJ-11, PJ-12;
- plain plot: PJ-17.

## The misses, read from the raw replies

1. **The model asks for marks outside their scope and keeps asking after the refusal** (PJ-15 ×2, PJ-16 ×2, PJ-10 r1, PJ-13 r2).
   - Requests seen:
     - range on a cubic and on a sine;
     - vertex or intercepts on a root and on an exponential;
     - range with two curves;
     - a constant `c` that is not a lesson number.
   - The program refuses each one in the section, as decision 0018 says. The refusal tells the model to leave the mark out and names only the first mark. The retry asks for the same or another unsupported mark (PJ-16 switched from `range` to `vertex, intercepts`).
   - Six lessons were still refused when the harness stopped them at 3 calls. Coach allows a section three attempts after the bootstrap, so it would have made a 4th call, and only after that would the lesson have failed. Whether that 4th call would have produced a lesson is not measured. **This is the main defect.**
2. **`pieces: []` on a plain formula: 6 lessons** (PJ-10 r1, PJ-12 ×2, PJ-04 r2, PJ-15 r2, PJ-16 r2). The model wrote an empty pieces array beside a formula, and the program refused it as "two to four pieces", one extra call each. An empty array should mean no pieces; `marks: []` is refused the same way. This is a program bug.
3. **`sample_x_numbers` holding x values, not lesson-number indexes: 5 refusals**, all in near-miss lessons with the options on (none without them). This is not yet explained.
4. **The model chose another visual or another split.**
   - PJ-14 ×2: the allowed x values drawn as a solution set on a number line (`x > a`), not on the plot.
   - ST-02 ×2: 27 + 25 jumped as 20 then 5, not 10, 10, 5. In r2 the line drew 27 → 47 → 52 during the narration, then set the first jump back to 0 for the learner's turn (a met practice target returns the line first). The judge reads that final state.
   - ST-07 r1: the bootstrap's number line declared no lesson numbers (an outline fault), so the outline was asked again, and the new first section had no number line.
   - PJ-10 r2: asked for the domain only.
   - PJ-02 r2: wrote a parabola for the line y = −2x + 4 (a slip).
5. **PJ-03 ×2 has no symmetry axis.** The case expects one, but its request asks only for the vertex and the x-axis crossings. The case's expectation is stricter than its request. Cases are not changed after a run.

**Near miss ST-06** (four additions): the candidate drew `number_line_steps` in both repeats (1 call each): start 6, then +7, +8, +9 as three moves landing at 13, 21 and 30, as narrated. It passes the hand read. Both repeats invite the learner to adjust a jump that has no slider in the reply; the program's own handling of that is unchanged by the trial.

**Other refusals in lessons that passed** (from the census): formula names not declared as lesson numbers (`a`, `k`), a demonstration with an unbound number, overlapping pieces, an animated multi-curve comparison. Each cost one call.

## Recommendation

- Keep both off.
- **Fix the refusal loop in the program, not in more rule text.** When a section is refused for a mark, test each mark alone against the reply's formula. The retry's schema offers only those that compile, or no `marks` at all; the same applies to the several-curves refusal. Coach already narrows an outline this way (`LESSON_PLAN_OUTLINE_VISUAL`). Excluding only the named mark would not stop it: the cubic reply asked for four, and none can be drawn. The "do not narrate" hint stays on the retry.
- Fix `pieces: []` and `marks: []` to mean none.
- Keep each lesson's refusal reasons in the harness report, and let a lesson make Coach's real number of calls.
- Then a small re-trial of the failing cases with a control arm (needs the owner's approval and a call count).

## Confirming run B (2026-11-15, owner-approved, cap 100 calls)

- **Setup:** after the fixes (Coach #94–#96, main plus #93–#96 merged locally), the 17 plot cases ran once each, with the options on and off in the same build.
  - Flags: `--both-arms --lesson-calls 4`.
  - Coach #94–#96 change no request-building code, so the trial's 48 first replies stayed valid and were replayed offline; one repeat confirms them live.
- **Calls:** 73.
- **Tokens, over 43 recorded replies:** prompt 108,433; output 54,431; thinking 7,457.
- **Data:** `handoff-math-expressiveness/runs/plot-rerun-b/` (the raw replies are copied into `raw/`).

| | Options on | Options off |
|---|---|---|
| Reached a playable section | 17 of 17 | 15 of 17 (PJ-07 and PJ-09, piecewise, failed after 4 calls) |
| Judge passes | 13 | 4 |
| Calls | 35 | 38 |
| Lessons with a rejection | 2 | 3 |
| Median seconds to first playable | 6.8 | 8.1 |

**Against the agreed rules:**
- **PJ-03:** a known miss, recorded before the run. The vertex and x-intercepts were drawn; the axis was not asked for.
- **Near misses PJ-15 (cubic) and PJ-16 (sine):** both draw a plain plot and pass in both arms. With the options on they draw the range, in fewer calls.
- **PJ-17 (plain plot):** passes in both arms.
- **In scope:** 10 of 13 pass. The misses:
  - **PJ-01, misleading, caused by the program (#94).** The model gave one moving point (`sample_x_numbers: [1]`) and asked for the slope triangle. #94 leaves a triangle with one model point out, but the narration explains the rise and run from x = 1 to x = 3. Before #94 this was refused and retried.
  - **PJ-13, the model's choice.** It asked only for `intercepts` on an exponential (left out) and never for `range`. The narration states the range in words and does not point at a drawn mark.
  - **PJ-14, the model's choice.** The allowed x values are drawn on a number line (`number_line_solution`) in both arms. Under the agreed rule this is a miss, reported separately.

**Left-out marks:** checked by reading the reply beside the drawn parts. Only PJ-01's narration describes a left-out mark.
