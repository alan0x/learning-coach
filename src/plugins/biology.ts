// Biology: cells, heredity and evolution, ecosystems, the human body, plants and animals.
// Subject plugin (decision 0012) with no recipes yet: it exists so that Jev can
// choose the subject (subject plan P2). It adds nothing to model requests.
import { BIOLOGY_PLUGIN_MANIFEST, BIOLOGY_SUBJECT_DESCRIPTION } from "octos-lesson-language/plugin-biology";
import type { CoachSubjectPlugin } from "./types.js";

export const BIOLOGY_PLUGIN = {
  // The manifest and the Jev subject line are the OLL shared layer's.
  manifest: BIOLOGY_PLUGIN_MANIFEST,
  subject: { description: BIOLOGY_SUBJECT_DESCRIPTION },
  recipes: {},
  schema_properties: {},
  prompt_rules: {},
} as const satisfies CoachSubjectPlugin;
