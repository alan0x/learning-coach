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

A following three-run batch checked the same requests again. The two-control
parabola and cubic sampled-point courses each passed 3/3 with first-playable
times around 10–12 seconds. The three-curve comparison also completed 3/3, but
its first-playable times varied from about 11 to 86 seconds. These measurements
are historical observations of provider variation, not a reliability or
latency guarantee.

The static multi-curve addition is intentionally narrow: one `function_plot`
may contain one to eight explicit one-variable formulas for comparison. The
program parses every formula, removes exact duplicates, derives or aligns
labels, computes the viewport, and does not invent a numeric control for a
static comparison. This does not claim a general plotting language or add a
new subject package.

The current responsibility boundary is:

- the model chooses the course outline, narration, formulas, comparisons, and
  teaching intent;
- the accepted course outline is the only authority for which persistent
  visuals and reusable board items a section must create;
- the first model response contains only the course outline. It cannot include
  narration or board cards;
- after the outline passes validation, section 1 is generated through the same
  exact, outline-derived schema and validator used for every later section;
- because that exact schema contains only the visuals and reusable board items
  declared by the accepted outline, section 1 cannot add an unrelated visual
  or silently omit a required one;
- ordinary non-reusable Math and Note cards remain ordinary section content.
  They are not deleted merely because the outline did not reserve them for
  later reuse;
- program code assigns identity and references, parses formulas, removes exact
  duplicate curves, collapses equivalent formula fields, removes controls and
  tasks that cannot affect a visual, computes axes and sampling, and compiles
  OLL;
- if a required mathematical expression is genuinely missing, the program
  does not invent it and does not weaken the outline. The affected section must
  be generated correctly before publication.

The normal successful first-playable path now uses one small outline request
followed by one exact section-1 request. This adds a model round trip, but avoids
the former large response that mixed admission, the whole-course outline, and
the first section. The first request is now smaller and section 1 cannot be
generated against an outline that has not yet passed validation.
Lesson authoring no longer adds its own 4,096-token cap, 30/60-second deadlines,
or a second broad-request fallback for truncated, empty, or timed-out provider
responses. Generic model transport configuration owns request limits and
transport retries. Local semantic validation still rejects an invalid outline
or section and can regenerate the exact invalid part with its validation error.

The automated suite covers outline authority, exact first-section structure,
static multi-curve compilation, and provider failure non-repetition. `/learn`
E2E is still required before treating the inserted multi-curve capability as
accepted for a release.

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
