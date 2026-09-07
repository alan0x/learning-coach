import { compileMathExpression } from "octos-lesson-language";

export type SelectionPlotFailureCode =
  | "unreadable_expression"
  | "unsupported_variables"
  | "unsupported_representation"
  | "unsafe_complexity";

export type SelectionPlotRoute =
  | { kind: "plot"; expression: string }
  | { kind: "implicit_plot"; expression: string; level: number }
  | { kind: "surface"; expression: string }
  | { kind: "implicit_surface"; expression: string; level: number }
  | {
      kind: "unsupported";
      reasonCode: SelectionPlotFailureCode;
      reason: string;
      alternatives: string[];
    };

const MATH_FUNCTION_NAMES: ReadonlySet<string> = new Set([
  "abs", "acos", "asin", "atan", "ceil", "cos", "exp", "floor",
  "ln", "log", "round", "sin", "sqrt", "tan",
]);
const MATH_CONSTANT_NAMES: ReadonlySet<string> = new Set(["pi", "e"]);
const PLOT_VARIABLES = ["x", "y", "z"] as const;
type PlotVariable = (typeof PLOT_VARIABLES)[number];

class SelectionPlotFormError extends Error {
  constructor(
    readonly reasonCode: SelectionPlotFailureCode,
    message: string,
    readonly alternatives: string[],
  ) {
    super(message);
  }
}

// Identifiers preceded by a digit or dot belong to numeric literals (2e3).
function scanIdentifiers(expression: string): string[] {
  return [...expression.matchAll(/(?<![a-z0-9_.])[a-z][a-z0-9_]*/giu)]
    .map((match) => match[0].toLowerCase());
}

function usedPlotVariables(identifiers: readonly string[]): PlotVariable[] {
  return PLOT_VARIABLES.filter((variable) => identifiers.includes(variable));
}

function compileUniverse(variables: readonly PlotVariable[]): string[] {
  const highest = variables.reduce(
    (maximum, variable) => Math.max(maximum, PLOT_VARIABLES.indexOf(variable)),
    0,
  );
  return PLOT_VARIABLES.slice(0, highest + 1);
}

// The whitelist grammar has no comparison operators, so every "=" is a
// top-level equation separator and a mechanical split is safe.
function implicitDifference(lhs: string, rhs: string): string {
  if (/^\d+(?:\.\d+)?$/u.test(rhs)) {
    return Number(rhs) === 0 ? lhs : `${lhs}-${rhs}`;
  }
  return `(${lhs})-(${rhs})`;
}

function analyzeSelectionPlotForm(source: string): SelectionPlotRoute {
  const parts = source.split("=").map((part) => part.trim());
  if (parts.length > 2) {
    throw new SelectionPlotFormError(
      "unsupported_representation",
      "等式包含多个等号，无法确定唯一的等量关系",
      ["框选只含一个等号的完整公式后重试"],
    );
  }
  if (parts.some((part) => !part)) {
    throw new SelectionPlotFormError(
      "unsupported_representation",
      "等号两侧都需要有表达式",
      ["确认框选范围包含等号两侧的完整公式"],
    );
  }
  const identifiers = parts.flatMap(scanIdentifiers);
  const unknown = [...new Set(identifiers.filter((name) => (
    !MATH_FUNCTION_NAMES.has(name)
    && !MATH_CONSTANT_NAMES.has(name)
    && !(PLOT_VARIABLES as readonly string[]).includes(name)
  )))];
  if (unknown.length > 0) {
    throw new SelectionPlotFormError(
      "unsupported_variables",
      `表达式包含不支持的变量或函数 ${unknown.map((name) => `「${name}」`).join("、")}，当前只支持 x、y、z 三个变量`,
      [
        "把不支持的变量替换为具体数值后重试",
        "多余变量可固定取值后改写为 F(x,y,z)=0 的隐式形式",
      ],
    );
  }
  const variables = usedPlotVariables(identifiers);
  const universe = compileUniverse(variables);
  for (const part of parts) {
    try {
      compileMathExpression(part, universe);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SelectionPlotFormError(
        "unsupported_representation",
        `表达式「${part}」无法安全解析：${message}`,
        [
          "确认框选范围只包含一个完整公式",
          "可改写为 y=f(x)、z=f(x,y) 或 F(x,y,z)=0 的形式后重试",
        ],
      );
    }
  }
  const usesZ = variables.includes("z");
  if (parts.length === 2) {
    const [lhs, rhs] = parts as [string, string];
    const lhsVariables = usedPlotVariables(scanIdentifiers(lhs));
    const rhsVariables = usedPlotVariables(scanIdentifiers(rhs));
    const without = (variable: PlotVariable) => (
      side: readonly PlotVariable[],
    ) => !side.includes(variable);
    if (lhs.toLowerCase() === "y" && without("y")(rhsVariables) && !usesZ) {
      return { kind: "plot", expression: rhs };
    }
    if (rhs.toLowerCase() === "y" && without("y")(lhsVariables) && !usesZ) {
      return { kind: "plot", expression: lhs };
    }
    if (lhs.toLowerCase() === "z" && without("z")(rhsVariables)) {
      return { kind: "surface", expression: rhs };
    }
    if (rhs.toLowerCase() === "z" && without("z")(lhsVariables)) {
      return { kind: "surface", expression: lhs };
    }
    const difference = implicitDifference(lhs, rhs);
    return usesZ
      ? { kind: "implicit_surface", expression: difference, level: 0 }
      : { kind: "implicit_plot", expression: difference, level: 0 };
  }
  if (usesZ) {
    return { kind: "implicit_surface", expression: parts[0]!, level: 0 };
  }
  if (variables.includes("y")) {
    return { kind: "surface", expression: parts[0]! };
  }
  return { kind: "plot", expression: parts[0]! };
}

/**
 * Deterministically route a selection visualization to a plot kind. Sources
 * are tried in order: the reusable recognition (the full equation as written)
 * first, the model's expression only as a fallback candidate. The first
 * analyzable source wins; if none can be drawn, the failure of the primary
 * source becomes the unsupported reason.
 */
export function routeSelectionPlot(
  sources: readonly (string | undefined)[],
): SelectionPlotRoute {
  const seen = new Set<string>();
  let firstFailure: SelectionPlotFormError | undefined;
  for (const source of sources) {
    const trimmed = source?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    try {
      return analyzeSelectionPlotForm(trimmed);
    } catch (error) {
      if (!(error instanceof SelectionPlotFormError)) throw error;
      firstFailure ??= error;
    }
  }
  if (firstFailure) {
    return {
      kind: "unsupported",
      reasonCode: firstFailure.reasonCode,
      reason: firstFailure.message,
      alternatives: firstFailure.alternatives,
    };
  }
  return {
    kind: "unsupported",
    reasonCode: "unreadable_expression",
    reason: "没有识别到可以绘制的数学表达式",
    alternatives: [
      "确认框选范围只包含一个完整公式",
      "使用“问小章鱼”让它解释或改写为可绘制形式",
    ],
  };
}
