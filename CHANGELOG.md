# Changelog

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
