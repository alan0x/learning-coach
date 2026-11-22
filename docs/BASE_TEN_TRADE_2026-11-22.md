# Trading tens and ones in Coach: judge and cases (OLL decision 0023, step 2)

The plan's order is judge before recipe. This step adds the trading mat's blueprint, its development cases and its judge. The recipe comes next, in its own PR.

## Blueprint (`testsuite/base-ten-blueprint.json`)
- Five rows from the standards, each with a teacher picture written without reference to any card:
  - T1: ten ones make a ten (1.NBT.B.2.a);
  - T2: decades (1.NBT.B.2.c);
  - T3: a collection counted by bundling, up to 120 (1.NBT.A.1);
  - T4: hundreds, tens and ones, including 100 as ten tens and a place with zero (2.NBT.A.1.a–b);
  - T5: expanded form (2.NBT.A.3).
- English only: the mat's own words are English.

## Development cases (`testsuite/base-ten-dev-cases.json`)
- 20 cases:
  - 16 that should use the mat, each with the pile the question states (`expect.lesson_pile`, hundreds, tens, loose ones);
  - 4 near misses that should not use it (comparing, adding with regrouping, ten more, rounding).
- They are written from the blueprint, never from the question set.
- All are under the case-overlap bars (open 0.20, held-out 0.15). Eleven first came out over and were reworded with more context of their own; the check prints only IDs and scores.
- Used for design and tuning. The scoring set will be written separately by a fresh agent from the blueprint alone, and sealed.

## Judge (`scripts/base-ten-judge.mjs`)
The judge reads the lesson through OLL (normalize and reduce), so the demonstration's taps are applied by the card's own rules. It checks:
- one mat;
- the lesson pile is the question's;
- the columns fit the pile;
- the demonstration trades when needed, ends with no trade left, and keeps the value;
- a card task with a practice pile that is a starting pile, differs from the lesson's, and has as many places;
- the number, the counts row and the parts row answer the practice pile;
- the parts row asks what each place is *worth* (first-use test in Learn);
- no label shows a number;
- every question sits by the mat;
- near misses have no mat.

Narration is read by hand under the probe's pass rules.

`test/base-ten-judge.test.mjs` checks that a good lesson passes and that each kind of break is caught.

`node scripts/base-ten-judge.mjs testsuite/base-ten-dev-cases.json <run-directory>` judges a run's lessons.
