// The math plugin's reader for model-written function_plot formulas: infix
// text such as "2*x + n1" to Lesson Plan expression tokens.
import { LessonPlanError, type LessonPlanMathExpression } from "../lesson-plan.js";

type FormulaLexeme =
  | { kind: "number"; value: number }
  | { kind: "identifier"; value: string }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" | "^" }
  | { kind: "left" | "right" };

const formulaFunctions = new Set([
  "abs", "acos", "asin", "atan", "ceil", "cos", "exp", "floor",
  "ln", "log", "round", "sin", "sqrt", "tan",
]);

export function formulaError(path: string, message: string): never {
  throw new LessonPlanError("LESSON_PLAN_EXPRESSION", path, message);
}

const atomicBareFunctionPattern = new RegExp(
  `\\b(${[...formulaFunctions].join("|")})\\s+(-?(?:x|n\\d+|pi|e|(?:\\d+(?:\\.\\d*)?|\\.\\d+)))(?=\\s*(?:$|[+\\-*/),]))`,
  "giu",
);

const atomicSubscriptLogPattern = new RegExp(
  `\\blog_\\{?((?:\\d+(?:\\.\\d*)?|\\.\\d+))\\}?\\s+(-?(?:x|n\\d+|pi|e|(?:\\d+(?:\\.\\d*)?|\\.\\d+)))(?=\\s*(?:$|[+\\-*/),]))`,
  "giu",
);

const parenthesizedSubscriptLogPattern = new RegExp(
  `\\blog_?\\{?((?:\\d+(?:\\.\\d*)?|\\.\\d+))\\}?\\s*\\(\\s*(-?(?:x|n\\d+|pi|e|(?:\\d+(?:\\.\\d*)?|\\.\\d+)))\\s*\\)`,
  "giu",
);

function normalizeAtomicBareFunctionCalls(formula: string): string {
  // Only normalize an unambiguous, single atomic argument. Expressions such
  // as `log x^2` or `sin x y` keep failing instead of being guessed.
  return formula
    .replace(parenthesizedSubscriptLogPattern, (_match, base: string, argument: string) => {
      const numericBase = Number(base);
      if (!(numericBase > 0) || numericBase === 1) return _match;
      return `(log(${argument})/log(${base}))`;
    })
    .replace(atomicSubscriptLogPattern, (_match, base: string, argument: string) => {
      const numericBase = Number(base);
      if (!(numericBase > 0) || numericBase === 1) return _match;
      // Change of base works regardless of whether the runtime's `log` is
      // natural or base ten, and avoids adding a second log operator.
      return `(log(${argument})/log(${base}))`;
    })
    .replace(atomicBareFunctionPattern, (_match, name: string, argument: string) => (
      `${name}(${argument})`
    ));
}

function formulaLexemes(rawFormula: unknown, path: string): FormulaLexeme[] {
  if (typeof rawFormula !== "string" || !rawFormula.trim() || rawFormula.length > 256) {
    return formulaError(path, "expected a non-empty formula up to 256 characters");
  }
  let formula = normalizeAtomicBareFunctionCalls(rawFormula.trim())
    .replaceAll("−", "-")
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("π", "pi")
    .replaceAll("²", "^2")
    .replaceAll("³", "^3");
  const equals = [...formula.matchAll(/=/gu)];
  if (equals.length > 1) formulaError(path, "formula may contain at most one equals sign");
  if (equals.length === 1) {
    const index = equals[0].index ?? 0;
    const left = formula.slice(0, index).replaceAll(/\s+/gu, "").toLowerCase();
    if (left !== "y" && left !== "f(x)") {
      formulaError(path, "an optional formula left side must be y or f(x)");
    }
    formula = formula.slice(index + 1);
  }
  const compact = formula.replaceAll(/\s+/gu, "");
  const tokens: FormulaLexeme[] = [];
  for (let index = 0; index < compact.length;) {
    const rest = compact.slice(index);
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/iu.exec(rest)?.[0];
    if (number) {
      const value = Number(number);
      if (!Number.isFinite(value)) formulaError(path, `invalid number '${number}'`);
      tokens.push({ kind: "number", value });
      index += number.length;
      continue;
    }
    const identifier = /^(?:n\d+|[a-z_][a-z_]*)/iu.exec(rest)?.[0];
    if (identifier) {
      tokens.push({ kind: "identifier", value: identifier.toLowerCase() });
      index += identifier.length;
      continue;
    }
    const character = compact[index];
    if (character === "(" || character === ")") {
      tokens.push({ kind: character === "(" ? "left" : "right" });
      index += 1;
      continue;
    }
    if (character === "+" || character === "-" || character === "*" || character === "/" || character === "^") {
      tokens.push({ kind: "operator", value: character });
      index += 1;
      continue;
    }
    formulaError(path, `unsupported formula character '${character}'`);
  }
  const withImplicitMultiplication: FormulaLexeme[] = [];
  const canEndValue = (token: FormulaLexeme): boolean => (
    token.kind === "number" || token.kind === "identifier" || token.kind === "right"
  );
  const canStartValue = (token: FormulaLexeme): boolean => (
    token.kind === "number" || token.kind === "identifier" || token.kind === "left"
  );
  for (const token of tokens) {
    const previous = withImplicitMultiplication.at(-1);
    const functionCall = previous?.kind === "identifier"
      && formulaFunctions.has(previous.value)
      && token.kind === "left";
    if (previous && canEndValue(previous) && canStartValue(token) && !functionCall) {
      withImplicitMultiplication.push({ kind: "operator", value: "*" });
    }
    withImplicitMultiplication.push(token);
  }
  return withImplicitMultiplication;
}

