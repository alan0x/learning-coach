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
- **Refused, with the reason:** a pile outside the starting limits, over 999 or under 10 (no ten to make); a practice pile with the lesson's number or another number of places; hundreds in a tens-and-ones practice; a second, different mat (at its own section); lesson numbers.
- **The program draws** the mat (two columns, or three when the pile has hundreds or makes 100 or more), in Chinese for a Chinese lesson.
- **The program demonstrates,** after the moment that draws the mat, in its own sentences per language: for each place below the highest that holds ten or more, ten taps into the tray and the make; each remaining trade of that place fills the tray in one brief animation and makes (the amount on the mat stays true throughout; 50 ones take about 28 s in Learn, against nearly a minute tap by tap).
- **The program writes the practice:** "I'm done" on the practice pile, the number, the counts row and the parts row. The model's questions and thinking questions on the mat are dropped and recorded (`activity_removed`); a one-section lesson makes no separate practice request.
- **Request cost** with the trial on (first request): prompt 279 B, schema 382 B, 661 B in all. Requests and recorded lessons are unchanged with it off.
- `test/base-ten-recipe.test.mjs`: every development case's ideal output compiles and passes the judge in English and Chinese; the demonstration's sentences and actions; the practice; dropping; refusals; a stubbed generation run.

## Rebuilt on lesson numbers (2026-11-23; replaces "Step 3" above)

Probe 1 failed two of its four bars (`docs/BASE_TEN_PROBE_2026-11-22.md`). Two failures came from where the recipe left the pattern of every earlier component: a demonstration timed by the program, practice written by the program, and six number fields of its own. The owner asked for the mat to follow the earlier pattern (2026-11-23).

- **The pile is lesson numbers:** the loose ones, the tens, and the hundreds when the question has them. The model declares them in the outline as it does for every other component. The mat has no field for the model to fill.
- **The model writes the trades in its own moments:** "animate the ones from 26 to 6". The mat plays that as trades by the card's rules: the first trade of a place tap by tap, later ones as a brief tray fill and a make. The tens follow by themselves. The amount on the mat is true at every instant.
  - Several animations of the mat in one moment are one step, applied lowest place first, whatever order they were written in.
  - A change the mat cannot make is refused with the reason ("the loose ones go down by tens: from 26 they can be 16 or 6"), and the section is asked again.
  - A pile of tens and ones that makes a hundred gets a hundreds column of the mat's own.
- **The model writes the practice.**
  - "Bring the ones to 6" becomes the learner's own trading: the mat starts again from the lesson's pile, the learner taps and says "I'm done", and the program checks that no trade is left. The program refuses a target that is not the fully traded count. On a pile with nothing to trade, the task is dropped and recorded.
  - Typed questions are the model's, as for the number line.
- **Chosen by the feature `trade_ten_for_one`** (was `place_value_trading`: both comparison questions of probe 1 asked for that and got the mat).
- **Removed:** the program's beats and tasks, "the visual owns its practice", the six fields, the practice-pile rules.
- **In the request with the trial on:** about 460 bytes (guidance 408, number names 32, feature 21), against 661. With the trial off, requests and recorded lessons are unchanged.
- **How it is built:** a recipe hook, `number_moves`, gives the state of a card whose numbers change only by its own rules, and the state after a move. The compiler, the later sections' number facts and the judge use the same rules (`src/plugins/base-ten-moves.ts`). The compiled visual's `mover` plays the steps and makes the task.
- **The judge:**
  - **Kept:** one mat; the lesson pile is the question's; every step keeps the amount; the lesson ends with no trade left; the learner's task starts from the lesson's pile; a typed question follows; the mat speaks the lesson's language.
  - **Dropped:** a separate practice pile and the wording checks on prompts.
- **Paper test before the build:** on the 26 lessons of probe 1 that drew the mat, every trade the model narrated fits the rule (28 of ones, 6 of tens). In 3 lessons the model only said a trade "can" be made. Record: handoff `COMPONENT-INTERFACE-2026-11-23.md` §8.
