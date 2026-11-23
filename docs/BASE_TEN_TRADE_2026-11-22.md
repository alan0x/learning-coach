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

Added with the recipe (step 3): the mat speaks the lesson's language, and the rows' words are that language's (0023 amendment 3); no question's prompt or hint shows a number, because a locked question shows its prompt (Chinese first-use test); every demonstration step keeps the value, not only the end (two animated counts play one after the other and showed 37 for 67 in Learn's player).

## Step 3: the recipe (a trial, off by default)

Owner decisions (2026-11-22): the program speaks the trade steps; the first trade of each place tap by tap, the rest at once; the program writes the practice; one mat per lesson; English and Chinese.

- **The model writes** six whole numbers, ones first: `lesson_ones`, `lesson_tens`, `lesson_hundreds`, `practice_ones`, `practice_tens`, `practice_hundreds`. They are first in the first combined reply's schema, which requires no field (fraction probe 2: late fields were left out); a missing or bad number is refused and the section asked again with a schema that requires all six.
- **Refused, with the reason:** a pile outside the starting limits or over 999; a practice pile with the lesson's number or another number of places; hundreds in a tens-and-ones practice; a second, different mat; lesson numbers.
- **The program draws** the mat (two columns, or three when the pile has hundreds or makes 100 or more), in Chinese for a Chinese lesson.
- **The program demonstrates,** after the moment that draws the mat, in its own sentences per language: for each place below the highest that holds ten or more, ten taps into the tray and the make; each remaining trade of that place fills the tray in one brief animation and makes (the amount on the mat stays true throughout; 50 ones take about 28 s in Learn, against nearly a minute tap by tap).
- **The program writes the practice:** "I'm done" on the practice pile, the number, the counts row and the parts row. The model's questions and thinking questions on the mat are dropped and recorded (`activity_removed`); a one-section lesson makes no separate practice request.
- **Request cost** with the trial on (first request): prompt 279 B, schema 382 B, 661 B in all. Requests and recorded lessons are unchanged with it off.
- `test/base-ten-recipe.test.mjs`: every development case's ideal output compiles and passes the judge in English and Chinese; the demonstration's sentences and actions; the practice; dropping; refusals; a stubbed generation run.
