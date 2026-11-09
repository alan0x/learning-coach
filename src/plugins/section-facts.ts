import type { LessonPlanOutline, LessonPlanVisualContent } from "../lesson-plan.js";
import { MATH_SECTION_FACTS } from "./math-facts.js";

/** What Coach knows about a course visual when it writes a later section. */
export interface SectionFactsInput {
  section: number;
  mode: "create" | "reuse";
  /** The visual as created in an earlier section, when it is reused. */
  established?: LessonPlanVisualContent;
  numbers: LessonPlanOutline["numbers"];
  /** Each shared number's value when this section starts. */
  state: ReadonlyMap<number, number>;
}

/**
 * Program-computed facts a recipe adds to the section's visuals_for_section
 * entry: `lead` before the entry's own fields, `facts` after them.
 */
export interface SectionFacts {
  lead?: Record<string, unknown>;
  facts?: Record<string, unknown>;
}

export type SectionFactsHook = (input: SectionFactsInput) => SectionFacts;

/** Section-fact hooks of the installed plugins, keyed by recipe. */
export const SECTION_FACTS: Readonly<Record<string, SectionFactsHook>> = { ...MATH_SECTION_FACTS };
