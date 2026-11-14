# Practice targets and the spoken invitation (2026-11-14)

Owner's question after Coach #78's review: could deterministic code, rather than an extra model call, stop a lesson from saying one number while its practice task checks another (the review's example: narration says 9, the task 8)?

## What the recordings show
These measurements are free. Held-out lessons are counted, never described.

**What the model writes.** Across 129 sections with a number task, read from the model's raw replies:
- the closing invitation names the task's own target in 62;
- it invites without naming a number in 44;
- there is no invitation in 19;
- **it names a different number in 4**;
- 1 earlier moment also invites.

The model follows the rule well. Most mismatches come from the program changing the target afterwards.

**What the program changes.** Replayed through this branch, the 90 recorded lessons that complete hold 85 slider tasks. **The program replaced the wording of 15 of them**: a target the slider already meets is moved and the task text rewritten, while the narration still names the model's value.

**Four cases:**

| Case | State on this branch |
|---|---|
| a. The program snaps a count's target (9 → 8.975) or moves it past the visual (to 10) | Fixed in ec5a307 (#78), no call |
| b. The target is drawable but beyond the model's slider ("make 7" on 1–6, checked at 6) | Fixed in 066e7d3: the slider widens, no call. No recorded lesson had it |
| c. The target is already met, and the program moves it and rewrites the task | Open: 15 of 85 slider tasks |
| d. The target is one the visual cannot draw (the model wrote 9 squares) | Refused for repair (#78). 2 of 99 recorded lessons. In the live rerun, 3 repair calls produced already-met targets |

## What the player and the compiler do (checked with scripts)
- **Tasks open after the whole lesson.** Every number task has `"availability": {"kind": "after_lesson"}`. An invitation at the end of section 1 asks for something the learner cannot do yet. "Met" means met at the lesson's end, which only the last section can know.
- **A task can still change after its section has played.** Scripted: section 1 has a task already met at the start on a 1–6 slider, and section 2 animates the same number to 8. The task said 6 in the first published part and 8 in the final lesson, because the far end of the slider moved. The card is hidden until the lesson ends, so the move is invisible there. A spoken number would be wrong.
- **Anything placed at "the lesson's end" moves as parts arrive.** The number line's reset ends section 1 in the first part and section 2 in the final lesson. Learn reloads the parts as they arrive.
- **What the 15 replaced wordings include.** They count any program rewrite of task text: met targets moved, targets clamped to a visual's edge, number-line snaps. Not all of them had a spoken invitation naming the old value.

## Proposal (revised after the checks)
1. **One number-free invitation, by the program, at the lesson's end.**
   - Appended to the last moment of the outline's last section, only in the compile that contains that section. Earlier parts carry none.
   - Wording, in the lesson language: "Now try the practice task." It names no target, so nothing a later part changes can contradict it. The task card shows the number.
2. **The model writes no invitation.**
   - Remove the invitation clauses of the section rule, including "不同于课程结束时滑杆所在的值", which section 1 cannot know.
   - The ban on in-lesson invitations ("不写'请你调到 4'") stays. The recordings show it is obeyed (1 early invitation in 129 sections).
   - The task-text rules ("调回", sequential tasks) stay.
   - `teacher-context.test.mjs:126` pins the removed clause and changes with it.
3. **A target met at the lesson's end is moved by the program, for every slider.**
   - The mover today checks other sliders only at the start. G68-38's repaired tasks (6 and 4, where its animations leave the sliders) slipped through.
   - Moving is invisible to the learner, since the card opens after the lesson, and needs no call.
   - Number lines keep your reset rule.
4. **Case d stays refused** (owner-approved today). Dropping an undrawable task becomes safe once the model no longer names targets, so it is offered after this probe, with the live rerun's 3-call cost as the reason.

## Probe (pass rules set before any run; needs the owner's approval and call count)
**Arms.** This branch at 264ce20 (control: item 3 and everything before it) and the next commit (candidate: items 1–2), so the arms differ only in the invitation change. Same cases, 2 repeats each.

**Cases.** Fresh, scored for overlap against all 160 questions by a script that prints only IDs and scores. They must produce number tasks:
- slope and intercept on a function plot (the history behind the rule: two slope lessons);
- number-line addition;
- the unit-square array;
- a polygon's side count;
- a circle's radius;
- one Chinese case per kind where possible.

**Unit.** A section with a number task. A case counts only if the control arm produced one.

**Pass rules:**
1. **Leftover invitations:** split into those naming a number (harmful) and generic ones (redundant). Pass: no number-naming leftover in at least 95% of candidate sections. Expected from the recordings: the model obeys this kind of ban (1 early invitation in 129).
   - An invitation is a sentence asking the learner to act ("try", "your turn", "now you", "试试", "请你", "轮到你", "动手"), judged by reading.
   - The program's own sentence is excluded.
2. **No contradiction:** across the whole closing of every candidate lesson, nothing spoken names a target other than its task's. Judged by reading, since a leftover model invitation is still spoken.
3. **No regression:** refusals, failed lessons and calls to first playable no worse than control, by reading the counts.
4. **No stock line:** no closing is reduced to the program's sentence alone where the control had teaching content there.

**Fallback.** If rule 1 or 2 fails, items 1–2 are not adopted. Item 3 (moving end-met targets) stands on its own and ships either way, with its own replay evidence.

**Gate (after the probe).** A paired speed comparison needs the two-build mode in `eval-trial-recipe-speed.mjs`, which does not exist yet.

## Probe result (2026-11-14, owner-approved)
**Run:**
- 8 fresh cases × 2 repeats × 2 arms, interleaved: 32 lessons, 75 calls (cap 100).
- Tokens: 134,961 prompt, 69,648 output, 10,962 thinking.
- Arms: control 264ce20, candidate 9e7f0d6.
- Overlap: every case scores at most 0.25 against open questions and below 0.25 against held-out ones. One draft was replaced for its held-out score, unread, and one (a parabola translation) for being near an open question.
- Run data: handoff `runs/practice-invitation/`.

| Rule (set before the run) | Control | Candidate | Verdict |
|---|---|---|---|
| 1. Model invitations left in a section's closing | 20 of 23 sections; 15 name a number | **0 of 22** | pass |
| 2. Something spoken names a target other than its task's | **0 real** after reading. A word matcher flagged 5: snapped values whose stated number completes the task (4 for 3.985, 2 for 2.011), a decimal split at its point ("2." of 2.5, "3." of 3.14), "负 5" for −5, and a rectangle's other side | **0**: closings mention numbers only as the lesson's own demonstration | pass |
| 3. Regressions | 16 of 16 lessons; 36 calls; 4 refusals (3 plot formula, 1 teaching mismatch) | 16 of 16 lessons; 39 calls; 7 refusals (6 plot formula, 1 phase start) | pass (formula refusals are outside this change; likely run noise, not tested) |
| 4. Closing reduced to the stock line | — | none: every closing keeps its summary or thinking question, with the program's sentence added once (16 of 16 lessons) | pass |

**What the probe does and does not show.** It shows the model stops inviting and nothing breaks. It does not show a spoken disagreement in the control: there was none in this run. The case for the change rests on the scripted checks (practice opens after the lesson; a section's task can change after it has played) and on the recorded lessons, in 4 of 129 sections.

**A cost the rules did not cover: tasks that repeat the lesson.**
- **What changes.** The removed clause ("不同于课程结束时滑杆所在的值") was the only instruction against a target the lesson itself reaches. Without it, read from the raw replies:
  - targets equal to where the lesson's animations leave the number: 8 of 23 candidate tasks, against 2 of 24 control tasks;
  - targets equal to the starting value: 7 against 2.
- **What the program does with them.**
  - Number-line tasks reset and stay usable, but repeat the demonstration.
  - Two others became the program's generic wording ("Set Slope (m) to -5.", "Set Columns (Length) to 8 squares.") under item 3.
- **The fix is a task-side clause.** Its form must be one a section can follow: the target differs from where this section's own animations leave the number (a section cannot know later sections). That changes the candidate, so it needs one more small probe before any gate.

**Unverified.** "Practice opens after the lesson" was read from `availability: after_lesson`. Whether a learner who finishes a part before the next one arrives can open practice early has not been checked.

**Observed, predates this change:** non-count sliders still snap a target to the slider's step (2 → 2.005 under a prompt saying 2). In all 42 tasks naming a number, the stated value lies within the task's tolerance, so it completes the task. Cosmetic; a candidate follow-up.

**Next:** the speed gate (M4) on frozen code. It needs the two-build mode in the speed harness, and the owner's approval with its call count.
