// Rearrangement constructions live in the math plugin's shared layer
// (octos-lesson-language/plugin-math). The model's compact catalog of them is
// Coach's generation layer.
import { REARRANGEMENT_CONSTRUCTIONS } from "octos-lesson-language/plugin-math";

export {
  REARRANGEMENT_CONSTRUCTIONS, REARRANGEMENT_FACTS, rearrangementRecipe,
  type RearrangementConstruction, type RearrangementRecipe, type RigidPose,
} from "octos-lesson-language/plugin-math";

/** Short catalog text, derived from the same endpoint facts used by the renderer. */
export const REARRANGEMENT_MODEL_GUIDANCE = "重排进度，不改边长；" + Object.entries(REARRANGEMENT_CONSTRUCTIONS)
  .map(([name, facts]) => `${name}：${facts.catalog}`).join("；") + "。面积只比较端点。";
