# Mathematics capability matrix v1

This file records what the current product can execute deterministically. It is
not a list of topics that a model might be able to discuss.

Two product paths are kept separate:

- **Complete lesson**: a question submitted from the bottom composer. The model
  writes the lesson structure and teaching content; installed program code must
  compile every visual, control, animation, task, reference, and OLL action.
- **Selection assistance**: a learner selects existing handwriting or board
  content and asks for a nearby explanation or generated visual. This path does
  not create a complete lesson.

“Supported” below means that program code exists and current contract tests
exercise the result. Anything outside an explicit boundary must be reported as
unsupported; a model response alone does not make it supported.

## Current boundary

| Mathematics need | Complete lesson | Selection assistance | Deterministic implementation | Explicit boundary |
| --- | --- | --- | --- | --- |
| One-variable functions and parameter changes | **Supported** | **Supported** | `function_plot` compiles explicit `y=f(x)` curves, computes a finite viewport, can show several static curves, can move one sampled point, or can let as many as four lesson numbers change the whole curve. | Only the installed mathematical expression grammar is accepted. A parameterized curve must still contain the horizontal input. This is not a general computer-algebra or arbitrary-code plotter. |
| Two-variable implicit relations | **Not yet supported** | **Supported** | Selection assistance can render `F(x,y)=c` as an implicit plot after local expression and viewport checks. | Complete lessons do not yet have an implicit-curve capability. They must reject this visual requirement instead of silently substituting an explicit quadratic. |
| Three-dimensional functions and level sets | **Partially supported** | **Supported** | `function_surface_with_section` compiles `z=f(x,y)`, orbit/zoom interaction, an axis-aligned `x`, `y`, or `z` section plane, and its actual intersection. Selection assistance also supports explicit surfaces and implicit `F(x,y,z)=c` surfaces. | Complete lessons do not yet support general implicit surfaces, parametric surfaces, vector fields, or arbitrary section planes. Surface expressions and sampled ranges must remain finite. |
| Unit circle and trigonometric functions | **Supported within a fixed boundary** | Explanation or a single generated plot only | `unit_circle_projection` binds one angle to a unit-circle point, radius, projection line, and the matching sine or cosine curve. The slider and draggable circle point update the same number. | The linked visual supports sine or cosine. Tangent, secant, inverse functions, identities involving several angles, and non-unit circles need another validated program. |
| Circles, radii, central angles, and arcs | **Supported within a fixed boundary** | Explanation only | `circle_and_arc` binds angle and positive radius to a circle, moving point, radius, and arc. `coordinate_circle` renders a circle with a fixed center and optional radius control. | General Euclidean constructions such as chords, tangents, inscribed angles, intersecting circles, and theorem-specific dependencies are not implemented. |
| Plane-geometry construction and rearrangement | **Supported for three installed constructions** | Explanation only | `geometric_rearrangement` performs rigid-piece interpolation and preserves every piece shape for `right_triangle_square`, `square_area_identity`, and `triangle_to_rectangle`. | It is not an arbitrary polygon-construction engine. A new proof or rearrangement requires a new validated recipe and invariant tests; the model cannot invent point bindings. |
| Solid geometry and sections | **Supported for a cube** | Explanation or a separately generated 3D function visual | `cube_with_section` renders a rotatable edge-length-2 cube, labeled vertex/edge/face, and a movable horizontal section with a program-owned range. | Other polyhedra, spheres, cylinders, oblique planes, nets, and measurements are not complete-lesson capabilities yet. |
| Algebraic derivation | **Display and lesson sequencing are supported; proof verification is not** | **Explanation is supported** | Complete lessons can create Math/Text/Note/Table cards, return to earlier cards, narrate several sections, emphasize steps, and attach student tasks. | Program code currently validates expression syntax and lesson structure, not algebraic equivalence between every adjacent derivation step. A model-written derivation must not be described as symbolically verified. |
| Complete multi-section mathematics lessons | **Supported** | Not applicable | Lesson Plan provides an ordered outline, progressive sections, reusable references by numeric position, narration, board actions, animation, student control, tasks, and final focus. Program code assigns business IDs, placements, and OLL references. | A complete lesson can only use the executable visual boundaries above. Unsupported requested parts must be identified explicitly; prose cannot disguise a missing visual or interaction. |

## Existing programs outside the first mathematics package

- `spring_and_mass` is a working physics-oriented program. It remains in the
  current product but is not evidence that a general physics capability package
  exists. Its executable variables currently cover phase, displacement, and a
  linked cosine curve—not arbitrary mass, damping, stiffness, or forcing.
- `process_diagram` is a cross-subject ordered-step diagram. It has no numeric
  control and is not a mathematical calculation engine.

