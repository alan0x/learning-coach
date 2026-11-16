# Paired check: retries that ask differently (2026-11-16)

Plan §7 step 3, steps 2–3 of the accommodation order. Approved by the owner, with a cap of 120 calls.

- **Candidate:** #109.
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
  - The model chose sliders for a/(px + q) on this arm, which exposes two defects on main:
    1. **The plot cannot be evaluated at one slider state** ("fails when number_01 = -1: Expression result is not finite"). This may be the plot judge's known false positive for slider-moved poles; not yet confirmed.
    2. **The domain bar contradicts the curve when p can reach 0** ("the function is defined at x = 4.8, outside the domain bars, when … number_03 = 0"). The range was already refused where p can be 0 (#92), but the domain was not. This can draw a wrong picture. It goes into the plan as an urgent fix.

## Tokens and cost

**Tokens,** over 57 recorded replies:
- prompt 142,698 (65,885 of them cached);
- output 65,176;
- thinking 14,824.

**Cost estimate.** At gemini-3.6-flash's standard prices (Google's pricing page, read 2026-11-15), the recorded replies come to about **$0.36**. Scaled to all 89 calls, the run cost about **$0.57**.
