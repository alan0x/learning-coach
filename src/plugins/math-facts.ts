// Section facts of the math plugin: what a later section is told about a
// math visual already planned or on the board.
import { REARRANGEMENT_FACTS, REARRANGEMENT_MODEL_GUIDANCE, type RearrangementConstruction } from "../rearrangement.js";
import { fixedLineSamples } from "../teaching-contracts.js";
import type { SectionFactsHook } from "./section-facts.js";

export const MATH_SECTION_FACTS: Record<string, SectionFactsHook> = {
  function_plot: ({ established }) => (established && fixedLineSamples(established) ? { lead: { sample_slope: "constant" } } : {}),
  geometric_rearrangement: ({ mode, established, numbers, state }) => {
    let facts: Record<string, unknown> = {};
    if (established) {
      const construction = (established.parameters?.construction ?? "right_triangle_square") as RearrangementConstruction;
      const definition = REARRANGEMENT_FACTS[construction];
      const number = established.numbers?.[0];
      const range = number ? numbers?.[number - 1] : undefined;
      facts = definition ? {
        construction, pieces: definition.pieces, shows: definition.shows,
        container: definition.container, at_start: definition.initial, at_end: definition.final,
        fixed_legs: { a: established.parameters?.leg_a ?? 3, b: established.parameters?.leg_b ?? 2 },
        ...(range && number ? { progress: { number, current_value: state.get(number),
          normalized: ((state.get(number) ?? range.initial) - range.min) / (range.max - range.min) } } : {}),
      } : {};
    }
    return { facts: { ...facts, ...(mode === "create" ? { construction_choices: REARRANGEMENT_MODEL_GUIDANCE } : {}) } };
  },
  circle_polygon_bounds: ({ established }) => ({
    facts: { circle_fixed: true, radius: established?.parameters?.radius ?? 2,
      side_count: { min: 3, max: 384, integer: true },
      pi_lower: "n*sin(pi/n)", pi_upper: "n*tan(pi/n)",
      n96: { lower: 3.1410319508905093, upper: 3.142714599645368 },
      caution: "Use the actual regular polygons, not circle_and_arc; displayed bounds are approximations, not exact historical rational bounds." },
  }),
};
