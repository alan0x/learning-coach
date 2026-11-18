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
