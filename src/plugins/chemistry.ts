// Chemistry: matter and its structure, reactions, the periodic table, solutions, acids and bases.
// Subject plugin (decision 0012) with no recipes yet: it exists so that Jev can
// choose the subject (subject plan P2). It adds nothing to model requests.
import { CHEMISTRY_PLUGIN_MANIFEST, CHEMISTRY_SUBJECT_DESCRIPTION } from "octos-lesson-language/plugin-chemistry";
import type { CoachSubjectPlugin } from "./types.js";

export const CHEMISTRY_PLUGIN = {
  // The manifest and the Jev subject line are the OLL shared layer's.
  manifest: CHEMISTRY_PLUGIN_MANIFEST,
  subject: { description: CHEMISTRY_SUBJECT_DESCRIPTION },
  recipes: {},
  schema_properties: {},
  prompt_rules: {},
} as const satisfies CoachSubjectPlugin;
