# 3D solids probe 1 (2026-11-17)

The `solid_3d` trial (decision 0019 §5 step 4) was run on the solids judge's 22 cases, quality only. The owner approved it with a cap of 112 calls. **75 calls were used**, with about 84 k prompt tokens. The route was google / gemini-3.6-flash.

The run used `--pairs 0 --recipes solid_3d --quality-repeats 1 --lesson-calls 4` on the `feat/solid-3d` build at c76663e.

## Result: failed (6 of 16 in-scope and control cases passed)

| Cause | Cases | Owner |
|---|---|---|
| **Schema order.** The provider writes properties in schema order. Sizes ran length, width, height, radius…, so a cylinder or cone written radius-first had nowhere left for its height and put it in `side` (`{radius 4, top_radius 4, side 10}`). The stray-size refusal then failed every retry. | SD-02–06, 10, 13–15, C1 (and N3 on the candidate arm) | Program |
| **Routing.** The outline asked for `solid_3d` + `section_plane` (the teaching cube's features) and got a box for a cylinder. The card did not say that cuts of any solid go to `solids`. | SD-08 | Card |
| **No `show`.** The question asked for a measure and the model wrote no `show`. The card did not say when to write it. | SD-09, 11 | Card |
| Near miss: the whole surface area was shown for an open-top box. My byte trim had cut "whole surface" from the card. | SD-N6 | Card |

Passed: SD-01, 07 (the L shape), 12 (cube beside a ball given by its diameter), N1, N2, N4. SD-N5 drew a horizontal cut on both arms, so the trial is no worse than the baseline there (the teaching cube).

## Fixes (offline, free)
- **Size order:** `shape, radius, top_radius, length, width, sides, side, height`, with height last, so every shape can be written in order. A test pins this order.
- **Unused sizes that say nothing are dropped and logged:** a zero, `sides` on a round solid, and a cylinder's `top_radius` equal to its radius. A real stray (a cone's top radius of 3) and a size written in place of another (`side` as height) are still refused, never moved.
- **Card:** "立体都选solids（含截面展开），2个并排，join叠放或拼L；问体积/全表面积/面棱顶点写show". The trial request grows by +744 B (card +152, schema +592), 24 B over the ~720 B the owner approved.

568 tests pass, and all 139 recorded lessons replay identically. Probe 2 needs the owner's approval.

# Probe 2 (2026-11-17, owner-approved, cap 112)

The same cases and setup, on the build at 1a473c0. **58 calls**, with about 84 k prompt tokens.

## Result: 10 of 16 in-scope and control cases passed (up from 6)

The size-order fix worked: every round solid now has its height. The remaining misses were all choices the card left open:

| Cause | Cases |
|---|---|
| **Outline numbers.** The model declared outline numbers (a cut height from 0 to 6, a side length, radius and height sliders) and gave them to the solid, which takes none. All four attempts were refused. | SD-08, 09, 10*, 15 |
| **No surface area.** It was asked for and left out of `show` (the model wrote volume only, or no `show` at all). | SD-01, 06, 10 |
| **`join: "side"` read as "side by side".** Two separate solids were asked to join. Each recovered on the retry, at the cost of one call. | SD-03, 12, N1, N3 |
| Near miss: the whole surface area was shown for an open-top box. | SD-N6 |

\* SD-10 also lost its surface area.

No worse than the baseline: SD-N5 routed to the teaching cube on both arms and drew a horizontal cut there.

## Fixes (offline, free)
- `join` is `stack` or `l_shape`, and the refusal says that two separate solids need no join.
- `show` is required in the solid's schema, so the model decides it every time.
- **New card:** "立体都选solids（含截面展开），尺寸固定不建数；2个并排，join叠放或拼L；问到的体积/表面积/面棱顶点都写show，无盖不写表面积".
- The trial request grows by **+801 B** (card +206, schema +595).

568 tests pass, and all 139 recorded lessons replay identically. Probe 3 needs the owner's approval.

# Probe 3 (2026-11-17, owner-approved, cap 112)

