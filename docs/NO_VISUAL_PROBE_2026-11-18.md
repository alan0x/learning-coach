# "No visual" probe: design and pass bar (2026-11-18)

Math expressiveness plan §7 3.6, "the outline's substitution rule", and the work stack's L4 main-track item 3. This record is written **before any run**, under the plan's §5 rule (owner, 2026-11-18): the cases, arms, repeats and pass bar are fixed here, the result is judged only against them, and the bar is not changed after the run. A near pass is a miss.

## Why
- The 2026-11-14 baseline (Coach #77) found 13 of 58 lessons misleading, all on questions no component fits; #78 has since removed 4 of the 13 causes (the clamp and the shared number).
- Every recorded lesson draws something. `course_visuals` may legally be empty, but no outline prompt says so, and the substitution rule invites a stand-in ("换成可实现的画面").
- #79's card limits did not help (3 of 13 against 1 of 13 on one run per case). Its record proposed this change next.

## The change (branch `feat/no-visual-rule`, build commit afad00c)
The outline's two rules (they reach every first request and every fallback outline):

| | Before | After |
|---|---|---|
| course_visuals | 只列必要画面； | 只列必要画面，可为空； |
| request_coverage | 只是要求的互动或画面形式做不到（…），但数学内容能用已有画面讲对时，写 teach 并换成可实现的画面，在第一节旁白里用一句话说明换成了什么；只有数学内容本身无法正确呈现时才写 unsupported、空章节及原因，禁止错误替代。 | 只是要求的互动或画面形式做不到（…），但已有画面能展示同一数学关系时，写 teach 并换成它，在第一节旁白里用一句话说明换成了什么；没有画面能展示这一关系时仍写 teach，不建画面，用公式、笔记和讲解讲清，不用其他画面代替；只有数学内容本身无法正确呈现时才写 unsupported、空章节及原因。 |

The wording is general: it names no concept, recipe or probe case.

**Riding along: 4a** (plan 3.4). Two repair messages said "the published graph"; they now say "a visual already shown", which fits any recipe declaring `ranges_fixed_once_shown` (today only the function plot). Only repair requests after that refusal change.

**Offline checks (free):**
- **Size:** +108 B on every first request and fallback outline, on every route. No other path changes. Every ceiling holds; none is raised.
- **Tests:** 592 of 592 pass.
- **Requests and lessons:** all 2,000 recorded request digests change. All 2,000 produced lessons are byte-identical.
- **Replays:** the 139 recorded lessons replay identically on both builds.
- **A lesson with no visual works end to end.** No recorded lesson has one, so two recorded flowchart lessons (#79's control arm) were replayed with every picture removed: empty `course_visuals`, no `visual_creates`, animations or points. Both compile (2 of 2, no refusal). One played to the end in the OLL web runtime with no error, and the harness row is clean (`recipes: []`, `drawn: []`).

## Cases: `testsuite/no-visual-probe-cases.json` (30 new cases)
All cases were written for this probe, not reused from #79's PA cases, and not drawn from the question set.
- **Overlap:** `scripts/case-overlap.mjs` at its bars (0.20 against open questions, 0.15 against held-out ones).
  - Eight drafts were over a bar and were replaced, five of them on held-out scores, without reading those questions.
  - Final maxima: 0.20 open, 0.14 held-out.
- **Languages:** 5 of the 30 are in Chinese.

| Class | Cases | What is expected |
|---|---|---|
| **No fit** (16) | NV-01–16 | No recipe shows the concept. Each case is a concept from an M1 "new" or "extend" candidate where an existing recipe is tempting (a number line for a line plot, the array for base-ten blocks or a dice grid, the arc for a spinner or clock, the plot for a scatter or reflection, the inscribed polygon for symmetry). **Pass:** no visual, an accurate text flowchart, or an irrelevant but accurate picture. **Fail:** misleading under #77's rubric. |
| **Stand-in** (4) | NV-17–20 | A recipe shows the same relationship only with a change (a side above 8; bars or counters asked for, a number line or array available). **Pass:** the change is said aloud, or no visual, or a flowchart. **Fail:** an undisclosed stand-in (misleading). |
| **Fit** (10) | NV-21–30 | A recipe fits, worded so the picture is easy to lose (word problems, "why" questions, two in Chinese). **Kept:** the expected recipe's family is drawn. **Lost:** no visual, a flowchart only, another recipe, or no lesson. |

## Arms, repeats, order
- **Control:** main at d10d950, frozen in `handoff-math-expressiveness/builds/nv-ctrl-d10d950`.
  - `lesson-plan.js` sha256 04fde995…
  - `main` sha256 ce1e0d98…
- **Candidate:** afad00c, frozen in `builds/nv-cand-afad00c`.
  - `lesson-plan.js` sha256 7469c986…
  - `main` is identical to the control's.
- **Repeats:** 2 per arm per case, so 120 lessons.
  - More cases, not more repeats: two runs of one case are not independent.
- **Order** (`handoff-math-expressiveness/tools/nv-probe-driver.mjs`):
  - cases in a fixed shuffled order (seed 20261118);
  - for each case and repeat, the two arms run back to back, and which arm goes first alternates;
  - one harness `--out` per arm and repeat (`ctrl-r1`, `cand-r1`, …), so the run can be resumed;
  - the whole lesson goes through `scripts/eval-math-expressiveness.mjs`, as Octos starts it.
- **Route:** google / gemini-3.6-flash.

## Reading (blind)
- **Blinding:** `tools/nv-blind.py` gives every lesson a random code and writes one packet per code: the question, its class, the outline's features, what was drawn, and every beat's speech and actions. It never writes the arm, the repeat or the build. The key goes to a sealed file.
  - Every verdict is written to `verdicts.json` before the key is opened.
  - Blinding is partial: a lesson with no visual hints at the candidate, though the control may produce one too.
- **Rubric:** #77's, fixed: helpful, text_flowchart, none, failed, irrelevant, misleading.
  - An undisclosed stand-in is misleading.
  - Narration that names a picture which is not drawn is misleading.
  - For the fit class, kept or lost (above) is also recorded.
- **Held-out questions:** none is read or quoted.

## Pass bar (fixed before the run)
**Primary statistic: improve where nothing fits.** Over the 20 no-fit and stand-in cases:
- For each case, d = (misleading control lessons, 0–2) − (misleading candidate lessons, 0–2).
- Over the cases with d ≠ 0, the one-sided p-value is the exact sign-flip permutation p of Σd.
- **Improve:** p ≤ 0.20.

**Must not lose** (all three must hold; each is counted over the arm's 60 lessons or the stated class):
1. **Pictures where one fits:** lost fit-class lessons, candidate ≤ control + 1 (of 20 each).
2. **Lessons:** no lesson (failed, refused or clarify), candidate ≤ control + 1 (of 60 each).
3. **Misleads where one fits:** misleading fit-class lessons, candidate ≤ control + 1.

**Verdict:**
- **Pass:** the improve test and all three must-not-lose tests hold. Next: the speed gate (L4 item 4), with its own call count for the owner.
- **Stop rule, improve fails:** the rule is dropped (this branch is closed unmerged, 4a goes with the next request change) and the work goes to 3.8.
- **A must-not-lose test fails:** reported to the owner. A revised wording is a new paid step, approved like any other.

**4a is separated.** After the run, every lesson's recorded replies are replayed offline on the candidate build. The lessons where a reworded repair message fired are listed and reported apart, and the verdict is also given without them. If removing them changes the verdict, that is reported to the owner.

### Power (simulated before the run, `handoff-math-expressiveness/tools/nv-power.py`)
Assumptions:
- Each case has its own mislead rate, drawn from a beta distribution (strong case-to-case spread).
- The mean rate is 0.2–0.4 on main; the baseline's no-fit stratum was 8 of 20 before #78, and #79's control arm 1 of 6.

| | Mean rate 0.2 | 0.3 | 0.4 |
|---|---|---|---|
| False pass (no real effect) | 11% | 18% | 12% |
| Pass when the candidate halves misleads | 55% | 74% | 83% |

**What this means:**
- The probe is a screen, not proof: a pass is checked again by the 60-question re-run (3.8).
- The 0.20 threshold is deliberate. At 0.10, the chance to see a real halving falls to 38–54%, and the stop rule would then often drop a rule that works.
- Three repeats would raise that chance to 67–91% for about 100 more calls (owner's choice; not recommended).

## Riding along: the Coach #121 count (parked; owner, 2026-11-18)
After the run, `noop-census.mjs` lists every animation to the value its number already holds, in both arms.

**Reading rule** (fixed now; the beat's speech and the one before it):
- **Replay:** the speech describes this number changing in this beat ("watch", "increase", "move", "as it goes from … to …").
- **Hold:** the speech treats the value as fixed ("when x = 3", "stays", "keep"), or is about something else.
- **Unclear:** anything else. It is listed, not counted.

**Decision rule** for #121, pooling the 6 lessons already read (5 replays, 1 hold):
- **Recommend merging** if replays are at least 3 times holds over at least 10 counted lessons.
- **Otherwise recommend closing** #121, leaving the structural re-ask as the option.

**Expected yield:** about 8% of lessons (11 of 139 in the replays), so about 5–10 new lessons, mostly in the fit class. Fewer than 4 new lessons leaves #121 parked, and the owner is told.

## Reported, not judged
- the no-visual and flowchart rates per arm;
- calls per lesson, tokens and first-playable time (speed is judged by the gate, not here);
- which stand-ins were disclosed.

## Ask
- **Route and model:** google / gemini-3.6-flash.
- **Size:** 120 whole lessons. Expected about 290 calls: 2.1–2.5 per lesson in recorded runs, up to 4 when a refusal re-asks the outline.
- **Cap:** 340 calls, enforced by the driver.
