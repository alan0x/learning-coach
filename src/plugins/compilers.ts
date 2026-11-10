// Recipe compilers of the installed plugins. Coach's compiler looks a recipe
// up here and never names a plugin itself.
import type { LessonPlanVisualContent } from "../lesson-plan.js";
import type { VisualCompiler } from "../recipe-kit.js";
import { MATH_COMPILERS } from "./math-compilers.js";
import { PHYSICS_COMPILERS } from "./physics-compilers.js";
import { SHARED_COMPILERS } from "./shared-compilers.js";

/** Each installed plugin's recipe compilers, keyed by plugin ID. */
export const PLUGIN_COMPILERS = { math: MATH_COMPILERS, physics: PHYSICS_COMPILERS, shared: SHARED_COMPILERS } as const;

/** Every installed recipe's compiler, keyed by recipe. */
export const VISUAL_COMPILERS = {
  ...MATH_COMPILERS,
  ...PHYSICS_COMPILERS,
  ...SHARED_COMPILERS,
} satisfies Record<LessonPlanVisualContent["capability"], VisualCompiler>;
