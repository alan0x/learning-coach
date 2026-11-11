# Shadow-mode speed gate, Jev on and Jev off (2026-11-11)

Subject plan P2, step 2, last item: "the speed gate passes with Jev on and with Jev off". The product owner approved the model spend and scaled it down like the payload experiment: 20 interleaved pairs, measured to the first playable section only.

**Result: pass.** Shadow mode adds no first-playable time with Jev on or with Jev off. The model requests are the same size in both arms, and the new Jev subject question is no slower than today's.

## What was compared

| | Baseline | Candidate |
|---|---|---|
| Coach | 0.25.1, the installed production build | 0.26.0, this branch's build (shadow mode, three new subjects) |
| Jev on | Learn's gate with today's five-choice subject question; no subject fields | Learn's gate with the plugin subject question; `plugins`, `plugin_confidence` and `plugin_source` from Jev's answer |
| Jev off | No gate call; no subject fields | No gate call; fields from the board context (`context`) or `none`, alternating |

- **One run** is what Learn and Octos do for a typed lesson request. Learn awaits the Jev gate when Jev is on. Then the Coach tool process starts with the lesson input on stdin, exactly as Octos runs it. The run stops at the tool's first `lesson-prefix-published` event. The time is gate time plus tool time, including Node start-up.
- **Gate request.** The harness's Jev request was checked byte for byte against Learn's `evaluateAdmissionFastGate` for both questions (all fields except `model`, which comes from the profile).
- **Route.** Production lesson route from the owner's Octos profile: `google` / `gemini-3.6-flash`, Jev `jev-latest`. Both keys were read inside the process; a scan of every output found no key fragment.
- **Cases.** 20 held-out text cases (`eval/subject-routing-heldout.json`): 3 or 4 per subject, the four mixed-subject cases and one ambiguous one. Pairs alternate Jev on and Jev off; the order within a pair alternates.
- **Spend.** 54 model calls (cap 60), 40 Jev gate calls.

Harness: `scripts/eval-shadow-speed.mjs`; raw rows: `eval/shadow-speed-gate-2026-11-11.json`.

## Results

| | Pairs | p50 first playable, baseline | p50, candidate | Paired difference (candidate − baseline), median | Mean, 95% CI |
|---|---|---|---|---|---|
| Jev on | 10 | 10.77 s | 11.02 s | −0.11 s | −0.54 s, [−3.76, +2.68] |
| Jev off | 9 | 12.52 s | 7.44 s | −0.32 s | −4.03 s, [−8.09, +0.03] |

- **Jev gate time:** p50 678 ms with today's question and 676 ms with the plugin question. No gate call failed or timed out, and every gate answered `generate_lesson`.
- **Same request size.** The first request's prompt tokens are the same in both arms of every pair (2,452–2,565). This confirms what the tests assert: shadow mode leaves the model request byte-identical.
- **Spread comes from repairs, not from the change.** The confidence intervals are wide because some runs needed a local rejection and a second or third model call before the first section played. These runs took 11–24 s. There were 8 such runs: 5 in the baseline and 3 in the candidate. The Jev-off candidate looks faster only because more baseline runs needed repairs.
- **One run was cut off by the harness, not by the lesson.** HO-PH-01, Jev off, candidate: one local rejection, then the outline was ready, and the harness stopped the run at its fourth model call (cap 3 per run). Its pair is left out of the Jev-off summary.
- **Coach logged the signal in every candidate run.** For example `jev` → `chemistry` + `shared`, `context` → `biology` + `math` + `shared`, `none` → broad. Jev's choice matched the expected subject in all 10 Jev-on runs.

## Decision

The gate passes with Jev on and with Jev off:
- The candidate adds no model-request bytes.
- Its Jev question is as fast as today's.
- The measured p50 differences are within run-to-run noise in both directions.

A slowdown of a few hundred milliseconds cannot be ruled out from 10 pairs per mode by timing alone. The mechanism rules it out instead: identical model requests, an equal gate time and only three small input fields to parse. Running the plan's 40 pairs would mainly narrow the repair noise.

Not covered: attaching the camera frame or ink selection to the Jev gate. That stays deferred and needs its own speed check, because an image call can be slower than the 2 s gate timeout allows.
