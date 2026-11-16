# Paired check: retries that ask differently (2026-11-16)

Plan §7 step 3, steps 2–3 of the accommodation order. Approved by the owner, with a cap of 120 calls.

- **Candidate:** #109, which held two changes: the retry leaves a refused `sample_x_numbers` out in lessons
  with no lesson numbers, and a piecewise check whose retry required `pieces`. The piecewise check never fired
  in this run, so the result belongs to the first change alone. After review, #109 was split: the first
  change is #110, and the piecewise check was dropped (a wording-triggered refusal paired with a retry that
  requires a field lets the wording decide what is drawn).
- **Control:** main `00797d8`.

**Result: no lesson lost on the candidate (20 of 20), against 2 of 20 on the control, with fewer calls.** The
judge misses that only the candidate shows replay identically on main: they are model variation exposing two
defects on main, recorded below.

## Setup

- **Cases:**
  - the plot judge cases where recorded lessons slipped or misled: PJ-01, PJ-02 and PJ-04 (sample slips), PJ-07 (a piecewise request drawn as whole lines) and PJ-15 (a near miss);
  - four clean ones: PJ-05, PJ-08, PJ-11 and PJ-17;
  - HO-PH-04, the routing case the speed gate lost.
  - Each case ran twice on each build: 40 lessons.
- **Command:** `--baseline-build <00797d8> --recipes retry_narrowing --other-cases HO-PH-04 --pairs 2 --quality-repeats 2 --both-arms --lesson-calls 4 --max-calls 120`.
- **Route:** google, gemini-3.6-flash.
- **Data:** `handoff-math-expressiveness/runs/retry-narrowing/` (`run.json`, `run-progress.log`); raw replies are in the run's `work_dir`.

## Results

| | Control | Candidate |
|---|---|---|
| Lessons playable | 18 of 20 | **20 of 20** |
| Calls | 47 | **42** |
| Plot judge passes | 16 of 16 judged | 16 of 18 judged |

- **Lost on the control:** PJ-01 and PJ-02, one repeat each. Each used four calls and published nothing, every refusal being `sample_x_numbers` holding x positions: the slip the retry now cannot repeat.
- **Fewer calls on the candidate:**
  - PJ-04 took 1 call in both repeats, against 3 and 2;
  - HO-PH-04 took 1 and 1, against 2 and 1;
  - PJ-07 took 1 and 2, against 2 and 2.
- **Piecewise:** PJ-07 drew pieces and passed the judge on both arms. The check did not fire in this run.
- **Judge misses, candidate only: PJ-11, both repeats.** They are not caused by #109.
  - Neither lesson went through a narrowed retry. One had no refusal; the other had an outline fault and an unbound-number refusal.
  - Replaying both lessons' replies on main gives the same lessons and the same misses.
  - Read from the replies (corrected 2026-11-16):
    1. **A moving point reaches a pole: a real defect on main.** The model put a point P, dragged by a slider
       from −5 to 5, on y = 2/(x + 1). At x = −1 the curve has no value, so the plot cannot be evaluated there
       ("fails when number_01 = -1: Expression result is not finite"). Coach checks a sample slider's two ends,
       never a pole between them. A fix (bind the point with `hide_when_undefined`, so it hides at the pole)
       changes every plot with moving points, so it goes into the plan.
    2. **The domain-bar miss is the plot judge's known false positive for slider-moved poles.** The formula is
       n1/(n4·x + n2) + n3. At the flagged state the denominator is 1·x − 4.8, so the function is not defined at
       x = 4.8; slider stepping leaves a rounding error, and the judge finds a value next to the pole. At
       n4 = 0 the bars' ends (−n2/n4) are not finite, and `hide_when_undefined` hides them: nothing wrong is
       drawn. An OLL change refusing that domain (OLL #71) was closed for this reason.

## Tokens and cost

**Tokens,** over 57 recorded replies:
- prompt 142,698 (65,885 of them cached);
- output 65,176;
- thinking 14,824.

**Cost estimate.** At gemini-3.6-flash's standard prices (Google's pricing page, read 2026-11-15), the recorded replies come to about **$0.36**. Scaled to all 89 calls, the run cost about **$0.57**.
