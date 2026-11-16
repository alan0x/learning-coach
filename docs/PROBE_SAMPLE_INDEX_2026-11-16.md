# Probe: sample_x_numbers limited to the lesson-number indexes (2026-11-16)

Plan §7 step 3.6a, approved by the owner with a cap of 100 calls. Candidate: this branch (#105). Control:
main `fc6adc2`.

**Pass rule** (stated before the run): no section slip on the candidate, and no regression against the control.
**Result: pass.**

## Setup

- **Cases:** the 17 plot judge cases (PJ-01–17) on both arms, plus HO-PH-04 (the routing case that produced no
  lesson in the speed gate) as one pair. 36 lessons in all.
- **Command:** `--baseline-build <fc6adc2> --recipes function_plot_extensions --other-cases HO-PH-04 --pairs 1
  --quality-repeats 1 --both-arms --lesson-calls 4 --max-calls 100`.
- **Route:** google, gemini-3.6-flash.
- **Data:** `handoff-math-expressiveness/runs/probe-36a/` (`probe.json`, `probe-progress.log`); raw replies are in
  the run's `work_dir`.

## Results

| | Control | Candidate |
|---|---|---|
| Lessons playable | 18 of 18 | 18 of 18 |
| Calls | 40 | 35 |
| Plot judge passes | 14 of 17 | 15 of 17 |
| Section-call slips in `sample_x_numbers` | 0 | 0 |

- **Calls in all:** 75 of 100.
- **Judge misses:**
  - both arms: PJ-03, the pre-registered miss (the case asks for no axis), and PJ-14 (the model drew no plot);
  - control only: PJ-10 (no range bar).
- **Refusals:** control 5 (4 formula errors, 1 interaction mismatch); candidate 2 (a missing board item, 1
  interaction mismatch). No `LESSON_PLAN_NUMBER_REFERENCE` on either arm.
- **Slips:** one in all 43 recorded replies, on a candidate bootstrap call (`[0, 2]` with two lesson numbers), which
  the limit cannot reach. The provider kept all 41 recorded `numbers` lists within their enum.

**What this shows, and what it does not.** The slip is rare (2 of 40 gate lessons; 1 of 36 here), so 36 lessons
cannot show a lower rate. The probe shows that the provider accepts the limited schema and that nothing regresses.
The fix itself is structural: the schema makes an out-of-range index unwritable, and the provider has kept every
recorded enum of this kind (370 in the earlier census, 41 here).

## Tokens and cost

**Tokens,** over 43 recorded replies:
- prompt 115,910 (40,958 of them cached);
- output 54,848;
- thinking 12,421.

**Cost estimate.** At gemini-3.6-flash's standard prices (Google's pricing page, read 2026-11-15: $0.75 per 1M
input, $0.075 per 1M cached, $3.75 per 1M output including thinking), the recorded replies come to **$0.31**. The
32 calls with no recorded reply are not counted; at the recorded average they would bring the run to about $0.54.
