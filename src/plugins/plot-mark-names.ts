// The marks a function plot can draw (OLL decision 0018 §1). Kept free of imports: the math plugin's
// schema reads it as the plugin loads, before the compilers' modules (plot-marks.ts) are ready.
export const PLOT_MARKS = ["intercepts", "vertex", "symmetry_axis", "slope_triangle", "domain", "range"] as const;
export type PlotMark = typeof PLOT_MARKS[number];
