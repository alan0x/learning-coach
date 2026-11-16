# Changelog

## Unreleased

- **A refused `sample_x_numbers` in a lesson with no lesson numbers is not offered again on the retry** (the owner's two principles, 2026-11-16; step 2 of the accommodation order, split from #109). A section retry used to be the same request plus the error; in the speed gate the model repeated `sample_x_numbers: [1, 3]` (x positions) on every attempt and two lessons were lost.
  - `retryNarrowing` leaves the field out of that section's later requests. No number exists for it to hold, so this is a structured fact, not prose choosing what is drawn. The narrowing stays for all of the section's later attempts, even when a narrowed retry fails for another reason (review of #109).
  - First attempts are untouched (request-hash test unchanged); other refusals retry as before.
  - **Evidence:**
    - The paired check (`docs/RETRY_NARROWING_CHECK_2026-11-16.md`, 89 calls): 20 of 20 lessons playable against 18 of 20, and 42 calls against 47. The piecewise half of #109 never fired there, so this result belongs to this change.
    - #105 closed because removing the field let a piecewise request drawn as whole lines (PJ-07) publish. All such misdraws in the recordings were written to requests that did not offer `pieces`. Under the current request, all 25 recorded piecewise lessons drew pieces.
  - Replays of the 139 recorded lessons, the trial, run B and the gate are identical to main.

- **Function-plot derivations come from OLL's math plugin** (plan §7 step 3.5, slice 2; no lesson or request changes). Marks, domain and range bars and the interval sign proofs moved to `octos-lesson-language/plugin-math`, so Studio can draw what AI lessons draw. `src/plugins/plot-marks.ts` is now an adapter: it hands the plugin Coach's formula tokens, with each lesson number by its binding name, and reports a refusal as the same section fault as before. `plot-domain-range.ts` and `interval.ts` are gone. OLL pin `ab13d5b` (OLL main with #68 and #69). The request-hash test is unchanged; replays of the 139 recorded lessons, the trial, run B and the gate are identical.

- **Curve labels that do not match the curves one to one are left out, not refused** (the owner's two principles, 2026-11-16: the model writes meaning, the program accepts what has exactly one safe reading; step 1 of the accommodation order, free, no request changes). The compiler derives a legend from each formula, so nothing narrated depends on the dropped labels. Only lessons main refused change.
  - **Review of #108, taken out:**
    - Sorting solution-set boundaries given larger first: reversed boundaries can also mean the model picked the wrong relation, and the swap would then draw the complement of the set it narrates. That is a reading of meaning, so it stays refused.
    - Dropping success messages with false arithmetic: the pattern dropped right messages (percentages, division with a remainder, thousands separators, a message correcting a wrong sum) and missed false ones ending in a period. It goes to plan step 3.6 as its own change, checked against recorded messages.
  - **Counts (free):** in 307 replayed lessons, the wording refusals about dragging plot points never fired. Practice targets were already counted in #81's record (15 of 85 slider tasks already met); #81's program-written invitation is the fix there.
  - Requests are byte-identical (request-hash test); replays of the 139 recorded lessons, the trial, run B and the gate are identical.

- **Coach's core names no recipe** (plan §2.3, §7 step 3.4, Goal 1; no lesson or request changes). Recipe knowledge in core becomes declarations on the recipes:
  - `numbers_in_parameters` (the plot): its lesson numbers come from its parameters, so the schema gives it no number list and generation assumes none;
  - `ranges_fixed_once_shown` (the plot): a number it shows keeps its range once its section is published (from `bound_numbers`, else the visual's numbers);
  - `initial_camera` (the three 3D recipes): replaces the camera table keyed by recipe names in `recipe-kit.ts`.
  - The drawable kinds are every output kind of a registered recipe with number inputs, the same four.
  - A plot's curve formulas stay in core, as an OLL plot field that every plugin's plots share.
  - **Test:** every file outside `src/plugins` is scanned. It fails on a recipe name quoted, used as a property or as a key, or compared with a capability; a name that is also an OLL node kind may appear only as that kind.
  - **Review:** the first version gave the plot curves to the math plugin, although physics plots use them too, and it left the camera table in place. Its test read four files and quoted names only.
  - **Second review:** no correctness bug. Test gaps closed:
    - a test now requires every 3D recipe to declare a finite first camera, which a "turn to this view" task is judged against; removing one passed every test before;
    - the name test reads `src` at any depth and also catches `case "…"`, `"…" ===` and `RECIPE_*.…`, including for `number_line`;
    - a malformed camera declaration fails instead of giving a NaN tolerance;
    - the three cameras share one constant.
  - `LESSON_PLAN_SCENE_INITIAL_CAMERAS` is no longer exported (no users found in any repository); use `recipeInitialCamera`.
  - **Left as follow-ups:** the repair message about the "published graph" (rewording changes repair requests), and deriving the drawable kinds from compiled output rather than declarations.
  - Requests are byte-identical (request-hash test); replays of the 139 recorded lessons, the trial, run B and the gate are identical.

- **M1 re-tagged after the switch-ons** (`testsuite/math-expressiveness-m1-2026-11-15.json`, plan §7 step 3.1; free, no lessons generated). Every question tagged with a number-line or function-plot component or candidate was re-read against main 267261c. Other tags are the 2026-11-13 baseline's, which stays as it was.
  - **Questions that need a picture, fully drawn by a component:** 27 → 33 of 145 (19% → 23%); open 18 → 23, held out 9 → 10.
  - **Now fully drawn (open):** two jumps through 50; a slope triangle from two points; m and c with slope and intercept marks; domain and range; the symmetry axis.
  - **Still not drawn:** the hiker's three moves (1,245, −380, +615). The moves are drawable, but the values share only 5, which needs 296 ticks, so it is refused. Decision 0017 had counted it as partly covered. Counting by 25s to 200 is not drawn either: the fit takes the smallest unit that fits (5), so one jump of 200 has no jumps of 25, whatever ranges the model writes; 0017 had counted it covered.
  - **Cut features given a home:**
    - the double number line goes to `tape_diagram_ratio_table`, which makes that question "new";
    - probability words on 0 to 1 go to `probability`;
    - a new candidate `function_plot_calculus_ext` takes the area under a curve, tangents, intersections, a cubic's turning points and a hole.
  - **Open-question gains after the re-tag:** fractions 10, counters and ten frames 9, data charts 8, polygon figures 7, place value 6, probability 6, 3D solids 6, tape diagrams and ratio tables 5.
  - The M1 test checks every M1 file by the same rules (`test/math-expressiveness-m1.test.mjs`).

- **The number line in steps is offered by default** (`number_line_steps`, OLL decision 0017 §2; owner's decision, 2026-11-15). It moves from `TRIAL_RECIPES` to the end of the catalog, where the trial offered it.
  - **Evidence:** the reduced trial (`docs/PLOT_TRIAL_2026-11-15.md`). 4 of 6 in-scope cases passed both repeats. The misses were a split of 25 as 20 then 5 where tens first was asked, and an outline fault with no number line. The four-addition near miss drew correct steps on a hand read. No lesson misled. Steps were not in run B, so there is no comparison with them off and no timing.
  - **Requests:** every request changes, and each is byte-identical to main with `LEARNING_COACH_TRIAL_RECIPES=number_line_steps` (+337 B on the first request and the fallback outline, as measured in #88); no ceiling exceeded. The combined speed gate with #81 compares against the build before #98 (`--baseline-build` at 75578ab), so it covers this change too.
  - **Lessons:** the 2,000 existing digests are unchanged; a fixed sample for the recipe adds 80. Replays of the 139 recorded lessons, the trial and run B are identical.

- **The function-plot options are offered by default** (owner's decision, 2026-11-15): marks (intercepts, vertex, symmetry axis, slope triangle, domain, range) and piecewise functions, OLL decision 0018. The trial option `function_plot_extensions` and `src/plugins/trials.ts` are removed; naming it in `LEARNING_COACH_TRIAL_RECIPES` now only picks the plot cases in the trial harness.
  - **Why now, before the combined speed gate with #81:** run B (`docs/PLOT_TRIAL_2026-11-15.md`, 73 calls, the same build both arms) measured the options on against off: 17 vs 15 lessons playable, 13 vs 4 judge passes, median 6.8 vs 8.1 s to the first playable section. The offline replay of run B on main gives 17 of 17 playable and 14 passes. Run B ran plot requests only, so the cost to requests that never draw a plot (+698 B first request, +310 B sections) is unmeasured. The combined gate with #81 must therefore compare against the build before this change (`--baseline-build` at 75578ab), as plan §8 Q5 says the gate covers the extensions.
  - **Requests:** every request changes (2,000 of 2,000 recorded digests), and each is byte-identical to the request main sent with the trial option on, so run B's measurements apply to this build unchanged. First request +698 B, section requests +310 B; no ceiling exceeded. `marks` and `pieces` take fixed places at the end of the schema property order, where the trial put them.
  - **Lessons:** all 2,000 produced lessons are unchanged (the compiler already accepted the options either way).

- **A formula name before a spaced digit is left to the parser** (review of #96). The parser's lexer drops spaces, so `a 2*x` with a number labelled "a" was rewritten to `n1 2*x`, read as `n12`. With twelve or more lesson numbers, that silently read number 12. A name followed by a digit, spaced or not, is never replaced.

- **Two function-plot slips are corrected in place, not refused** (default path; found in the trial of the plot options, `docs/PLOT_TRIAL_2026-11-15.md` on #93). Each was refused and the section asked again: a median 16.9 s to the first playable section, against 7.7 s with no retry.
  - **A formula naming a lesson number by its symbol** reads that number: `a*(x-2)^2+1` when the visual's number is labelled "a", or `k*x+1` for "斜率 k". A name is replaced only when it is no function or constant and exactly one of the visual's numbers shows it as its symbol (the label's trailing letter, as plot text already shows it). Anything else is refused as before.
  - **A moving point declared as a plain number:** on one fixed curve, one or two numbers the formula does not read become the points moving along it (`sample_x_numbers`), only where the section moves or names them and the program would otherwise refuse it. Each must be labelled as an x position ("x", "探针 x 坐标", "x-coordinate"; not "x 的系数" or a bound such as "max x value"), with the curve existing at its min, max and initial value. A lesson that compiles on main is never changed (review: the first version also changed fixed curves listing an unmoved x number, and could refuse one).
  - **Review:** names are replaced only on the right of an `=`, read as the parser's lexer reads them (letters only, compared lowercased, `N1` one reference), and never when glued to a digit. So `E^x`, `X^2`, `f(x) = …` and `y = …` behave as on main. A unit label such as "长度 m" does bind `m` to its number.
  - **Effect:** 5 of the 139 recorded lessons (the practice-invitation runs) now publish their first section in 1 call instead of 2, with the curve reading the number. The other 134 replay identically. In the trial replay, 4 more lessons need no retry. Requests are unchanged (request-hash test).
  - The hook receives the outline's number labels and the visual's numbers (`lower_model_parameters` context).

- **Exact ranges for odd-degree polynomials, sines and cosines; domains for every polynomial** (decision 0018 as extended by the owner after the trial). An odd degree from 3 to 9 takes every value, provided its leading coefficient is proved never to be 0 over the lesson numbers' ranges. Any polynomial up to degree 9 is defined everywhere. a·sin(px + q) + k and a·cos(px + q) + k run from k − |a| to k + |a|, both ends included, also while a slides through 0 (both ends are then k), provided x's coefficient never reaches 0. An even degree of 4 or more still has no range drawn, since its minimum is not read. Marks still read lines and quadratics only (the polynomial reader takes a maximum degree; marks keep 2). In the trial replay, the cubic and sine lessons now draw the range they narrate (two lessons said the range was marked when it was left out). The checks pass the plot judge, including the closed ends of sine ranges.

- **Function-plot marks the program cannot draw are left out, not refused** (decision 0018 as amended after the trial, `docs/PLOT_TRIAL_2026-11-15.md` on #93). A vertex of a line, intercepts of a cubic, a range with no exact formula, a slope triangle with no fitting pair, marks on several curves: each such mark is left out and the rest of the plot is drawn in the same call. Before, the section was refused and asked again (a median 16.9 s to the first playable section against 7.7 s without a retry), and the model often asked again for the same or another undrawable mark. Only the program's own mark faults are caught; any other fault still fails the section. An empty `pieces` or `marks` list now means none (6 of 48 trial lessons were refused for `pieces: []`). A slope triangle on one model point runs from it (A) to B two units right, which moves with it, wherever B stays on the curve (confirming run B: the model gave one point at x = 1 and narrated the rise and run to x = 3, which leaving the triangle out had left undrawn). Replaying the trial's saved replies: lessons needing a retry 16 → 9, lessons reaching a playable section 42 → 47 of 48. Narration naming a left-out mark is the remaining risk; in the trial it occurred only for ranges the decision's extended scope draws (the PR stacked on this one). Default requests are unchanged (request-hash test); the 139 recorded lessons replay identically.

- **The trial harness runs the function-plot cases** (`scripts/eval-trial-recipe-speed.mjs`). `--recipes number_line_steps,function_plot_extensions --pairs 0 --quality-repeats 2` runs the 7 number-line step cases and the 17 plot judge cases (PJ-01–17, from `testsuite/plot-judge-cases.json`) on the candidate arm, with the near misses (ST-06, PJ-15, PJ-16) also on the arm without the trial. Plot cases are judged by `scripts/plot-judge.mjs`. Near misses are now judged on both arms, and the report lists the baseline's beside the candidate's (`near_miss_baseline`); only the candidate counts toward the verdict. The report names the plot options a first part used (`plot_marks`, `plot_pieces`, `plot_domain_range`). A quality-only run no longer needs speed-pair requests for its first recipe. Each row now keeps its rejected parts' reasons (`rejections`, from Coach's own rejection log), and `--lesson-calls` sets how many calls one lesson may start (default 3 as before; 4 lets a lesson run as Coach runs it for a learner: the bootstrap plus three attempts at the first section). `--both-arms` runs every quality case with and without the trial, judges both, and reports lessons, judge passes, calls, rejections and median seconds to the first playable section per arm.

- **Domain and range bars** (`marks: ["domain", "range"]`, OLL decision 0018 §3, fourth and last step, same trial option). Intervals on the axes, from exact formulas only (`src/plugins/plot-domain-range.ts`): lines, quadratics, a·√(px + q) + k, a/(px + q) + k, a·b^(px + q) + k and exp, a·log(px + q) + k, and piecewise functions (domain from the intervals, joined where they meet; range only when every piece is a line or a constant). Any other formula is refused in the section, so a cubic's or a sine's range is never estimated.
  - Ends that read lesson numbers are bound and hidden while undefined. Where a sign decides the side (a in a·√…, a quadratic's a), two bars are written, each with an end defined for one sign only, so the right one shows and both hide at a = 0. A sign that decides the domain's side (p in √(px + q)) must be fixed. A range that collapses to one value at a slider stop (m = 0 in mx + c) is refused: an unbounded bar cannot be hidden.
  - **Signs are proved, not sampled** (review): which side a range bar opens to, and whether a coefficient can reach 0, are decided by interval arithmetic over every value the lesson numbers can take (each number's min to max; `src/plugins/interval.ts`), checked against OLL's own evaluation. Sampling the start, the demonstrated states and each slider's ends one at a time missed changes between them: (n1² − 1)·x² with n1 from −3 to 3 got one bar [0, ∞) although it opens downward for |n1| < 1. A sign the interval cannot prove gets the guarded pair, or the refusal for a line's or a log's range. Both bars of a guarded pair carry the label, since only one is ever shown.
  - An exponential's domain needs a base above 0 wherever the numbers go, also in a piece (review: n1^x with n1 down to −1, and (−2)^x, got all reals).
  - The rule was tightened: the plot options take 713 B of their 800 B cap. With all of them on: first request +698 B (388 B schema), section requests +310 B; no ceiling exceeded.
  - Tests: PJ-10 to PJ-14 pass the plot judge, including a range that flips as a slider turns a from −1 to 1; refusals for a cubic, a sine and a slope through 0; a piecewise function's joined bars; drawing the root's closed end open fails PJ-10; the review's cases above. 518 of 518 pass; replay of 139 lessons identical off and on.

- **Piecewise functions** (`pieces`, OLL decision 0018 §2, third step, same trial option). The model writes each piece's formula, its interval (`x_from`, `x_to`; an unbounded side left out) and its ends (`[]`, `[)`, `(]`, `()`); `formulas` repeats the pieces' formulas, as the schema requires one. The program draws each piece as one curve on its interval, the pieces sharing a series (one legend, colour and line style), with filled and open ends as written. A piece may be a constant: it is drawn only on its interval. The finite ends join the view.
  - **Refused in the section:** overlapping pieces (each x at most once; where two meet only one includes the end, as OLL requires), fewer than two or more than four, an end below its start, and pieces with lesson numbers (fixed formulas only, as for several curves).
  - With the option on (marks and pieces): first request +749 B (371 B schema), section requests +378 B; no ceiling exceeded. The plot options take 764 B of their 800 B cap (decision 0018), so domain and range need the rule tightened.
  - Tests: PJ-07 to PJ-09 through generation pass the plot judge; ends and series as written; each refusal above (review: the count, order and ends refusals had none); 508 of 508 pass; replay of 139 lessons identical off and on.

- **The slope triangle as a mark** (`marks: ["slope_triangle"]`, OLL decision 0018 §1, second step, same trial option). With no moving points, the program places A and B two units apart, so the triangle is not a sliver: the first of x = 1 and 3, 2 and 4, −1 and 1, … where the curve exists at the start and at every demonstrated state. This keeps A off x = 0, where the y-intercept mark sits. With the model's two moving points (`sample_x_numbers`), those are the triangle; with one, it is refused. If no pair fits (√(x − 50) in this range), it is refused in the section. Without marks, a slope lesson's automatic references stay at 0 and 1 and are checked at the start only, as before, so default lessons compile or are refused exactly as they were (review: the check had also taken in demonstrated states without marks).
  - With the option on, marks in all: first request +318 B (99 B schema), section requests +219 B. No ceiling exceeded; replay of 139 lessons identical off and on.
  - Tests: PJ-01 passes the plot judge; with intercepts, A and B sit at 1 and 3 and the y-intercept keeps its own mark (PJ-02); √(x − 5) gets its points at 6 and 8; 501 of 501 pass.

- **Function-plot marks, a trial option** (`marks`, OLL decision 0018 §1, first of its steps): intercepts, vertex and symmetry axis. The model names the marks; the program derives them from the one formula, binds them to its lesson numbers, and hides one while it does not exist (a parabola lifted off the x-axis, a line at slope 0). Labels name the mark only ("y 截距", "顶点"; English in English lessons).
  - **Trial switch per option:** `LEARNING_COACH_TRIAL_RECIPES=function_plot_extensions` offers it; the function plot's later extensions (pieces, domain and range) will share the name, as they are gated together. With it off every request and lesson is byte-identical (request-hash test); the compiler accepts `marks` either way. A replay of 139 recorded lessons is identical with it off and on.
  - **Size with it on:** first request +246 B (82 B schema), section requests +164 B (the rule sits in `section.formulas`, which every section carries); fallback outline and practice unchanged; no ceiling exceeded; math plugin 6,203 of 9,900 B with both trials on.
  - **Exact derivation:** the formula's coefficients in x are read from its tokens as short expressions in the lesson numbers (OLL caps a binding at 256 characters, so f cannot be substituted into itself), then checked numerically against the formula. x-intercepts of a quadratic are its two roots, hidden when the discriminant is negative or the leading coefficient is 0; the vertex and axis hide at a = 0.
  - **Refusals, in the section:** a mark the formula cannot give (any mark of a cubic, a vertex or axis of a line), or marks on several curves. The section is asked again without it (0018 question 2: narration about an undrawn mark misleads most). Coefficients too long for one binding (OLL's limit is 256 characters) refuse the marks the same way, before anything is compiled, and the refusal names the mark whose expression is too long (review: OLL's own length error escaped with no path).
  - Marks come after the sample or reference points (the secant measures the first two), and their positions at the start and at each demonstrated state join the view. `marks` is a semantic parameter: two plots differing only in marks are different visuals.
  - **Tests:** PJ-02 to PJ-06 through generation, from replies in the model's format, pass the plot judge; a wrong vertex sign fails three of them; refusals ask for the section again; a lesson with marks requires player 0.11.0.
  - **Browser check (OLL runtime):** a double root draws its labels once, without overlap. A parabola lifted through the x-axis by a slider: labels overlap at 4 of 221 slider states (two x-intercepts nearly together, k = −0.24 to −0.16, and one at k = −2.2); never in playback. OLL places plot labels without avoiding each other; a fix belongs in the renderer.
  - **Known overlap with the next step:** a slope lesson's automatic reference A sits at x = 0, on the y-intercept mark. The slope-triangle step moves A.

- **Number line in steps, a trial recipe** (`number_line_steps`, OLL decision 0017 §2). Two or three moves on one line, each its own jump: make ten, tens then ones, up then down. The model gives the start and each move (`start`, `change_1` … `change_3`); the program computes where each move lands and the end. Offered only when `LEARNING_COACH_TRIAL_RECIPES` names it, until the speed gate; with it off every request is byte-identical (request-hash test). A replay of 139 recorded lessons is identical with the trial off and on.
  - **Card (334 B, cap 350 B):** it states the split from the one-step card, says a two-step lesson writes two moves, and says not to count hops on a move that turns back. The one-step card is unchanged while this is a trial. With the trial on, the first request and the fallback outline grow by 337 B (15 B schema); section requests are unchanged.
  - **Refusals:** one move (that is `number_line`'s) or more than three is a fault the outline owns. The fault names this recipe, so the outline is asked again without it and can still choose the one-move line; other number-line faults still exclude the whole family. One jump under narration of two steps is the defect the probe found (#79).
  - **Fit:** the number line's fit now takes a start and any number of moves, with one rule: each move narrows to what the window leaves after the moves before it, never below the values the lesson gives it. One move fits as before.
  - **Hops** only when every move goes the same way: a move with a slider over its whole range, a fixed move over the values the lesson gives it (the model writes wide ranges it never uses: −5 in −10 to 10 still counts back). A move that turns back is drawn raised as one arc (OLL #61), so no move gets hops then.
  - **Family guards** apply through `output_kinds`: practice targets kept as written, a met target returns the line first, outline faults, exclusion on a new outline, and the judge (#86). The speed harness tells a line in steps by its two or more jumps.
  - **Tests:** ST-01 to ST-05 and ST-07, compiled from lesson numbers shaped as recorded outlines write them (wide ranges, no slider), pass the steps judge; the wrong order (8 + 3 + 2) fails it for its own reason. Through generation, from replies in the model's format: two and three moves; a practice target on the last move kept as written, with the line returned first; one move under this recipe asks for a new outline that still offers the one-move line.
  - **Browser check (OLL runtime, compiled lessons):** tens then ones animated from 0 keeps one card height through playback, and three sliders that can each turn back keep one height at all 189 stop combinations. At 27 of 1,386 slider states of the animated card, moves of 0 or 1 crowd the landing numbers and the tick labels take a second row below the line; the axis does not move. This is the label-row growth 0017 records as predating it.
  - **Known limit:** on a card with free sliders, later moves get little room (−4 to 0, then 0 to 2, for 10 + 4 − 3 + 2), because each keeps the earlier moves' whole ranges in the window.

- **Coarse number-line units go past 10** (OLL decision 0017 §1). Whole numbers too far apart to count in ones were counted in 2s, 5s or 10s; the units now go on to 20, 25, 50, 100, 250, 500 and 1000, in the fit and in the compiler's ticks. The rule is unchanged: the smallest unit that every value is a multiple of and whose window fits. One move is still one jump, a hop per unit, so a move of 325 is 13 hops of 25. The request is unchanged.
  - A unit takes only exact multiples. The old tolerance (±0.011 of a unit) would have counted 1005 in 1000s and drawn it at 1000; 1005 is refused as before.
  - **Replay of 139 recorded lessons** (the baseline, the step-2 probe and control, the #78 reviews and reruns, and the practice-invitation probe): all identical. None of them uses numbers this far apart.
  - The ticks are the family's, so comparison and solution lines get the new units too: comparing 250 and 1750 was refused and now counts in 25s.
  - OLL thins tick labels so none overlap, and keeps the labels of the lesson's numbers.

- **OLL pinned to main 8e85fe1** (OLL #60–#62: decisions 0017 and 0018 and their render work). Player 0.11.0 with `plot:curve-intervals`, `plot:axis-intervals`, `plot:guide-hide-undefined` and `plot:secant-first-two`, and math plugin 0.3.0 with `plugin:math/number-line-jump-lanes@1`. No recipe emits them yet. Lessons are recorded as built with math plugin 0.3.0. A lesson's declared requirements come from the features it uses, so today's lessons need the same player and plugin as before. Authoring schema unchanged (same digest); all tests pass unchanged except the recorded plugin version.

- **A count a lesson states is never moved** (M2/M3 baseline, Coach #77). The unit-square array draws at most 8 squares a row, and the program used to clamp larger counts to 8 under the model's own words: 24 squares under "12 cookies", 8 under "ten ones". Counts (the unit-square array's rows and columns, a polygon's sides) are now checked after fitting. Slider ranges are still narrowed to what a recipe draws; positions in a recipe's own frame (a cube's section) are still fitted. A practice target on a count is checked like an animation (below); other practice targets keep their earlier rule (moved to the edge, prompt rewritten).
  - **A starting count beyond its recipe** is an outline-owned fault: the outline is asked again without that recipe (the number line's route, now naming the faulting recipe).
  - **An animation beyond its recipe** is the section's to fix.
  - **A count narrowed by another recipe sharing its number** (a 3-by-3 square beside a cube section running from −1 to 1, which became 1 by 3) is refused at the visual that shares it, for the section to drive it with another number or none.
  - **Replay of the baseline's 58 recorded lessons:** 54 compile exactly as before; the 4 misleading ones are refused (3 before first playable).
  - **After code review** (each finding reproduced first, then a test that fails on the earlier build):
    - A count is checked against every recipe that draws it, so the verdict no longer depends on which visual comes first.
    - A shared-number fault names the visual whose fit pushed the count out, not the first visual sharing it.
    - Range edges round like the counts they bound, so 1.4 squares (drawn as 1) is not refused against a range rounded up to 2.
    - The outline is refused before first playable when no lesson number is a count a required visual can draw (the array with every number above 8). Otherwise a count fault in section 2 or later went to sections that could not fix it, and the lesson failed after it had started; now that section is asked to drive the visual with a number it can draw.
    - Excluding a recipe never excludes the number line beside it; an outline fault points at the outline's number.
    - Drawable count ranges live on the recipe's number policy, read by the fit, the check and the card text.
    - Replay of the 58 recorded baseline lessons: identical to the reviewed build (54 unchanged, the same 4 refused; the clarification and the failed generation also behave as before). Every recorded outline restart that recovered (the #78 live rerun, the control arm) replays exactly as recorded. Request digests unchanged.
    - Count refusals quote the whole count: a target the program snapped to a slider step (9 became 8.975) is reported as the 9 the model wrote.
    - **A practice target on a count is refused, not moved** (owner, 2026-11-14). Moving 12 onto an array starting at 8 met the task, so the program moved the target to 1 and rewrote the prompt to "set it to 1" while the narration said 12. A count's target is kept as the model wrote it until compile, which knows the range the visual draws: snapping it to the slider's step turned 9 squares into 8.975 and 6 into 5.995, and moving a met target to the end of the model's range (10) went past the array's 8, so compile refused the program's own value. Targets are whole counts, and a met target moves within the drawable range.
      - Replay of the 58 recorded baseline lessons against the reviewed build: one more lesson is refused, the baseline's misleading ratio lesson, whose model-written target of 9 squares the array cannot draw (one section repair call, after first playable). Seven lessons change only in their practice tasks: targets become whole counts (5.995 → 6), and one task keeps the model's own wording instead of the program's rewrite. No held-out lesson is refused.

## 0.29.0 - 2026-11-12

- **The number line is offered in AI lessons** (OLL decisions 0013 and 0016). `number_line`, `number_line_compare`, `number_line_solution` and `number_line_rounding` move from the trial list to the end of the catalog, where the gate measured them. The live first request is byte-identical to the gate's candidate request.
  - **Gate on the frozen rewrite** (runs 11 and 11b, `docs/TRIAL_RECIPE_SPEED_NUMBER_LINE_2026-11-11.md`):
    - all 80 planned lessons pass every hard check;
    - requests the number line fits start 3.8 s sooner;
    - requests it does not fit start +0.15 s later, within the owner's +0.5 s rule, which judges each group on its own.
  - **Cards rewritten** after runs 9 and 9b showed other requests 2.8 s slower, with the model thinking more often:
    - a stale "not for inequalities, rounding" clause and a duplicate compare path are gone;
    - each card states its scope in its opening words;
    - the four cards shrink from 1,203 to 524 bytes.
  - **Comparing two numbers, solution sets and rounding** (decision 0016): the program draws open and filled ends, rays, intervals, neighbours, the halfway point and the rounding jump; the model gives only the numbers, the relation or the place.
- **Payload:**
  - Fallback-outline ceilings are raised to the measured maxima with the four recipes on (owner-approved under S6).
  - Math's plugin budget is 9,900 B (plan Q1; #71).
- **Speed harness:**
  - Fitting and other requests are judged separately (`speed` verdict); a planned group with no complete pairs is incomplete, not a pass.
  - New options: a third arm for an earlier build (`--previous-build`) and other-only pairs (`--other-cases`).
  - Each turn's thinking tokens are recorded.
  - Every named recipe's quality cases run.

### Earlier work in this release

- **Number line, after speed gate run 4.**
  - The `denominator` parameter is removed. With it, the model wrote numerators: 3 for 3/4.
  - The values choose the denominator; a coarse slider step (1/2 to 1/6) counts only when the values are whole.
  - A start that nothing drives is kept near its value, even with a slider.
  - An offline replay of run 4's ten lessons meets the run 5 criteria.
  - With `OLL_DEBUG_GENERATION=1`, streamed model replies are logged too, and the speed harness keeps them.
- **Number line fitted to the lesson** (trial recipe): the program fits a number line's numbers to what the lesson teaches, so fraction lessons show their fraction ticks and lines stay readable (`docs/TRIAL_RECIPE_SPEED_NUMBER_LINE_2026-11-11.md`, "The fit").
  - The model may give a `denominator` (1–12, clamped). Otherwise it is taken from the lesson's values and clean slider steps.
  - Starting values, ranges, slider steps, animation targets and practice targets snap to its ticks.
  - A number the lesson drives shrinks to a window around the values the lesson uses. A slider nothing drives keeps the model's range, so the answer stays reachable. A number with neither keeps a short range.
  - Nothing new is refused. Numbers are left as written when another visual also shows them (including through a plot's formula or sample points), when a practice task judged by an expression reads or controls them, or when snapping would make a practice task already met.
- The trial-recipe speed harness records what each number-line first part drew (range, parts, hops, start and end) and keeps the compiled parts.

## 0.28.0 - 2026-11-11

- `number_line` in the math plugin (OLL decision 0013, grades 3–8 math first).
  - The visual's two numbers are the start and the change; the end point is bound to their sum, so the program, not the model, computes where a jump lands.
  - The model gives only the two numbers (and a title). The program chooses the parts per unit and whether to draw hops from them, because the model cannot see the limits those depend on.
  - The line covers every value the numbers can reach.
  - Each unit is split into the fewest parts (1–12) that put every reachable value on a tick: the numbers' ends, starting values and slider steps. When no count up to 12 does, the line keeps whole-number ticks and draws one arc. Jumps are drawn hop by hop when every reachable change is a whole number of parts and needs at most 24 hops.
  - It is a **trial recipe**, offered to the model only when `LEARNING_COACH_TRIAL_RECIPES` names it, so live requests are byte-identical until its speed gate passes. `eval-trial-recipe-speed.mjs --recipes number_line` has ten number-line requests for that gate.
- Number-line bindings count as visual effects in the check that every numeric control drives a visual.
- Uses OLL `71b1d6d`, with the math plugin at 0.2.0: compiled lessons record `math: "0.2.0"`.

## 0.27.0 - 2026-11-11

- `constant_speed_motion` in the physics plugin (subject plan P2 physics pilot): an object on a track linked to its distance–time graph, with time and speed as lesson numbers, compiled through OLL's `buildConstantSpeedMotion`. It is a **trial recipe**: installed and tested, but offered to the model only when `LEARNING_COACH_TRIAL_RECIPES` names it, so live requests are byte-identical. It passed its speed gate (`docs/TRIAL_RECIPE_SPEED_2026-11-11.md`). The product owner keeps it a trial until the per-subject quality review.
- Uses OLL `4389a02`. Geometry cards show their axis labels again, and cards are drawn at their layout size (rendering only).
- `scripts/eval-shadow-speed.mjs` and `scripts/eval-trial-recipe-speed.mjs`: the speed gates for shadow mode and for trial recipes.

## 0.26.0 - 2026-11-10

- Subject signal in shadow mode (subject plan P2).
  - The three lesson actions and `oll_generate_lesson` accept optional `plugins` (installed plugin IDs, at most three), `plugin_confidence` (0–1) and `plugin_source` (`jev`, `context` or `none`). Unknown IDs are rejected before any model request (`LESSON_PLUGIN_UNKNOWN`).
  - The request stays broad and byte-identical.
  - The `lesson-plan-generation` trace records the signal and what a scoped request would have contained (`plugin_signal.scoped_plugins`, `scoped_recipes`). The completed event records `plugins_outside_scope`.
- The `chemistry`, `biology` and `earth_space` plugins are installed: their manifest and Jev subject line come from OLL `bd031be`. They have no recipes or prompt rules yet, so they add nothing to model requests, and every request digest is unchanged. They are listed in the lesson actions' `plugins` enum.
- `eval/subject-routing-heldout.json` adds 46 held-out routing cases. `scripts/eval-subject-routing.mjs` runs them against Jev with Octos Learn's question.
- `scripts/report-plugin-signal.mjs` reports, from generation traces: the share of lesson requests that arrived with a Jev answer, scoped versus broad requests, and lessons that used a plugin outside their scope.

## 0.25.1 - 2026-11-10

- Rounding questions accept the unrounded value. A prompt that asks for rounding ("保留一位小数", "四舍五入", "精确到百分位", "round to the nearest tenth", "to 2 decimal places") gives the answer a tolerance of half a unit in the requested place. The learner can type 2.15 for an answer of 2.2, whether or not the model wrote the unrounded arithmetic in `check`. Questions that do not ask for rounding keep exact grading.
- `log` is the common logarithm (base 10) once Coach uses an OLL with that semantics. `ln` stays the natural logarithm. `log_b(x)` and `log10`/`lg`/`log2` are written by change of base, so they are unaffected.

## 0.25.0 - 2026-11-10

- Function plots get their view from a deterministic teaching view planner (`docs/PLOT_VIEW_PLANNER.md`), replacing the viewport heuristics.
  - The view frames the features of each curve and the states the creation section shows. Slider extremes join only when they cost at most 1.5× of the span.
  - Quantity axes start at zero.
  - Model-written ranges are checked and repaired with a logged `plot_view_adjusted` adjustment instead of failing the section.
  - Equal units are used only where geometry is the content. Radian trigonometric plots get π ticks, and removable holes are published as `curves[].holes`.
- Static curve legends use the textbook formatter. `log10`, `lg` and `log2` are accepted.
- Needs an OLL player that understands `axes.layout`, `axes.x.ticks` and `curves[].holes`. Older players ignore these fields and still play the lesson.
- Request digests are unchanged. The lesson digests of the four function-plot fixtures changed.

## 0.24.4 - 2026-11-10

- Function plots separate formula parameters from sample inputs. A curve changes through the parameters its formula references; `parameters.sample_x_numbers` moves one point (P) or two points (A/B, secant) along a fixed curve. Explicit sample bindings change every model request, so all 1,680 request digests were re-recorded; the lesson digests of the four function-plot fixtures changed with them.
- A static quadratic whose labels and section instructions confirm the vertex roles is rebuilt locally as a vertex-translation curve, without another model request.
- A redundant sample field on a parameterized curve is removed locally before validation, even when it is malformed, unless the lesson really uses a moving point. The adjustment log records the removed field.
- Parameterized curve legends and hover readouts use the sliders' readable symbols (`y = −(x − h)² + k`) instead of internal aliases. Request digests are unchanged by this; one sample lesson digest changed.

## 0.24.3 - 2026-11-10

- Subject plugin close-out (plan P1). No prompt, schema or lesson changes: every request and lesson digest in `eval/request-hashes.json` is unchanged.
  - The compiler looks recipes up in `src/plugins/compilers.ts` and no longer names a plugin.
  - Plugin manifests and Jev subject lines come from the OLL packages (`octos-lesson-language/plugin-<id>`) instead of being declared a second time. This found one disagreement: OLL's `math` manifest did not depend on `shared`. Fixed in OLL `d84fcb2`.
  - A compiled lesson reports the plugins that built its visuals, with versions (`plugins` on the compiled result, `lesson_plan_plugins` in the tool result and the `lesson-plan-generation` log entry). This is compilation metadata, separate from what a player needs.

## 0.24.2 - 2026-11-10

- Typed questions (`answer_activities`) can no longer fail a lesson. In the P0 baseline, 4 of 120 lessons failed after section 1 was already playing, because a later section's optional question kept failing its answer check across all three section attempts.
  - A decimal answer now matches when it is its `check` rounded to the places it writes (11.21 for 2.02/18.02*100; full-width digits count the same). The learner's task gets the same half-unit tolerance plus a floating-point slack (0.005000005 for two places), so typing the unrounded value is also accepted, even exactly on the rounding boundary (2.15 for 2.2). Whole numbers, fractions and mixed numbers still must equal the check exactly. The typed-question rule asks for rounded answers as decimals, with the question stating the places.
  - A question that still fails its checks (answer, arithmetic, prompt or hints) is dropped when its section arrives (a `lesson-plan-program-adjustment` of kind `answer_activity_removed`), as single-section practice already does, instead of costing a section rewrite.

## 0.24.1 - 2026-11-09

- Compiles and validates against OLL `350d5e0` (player execution version 0.10.0), the same OLL that Octos Learn plays, instead of `7aec858` (0.5.0). The vendored authoring schema is synced. No recipe or prompt changes; Coach can now use features up to player 0.10.0 when its recipes need them.

## 0.24.0 - 2026-11-01

- `learning.teach.review` also returns `personal_details`: personal details the child said on each card (a real person's name, their school, town or address, age or grade, contact details) as the card key and the child's exact words, so the host can ask the child to remove them before the lesson is shared. A detail that is not the child's own words on that card is dropped. The review's messages still never repeat personal details. Other actions are unchanged.

## 0.23.0 - 2026-10-31

- Three sync actions for a learner recording their own lesson (surface `learning.teach`), each a single structured request: `learning.teach.octo-question` (Octo, as a curious student, asks one short question about the card just recorded), `learning.teach.ink-to-math` (a handwritten formula as KaTeX LaTeX exactly as written; unreadable handwriting is reported, link-capable commands are refused) and `learning.teach.review` (card-by-card feedback: math topics tell a slip from a misconception, topics that are not math are judged on clarity only, and a review that skips a card is refused). Replies are validated before they leave the skill; existing actions are unchanged.

## 0.22.0 - 2026-10-30

- Lessons and selection assistance follow the host's `language` (`zh-CN` or `en-US`). For English, every existing generation call (first request, later sections, practice, selection) carries an output-language rule; no translation request is added and Chinese requests are byte-identical to 0.21.0. Compiler-owned fallback text (titles, labels, captions, hints, prompts and learner responses) uses the lesson language; numbers, formulas and construction checks are unchanged. The same narrow teaching-claim guards now also read English narration. `learning.selection.enhance` declares `language`, so hosts send it only to this version or later.

## 0.21.0 - 2026-10-28

- A one-section lesson gets practice too: once its section is playable, one small request (`part: "practice"`, schema `answer_activities` only) asks for 0–2 typed questions about what the section taught, placed by its last formula or note. A question whose answer disagrees with its arithmetic is dropped, not repaired, and any failure delivers the lesson exactly as before. The first request and every multi-section lesson's requests are byte-identical to 0.20.2.

## 0.20.2 - 2026-10-28

- Typed-question rule, from 8 real lessons: `answer` is a bare number (a percent question puts `%` in `unit`; "80%" had cost a repair request), and a question that asks for the simplest fraction must set `simplest_fraction` (one lesson asked for it but would have accepted 30/45).

## 0.20.1 - 2026-10-28

- A typed question whose `unit` is empty is read as having no unit, instead of rejecting the whole section and spending a repair request (seen in the first real lesson).

## 0.20.0 - 2026-10-28

- Later sections may end with up to two typed numeric questions (`answer_activities`): the learner types a whole number, decimal, fraction or mixed number after the lesson and the program checks it, so topics without a draggable visual can be practised and lit on the star map. The model writes both the answer and plain arithmetic for it (`check`); a question whose answer differs from its arithmetic is rejected. The first playable request is unchanged. Requires OLL player 0.5.0 (`student-tasks:numeric_answer`).

## 0.19.0 - 2026-10-28

- The three complete-lesson actions accept an optional `teacher_experiences`: a few facts from the preset teacher's own everyday life. The teacher may mention one, in a sentence or two and only when it makes the concept concrete, then use it as the setting for the example; most lessons mention none, and no new life facts may be invented. Requests without it keep their exact prompts.

## 0.18.0 - 2026-10-28

- The three complete-lesson actions accept an optional `current_lesson`: the host's summary of what the same board just taught (titles, sections, thinking questions with reference answers, practice). With it, a follow-up such as "I don't get the reflection question" is taught directly instead of being asked to describe itself again; requests without it keep their exact prompts.

## 0.17.1 - 2026-10-26

- Narration, practice prompts, hints and success messages show a lesson number's own symbol instead of a formula placeholder such as `n1`.
- Practice invitations say "调回" only for a value the slider really had; later practice text is computed from the state left by earlier practice.
- A requested interaction the visuals cannot draw (such as a freely draggable triangle) is replaced with a drawable visual and explained, instead of declining the whole lesson; `unsupported` is kept for mathematics that cannot be shown correctly.

## 0.14.1 - 2026-09-08

- Declared the selection delivery mode accepted by the whiteboard action.
- Updated the OLL runtime contract for wheel input through auxiliary cards.

## 0.14.0 - 2026-08-29

- Replaced model-owned low-level lesson identity with the deterministic Lesson Plan compiler and capability registry.
- Added combined outline/first-section bootstrap, progressive playable prefixes, partial-response salvage, and per-section repair.
- Added Vertex, Gemini API, and Ark provider routing with delayed hedging and loser cancellation.
- Added camera observation reuse and end-to-end client timing diagnostics.
- Standardized generation progress as `octos.learn.trace.v1`, including live first-chunk, validated-outline, provider winner, hedge, token, prefix, and completion milestones.
