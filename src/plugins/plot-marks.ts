// Function-plot derivations (OLL decision 0018): marks, domain and range bars. They live in the math
// plugin of OLL, shared with Studio (plan §7 step 3.5); this adapter hands them Coach's formula tokens,
// with each lesson number by the name its bindings use, and reports a derivation the program cannot make
// as the section-owned fault Coach has always reported (the compiler leaves that mark out).
import {
  PlotDerivationRefusal, formulaBars as pluginFormulaBars, intervalOf, markParts as pluginMarkParts, pieceBars as pluginPieceBars, signOf,
  type AxisBar, type Interval, type MarkPart, type PlotFormula, type SignCheck,
} from "octos-lesson-language/plugin-math";
import { LessonPlanError, type LessonPlanMathExpression } from "../lesson-plan.js";
import { variableAlias } from "../recipe-kit.js";

import { PLOT_MARKS, type PlotMark } from "./plot-mark-names.js";
export { PLOT_MARKS, intervalOf, signOf, type AxisBar, type Interval, type MarkPart, type PlotMark };

/** Coach's tokens as the plugin reads them: a lesson number by its binding name. */
function pluginTokens(tokens: LessonPlanMathExpression): PlotFormula {
  return tokens.map((token) => (token.kind === "number" ? { kind: "variable", name: variableAlias(token.number) } : token)) as PlotFormula;
}

function reported<T>(derive: () => T): T {
  try {
    return derive();
  } catch (error) {
    if (error instanceof PlotDerivationRefusal) throw new LessonPlanError("LESSON_PLAN_CAPABILITY_PARAMETER", error.path, error.message);
    throw error;
  }
}

/** The parts the named marks draw for a formula, or a section-owned fault naming the mark it cannot give. */
export function markParts(tokens: LessonPlanMathExpression, marks: readonly PlotMark[], labels: (source: string) => string, check: { variables: string[]; samples: Array<Record<string, number>> }, path: string): MarkPart[] {
  return reported(() => pluginMarkParts(pluginTokens(tokens), marks, labels, check, path));
}

/** The bars for `domain` and/or `range` of one formula, or a section-owned fault naming what it cannot give. */
export function formulaBars(tokens: LessonPlanMathExpression, want: { domain: boolean; range: boolean }, check: SignCheck, path: string): AxisBar[] {
  return reported(() => pluginFormulaBars(pluginTokens(tokens), want, check, path));
}

/** The domain and/or range bars of a piecewise function, or a section-owned fault. */
export function pieceBars(pieces: ReadonlyArray<{ tokens: LessonPlanMathExpression; from: number | null; to: number | null; from_closed: boolean; to_closed: boolean }>, want: { domain: boolean; range: boolean }, path: string): AxisBar[] {
  return reported(() => pluginPieceBars(pieces.map((piece) => ({ ...piece, tokens: pluginTokens(piece.tokens) })), want, path));
}
