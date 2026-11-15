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
| Near misses no worse than without the options | **fail**: PJ-15 and PJ-16 produced no lesson in either repeat; without the options both drew a plain plot |
| Not using the option is a miss | applied |
| Refusals and extra calls reported | below |

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
   - The program refuses each one in the section, as decision 0018 says. The refusal tells the model to leave the mark out, but the retry asks for the same or another unsupported mark, until the lesson's calls run out.
   - Six lessons ended with no lesson at all. **This is the main defect.**
2. **`pieces: []` on a plain formula** (PJ-10 r1). The model wrote an empty pieces array beside a formula, and the program refused it as "two to four pieces". An empty array should mean no pieces. This is a program bug.
3. **The model chose another visual or another split.**
   - PJ-14 ×2: the allowed x values drawn as a solution set on a number line (`x > a`), not on the plot.
   - ST-02 ×2: 27 + 25 jumped as 20 then 5 (r1), or with a wrong landing (r2), not 10, 10, 5.
   - ST-07 r1: the first section had no number line.
   - PJ-10 r2: asked for the domain only.
   - PJ-02 r2: wrote a parabola for the line y = −2x + 4 (a slip).
4. **PJ-03 ×2 has no symmetry axis.** The case expects one, but its request asks only for the vertex and the x-axis crossings. The case's expectation is stricter than its request. Cases are not changed after a run.

**Near miss ST-06** (four additions): the candidate drew `number_line_steps` in both repeats (1 call each), which passes the judge's checks. It needs a hand read before it counts.

## Recommendation

- Keep both off.
- **Fix the refusal loop in the program, not in more rule text.** When a section is refused for a mark, the retry's schema should no longer offer that mark. Coach already does the same for an outline visual (`LESSON_PLAN_OUTLINE_VISUAL` excludes the recipe from the next outline). The model then cannot ask for it again, and the first request does not grow.
- Fix `pieces: []` to mean no pieces.
- Then a small re-trial of the failing cases with a control arm (needs the owner's approval and a call count).
