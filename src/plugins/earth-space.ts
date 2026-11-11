// Earth and space science: weather and climate, the water cycle, rocks and landforms, the solar system.
// Subject plugin (decision 0012) with no recipes yet: it exists so that Jev can
// choose the subject (subject plan P2). It adds nothing to model requests.
import { EARTH_SPACE_PLUGIN_MANIFEST, EARTH_SPACE_SUBJECT_DESCRIPTION } from "octos-lesson-language/plugin-earth-space";
import type { CoachSubjectPlugin } from "./types.js";

export const EARTH_SPACE_PLUGIN = {
  // The manifest and the Jev subject line are the OLL shared layer's.
  manifest: EARTH_SPACE_PLUGIN_MANIFEST,
  subject: { description: EARTH_SPACE_SUBJECT_DESCRIPTION },
  recipes: {},
  schema_properties: {},
  prompt_rules: {},
} as const satisfies CoachSubjectPlugin;
