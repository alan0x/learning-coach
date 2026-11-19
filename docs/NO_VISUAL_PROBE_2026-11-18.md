# "No visual" probe: design and pass bar (2026-11-18)

Math expressiveness plan §7 3.6, "the outline's substitution rule", and the work stack's L4 main-track item 3. This record is written **before any run**, under the plan's §5 rule (owner, 2026-11-18): the cases, arms, repeats and pass bar are fixed here, the result is judged only against them, and the bar is not changed after the run. A near pass is a miss.

## Why
- The 2026-11-14 baseline (Coach #77) found 13 of 58 lessons misleading, all on questions no component fits. #78 has since removed 4 of the 13 causes (the clamp and the shared number).
- Every recorded lesson draws something. `course_visuals` may legally be empty, but no outline prompt says so, and the substitution rule invites a stand-in ("换成可实现的画面").
- #79's card limits did not help: 3 of 13 against 1 of 13, one run per case. Its record proposed this change next.

## The change (branch `feat/no-visual-rule`, build commit 75dcd4b)
Two outline rules change. They reach every first request and every fallback outline.

| | Before | After |
|---|---|---|
| course_visuals | 只列必要画面； | 只列必要画面；没有画面能展示所讲关系时不列（可为空），用公式、笔记和讲解讲清，不用其他画面代替； |
| request_coverage | …但数学内容能用已有画面讲对时，写 teach 并换成可实现的画面，在第一节旁白里用一句话说明换成了什么；只有数学内容本身无法正确呈现时才写 unsupported、空章节及原因，禁止错误替代。 | …但已有画面能展示同一数学关系时，写 teach 并换成它，在第一节旁白里用一句话说明换成了什么；没有这样的画面时仍写 teach，不建画面；只有数学内容本身无法正确呈现时才写 unsupported、空章节及原因。 |

- **Where the rule sits.** The "no visual" rule is part of picture selection, so it applies whether or not the learner asked for a picture. The substitution rule now allows a swap only for a picture of the same relationship.
- **Wording.** It names no concept, recipe or probe case.

**Riding along: 4a** (plan 3.4). Two repair messages said "the published graph". They now say "a visual already shown", which fits any recipe declaring `ranges_fixed_once_shown` (today only the function plot). Only repair requests after that refusal change.

**Offline checks (free):**
- **Size:** +144 B on every first request and fallback outline, on every route. No other path changes. Every ceiling holds, and none is raised.
- **Tests:** 592 of 592 pass.
- **Recorded requests:** all 2,000 request digests change, and all 2,000 produced lessons are byte-identical.
- **Replays:** the 139 recorded lessons replay identically on both builds.
- **A lesson with no visual works end to end.** No recorded lesson has one, so two recorded flowchart lessons (#79's control arm) were replayed with every picture removed: empty `course_visuals`, and no `visual_creates`, animations or points.
  - Both compile (2 of 2, no refusal).
  - One played to the end in the OLL web runtime with no error.
  - The harness classifiers return `drawn: []` and `recipes: []` for it.
- **Harness (evaluation only):** a row now counts provider transport failures (`provider_failures`), so the driver can tell them from lessons the build lost.

## Cases: `testsuite/no-visual-probe-cases.json` (30 new cases)
All 30 cases were written for this probe. None is a #79 PA case, and none is drawn from the question set.
- **Overlap:** checked with `scripts/case-overlap.mjs` at its bars: 0.20 against open questions, 0.15 against held-out ones.
  - Ten drafts were over a bar and were replaced.
  - Six of those were over on held-out scores and were replaced without reading those questions.
  - Final maxima: 0.20 open, 0.13 held-out.
- **Builder check:** each fit case was checked against what its recipe builds. NV-26's first request on the control build offers `solids`. NV-27 uses a construction the rearrangement builds (`right_triangle_square`).
- **Languages:** 5 of the 30 cases are in Chinese.

| Class | Cases | What is expected |
|---|---|---|
| **No fit** (16) | NV-01–16 | No recipe shows the concept. Each case is a concept from an M1 "new" or "extend" candidate where an existing recipe is tempting, for example:<br>• a number line for a line plot<br>• the array for base-ten blocks or a dice grid<br>• the arc for a spinner or clock<br>• the plot for a scatter or reflection<br>• the inscribed polygon for symmetry<br>Half the cases name a picture; half do not ask for one (NV-05, 07, 08, 09, 10, 12, 15, 16). |
| **Stand-in** (4) | NV-17–20 | A recipe shows the same relationship only with a change: a side above 8, or bars or counters asked for when only a number line or array exists. |
| **Fit** (10) | NV-21–30 | A recipe fits, worded so the picture is easy to lose (word problems, "why" questions, two cases in Chinese). The expected recipe's family is in the cases file. Families: the number line family (`number_line`, `_steps`, `_compare`, `_solution`, `_rounding`), `function_plot`, `solid_3d`, `geometric_rearrangement`, `rectangle_unit_square_array`, `unit_circle_projection`, `circle_and_arc`. |

## Arms, repeats, order
- **Control:** main at d10d950, frozen in `handoff-math-expressiveness/builds/nv-ctrl-d10d950`.
  - `lesson-plan.js` sha256 04fde995…
  - `main` sha256 ce1e0d98…
- **Candidate:** 75dcd4b, frozen in `builds/nv-cand-75dcd4b`.
  - `lesson-plan.js` sha256 8c811da4…
  - `main` is the same file as the control's.
- **Repeats:** 2 per arm per case, so 120 lessons.
  - Two runs of one case are not independent, so the tests below are by case.
  - More cases buy more power than more repeats.
- **Order** (`handoff-math-expressiveness/tools/nv-probe-driver.mjs`):
  - Cases run in a fixed shuffled order (seed 20261118).
  - For each case and repeat, the two arms run back to back, and which arm goes first alternates.
  - Each arm and repeat has its own harness `--out` (`ctrl-r1`, `cand-r1`, …), so the run can be resumed.
  - Every lesson runs whole through `scripts/eval-math-expressiveness.mjs`, as Octos starts it.
- **Route:** google / gemini-3.6-flash.

**Incomplete runs:**
- **Provider failures.** A lesson that ends without a lesson and logged a provider transport failure is run once more. A second failure leaves it missing.
- **Missing lessons.** A case missing any of its four lessons, for any reason (provider or the call cap), is dropped from every test and listed.
- **Too many dropped.** If more than 3 cases are dropped, there is no verdict, and the owner is told.
- **Lost lessons.** A lesson that ends "failed" or "no lesson" with no provider failure is a lost lesson. It counts against its arm.

## Reading (blind)
- **The run is silent.** The driver sends everything the harness prints to `run.log` and shows only a count of lessons and calls. Until every verdict is written, I don't open `run.log`, any `report.json`, the 4a replay or the #121 census.
- **Packets.** `tools/nv-blind.py` gives every lesson a random code and writes one packet per code. A packet holds the question, its class, the outline's features, what was drawn, and every beat's speech and actions. It never holds the arm, the repeat or the build.
- **Verdicts first.** The key goes to a sealed file. Every verdict is written to `verdicts.json` before the key is opened.
- **Blinding is partial.** A lesson with no visual hints at the candidate, though the control may produce one too.
- **Rubric:** #77's categories, fixed: helpful, text_flowchart, none, failed, irrelevant, misleading.
- **One rule for stand-ins**, the same in every class. A picture that is not the representation the question asks for or implies is **misleading** when any of these holds:
  - its numbers differ from the question's and the narration does not say so (an 8-by-5 grid for 12 by 5);
  - it shows a different relationship (a ratio drawn as an area);
  - the narration says something is on the screen that is not: an object, a part, a count or a motion (slices, rods, bars, a clock face, points not drawn).

  Otherwise it is **helpful**, or **irrelevant** if it is beside the question. That covers a different representation with the question's own numbers, described as what it is, such as a number line called a number line. Using drawn marks as tokens, said aloud ("each square is one apple"), is not a claim about a missing object.
- **Fit class: kept or lost.** It is judged by reading the lesson, with the drawn kind as a check (the harness's `recipes` field does not know `solid_3d`).
  - **Kept:** the expected family is drawn.
  - **Lost:** no visual, a flowchart only, another recipe, or no lesson.
- **Held-out questions:** none is read or quoted.

## Pass bar (fixed before the run)
All three tests use the exact one-sided sign-flip test over cases. Each case gives one difference, d, and p is the share of the 2^n sign patterns of the non-zero d's whose sum is at least the observed sum.

**1. Improve where nothing fits.** Over the 20 no-fit and stand-in cases:
- d = (misleading control lessons, 0–2) − (misleading candidate lessons, 0–2).
- **Passes when p ≤ 0.20.**
- The 0.20 is my choice, for a screen whose pass is checked again by the 60-question re-run (3.8).
- A pass can rest on little: three cases each one lesson better and none worse gives p = 0.125. Two cannot pass (p = 0.25).

**2. Must not lose pictures where one fits.** Over the 10 fit cases:
- d = (candidate lessons lost or misleading) − (control lessons lost or misleading), each 0–4 per case.
- **Fails when p ≤ 0.10.**

**3. Must not lose lessons.** Over all 30 cases:
- d = (candidate lost lessons) − (control lost lessons).
- **Fails when p ≤ 0.10.**

**Verdict:**
- **Pass:** test 1 passes and neither 2 nor 3 fails. Next is the speed gate (L4 item 4), with its own call count for the owner.
- **Stop rule, test 1 fails:** the rule is dropped. This branch closes unmerged, 4a goes with the next request change, and the work goes to 3.8.
- **Test 2 or 3 fails:** the result goes to the owner. A revised wording is a new paid step, approved like any other.

**4a is separated.** After the verdicts, every lesson's recorded replies are replayed offline on the candidate build. The lessons where a reworded repair message fired are listed, and the verdict is also given without their cases. If removing them changes the verdict, that is reported.

### Power (simulated before the run: `handoff-math-expressiveness/tools/nv-power/`)
The model of the run:
- Each case has its own rate, drawn from a beta distribution with strong case-to-case spread.
- Misleads on no-fit cases average 0.2–0.4. The baseline's no-fit stratum was 8 of 20 before #78; #79's control arm was 1 of 6.
- Fit pictures are lost at 0.1–0.2. The baseline's near-miss stratum picked another recipe in 2 of 12.
- Lessons are lost at 0.07.

| Scenario | Whole bar passes |
|---|---|
| No real effect | 12–14% |
| The rule halves misleads and costs nothing | 68–69% |
| Halves misleads, but loses 20 more pictures per 100 fit lessons | 45% (test 2 catches it 39% of the time) |
| Halves misleads, but loses 30 more per 100 | 26–29% (caught 64%) |
| Halves misleads, but loses 10 more lessons per 100 | 28% (caught 62%) |

With no real loss, tests 2 and 3 fail by chance about 7% of the time. Simple count margins were tried first and dropped: "candidate ≤ control + 1" on each count failed by chance about half the time.

**What this means:**
- **The probe is a screen.** It finds a real halving about 7 times in 10.
- **It sees large losses only.** A small loss of pictures can pass, so 3.8's M2 reading is the real check on that side.
- **Three repeats** would raise test 1's chance to see a halving from about 7 to about 9 in 10 (simulated for test 1 only), for about 100 more calls. I don't recommend them.

## Riding along: the Coach #121 count (parked; owner, 2026-11-18)
After the verdicts, `tools/noop-census.mjs` lists every animation to the value its number already holds, in both arms.

**Reading rule** (fixed now; it reads the beat's speech and the one before it):
- **Replay:** the speech describes this number changing in this beat ("watch", "increase", "move", "as it goes from … to …").
- **Hold:** the speech treats the value as fixed ("when x = 3", "stays", "keep"), or is about something else.
- **Unclear:** anything else. It is listed, not counted.

**Decision rule for #121**, pooling the 6 lessons already read (5 replays, 1 hold):
- **Recommend merging** if replays are at least 3 times holds over at least 10 counted lessons.
- **Otherwise recommend closing** #121, with the structural re-ask left as the option.

**Expected yield:**
- In the recorded runs, 11 of 108 lessons with a slider repeat a change in the way #121 handles.
- This probe should have about 50–65 lessons with a slider: most fit lessons, and the no-fit lessons that draw a number line or array.
- So expect about 5–7 new lessons, 11–13 with the old ones.
- With fewer than 4 new lessons, #121 stays parked, and the owner is told.

## Reported, not judged
- the no-visual and flowchart rates per arm;
- calls per lesson, tokens and first-playable time (speed is judged by the gate, not here);
- which stand-ins were disclosed.

## Ask
- **Route and model:** google / gemini-3.6-flash.
- **Size:** 120 whole lessons.
- **Expected calls:** about 290. Recorded runs average 2.1–2.5 calls per lesson, rising to 4 when a refusal re-asks the outline.
- **Cap:** 340 calls, enforced by the driver.
