import { compileMathExpression } from "octos-lesson-language";

export interface Scene3dRange {
  min: number;
  max: number;
}

export interface ImplicitSurfaceDomain {
  x: Scene3dRange;
  y: Scene3dRange;
  z?: Scene3dRange;
}

export interface ImplicitSurfaceObject {
  as: string;
  kind: "implicit_surface";
  expression: string;
  level: number;
  x_range: Scene3dRange;
  y_range: Scene3dRange;
  z_range: Scene3dRange;
  samples: number;
  color: string;
  label?: string;
}

type SurfaceSampleStatus = "absent" | "clipped" | "contained";

const DOMAIN_CANDIDATE_HALF_SPANS = [2, 5, 10, 20, 50, 100] as const;
const DOMAIN_REFINEMENT_STEPS = 12;
const DOMAIN_MARGIN = 1.1;

function expressionUsesVariable(expression: string, variable: "x" | "y" | "z"): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_])${variable}([^A-Za-z0-9_]|$)`, "u").test(expression);
}

function sampleImplicitSurfaceStatus(
  evaluate: ReturnType<typeof compileMathExpression>,
  variables: readonly ["x", "y"] | readonly ["x", "y", "z"],
  level: number,
  halfSpan: number,
  dependentVariables: ReadonlySet<string>,
): SurfaceSampleStatus {
  const resolution = variables.length === 2 ? 18 : 10;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  const boundaryRanges = new Map<string, { minimum: number; maximum: number }>();
  for (const variable of dependentVariables) {
    boundaryRanges.set(`${variable}:min`, { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY });
    boundaryRanges.set(`${variable}:max`, { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY });
  }
  const observe = (value: number, coordinates: Record<string, number>): void => {
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) return;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    for (const variable of dependentVariables) {
      const coordinate = coordinates[variable];
      const side = Math.abs((coordinate ?? 0) + halfSpan) < 1e-9
        ? "min"
        : Math.abs((coordinate ?? 0) - halfSpan) < 1e-9
          ? "max"
          : undefined;
      if (!side) continue;
      const range = boundaryRanges.get(`${variable}:${side}`)!;
      range.minimum = Math.min(range.minimum, value);
      range.maximum = Math.max(range.maximum, value);
    }
  };

  for (let xIndex = 0; xIndex <= resolution; xIndex += 1) {
    const x = -halfSpan + 2 * halfSpan * xIndex / resolution;
    for (let yIndex = 0; yIndex <= resolution; yIndex += 1) {
      const y = -halfSpan + 2 * halfSpan * yIndex / resolution;
      const zIterations = variables.length === 3 ? resolution : 0;
      for (let zIndex = 0; zIndex <= zIterations; zIndex += 1) {
        const z = variables.length === 3
          ? -halfSpan + 2 * halfSpan * zIndex / resolution
          : 0;
        const coordinates = variables.length === 3 ? { x, y, z } : { x, y };
        try {
          observe(evaluate(coordinates), coordinates);
        } catch {
          // Isolated singularities do not invalidate the surrounding viewport.
        }
      }
    }
  }

  if (!(minimum <= level && maximum >= level)) return "absent";
  const crossesBoundary = [...boundaryRanges.values()].some((range) => (
    range.minimum <= level && range.maximum >= level
  ));
  return crossesBoundary ? "clipped" : "contained";
}

export function implicitSurfaceDomain(
  expression: string,
  variables: readonly ["x", "y"] | readonly ["x", "y", "z"],
  level: number,
): ImplicitSurfaceDomain {
  if (!Number.isFinite(level)) throw new Error("Implicit surface level must be finite");
  const evaluate = compileMathExpression(expression, [...variables]);
  const dependentVariables = new Set(variables.filter((variable) => (
    expressionUsesVariable(expression, variable)
  )));
  let firstVisibleHalfSpan: number | undefined;
  let previousHalfSpan = 0;
  for (const candidateHalfSpan of DOMAIN_CANDIDATE_HALF_SPANS) {
    const status = sampleImplicitSurfaceStatus(
      evaluate,
      variables,
      level,
      candidateHalfSpan,
      dependentVariables,
    );
    if (status !== "absent" && firstVisibleHalfSpan === undefined) {
      firstVisibleHalfSpan = candidateHalfSpan;
    }
    if (status === "contained") {
      let lower = previousHalfSpan;
      let upper = candidateHalfSpan;
      for (let step = 0; step < DOMAIN_REFINEMENT_STEPS; step += 1) {
        const middle = (lower + upper) / 2;
        const middleStatus = sampleImplicitSurfaceStatus(
          evaluate,
          variables,
          level,
          middle,
          dependentVariables,
        );
        if (middleStatus === "contained") upper = middle;
        else lower = middle;
      }
      // Preserve the existing readable minimum window for small surfaces while
      // expanding larger bounded surfaces far enough to avoid clipping.
      const dependentHalfSpan = Math.max(2, upper * DOMAIN_MARGIN);
      const rangeFor = (variable: "x" | "y" | "z"): Scene3dRange => {
        const halfSpan = dependentVariables.has(variable)
          ? dependentHalfSpan
          : Math.max(2, dependentHalfSpan);
        return { min: -halfSpan, max: halfSpan };
      };
      return {
        x: rangeFor("x"),
        y: rangeFor("y"),
        ...(variables.length === 3 ? { z: rangeFor("z") } : {}),
      };
    }
    previousHalfSpan = candidateHalfSpan;
  }
  if (firstVisibleHalfSpan !== undefined) {
    // Open surfaces intersect every finite boundary. Preserve a practical
    // observation window instead of expanding them until they become tiny.
    const range = { min: -firstVisibleHalfSpan, max: firstVisibleHalfSpan };
    return { x: range, y: range, ...(variables.length === 3 ? { z: range } : {}) };
  }
  throw new Error("Implicit surface level is outside the program-selected viewport");
}

export function buildImplicitSurfaceObject(input: {
  as: string;
  expression: string;
  level: number;
  samples?: number;
  color?: string;
  label?: string;
}): ImplicitSurfaceObject {
  const expression = input.expression.trim();
  if (!expression) throw new Error("Implicit surface expression must not be empty");
  const domain = implicitSurfaceDomain(expression, ["x", "y", "z"], input.level);
  if (!domain.z) throw new Error("Implicit surface requires a three-dimensional viewport");
  const samples = input.samples ?? 12;
  if (!Number.isInteger(samples) || samples < 4 || samples > 24) {
    throw new Error("Implicit surface samples must be an integer from 4 to 24");
  }
  return {
    as: input.as,
    kind: "implicit_surface",
    expression,
    level: input.level,
    x_range: domain.x,
    y_range: domain.y,
    z_range: domain.z,
    samples,
    color: input.color ?? "teal",
    ...(input.label ? { label: input.label } : {}),
  };
}
