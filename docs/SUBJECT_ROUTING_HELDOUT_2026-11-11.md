# Held-out subject routing against Jev (2026-11-11)

Subject plan P2, step 2 (Octos Learn `docs/SUBJECT_EXPANSION_PLAN.md` §5.2 and §9). The owner authorized the Jev calls on 2026-11-10.

## Method

- **Cases:** `eval/subject-routing-heldout.json` has 46 requests that were not used to tune the thresholds. The run also rechecked FU-04 and FU-05 from the tuning set, the two follow-ups that passed the admission gate in P0 only through its pass-through rule.
- **Question and selection:** the runner, `scripts/eval-subject-routing.mjs`, asks Jev exactly what Octos Learn asks. It uses `subjectQuestion` from OLL `plugin-subjects` (`bd031be`): the five subject lines plus `none` and `unclear`, with the same state fields (`current_lesson` for follow-ups). It applies the same selection (`selectSubjectPlugins`, T1 0.6 / T2 0.05).
- **Images:** the four camera and selection cases were sent with their image rendered to a PNG as a Jev image asset.
- **Route:** the owner's Jev key and model (`jev-latest`), read from the `yy` profile inside the runner process. No key fragment appears in the result.
- **Raw result:** `eval/subject-routing-heldout-result-2026-11-11.json`.

## Result

| Category | Correct |
|---|---|
| math, physics, chemistry, biology | 21 / 21 |
| earth_space (new in P2) | 6 / 6 |
| no subject (Jev answers `none`) | 4 / 4 |
| ambiguous (`unclear`, or a clear subject) | 3 / 3 |
| follow-ups, including FU-04 and FU-05 | 6 / 6 |
| camera and selection images | 4 / 4 |
| mixed subjects | 3 / 4 |
| **Total** | **47 / 48** |

Jev latency p50 was 208 ms. There were no errors and no broad fallbacks.

**The miss (HO-MX-03):** "Why does ice float, and what does that mean for fish in a frozen lake?" expects chemistry and biology, with physics acceptable. Jev gave physics 0.63, chemistry 0.22 and biology 0.10. The rule selects at most two subjects, so biology was left out. That is the two-plugin design limit, not a threshold error. With scoped requests deferred it has no effect, and in a scoped request the §5.4 reroute would recover it.

## Thresholds

- **T1 0.6 holds.** The lowest winning probability among selected subjects was 0.63 (HO-MX-03). The others were 0.77 or higher, most of them about 1.0.
- **T2 0.05 holds.** Every selected second subject had at least 0.11, and every second subject left out had 0.01 or less.
- **FU-04 and FU-05:** Jev now routes both confidently with the plugin-based question and `current_lesson`. FU-04 got chemistry 0.86 plus physics 0.13; FU-05 got biology 0.99.

T1 0.6 / T2 0.05 are confirmed on held-out requests.
