# Function plot view planner

Coach chooses each function plot's published coordinate window in `src/plot-view-planner.ts`. The OLL player then decides how large to draw it. The planner is deterministic: model output contributes hints only, and the same lesson always gets the same view. The owner approved this design on 2026-11-10.

## What the planner does

1. **Analyses every curve state the creation section shows.** This covers the initial state, animation endpoints, restarts and `number_target` practice values. For each state it finds:
   - roots, local extrema and the y-intercept
   - vertical asymptotes, confirmed by growth under refinement, and removable holes
   - domain edges, with a value only when the curve approaches the edge boundedly
   - intersections between curves
   - periods of affine `sin`, `cos` and `tan` arguments
2. **Keeps the most important cluster of features.** Features more than 10 units apart form separate clusters. The cluster holding the marked points wins; otherwise the one with the most weight (extrema, then roots, poles and intersections, then intercepts). Left-out features are logged as `distant_features_left_out`. Oscillating curves keep their nine features nearest the focus.
3. **Builds the x window:**
   - Quadratics use their roots plus a shape window of ±√(9/|a|) around the vertex, clamped to 1–6 units.
   - Periodic curves use ±1 period around the focus.
   - Curves with two or more turning points use those features plus 25% on each side.
   - Everything else gets at least 8 units, centred on 0 when it is close.
   - The window never widens into an undefined region.
4. **Starts quantity axes at zero.** When the x axis has a quantity label, the curves are defined just right of 0, and nothing marked lies left of it, x starts at 0. With a single feature (usually a start value), the window extends until the quantity has changed by twice its starting size.
5. **Builds the y window:**
   - Quadratics use their own shape window.
   - Turning curves are framed by their features plus 50%, and their steep arms may leave the frame.
   - Other curves are sampled across the window, skipping pole and unbounded-edge neighbourhoods.
   - Marked points are always included.
6. **Treats slider extremes as optional.** Both ends of a slider join the view together, and only when x and y each grow by at most 1.5×. Optional sample positions follow the same rule. Points that stay outside get an edge marker in the player.
7. **Checks model hints.** `x_min`/`x_max`/`y_min`/`y_max` are accepted only when they keep the marked points and the curve's features and the curve fills a reasonable share of the frame. Otherwise they are replaced, logged as a `plot_view_adjusted` program adjustment (`model_x_range_replaced`, `model_y_range_replaced`), and the section is not failed.
8. **Finishes the frame:**
   - Pulls in an axis when 0 is within half a span.
   - Pads by 8%.
   - Snaps to a fine readable step, or to π/2 on π-tick axes.
9. **Chooses the scale mode.** Equal units (`equal_scale` with `layout: "adaptive"`) apply to inverse comparisons with `y = x`, which also share one square window, and to circles and arcs, perpendicular lines, and quadratics whose framed aspect is between 1:2 and 2:1. Everything else uses independent scales. Radian trigonometric plots with periods that are quarter multiples of π get `axes.x.ticks: "pi"`.

Holes inside the frame are published as `curves[].holes`. Legends for static and parameterized curves use the same textbook formatter (`3x²`, `−4.9x² + 20x`, `(x − 1)(x + 2)`, `√x`, `|x|`, `log₁₀(x)`). `log10`, `lg` and `log2` are accepted and evaluated through `ln`. Plain `log` remains the natural logarithm, as in OLL.

## Verification

- `test/plot-view-planner.test.mjs` runs the 60 situations in `test/plot-view-cases.mjs`. It asserts:
  - every case compiles
  - the curve fills a readable share of the frame
  - marked points and animation endpoints are visible with clearance
  - key features are visible
  - quantity axes start at zero
  - unshown slider extremes don't flatten the curve
  - equal units appear only where geometry is the content
  - π ticks, the handling of model ranges, holes and legends behave as specified
  - the planner is deterministic
- Request digests are unchanged. The lesson digests of the four function-plot fixtures changed.
