# Changelog

## Unreleased

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
