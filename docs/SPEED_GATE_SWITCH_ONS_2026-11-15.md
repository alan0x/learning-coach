# Speed gate for the two switch-ons (2026-11-15)

Plan §7 step 3.2, approved by the owner with a cap of 160 calls. It measures the two changes switched on before
any gate: number-line steps (Coach #99) and the function-plot options (#98).

**Verdict: speed passes.** Requests that use the new parts start 0.67 s sooner, and other requests start 0.21 s
sooner (paired medians; the M4 rule allows up to +0.5 s for each group). The run found one defect: two lessons
with the new parts on produced nothing. **It is still open on main** (see the last section).

## Setup

- **Builds:** baseline Coach `75578ab` (before both switch-ons); candidate `267261c` (main, both on). The same
  environment for both (`--baseline-build`).
- **Command:** `--recipes extensions_switch_on --pairs 40 --lesson-calls 4 --max-calls 160`.
- **Requests that use the new parts:** ten, chosen by a rule fixed before the run: ST-01 to ST-05, and PJ-01,
  PJ-02, PJ-04, PJ-07 and PJ-10 (the first plot case of each option family; PJ-03 left out as a pre-registered
  miss).
- **Other requests:** the ten routing cases every earlier gate used. Each request runs twice per build; the two
  builds alternate which goes first.
- **Route:** google, gemini-3.6-flash.
- **Data:** `handoff-math-expressiveness/runs/gate-switch-ons/` (`gate.json`, `gate-progress.log`); raw replies are
  in the run's `work_dir`.

## Results

| Group | Complete pairs | Paired median | 95% interval of the mean | p50 baseline → candidate |
|---|---|---|---|---|
| Uses the new parts | 19 | **−674 ms** | −5.3 s to +1.2 s | 8.8 s → 8.7 s |
| Other requests | 19 | **−208 ms** | −2.4 s to +3.4 s | 9.4 s → 8.5 s |

- **Calls:** 125 of 160 (baseline 53, candidate 72). Lessons needing more than one call: baseline 9, candidate 21.
- **Requests:** median prompt +180 tokens on the candidate (2,736 → 2,916).
- **Thinking turns:** baseline 20 of 40, candidate 16 of 38.
- **No lesson (candidate only): 2 of 40.** PJ-01 and HO-PH-04 each used 4 calls and published nothing. Every
  refusal in both was `sample_x_numbers` holding x positions, not lesson-number indexes (`[1, 3]` for the points
  at x = 1 and 3). The trial had seen the same slip 5 times, only with the options on. Both missing pairs are
  left out of the medians above.
- **Judge (first section, candidate):** 17 of 20 pass.
  - ST-02 missed twice: 27 + 25 was split as 20 then 5, not tens then ones, as in the trial.
  - PJ-01 missed once: no lesson.

## The defect: still open

**Repair in place was tried and closed (#102).** It turned x positions written as `sample_x_numbers` into fixed points. Two code reviews (20 findings) showed that every version which reads the lesson's text to judge whether the formula is the real curve can publish a wrong picture. A stand-in formula is the case: `x` written for the line through (1, 2) and (7, 10). A refusal costs a call; a wrong picture breaks the standard.

**Census of the recorded slips** (corrected 2026-11-16: the first count skipped outlines with no `numbers`
key): 42 replies across this gate, the trial, run B and the 139 recorded lessons.
- 15 are on section calls in lessons with no lesson numbers. Both lessons this gate lost are of this kind.
- 12 are on section calls in lessons with numbers.
- 15 are on bootstrap calls, which write the outline in the same reply.

**Fix: not merged (#105 closed after five reviews).** Its last form left `sample_x_numbers` out of section
requests in lessons with no lesson numbers. Replayed on the recorded slips, it rescued three lost lessons, but it
let a fourth (PJ-07) publish a piecewise request drawn as two full lines. A check main lacks (does a piecewise
request draw pieces?) comes first. With numbers, an enum would turn an x value into a valid but wrong index. The
defect stays open (plan §7 step 3.6a).

## Tokens and cost

**Tokens,** over the 106 recorded replies (calls stopped at the first playable section have no recorded reply):
- prompt 265,807 (82,916 of them cached);
- output 127,161;
- thinking 30,750.

**Cost estimate:** prices for gemini-3.6-flash, standard tier, are from Google's pricing page
(aistudio.google.com/docs/pricing, read 2026-11-15), valid through 2026-12-31:

| Item | Tokens | Price per 1M | Cost |
|---|---|---|---|
| Uncached input | 182,891 | $0.75 | $0.137 |
| Cached input | 82,916 | $0.075 | $0.006 |
| Output and thinking | 157,911 | $3.75 | $0.592 |
| **Recorded replies** | | | **$0.74** |

- The 19 calls with no recorded reply are not counted. At the recorded average they would add up to $0.13, so the
  run cost about **$0.74–0.87**.
- From 2027-01-01 the page lists double these prices.
