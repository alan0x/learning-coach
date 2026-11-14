# M3 step 2: recipe limits on the cards, and narration against the picture (2026-11-14)

Math expressiveness plan §7 step 2, owner's order "M3 first" (2026-11-14). The M2/M3 baseline (Coach #77) found 13 of 58 lessons misleading. Coach #78 handles the clamp and shared-number causes (4). This step handles the other two:
- **Misused recipe (4):** a recipe drawn for a concept it cannot show.
- **Narration (5):** the narration describes parts the recipe does not draw.

Each part goes through plan §5: a probe of about $0.25 on cases written for it (never the question set), then one gate on frozen code. The pass rules below are written before any run.

## Part (a): limits on the cards

### The change (this branch, stacked on #78)
The limits follow the handoff's misuse categories and are checked against what each builder can draw (its `parts`, number policies and, for the plot, its expression grammar).

| Recipe | Added to the card | What the builder draws |
|---|---|---|
| `rectangle_unit_square_array` | `（各≤8）` … `；非计数、位值或比例图` | one rectangle of unit squares, columns × rows, each 1–8; the total is always the product |
| `function_plot` | `；不能分区间定义或画数据分布` | whole curves y = f(x), one formula each; the grammar has abs, floor, ceil and round but no conditions, so |x| draws and "x + 1 for x < 0, 2 otherwise" does not |
| `cube_with_section` | `；仅此一个正方体` | one cube, its parts and a horizontal section |
| `process_diagram` (shared) | `，只有文字框` | text boxes joined by arrows |

**Size.** +130 bytes on every outline-bearing request. The fallback outline was 158 bytes under its ceiling; it is now 28 bytes under on every route, so **no ceiling is raised**. First requests stay about 7.4 KB under theirs. Plugin budgets: math 5,602 → 5,714 of 9,900; shared 265 → 283 of 2,265.

**Speed risk.** The number-line gate traced a slowdown to more thinking, triggered by a "not for…" clause that contradicted another card. No card contradicts these clauses: none offers place value, ratios or distributions; the number line's "counting by fractions" is a different picture from the array; the implicit surface can draw other solids, but it is its own recipe, and the cube clause speaks only of the cube recipe. The gate below measures it anyway.

**Effect offline.** Only requests change: all 2,000 recorded request digests change, all produced lessons are byte-identical (`eval/request-hashes.json` re-recorded). 443 tests pass. Replay of recorded replies is unaffected (cards only reach the model).