The same cases, on the build at the judge-fix commit (OLL 5f11ddf; the stricter judge from the owner's review). **50 calls**, with about 85 k prompt tokens. **No errors and no refusals.**

## Result: 13 of 16 in-scope and control cases passed (6 → 10 → 13)

Every lesson was read by hand: caption, objects and narration.

| Case | Judge | Reading |
|---|---|---|
| SD-01, SD-10 | missing surface area | The first section teaches the volume only, and its narration says so. Later sections are not in the first part, so whether they show the area is unknown. **Not a mislead.** |
| SD-08 | wrong solid | The outline asked for `solid_3d` + `section_plane`, the teaching cube's features. It drew a 2×2×2 box while the narration described a cylinder of radius 2 and height 6. **Misleading**, though the baseline draws the same cube. |
| SD-06, SD-09 | pass | The narration says "let us unfold it". The net opens only when the learner drags (learner-only slider, v1), so the teacher promises motion they can't show. |
| All other in-scope cases | pass | The narration's numbers agree with the measures line (for example SD-12: 64 and 33.51; SD-15: 18π ≈ 56.55). |

Near misses, against the baseline:
- **N1** (cube and sphere), **N3** (cone and cylinder, pouring only narrated), **N4** (a 3×2×2 box with its volume, no cube grid) and **N2** (the torus routes to the implicit surface on both arms) are no worse than the baseline.
- **N5:** the candidate drew a cube with no cut, which is better than the baseline's forbidden horizontal cut.
- **N6, worse than the baseline.** The candidate drew an unfolding net of a box with a lid, while the narration says there are 5 faces and no lid. The baseline drew no 3D scene.

## Owner decisions this raises
1. **SD-08 routing.** The model still picks the teaching cube for cuts. Recommended: retire `cube_with_section` when `solid_3d` is switched on, since a box with a cut covers it. That removes the choice, and the switch-on gate measures it.
2. **N6, an open box.** Recommended: list it as a known near miss. An open-box option would be a new 0019 item.
3. **Promised motion (SD-06, SD-09).** Recommended: a later 0020-style field that lets the model animate the program's slider, with its own probe.

# Speed gate 1 (2026-11-18, owner-approved, cap 200)

The run used `--pairs 40 --recipes solid_3d --cases SD-08,SD-09,SD-N5 --lesson-calls 4` on the build at 1d9fbb9, where the trial retires `cube_with_section`. **106 calls.** No errors, and every lesson reached its first playable part.

| Requests | Pairs | Median paired difference | 95% CI | Prompt tokens (median) | Thinking turns, baseline / candidate |
|---|---|---|---|---|---|
| Fitting (SD-01–10) | 20 | **−1.71 s** | −4.8 to −0.5 s | +27 | 13 / 6 |
| Other (held-out routing) | 20 | **+1.20 s** | −1.0 to +3.0 s | +27 | 14 / 13 |

**The M4 rule fails on other requests** (+1.20 s, limit +0.5 s). The candidate added only 27 prompt tokens and no extra thinking turns. Per-request differences ranged from −6.0 s to +13.9 s, and one HO-CH-01 pair alone was +13.9 s. Earlier gates found that a change with no cost fails a 20-pair +0.5 s median about 1 time in 8.

Quality, read by hand:
- SD-08, SD-09 and SD-N5 passed the quality check.
- In the fitting pairs, SD-08 once drew a solid with no learner cut, and once drew no solid in its first section. SD-01, SD-09 and SD-10 taught volume first; later sections were not judged.

**Next (owner):** the one repeat the earlier gates allowed (run 9b), on the 20 other pairs only. That is about 50 calls, inside this gate's remaining 94.

# Speed gate 1b, the allowed repeat on other requests (2026-11-18, owner-approved)

20 other-request pairs, **49 calls**, no errors.

| Run | Pairs | Median paired difference | 95% CI |
|---|---|---|---|
| Gate 1, other | 20 | +1.20 s | −1.0 to +3.0 s |
| Gate 1b, other | 20 | +0.75 s | −1.2 to +3.3 s |
| Pooled | 40 | +1.18 s | — |

**FAILED after the allowed repeat, so `solid_3d` stays a trial** (the pre-set rule, as in run 9b).

**Signal from the recorded replies** (the first call's usage, medians):
- the candidate wrote about 40 more output tokens;
- it spent more thinking tokens: 515 against 476 in gate 1, and 788 against 605 in gate 1b;
- the number of thinking turns did not change (16 of 20 on both arms);
- the prompt grew by only +27 tokens.

As in runs 9 and 9b, the likely cause is the model thinking longer on requests the new card doesn't fit, not the request's size.

**Proposed next (owner):** a three-arm diagnostic on the 20 other requests, like run 10, at about 70 calls. The arms are the baseline, the trial with the cube retired, and the trial keeping the cube. It separates the cost of the new card from the cost of the changed catalog. Then a card rewrite, if the card is the cause, and a new gate.

# Speed gate 1c: first extension under the revised rule (2026-11-18, owner-approved)

20 other-request pairs on a frozen copy of the build whose request is byte-identical to gates 1 and 1b. **41 calls**, no errors.

Judged by `scripts/speed-gate.mjs`, pooling gates 1, 1b and 1c. The fitted rate is 5.40 ms per generated token plus 1.66 s (r² 0.69, 160 rows).

| Requests | Pairs | Median (tokens in seconds) | 95% interval | Verdict |
|---|---|---|---|---|
| Fitting | 20 | −2.14 s | −4.38 to −0.52 s | **pass** |
| Other | 60 | +0.27 s | −0.25 to +1.28 s | **extend** |

**Next (owner):** the last step, 20 more other pairs (about 45 calls), reaching the 80-pair cap where the median decides.

# Speed gate 1d: final extension (2026-11-18, owner-approved)

20 other-request pairs on the same frozen build as 1c. **50 calls.**
- One candidate request ended without a lesson: on that question the model chose a non-lesson reply, while the baseline taught it. An offline replay confirms this. It is a model choice, not a crash.
- That leaves 19 complete pairs.
- No other request used `solid_3d`. The run's "used trial recipe" count of 4 includes plot recipes.

Pooled 1 + 1b + 1c + 1d (`scripts/speed-gate.mjs`; rate 5.48 ms per generated token plus 1.63 s, r² 0.75, 199 rows):

| Requests | Pairs | Median (tokens in seconds) | 95% interval | Verdict |
|---|---|---|---|---|
| Fitting | 20 | −2.17 s | −4.44 to −0.53 s | **pass** |
| Other | 79 | +0.25 s | −0.70 to +1.26 s | **extend** (one pair short of the 80-pair cap) |

This run alone gave −2.10 s on other requests (interval −4.16 to +1.58 s).

**Next (owner):** the rule decides by the median at 80 pairs, and this run reached 79. One more other pair (2 to 8 calls) completes it. The rule is not changed to fit the result.
