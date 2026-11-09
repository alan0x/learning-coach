/**
 * A prompt bullet that installed plugins fill. Each plugin contributes its own
 * sentences; Coach joins them in plugin order after the bullet's core text and
 * leaves the bullet out when nothing is left to say.
 */
export type PromptSlot =
  | "outline.visual_choice"
  | "section.formulas"
  | "section.bounds"
  | "section.linked_numbers"
  | "section.constructions";

/** Coach's view of a subject plugin (OLL decision 0012, draft). */
export interface CoachSubjectPlugin {
  manifest: { id: string; version: string; depends: Readonly<Record<string, string>> };
  /** One line for the Jev subject question. The shared plugin has none. */
  subject?: { description: Readonly<Record<string, string>> };
  /** Recipe registry entries this plugin owns, keyed by capability name. */
  recipes: Readonly<Record<string, unknown>>;
  prompt_rules: Readonly<Partial<Record<PromptSlot, string>>>;
}
