// Function-plot teaching situations for the view planner. Expressions use n1,
// n2, ... for lesson numbers; `samples` lists numbers that move points on a fixed curve.
const s = (label, initial, min, max) => ({ label, initial, min, max });

export const cases = [
  // Quadratics
  { id: "q-basic", group: "quadratic", expr: "x^2" },
  { id: "q-steep3", group: "quadratic", expr: "3*x^2" },
  { id: "q-steep5", group: "quadratic", expr: "5*x^2" },
  { id: "q-flat", group: "quadratic", expr: "0.1*x^2" },
  { id: "q-vertex-form", group: "quadratic", expr: "-(x+1)^2+4" },
  { id: "q-standard", group: "quadratic", expr: "x^2-6*x+5" },
  { id: "q-far-vertex", group: "quadratic", expr: "(x-12)^2+30" },
  { id: "q-family", group: "quadratic", exprs: ["x^2", "2*x^2", "0.5*x^2"] },
  { id: "q-a-slider", group: "quadratic", expr: "n1*x^2", numbers: [s("开口系数a", 1, -5, 5)], animate: [[1, 3]] },
  { id: "q-hk-slider", group: "quadratic", expr: "-(x-n1)^2+n2", numbers: [s("顶点横坐标h", -1, -5, 5), s("顶点纵坐标k", 4, -5, 10)], animate: [[1, 2]] },
  { id: "q-ahk", group: "quadratic", expr: "n1*(x-n2)^2+n3", numbers: [s("a", 1, -3, 3), s("h", 0, -4, 4), s("k", 0, -4, 4)], animate: [[1, -2]] },
  { id: "q-projectile", group: "quadratic", expr: "-4.9*x^2+20*x", x_label: "t (s)", y_label: "h (m)" },
  { id: "q-secant", group: "quadratic", expr: "-(x+1)^2+4", numbers: [s("点 A 横坐标", -1, -4, 4), s("点 B 横坐标", 4, -4, 4)], samples: [1, 2], animate: [[2, 1]] },
  { id: "q-tangent-point", group: "quadratic", expr: "x^2", numbers: [s("点 P 横坐标", 1, -3, 3)], samples: [1], animate: [[1, 2.5]] },

  // Lines
  { id: "l-basic", group: "linear", expr: "2*x+1" },
  { id: "l-kb", group: "linear", expr: "n1*x+n2", numbers: [s("斜率k", 1, -5, 5), s("截距b", 0, -10, 10)], animate: [[1, 3]] },
  { id: "l-far-intercept", group: "linear", expr: "0.5*x-100" },
  { id: "l-cost", group: "linear", expr: "12*x+50", x_label: "件数", y_label: "总价 (元)" },
  { id: "l-two-lines", group: "linear", exprs: ["2*x+1", "-x+4"] },

  // Polynomials
  { id: "p-cubic", group: "polynomial", expr: "x^3" },
  { id: "p-cubic-turns", group: "polynomial", expr: "x^3-3*x" },
  { id: "p-roots", group: "polynomial", expr: "(x-1)*(x+2)*(x-3)" },
  { id: "p-quartic", group: "polynomial", expr: "x^4-5*x^2+4" },
  { id: "p-wide-roots", group: "polynomial", expr: "(x-8)*(x+6)*x/20" },

  // Trigonometric
  { id: "t-sin", group: "trig", expr: "sin(x)" },
  { id: "t-amp-freq", group: "trig", expr: "2*sin(3*x)" },
  { id: "t-shifted", group: "trig", expr: "sin(x)+5" },
  { id: "t-sliders", group: "trig", expr: "n1*sin(n2*x+n3)", numbers: [s("振幅A", 1, 0, 4), s("角频率ω", 1, 0.5, 4), s("初相φ", 0, -3.14, 3.14)], animate: [[1, 3]] },
  { id: "t-tan", group: "trig", expr: "tan(x)" },
  { id: "t-fast", group: "trig", expr: "sin(20*x)" },
  { id: "t-sin-cos", group: "trig", exprs: ["sin(x)", "cos(x)"] },
  { id: "t-sinc", group: "trig", expr: "sin(x)/x" },
  { id: "t-degrees", group: "trig", expr: "sin(x*pi/180)", x_label: "角度 (°)" },

  // Exponential / logarithmic
  { id: "e-2x", group: "exp-log", expr: "2^x" },
  { id: "e-decay", group: "exp-log", expr: "0.5^x" },
  { id: "e-ln", group: "exp-log", expr: "ln(x)" },
  { id: "e-log10", group: "exp-log", expr: "log10(x)" },
  { id: "e-inverse", group: "exp-log", exprs: ["2^x", "ln(x)/ln(2)", "x"] },
  { id: "e-gauss", group: "exp-log", expr: "e^(-x^2)" },
  { id: "e-compound", group: "exp-log", expr: "1000*1.05^x", x_label: "年", y_label: "本息 (元)" },
  { id: "e-population", group: "exp-log", expr: "100*e^(0.3*x)", x_label: "t (h)", y_label: "N" },
  { id: "e-base-slider", group: "exp-log", expr: "n1^x", numbers: [s("底数a", 2, 0.2, 5)], animate: [[1, 0.5]] },

  // Rational / singular
  { id: "r-1x", group: "rational", expr: "1/x" },
  { id: "r-shifted", group: "rational", expr: "1/(x-2)+1" },
  { id: "r-two-poles", group: "rational", expr: "1/(x^2-1)" },
  { id: "r-removable", group: "rational", expr: "(x^2-1)/(x-1)" },
  { id: "r-k-slider", group: "rational", expr: "n1/x", numbers: [s("k", 1, -4, 4)], animate: [[1, 4]] },
  { id: "r-inverse-sq", group: "rational", expr: "1/x^2" },

  // Roots, absolute value, geometry-like
  { id: "g-sqrt", group: "roots-abs", expr: "sqrt(x)" },
  { id: "g-semicircle", group: "roots-abs", expr: "sqrt(4-x^2)" },
  { id: "g-abs", group: "roots-abs", expr: "abs(x-1)-2" },
  { id: "g-cbrt", group: "roots-abs", expr: "x^(1/3)" },

  // Scale extremes
  { id: "x-tiny", group: "scale", expr: "0.001*x^2" },
  { id: "x-huge", group: "scale", expr: "1000000*x" },
  { id: "x-small-slope", group: "scale", expr: "x/1000" },
  { id: "x-speed", group: "scale", expr: "60*x", x_label: "t (h)", y_label: "s (km)" },

  // Model-authored ranges that may be wrong or awkward
  { id: "m-wide-x", group: "llm-ranges", expr: "x^2", x_min: -100, x_max: 100 },
  { id: "m-narrow-x", group: "llm-ranges", expr: "sin(x)", x_min: 0, x_max: 0.5 },
  { id: "m-y-misses", group: "llm-ranges", expr: "x^2+10", y_min: -5, y_max: 5 },
  { id: "m-domain-miss", group: "llm-ranges", expr: "ln(x)", x_min: -10, x_max: -1 },
];
