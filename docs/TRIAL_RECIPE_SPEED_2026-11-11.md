# Speed gate for the constant-speed motion recipe (2026-11-11)

Subject plan P2, step 3, decision E5: an AI lesson adopts a new recipe only after the recipe passes the speed gate. The product owner approved the model spend: 20 interleaved pairs, measured to the first playable section.

**Result: pass.** Offering `constant_speed_motion` adds 81 prompt tokens (p50 2,495 → 2,576) and no measurable first-playable time. The model chose the recipe for every constant-speed request and for no other request.

## What was compared

- **Both arms:** the same Coach build (this branch) through the real tool process, as Octos starts it, stopped at the first `lesson-prefix-published` event.
- **Candidate:** the same run with `LEARNING_COACH_TRIAL_RECIPES=constant_speed_motion`, so its requests also offer the recipe's card, guidance and schema.
- **Cases:** 10 constant-speed requests (5 Chinese, 5 English) paired with 10 held-out requests from other subjects (mathematics, physics, chemistry, biology, earth and space). Pairs alternate the two kinds; the order within a pair alternates.
- **Route:** the production lesson route from the owner's Octos profile, `google` / `gemini-3.6-flash`. The key was read inside the process; no output contains a key fragment.
- **Spend:** 45 model calls (cap 60).

Harness: `scripts/eval-trial-recipe-speed.mjs`. Raw rows: `eval/trial-recipe-speed-2026-11-11.json`.

## Results

| | Pairs | p50 first playable, recipe not offered | Offered | Paired difference (offered − not), median | Mean, 95% CI |
|---|---|---|---|---|---|
| All | 20 | 9.59 s | 8.17 s | −1.28 s | −2.62 s, [−4.49, −0.75] |
| Constant-speed requests | 10 | 9.20 s | 8.45 s | −0.92 s | −2.15 s, [−4.67, +0.37] |
| Other subjects | 10 | 10.07 s | 7.86 s | −1.50 s | −3.09 s, [−5.96, −0.21] |

- **No slowdown.** The candidate is not slower in either group. The negative differences are not a speed-up from the recipe. Four baseline runs were slow for unrelated reasons (15–20 s), two of them after a local rejection and a repair call. Every candidate run reached its first section with one model call. The size of the request changed by 81 prompt tokens; the payload experiment found no cost from 1,331.
- **Recipe choice.** The first playable section used the recipe in 10 of 10 constant-speed requests and 0 of 10 other requests. No run failed or was cut off.
- **What the model wrote with it.**
  - Time 0–10 s.
  - Speed in m/s, starting at the value the request gave when it gave one (15 m/s, 1.5 m/s), otherwise 2 m/s.
  - Units on both axes.
  - A distance axis rounded to 50, 100 or 500 m.

## Decision

The recipe passes the speed gate. Adopting it in AI lessons means moving it from `TRIAL_RECIPES` to the catalog. That is a separate change, and it changes every provider request (new request digests). The plan's quality gate for enabling a subject (§10, blinded review) still applies to physics as a whole.
