# Changelog

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