## Evidence that already exists

The current automated suite verifies, among other things:

- every registered program has a fixed Lesson Plan sample and compiles through
  the full OLL validation pipeline;
- a declared control must change a compiled visual;
- function parameters change the whole curve when the mathematical structure
  says they do, while a sampled-point control only moves the point;
- two-parameter curve translation is checked across 200 deterministic random
  parameter combinations, including its vertex and symmetry invariants;
- one function card renders several static explicit curves, accepts the
  declared maximum of four curve parameters, and rejects a fifth parameter;
- axes and numeric ranges are computed or normalized by program code;
- the circle/arc, unit-circle, spring, cube-section, and surface-section
  controls remain inside their executable ranges;
- each installed geometric rearrangement preserves all rigid side lengths at
  every tested progress value;
- later sections reuse earlier visuals by program-assigned positions rather
  than model-authored names;
- unsupported lesson parts stop before publication.

These tests establish the execution boundary. They do not establish broad
curriculum coverage or teaching quality.

The first isolated Gemini 3.6 Flash checks on 2026-08-23 also exercised the
same production Lesson Plan path rather than a hand-written fixture:

- a two-control parabola changed one whole curve with both lesson numbers and
  produced its first playable section in 11.5 seconds;
- a request to compare `x`, `x^2`, and `sin(x)` initially exposed that the
  model-facing course format only accepted one formula even though the compiler
  supported several. The format now accepts one to eight explicit formulas,
  parses every formula locally, and the unchanged request produced three curves
  in one plot in 12.7 seconds;
- a cubic sampled-point request produced one numeric control with both point
  coordinates bound to it in 9.8 seconds.

These are single-run capability checks, not latency or reliability statistics.

A following three-run batch checked the same requests again:

- the two-control parabola passed 3/3 without repair; first playable p50 was
  10.0 seconds and the slowest run was 11.3 seconds;
- the cubic sampled point passed 3/3 without repair; first playable p50 was
  10.5 seconds and the slowest run was 12.1 seconds;
- the three-curve comparison eventually passed 3/3, but first playable results
  were about 11, 39, and 86 seconds. One run retried only a truncated bootstrap
  response. Another discarded an outline-external speculative visual, then
  repaired invalid first-section activities without regenerating the course
  outline. These recovery rules contain no function names or subject-specific
  cases and add no request to the normal successful path.

The reliability investigation then repeated several different static
multi-curve lessons: polynomial comparison, trigonometric comparison, shifted
parabolas, and absolute-value comparison. Across the recorded batches, 21
courses completed and every successful course produced at least three curves
in one plot with no invented numeric control. One earlier request failed when
Vertex returned HTTP 200 with `finishReason=RECITATION` but no JSON. That
provider response is now classified as an unusable combined response and
enters the same bounded small-response fallback as truncation and timeout. Two
post-fix repeats of the previously failing shifted-parabola case both completed
in 8.7 and 21.4 seconds.

The investigation also established a program/model responsibility boundary:

- the model chooses the lesson outline, narration, formulas, comparisons, and
  teaching intent;
- program code assigns identity and references, parses formulas, removes exact
  duplicate curves, aligns or derives labels, removes controls and tasks that
  cannot affect a visual, computes axes and sampling, and compiles OLL;
- synonymous or stale expression fields are collapsed into one canonical
  representation instead of causing a full lesson retry;
- a combined outline-and-first-section response is limited to 4,096 output
  tokens and 30 seconds. If it is truncated, times out, contains no JSON, or has
  an invalid outline, the program asks for the smaller outline and exact first
  section separately. It does not repeat the same broad request;
- the total budget for obtaining the first playable section is 60 seconds, so
  fallback requests cannot extend the wait indefinitely;
- if a formula is genuinely missing, the program does not invent mathematics.
  It preserves the valid outline and regenerates only the affected section
  under its exact capability schema.

The normal successful path is still one model request. These rules do not use
function names or test-question branches. They improve bounded recovery, but
they do not remove Vertex latency variation. The sample is too small for a
production p50/p95 claim, and `/learn` E2E remains required before the complete
one-variable-function row is marked accepted.

## Rule for changing this matrix

A row can be widened only when the same change includes:

1. a small model-facing description of the new teaching choice;
2. program-owned input normalization and OLL compilation;
3. positive contract tests and negative boundary tests;
4. random-parameter tests for numerical or geometric invariants where relevant;
5. a real-model generation test and a `/learn` E2E case;
6. an update to this file describing the new boundary in plain language.

Adding prompt text, accepting a new model field, or rendering one successful
example is not enough to claim a new capability.
