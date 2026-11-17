# 3D solids judge (2026-11-17)

OLL decision 0019 §5 step 2, math plan 3.7: the judge and its cases come before the `solid_3d` recipe. Nothing here changes a request or a lesson.

## Judge: `scripts/solids-judge.mjs`
- **Reads lessons through OLL.** Each lesson is normalized, and every scene3d node is read from the reduced board.
- **Recognises solids by geometry, never by name.** Objects that touch form one solid (a composite's parts), and solids are ordered left to right. A box matches in any orientation.
- **Recomputes measures without the plugin's formulas:**
  - polyhedra: volume by the divergence theorem over their faces, and surface area as the sum of face areas;
  - round solids: their own formulas.
- **Expected values,** written into each case before any run:
  - each solid's kind and sizes, including a regular base given by its edge;
  - the measures its line must show;
  - the slider the lesson must offer: a cut that moves through ≥ 90% of the height, or a net that opens flat;
  - what must not appear (`forbid`).
- **Checks needing no expectation,** on every scene:
  - the lesson normalizes;
  - every measure the line shows belongs to the drawn solid, so a wrong volume fails even when no case asks for one;
  - two solids get a line each;
  - no objects overlap;
  - a cutting plane stays within the solids;
  - a net opens flat.
- **Narration is not judged.** It is read by hand under the probe's pass rules.
- Usage: `node scripts/solids-judge.mjs testsuite/solids-judge-cases.json <run dir>`.

## Cases: `testsuite/solids-judge-cases.json`
- 22 cases written for the judge, none taken from the question set.
- **Overlap:** scored with `scripts/case-overlap.mjs` (Jaccard over content words and Chinese bigrams; it prints only IDs and scores).
  - Every case scores at most 0.20 against open questions and 0.15 against held-out ones.
  - Seven drafts over those bars were rephrased before any expectation was written: SD-01, 05, 07, 09, 12, N1, N5.
- **Also found:** this tokenizer scores PJ-07 at 1.00 against an open question. That is worth a look before the plot cases are reused for tuning.

| Cases | What they cover |
|---|---|
| SD-01, 09 | Box: volume and surface area; a cube's net |
| SD-02, 04, 10, 13, 15 | Cylinder, sphere, cone (Chinese), frustum, hemisphere: values in π |
| SD-03, 12 | Two solids side by side: a cone and a cylinder of the same base and height; a cube and a ball given by its diameter |
| SD-05, 11 | Face, edge and vertex counts (any size), one in Chinese |
| SD-06, 14 | A regular base given by its edge (square pyramid with net; hexagonal prism), so an edge written as the circumradius fails |
| SD-07 | The L shape: two boxes joined; two separate boxes fail |
| SD-08 | A horizontal cut moving bottom to top |
| SD-N1–N6 | Near misses: plane figures, torus, pouring, unit cubes, a slanted cut (a horizontal cut is forbidden), an open-top box (the whole surface area is forbidden) |
| SD-C1 | Control: a plain cylinder |

## Counterexamples: `test/solids-judge.test.mjs`
- Every case is met by a hand-written scene laid out the way OLL's `buildSolid` lays one out.
- Each check fails one mutation for its own reason, and the test asserts the miss message:
  - a wrong value on the line;
  - a wrong box, or a cone in place of a cylinder;
  - a missing measure;
  - one line for two solids;
  - overlapping solids;
  - a diameter written as the radius;
  - wrong counts;
  - an edge written as the circumradius;
  - no net, or a net that never opens flat;
  - an L shape whose boxes do not touch;
  - a cut slider that is too short, or one that reaches past the solid;
  - a forbidden cut or surface area;
  - no scene at all.

## Known risk for the recipe
- The program's surface area is the whole surface. Questions about lateral area, an open box, or a dome's curved area alone would get a misleading line.
- The card must say "whole surface", and SD-N6 checks the open-box case.
- Lateral area could be a later `show` option. It is not part of 0019.
