# Mathematics capability matrix v1

Last reconciled: 2026-08-31, against learning-coach main `2ca174c`.
This is an implementation-boundary document, not a separately extracted
mathematics package or a new test run.

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
| One-variable functions and parameter changes | **Supported within a fixed boundary** | **Supported for generated plots** | `function_plot` supports one to eight static explicit `y=f(x)` curves; a single curve may instead have a sampled-point control or as many as four parameters that change the whole curve. Program code computes the viewport. | Dynamic multi-curve controls are not supported. A parameterized curve must contain the horizontal input. Selection-generated plots do not inherit complete-lesson sliders or tasks. This is not a general computer-algebra or arbitrary-code plotter. |
| Two-variable implicit relations | **Not yet supported** | **Supported** | Selection assistance can render `F(x,y)=c` as an implicit plot after local expression and viewport checks. | Complete lessons do not yet have an implicit-curve capability. They must reject this visual requirement instead of silently substituting an explicit quadratic. |
| Three-dimensional functions and level sets | **Supported for explicit and implicit surfaces** | **Supported for generated surfaces** | `function_surface_with_section` compiles `z=f(x,y)`; `implicit_surface_with_section` compiles `F(x,y,z)=c` using the implicit-surface implementation shared with selection assistance. Complete lessons support orbit/zoom and a movable axis-aligned `x`, `y`, or `z` section with its actual intersection. | The safe expression grammar, finite sampling bounds and resource limits still apply. Parametric surfaces, vector fields and arbitrary oblique section planes are not supported. Selection-generated surfaces do not imply the complete lesson's section controls or tasks. |
| Unit circle and trigonometric functions | **Supported within a fixed boundary** | Explanation or a single generated plot only | `unit_circle_projection` binds one angle to a unit-circle point, radius, projection line, and the matching sine or cosine curve. The slider and draggable circle point update the same number. | The linked visual supports sine or cosine. Tangent, secant, inverse functions, identities involving several angles, and non-unit circles need another validated program. |
| Circles, radii, central angles, and arcs | **Supported within a fixed boundary** | Explanation only | `circle_and_arc` binds angle and positive radius to a circle, moving point, radius, and arc. `coordinate_circle` renders a circle with a fixed center and optional radius control. | General Euclidean constructions such as chords, tangents, inscribed angles, intersecting circles, and theorem-specific dependencies are not implemented. |
| Plane-geometry construction and rearrangement | **Supported for three installed constructions** | Explanation only | `geometric_rearrangement` performs rigid-piece interpolation and preserves every piece shape for `right_triangle_square`, `square_area_identity`, and `triangle_to_rectangle`. | It is not an arbitrary polygon-construction engine. A new proof or rearrangement requires a new validated recipe and invariant tests; the model cannot invent point bindings. |
| Solid geometry and sections | **Dedicated cube construction; implicit surfaces for spheres and cylinders** | Explanation or a separately generated 3D function visual | `cube_with_section` renders an edge-length-2 cube, labeled vertex/edge/face and movable horizontal section. Sphere and cylinder equations can use `implicit_surface_with_section`; they are not substituted with explicit paraboloids. | This is not a general solid-modeling API. Arbitrary polyhedra, oblique planes, nets and measurements are not complete-lesson capabilities. Runtime primitives alone do not establish a matching Lesson Plan capability. |
| Algebraic derivation | **Display and lesson sequencing are supported; proof verification is not** | **Explanation is supported** | Complete lessons can create Math/Text/Note/Table cards, return to earlier cards, narrate several sections, emphasize steps, and attach student tasks. | Program code currently validates expression syntax and lesson structure, not algebraic equivalence between every adjacent derivation step. A model-written derivation must not be described as symbolically verified. |
| Complete multi-section mathematics lessons | **Supported** | Not applicable | Lesson Plan provides an ordered outline, progressive sections, reusable references by numeric position, narration, board actions, animation, student control, tasks, and final focus. Program code assigns business IDs, placements, and OLL references. | A complete lesson can only use the executable visual boundaries above. Unsupported requested parts must be identified explicitly; prose cannot disguise a missing visual or interaction. |

## Other registered programs (no subject package has been extracted)

- `spring_and_mass` is a working physics-oriented program. It remains in the
  current product but is not evidence that a general physics capability package
  exists. Its executable variables currently cover phase, displacement, and a
  linked cosine curve—not arbitrary mass, damping, stiffness, or forcing.
- `process_diagram` is a cross-subject ordered-step diagram with two to eight
  steps and program-owned text/layout limits. It has no numeric control and is
  not a geometry-rearrangement or mathematical calculation engine. An invalid,
  nonessential diagram can be omitted while retaining the other lesson content.

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

## Current generation and responsibility boundary

- The model chooses the outline, narration, formulas, comparisons and teaching
  intent. It does not assign business IDs or write executable OLL.
- The normal first request returns **the outline and the first section
  together**, with admission/clarification handled in that same request.
  A camera request also supplies one frame and receives an image observation.
- Program code validates the outline first. That accepted outline is the
  authority for persistent visuals and reusable board items. The first
  section is reconciled with it before compilation; extra persistent visuals
  cannot revise the accepted outline.
- Ordinary non-reusable Math and Note cards remain ordinary section content.
  They are not deleted simply because the outline did not reserve them.
- Program code assigns identity and references, parses formulas, removes exact
  duplicate curves, aligns labels, normalizes execution parameters and compiles
  OLL. An ineffective control cannot be published as working interaction.
- If a required mathematical expression is missing, the program does not invent
  it or weaken the outline. It retains the valid outline and regenerates the
  invalid first section through an exact, outline-derived schema.
- Subsequent sections are generated sequentially using their outline-derived
  schemas and published as validated cumulative prefixes. There is no normal
  all-sections batch request.

Vertex and Gemini API use streamed bootstrap responses. Streaming does not
permit unvalidated partial JSON to reach the player. On an interrupted or
truncated response, a fully received and revalidated outline may be retained;
camera observation data can also be reused without sending the image again.
When no valid outline is available, eligible bootstrap failures can fall back
to an outline-only request. This is not the removed model-authored-OLL path,
and it does not imply every transport failure is recoverable.

A successful N-section course normally needs N course-content requests.
Local repair, transport retry and optional provider fallback/hedging may add
requests. Request limits belong to the configured transport; this document does
not prescribe the rejected course-specific 4,096-token / 30-second workaround.

The existing automated suite covers outline authority, streamed valid-prefix
reuse, exact first-section repair, static multi-curve compilation and implicit
surfaces. The user has completed later multi-curve and mathematics /learn E2E
rounds; the earlier “awaiting first E2E” status is obsolete. Neither those E2E
rounds nor this documentation reconciliation establish production reliability,
all-device coverage or a 15-second latency guarantee. No new generation tests
were run for this documentation-only update.

## Implementation sources and extraction status

- [Capability registry and policies](../src/lesson-plan.ts):
  LESSON_PLAN_CAPABILITY_REGISTRY contains ten visual programs, including
  spring physics and cross-subject process diagrams.
- [Provider-facing schemas](../src/lesson-plan-schema.ts) and
  [generation orchestration](../src/lesson-plan-generation.ts) define admission,
  combined bootstrap, outline reconciliation and per-section generation.
- [Deterministic compiler](../src/lesson-plan-compiler.ts) creates the executable
  OLL for each registered program.
- [Contract tests](../test/lesson-plan.test.mjs) exercise these boundaries.

The registry remains internal to learning-coach. Mathematics-package extraction
is paused pending the separate DSL evaluation. Extraction must move existing
behavior and tests first; it must not silently add new mathematical abilities.

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
