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
- **Narration:** misleads are recorded separately as evidence for (b) and do not fail (a). A miss is recorded with the recipe and narration. If a negative case still misuses a recipe, the wording is revised once and probed once more before the gate.

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

### Recommendation
1. **Cards (section 1 and every outline):** each card states what its recipe draws, in the form part (a) uses. The fallback outline has 28 bytes left, so further card text needs the fallback-outline ceilings raised: a plan change and a live comparison under S6.
2. **Later sections:** add a program-written `draws` line per visual to `visuals_for_section`, and one rule: speech names only what `draws` lists. Later-section and section-repair requests are 98 bytes under their ceilings (the P0 maxima). The cost is not measured yet; it is likely over, so this needs the same approval.
3. **No-op animations:** the program fix above.
4. **Rejected:** a model judge call per section. It adds one call per section to every lesson, a direct M4 cost, and is reconsidered only if 1–3 fail their gate.

## Status
- **(a):** on `feat/recipe-card-limits`, stacked on #78, not pushed. Probe and gate not run.
- **Blocked on this machine:**
  - there is no Octos model profile, so no paid run can start here even with approval;
  - `gh` has no valid login, so nothing can be pushed or opened as a PR.