**Room left.** 28 bytes on the fallback outline is about 9 Chinese characters. Any further card text (more recipes' limits, new components) needs the fallback-outline ceilings raised, which S6 ties to a plan change and a live comparison. This is the binding constraint for the rest of step 2 and for new components.

### Probe (a): about 35 model calls, candidate build only
Cases written for this probe. Overlap with all 160 questions was scored by a script that prints only IDs and word-overlap scores (Jaccard on words and Chinese characters).
- **Rule for held-out questions:** any draft scoring 0.25 or more against a held-out question is replaced without reading that question. Three drafts were replaced this way.
- **Rule for open questions:** close matches were read. One draft (long division) was replaced as too near an open question.
- **Final scores:** every case scores at most 0.22 against held-out questions. Against open questions the maximum is 0.40, for PA-03, which shares only "f(x)" with a translation question; PA-04 is next at 0.25, sharing digits with a fraction comparison.

**Harness:** neither existing script takes ad hoc prompts. The sample script takes question-set IDs and the trial script takes built-in cases. The probe needs a small `--cases-file` option on the sample script, built and checked offline first.

Negative cases (no recipe can show the concept; PA-05 is a near miss to the cube):
- **PA-01** "Make a ten: show how 8 + 5 = 13 by moving 2 over to the 8."
- **PA-02** "The ratio of cats to dogs at a shelter is 4:3. If there are 12 cats, how many dogs are there?"
- **PA-03** "Graph f(x) = x + 1 for x < 0 and f(x) = 2 for x ≥ 0."
- **PA-04** "How do I find the standard deviation of 2, 4, 4, 4, 5, 5, 7, 9?"
- **PA-05** "Why does a soccer ball roll away but a box stays put?"
- **PA-06** "用点状图表示数据 2, 3, 3, 5, 5, 5 并找出众数。"

Positive controls (a recipe fits and must still be chosen):
- **PA-07** "A rug is 5 feet by 7 feet. How many square feet does it cover?" → `rectangle_unit_square_array`
- **PA-08** "Graph y = x² − 2x and find its vertex." → `function_plot`
- **PA-09** "一个正方体有几个面、几条棱、几个顶点？" → `cube_with_section`
- **PA-10** "Show 3 × 7 as rows and columns." → `rectangle_unit_square_array`

Cases for the other two clauses:
- **PA-11** "A garden is 10 m long and 3 m wide. What is its area?" and **PA-13** "一个长方形长 12 厘米、宽 5 厘米，面积是多少？" (`各≤8`): no outline offers the array with a side above 8, so #78's re-ask never fires. Model calls per lesson are recorded; avoiding that extra call is this clause's measurable benefit.
- **PA-12** "Walk me through finding the greatest common factor of 36 and 48." (`只有文字框`): if a process diagram is drawn, the narration does not say a factor tree, chart or figure is on the board.

**Probe reading (directional, not a gate):** every lesson is read in full against #77's rubric, which is fixed.
- **PA-01–06:** none is *misleading* through a misused recipe. A text flowchart, no visual, or an *irrelevant* picture passes for (a).
- **PA-07–10:** the expected recipe is chosen.
- **PA-11–13:** as stated above.
- **Narration (step 2b's rule):** recorded separately, and does not fail (a). Target, set before the run: no lesson of the 13 is misleading through narration (it claims something drawn that is not, or a control doing what it does not). Any such lesson is quoted in the report. A miss is recorded with the recipe and narration. If a negative case still misuses a recipe, the wording is revised once and probed once more before the gate.

### Gate (a), pass rules (set before the run)
- **Arms:** #78's build (baseline) against this branch (candidate). The two differ only in card text.
- **Speed (M4 rule):**
  - The cases are interleaved pairs on requests these four recipes fit and on requests they don't.
  - Each group passes if its paired median first-playable delta is at most +0.5 s.
  - Wall-clock time is noisy, so model calls per lesson are reported too.
- **Quality:** a second set of cases written for the gate, unseen by the probe: 8 negative and 6 positive.
  - Pass: no negative is *misleading* under #77's rubric through a misused recipe (0). Flowcharts, no visual and irrelevant pictures pass. Narration misleads are reported, not counted.
  - Pass: at least 5 of the 6 positives choose their recipe.
- **Harness:** `eval-trial-recipe-speed.mjs` compares a trial recipe on against off. A card change on recipes already on needs a two-build mode (`--baseline-build`), a small harness change made and tested offline before the gate.

## Part (b): narration only describes what is drawn (proposal, for the owner)

Not implemented. The owner asked for a check; this section explains why a check alone can't do the job and proposes what to do instead. The owner decides.

### What the open baseline cases did
- **Names objects not drawn:** a square and a sphere beside a lone cube; three charts "built" from a text flowchart.
- **States a frame the picture lacks:** "both start at zero" on a number line from 3 to 10 showing two points.
- **Claims a change that doesn't happen:** "move the crayon's start", then an animation to the value it already holds.

### Where the false claims are written
**Section 1 comes from the bootstrap request**, which sends the cards and no per-visual facts (`visuals_for_section` exists only in later-section requests). The cube and flowchart claims above are in section 1. For section 1, then, only the card or a check after generation can act. Part (a)'s `仅此一个正方体` and `只有文字框` are also section 1's narration rule.

### What a program can check
Spoken text is free text, in English and Chinese, and a matcher over it would be language-specific and refuse correct lessons. One structured signal does exist:
- **An animation to the value its number already holds.**
  - In the open recorded lessons (one-shot measurement, not tuned on): 14 of 57 animations are like this, in 10 lessons; 4 of those lessons are misleading and 6 helpful.
  - The tracker is approximate: it ignores restarts.
  - As a hard fault it would refuse helpful lessons, and each refusal costs a section repair, one extra model call.
  - Recommended as a **program fix, not a fault**: the compiler drops a no-op animation, or makes it animate from the starting value when the narration replays a change. Either way, no lesson says "watch it change" over a still picture.
  - This needs its own design: restart semantics first, then offline replay.

### How serious the errors are (open cases, read in full)
In all three, the spoken math is right. What is false is the claim about what is on the screen. All three are in K–5, and all three start in section 1, the first thing the learner sees.

| Case | What is drawn | What the narration says | Severity |
|---|---|---|---|
| K2-14, flat vs solid shapes | one cube with a horizontal section plane | "look at this square", "right next to it a cube", a circle and a sphere; the slider "adds thickness" and "turns a flat surface into a solid" | **High.** Three of the four named shapes are absent, and the slider is described as doing something it doesn't do (it moves a section plane). This teaches a wrong idea of the picture. |
| K2-21, comparing two lengths | two points on a number line from 3 to 10 | "both start together right at zero"; section 2 "moves the crayon's start" to show a misleading comparison, but its animation goes to the value already held | **High.** The lesson's key idea (line up the ends) is demonstrated over a picture that shows neither a zero nor a moved start. |
| G35-05, three data displays | a text flowchart of three steps | "now that we have built our tally chart, picture graph and bar graph", then compares how each looks | **Medium.** The comparison is correct in words, but the requested pictures never appear while the narration says they do. |

Two held-out lessons are also counted in this category. Under the held-out rule they are not described here.

### How much the request limits would grow (measured on a prototype)
The prototype adds the rule to the section and bootstrap prompts and a program-written `draws` line per visual. Sizes were measured with the payload fixtures against the 2a build:
- **Section rule:** 115 bytes.
- **`draws` line:** 35–68 bytes per visual in the section.
- **First request:** +145 bytes, about 7.2 KB under its ceiling. No raise needed.
- **Later section, first-section retry, section repair:** +162 bytes on the fixtures, **64 bytes over** the current ceilings, which are the P0 maxima.
  - The minimum raise is +64 bytes (0.8%).
  - A section with three visuals adds up to 319 bytes. Allowing for that means about **+250 bytes** on these three paths (about 3%; 8,505 → 8,755 on camera).
- **Fallback outline and practice:** no change.

Compared with what was tested live: first requests carried +8,368 bytes without a measured slowdown. Plan Q1 also found that what a card says moved speed more than its length. A +250-byte ceiling raise is small, but S6 still asks for a live comparison.

### What each part would fix
- **The three open cases are all in section 1**, which the bootstrap request writes. `draws` in later sections reaches none of them, and covers only K2-21's second half.
- **What reaches section 1:** the cards (part (a) already says "仅此一个正方体" and "只有文字框", which target K2-14 and G35-05) and the bootstrap rule (+145 bytes, no raise).
- **K2-21's "zero"** would need the drawn range in the request. The program chooses the range after generation, so the model can't know it from the card. This case is better caught by the no-op-animation check and by having the number line always show 0 when the lesson compares lengths, which is a builder question.

### Recommendation
1. **Adopt the bootstrap rule now**, with part (a). It reaches the section where every observed error was, and it goes through the same probe and gate as (a). **Accepted by the owner, 2026-11-14.**
   - **As built:** the full rule is in the bootstrap's first-section prompt, and a short form ("旁白只说画面确实画出的内容。") is in the section prompt, so a retried section 1 gets it too.
   - **Cost:** +159 bytes on the first request, about 7.2 KB under its ceiling. +45 bytes on later-section, first-section-retry and section-repair requests, which keep 53 bytes. **No ceiling is raised.**
   - **Offline:** all request digests change; every produced lesson is byte-identical. 443 tests pass.
2. **Later-section `draws` only if the gate shows narration errors in later sections.** That needs a +250-byte raise on three paths and a live comparison.
3. **No-op animations:** a compiler check. The prompt already says "目标已是当前值则无需动画", and the model broke it in 14 of 57 animations in the open recorded lessons.
4. **Rejected:** a model judge call per section. It adds one call per section to every lesson, a direct M4 cost.

## Status
- **(a) and the section-1 rule:** on `feat/recipe-card-limits`, stacked on #78, one commit each. The probe did not meet its rules, and the control arm on #78's build misled less (1 of 13 against 3 of 13). Recommendation: don't adopt (see the end of this document).

## Probe result (2026-11-14, owner-approved)
**Run:** the build at this branch's two commits (card limits plus the section-1 rule), google `gemini-3.6-flash`.
- 13 cases, 30 model calls (cap 45).
- Tokens: 53,537 prompt, 22,902 output, 7,366 thinking.
- Every lesson was read in full against #77's rubric. Run data is kept outside the repository (handoff `runs/m3-step2-probe/`).

| Case | Recipe drawn | Reading | Against the rule set before the run |
|---|---|---|---|
| PA-01 make a ten | number line | one jump 8 → 13; the 8 → 10 → 13 split is only in words | not misleading (minor) |
| PA-02 ratio 4:3 | **unit-square array** | 4 columns of "cats" by 3 rows of "dogs", scaled to 8 by 6, as the ratio | **misleading: misused recipe** |
| PA-03 piecewise | function plot chosen | the second formula `2` was refused ("must depend on x"); after three repairs, no lesson | no lesson (not misleading, but the card did not steer the choice) |
| PA-04 standard deviation | text flowchart | accurate | pass |
| PA-05 ball vs box | text flowchart | accurate; the cube is not used | pass |
| PA-06 dot plot (zh) | number line | "we mark the data: 2 once, 3 twice, 5 three times" on a line from 0 to 4 with one point at 2 | **misleading: misused recipe (an addition line for a data display) and narration** |
| PA-07 rug 5 by 7 | unit-square array | 7 by 5, 35 | pass |
| PA-08 y = x² − 2x | function plot | vertex (1, −1) | pass |
| PA-09 正方体 | cube | faces, edges, vertices | pass |
| PA-10 3 × 7 | unit-square array | 3 rows of 7 | pass |
| PA-11 garden 10 by 3 | unit-square array, 8 by 3 | says the grid shows at most 8, draws 8 by 3, computes 10 × 3 in a formula | pass; 2 calls, no #78 re-ask |
| PA-12 GCF | text flowchart | accurate; no factor tree claimed | pass |
| PA-13 长方形 12 by 5 (zh) | unit-square array, 8 by 5 | grid labelled 长 8 cm, then computes 12 × 5 without saying the grid is not the question's rectangle | **misleading** (read strictly: the learner sees 8 by 5 beside 12 × 5 = 60, unexplained); 2 calls, no re-ask |

**Reading:**
- **Card limits (a): not met.** Two negatives of six misused a recipe: PA-02 and PA-06. The plot was still chosen for a piecewise function (PA-03), which ended in no lesson.
- **Positive controls:** 4 of 4.
- **`各≤8`:** observed in 2 of 2 (no #78 re-ask). There is no control arm, so this can't be credited to the clause.
- **Narration target: not met.** PA-06 and PA-13 are misleading.
- **Overall:** 3 of 13 lessons mislead, and 1 fails.

### What the probe shows (free checks after the run)
- **The model ignored explicit clauses.** PA-02's outline chose the array's features for a ratio, against "非比例图". PA-03 chose the plot, against "不能分区间定义". PA-06's narration claims data points the line doesn't show, against the new rule. The one safe outcome came from a program check: PA-03's refusals.
- **A lesson may have no visual, but nothing asks for that.** `course_visuals` has no minimum. Yet no outline prompt says to leave the picture out when nothing fits. Every probe lesson drew something, and so did all 58 baseline lessons.
- **The outline prompt invites stand-ins.** Its substitution rule: when a requested picture can't be drawn but the math "can be taught correctly with an existing picture", write `teach`, substitute, and say so in one sentence. PA-11 is this rule working honestly. PA-02, PA-06 and PA-13 are the same move without the honesty. Card limits pull against this rule.
- **PA-02's rejection was #78 working:** an animation to 12 was refused and repaired to 8 by 6. The repaired lesson still teaches a ratio as an area.
- **PA-03 is a program finding of its own:**
  - A constant piece (`2`) is refused outright ("must depend on x").
  - Repairs alternated between that error and a `sample_x_numbers` error until the lesson failed.
  - It is like the handoff's follow-up 2 (a repair message that doesn't help).
- **Tuning risk in the section-1 rule:** its list (物体、图表、起点或动作) mirrors the three open baseline cases one for one. Step 3 re-measures on those questions, so a revision should state the rule generally.

### Recommendation (for the owner)
More card text is the lever that just failed, and it needs a ceiling raise. Instead:
1. **Control arm first:** the same 13 cases on #78's build, about 30 calls (needs approval). Without it, neither "the clauses failed" nor "the ≤8 note worked" can be claimed.
2. **Change the rule that invites stand-ins**, net of bytes:
   - Rewrite the substitution rule so that a stand-in is allowed only when it is the same concept (a smaller rectangle for area, said aloud).
   - Say that no visual is the right answer when no recipe shows the concept.
   - This is outline text, so it also counts against the fallback outline's 28 bytes, and the rewrite has to replace text rather than add it.
3. **Program checks where the model won't follow text:** the no-op-animation check, and a stand-in check (a count the lesson states that differs from the drawn count, with no disclosure) along the lines of #78.
4. **Keep the card limits?** They cost 130 bytes for no measured effect. Hold them on this branch until the control arm says whether they help.

## Control arm (2026-11-14, owner-approved): the same 13 cases on #78's build
- 31 calls. Tokens: 56,252 prompt, 25,537 output, 7,639 thinking.
- Read in full with the same rubric.
- Each case ran once per arm, so a single case can differ by chance. Read the pattern, not one row.

| Case | #78 (control) | This branch (candidate) |
|---|---|---|
| PA-01 make a ten | **misleading**: "moving 3 more brings us to 13" on a line ending at 12, nothing animated | minor: one jump 8 → 13 |
| PA-02 ratio | text flowchart, accurate | **misleading**: ratio as an area grid |
| PA-03 piecewise | failed (plot chosen, constant piece refused) | failed (same) |
| PA-04 standard deviation | flowchart, accurate | flowchart, accurate |
| PA-05 ball vs box | asked to clarify (no lesson) | flowchart, accurate |
| PA-06 dot plot | two-point line, said aloud to be a stand-in, counts in a note | **misleading**: points claimed but not drawn |
| PA-07, PA-08, PA-09, PA-10 | expected recipe, correct | expected recipe, correct |
| PA-11 garden 10 by 3 | array refused by #78 (10 > 8), outline re-asked: flowchart, accurate; 4 calls, first playable 15.4 s | 8-by-3 stand-in, said aloud; 2 calls, 9.5 s |
| PA-12 GCF | flowchart, accurate | flowchart, accurate |
| PA-13 长方形 12 by 5 | refused, re-asked: flowchart, accurate; 4 calls, 23.1 s | **misleading**: 8-by-5 stand-in, not said; 2 calls, 8.3 s |
| **Misleading** | **1 of 13** | **3 of 13** |

**Speed:** the paired median first-playable time is 1.3 s faster on the candidate (11 pairs). Most of that comes from PA-11 and PA-13 avoiding #78's re-ask.

**Reading:**
- **The card limits did not reduce misleading lessons**: 3 against 1, on single runs.
- **`各≤8` trades M3 for M4.** It saves #78's re-ask (2 calls and 6–15 s), but it turns a safe refusal (an accurate flowchart) into a stand-in, and one of the two stand-ins hid the swap.
- **The narration rule shows no measurable effect.** Each arm has one narration mislead (PA-01 on #78, PA-06 here).
- **Positive controls:** 4 of 4 in both arms.

### Recommendation (replaces the one above)
1. **Don't adopt the card limits or the narration rule.** Close #79 unmerged, or keep it only for this record. Their 289 bytes buy nothing measurable, and `各≤8` makes stand-ins more likely.
2. **Next, in this order, each through §5:**
   - **Rewrite the outline's substitution rule, net of bytes:**
     - a stand-in only for the same concept, and always said aloud;
     - no visual when no recipe shows the concept.
   - **Add a program check for undisclosed stand-ins:**
     - a count the lesson states (12) that differs from the drawn count (8), with no disclosure in the narration;
     - on #78's model, refused for repair.
   - **Add the no-op-animation check.**
3. **PA-03 (a constant piece refused, repairs alternating):** a separate program fix, with the handoff's follow-up 2.