export function parseModelFormula(rawFormula: unknown, numberCount: number, path: string): LessonPlanMathExpression {
  const lexemes = formulaLexemes(rawFormula, path);
  let position = 0;
  const peek = (): FormulaLexeme | undefined => lexemes[position];
  const take = (): FormulaLexeme | undefined => lexemes[position++];
  const binary = (
    left: LessonPlanMathExpression,
    right: LessonPlanMathExpression,
    operator: "add" | "subtract" | "multiply" | "divide" | "power",
  ): LessonPlanMathExpression => [...left, ...right, { kind: "operator", operator }];

  let parseExpression: () => LessonPlanMathExpression;
  let parseUnary: () => LessonPlanMathExpression;
  const parsePrimary = (): LessonPlanMathExpression => {
    const token = take();
    if (!token) return formulaError(path, "formula ended before a value");
    if (token.kind === "number") return [{ kind: "literal", value: token.value }];
    if (token.kind === "left") {
      const value = parseExpression();
      if (take()?.kind !== "right") formulaError(path, "formula has an unclosed parenthesis");
      return value;
    }
    if (token.kind !== "identifier") return formulaError(path, "expected a number, x, n1, constant, or function");
    if (token.value === "x") return [{ kind: "input" }];
    if (token.value === "pi" || token.value === "e") return [{ kind: "constant", name: token.value }];
    const numberMatch = /^n(\d+)$/u.exec(token.value);
    if (numberMatch) {
      const number = Number(numberMatch[1]);
      if (number < 1 || number > numberCount) {
        formulaError(path, `formula references unavailable numeric control n${number}`);
      }
      return [{ kind: "number", number }];
    }
    if (!formulaFunctions.has(token.value)) formulaError(path, `unsupported formula name '${token.value}'`);
    if (take()?.kind !== "left") formulaError(path, `function ${token.value} requires parentheses`);
    const argument = parseExpression();
    if (take()?.kind !== "right") formulaError(path, `function ${token.value} has an unclosed parenthesis`);
    return [...argument, {
      kind: "function",
      name: token.value as "abs" | "acos" | "asin" | "atan" | "ceil" | "cos" | "exp" | "floor" | "ln" | "log" | "round" | "sin" | "sqrt" | "tan",
    }];
  };
  const parsePower = (): LessonPlanMathExpression => {
    const left = parsePrimary();
    const token = peek();
    if (token?.kind === "operator" && token.value === "^") {
      take();
      return binary(left, parseUnary(), "power");
    }
    return left;
  };
  parseUnary = (): LessonPlanMathExpression => {
    const token = peek();
    if (token?.kind === "operator" && (token.value === "+" || token.value === "-")) {
      take();
      const value = parseUnary();
      return token.value === "-" ? [...value, { kind: "negate" }] : value;
    }
    return parsePower();
  };
  const parseProduct = (): LessonPlanMathExpression => {
    let value = parseUnary();
    while (true) {
      const token = peek();
      if (token?.kind !== "operator" || (token.value !== "*" && token.value !== "/")) break;
      take();
      value = binary(value, parseUnary(), token.value === "*" ? "multiply" : "divide");
    }
    return value;
  };
  parseExpression = (): LessonPlanMathExpression => {
    let value = parseProduct();
    while (true) {
      const token = peek();
      if (token?.kind !== "operator" || (token.value !== "+" && token.value !== "-")) break;
      take();
      value = binary(value, parseProduct(), token.value === "+" ? "add" : "subtract");
    }
    return value;
  };
  const result = parseExpression();
  if (position !== lexemes.length) formulaError(path, "formula contains an unexpected trailing token");
  if (!result.some((token) => token.kind === "input")) {
    formulaError(path, "a function plot formula must depend on x");
  }
  return result;
}
