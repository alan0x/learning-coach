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
