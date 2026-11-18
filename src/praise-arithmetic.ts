/**
 * Arithmetic claims in a model-written success message (plan §7 3.6; §10 item 5).
 *
 * A success message is shown after the learner completes a task. Nothing drawn depends on it, so under
 * decision 0020 a message whose arithmetic is false is dropped (the player then shows its neutral reaction),
 * never repaired and never sent back to the model. Only claims written wholly in numerals and operators are
 * read: `8 + 5 = 13`, `9 plus 5 is 14`, `8 乘 3 等于 24`. A claim is checked with exact fractions; a decimal
 * result counts as true when it is the exact value rounded to the digits shown (`10 / 3 = 3.33`).
 * Anything else is left alone: a letter or symbol beside a number (`2x`, `16π`, `50%`, `5²`), parentheses,
 * a chain (`8 + 2 = 10 + 3 = 13`), an approximation, a remainder, or a comparison (`is 2 more than`).
 */

type Token =
  | { kind: "num"; value: Fraction; glued: boolean; text: string }
  | { kind: "op"; op: "+" | "-" | "*" | "/"; text: string }
  | { kind: "eq"; symbol: boolean; text: string }
  | { kind: "word"; text: string }
  | { kind: "other"; text: string };

interface Fraction { n: bigint; d: bigint }

export interface PraiseArithmeticResult {
  /** "false" when any claim read is false; "true" when every claim read is true; "none" when none is read. */
  verdict: "true" | "false" | "none";
  claims: Array<{ text: string; holds: boolean }>;
}

const abs = (x: bigint) => (x < 0n ? -x : x);
const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? abs(a) : gcd(b, a % b));
function fraction(n: bigint, d: bigint): Fraction {
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
const add = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Fraction, b: Fraction) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Fraction, b: Fraction) => fraction(a.n * b.n, a.d * b.d);
const div = (a: Fraction, b: Fraction): Fraction | undefined => (b.n === 0n ? undefined : fraction(a.n * b.d, a.d * b.n));

function decimal(text: string, negative: boolean): Fraction {
  const plain = text.replace(/,/g, "");
  const [whole, part = ""] = plain.split(".");
  const n = BigInt(`${whole}${part}`) * (negative ? -1n : 1n);
  return fraction(n, 10n ** BigInt(part.length));
}

// Longest forms first, so "乘以" is not read as "乘" followed by "以".
const WORD_OPS: Array<[string, "+" | "-" | "*" | "/"]> = [
  ["multiplied by", "*"], ["divided by", "/"], ["plus", "+"], ["minus", "-"], ["times", "*"],
  ["乘以", "*"], ["除以", "/"], ["减去", "-"], ["加上", "+"], ["加", "+"], ["减", "-"], ["乘", "*"],
];
const WORD_EQS = ["is equal to", "equals", "makes", "gives", "is", "等于", "得", "是"];
const SYMBOL_OPS: Record<string, "+" | "-" | "*" | "/"> = { "+": "+", "-": "-", "−": "-", "–": "-", "×": "*", "*": "*", "·": "*", "÷": "/", "/": "/" };
/** A result followed by one of these is not the value of the expression. */
const NOT_A_RESULT = /^(more|less|fewer|greater|smaller|larger|bigger|times|than|remainder|r\b|R\d|余|多|少|倍|以上|以下)/iu;
const GLUE = /[A-Za-zα-ωπ%°²³⁰¹⁴⁵⁶⁷⁸⁹^′″]/u;
/** A token right after the result that means the result goes on (3:45) or is not exact. */
const CONTINUES = /^[≈:：]$/u;
const NUMBER = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/u;

function tokenize(text: string): Array<Token & { rest: string }> {
  const tokens: Array<Token & { rest: string }> = [];
  let i = 0;
  const previous = () => tokens[tokens.length - 1];
  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/u.test(ch)) { i += 1; continue; }
    const rest = text.slice(i);
    // A minus sign right before a digit is the number's sign unless a number or ")" comes just before it.
    const signed = /^[-−–]\d/u.test(rest) && previous()?.kind !== "num" && previous()?.text !== ")";
    const unsigned = signed ? rest.slice(1) : rest;
    // An unspaced fraction of whole numbers (3/4) is one number, as a learner reads it; "10 / 3" is a division.
    const fractionNumber = /^(\d+)\/(\d+)(?![\d.,]?\d)/u.exec(unsigned);
    const number = fractionNumber ?? NUMBER.exec(unsigned);
    if (number) {
      const length = number[0].length + (signed ? 1 : 0);
      const before = text[i - 1] ?? "";
      const after = text[i + length] ?? "";
      const value = fractionNumber
        ? div(decimal(fractionNumber[1]!, signed), decimal(fractionNumber[2]!, false))
        : decimal(number[0], signed);
      if (!value) { tokens.push({ kind: "other", text: number[0], rest: text.slice(i + length) }); i += length; continue; }
      tokens.push({ kind: "num", value, glued: GLUE.test(before) || GLUE.test(after), text: text.slice(i, i + length), rest: text.slice(i + length) });
      i += length;
      continue;
    }
    if (ch === "=" || ch === "＝") { tokens.push({ kind: "eq", symbol: true, text: ch, rest: text.slice(i + 1) }); i += 1; continue; }
    if (SYMBOL_OPS[ch]) { tokens.push({ kind: "op", op: SYMBOL_OPS[ch]!, text: ch, rest: text.slice(i + 1) }); i += 1; continue; }
    const lower = rest.toLowerCase();
    const latinBoundary = (length: number) => !/[A-Za-z]/u.test(rest[length] ?? "");
    const wordOp = WORD_OPS.find(([word]) => lower.startsWith(word) && (!/[a-z]/u.test(word[0]!) || latinBoundary(word.length)));
    if (wordOp) { tokens.push({ kind: "op", op: wordOp[1], text: wordOp[0], rest: rest.slice(wordOp[0].length) }); i += wordOp[0].length; continue; }
    const wordEq = WORD_EQS.find((word) => lower.startsWith(word) && (!/[a-z]/u.test(word[0]!) || latinBoundary(word.length)));
    if (wordEq) { tokens.push({ kind: "eq", symbol: false, text: wordEq, rest: rest.slice(wordEq.length) }); i += wordEq.length; continue; }
    const word = /^[A-Za-z]+/u.exec(rest);
    if (word) {
      // "5 x 4": a lone x between two numbers is a times sign; the caller decides from its neighbours.
      tokens.push({ kind: "word", text: word[0], rest: rest.slice(word[0].length) });
      i += word[0].length;
      continue;
    }
    tokens.push({ kind: /\p{L}/u.test(ch) ? "word" : "other", text: ch, rest: text.slice(i + 1) });
    i += 1;
  }
  return tokens;
}

/** Operator at index i, counting a lone "x" between two numbers as a times sign. */
function operatorAt(tokens: Token[], i: number): "+" | "-" | "*" | "/" | undefined {
  const token = tokens[i];
  if (token?.kind === "op") return token.op;
  if (token?.kind === "word" && token.text.toLowerCase() === "x" && tokens[i - 1]?.kind === "num" && tokens[i + 1]?.kind === "num") return "*";
  return undefined;
}

function evaluate(values: Fraction[], ops: Array<"+" | "-" | "*" | "/">): Fraction | undefined {
  // × and ÷ first, then + and − from the left.
  const terms: Fraction[] = [values[0]!];
  const signs: Array<"+" | "-"> = [];
  for (let k = 0; k < ops.length; k += 1) {
    const op = ops[k]!;
    const value = values[k + 1]!;
    if (op === "*" || op === "/") {
      const last = terms.pop()!;
      const next = op === "*" ? mul(last, value) : div(last, value);
      if (!next) return undefined;
      terms.push(next);
    } else {
      signs.push(op);
      terms.push(value);
    }
  }
  let total = terms[0]!;
  signs.forEach((sign, k) => { total = sign === "+" ? add(total, terms[k + 1]!) : sub(total, terms[k + 1]!); });
  return total;
}

/** The exact value equals the result as written, or rounds to it at the result's own decimal places. */
function holds(exact: Fraction, resultText: string, result: Fraction): boolean {
  const difference = sub(exact, result);
  if (difference.n === 0n) return true;
  const places = (/\.(\d+)/u.exec(resultText)?.[1] ?? "").length;
  if (places === 0) return false;
  // |exact − result| ≤ ½ · 10^−places, compared exactly.
  return abs(difference.n) * 2n * 10n ** BigInt(places) <= difference.d;
}

export function praiseArithmetic(text: string): PraiseArithmeticResult {
  const tokens = tokenize(text ?? "");
  const claims: PraiseArithmeticResult["claims"] = [];
  tokens.forEach((token, e) => {
    if (token.kind !== "eq") return;
    // Right side: one number, not glued to a symbol, and not continued by an operator, "=", another number
    // (the 1/2 of 1 1/2), a colon (3:45) or a comparison.
    const result = tokens[e + 1];
    if (result?.kind !== "num" || result.glued) return;
    const after = tokens[e + 2];
    if (after && (operatorAt(tokens, e + 2) || after.kind === "num" || after.kind === "eq" && after.symbol || CONTINUES.test(after.text))) return;
    if (NOT_A_RESULT.test(result.rest.trimStart())) return;
    // Left side: number (operator number)+, read backwards from the "=".
    const values: Fraction[] = [];
    const ops: Array<"+" | "-" | "*" | "/"> = [];
    let k = e - 1;
    while (k >= 0) {
      const value = tokens[k];
      if (value?.kind !== "num" || value.glued) return;
      values.unshift(value.value);
      const op = operatorAt(tokens, k - 1);
      if (!op) break;
      ops.unshift(op);
      k -= 2;
    }
    if (ops.length === 0) return;
    // What comes before the expression must end it: not a number, an operator, a bracket or a symbol "=".
    const before = tokens[k - 1];
    if (before && (before.kind === "num" || operatorAt(tokens, k - 1) || before.kind === "eq" && before.symbol || /^[([{|:：]$/u.test(before.text))) return;
    const exact = evaluate(values, ops);
    if (!exact) return;
    const start = text.indexOf(tokens[k]!.text + tokens[k]!.rest);
    const end = text.length - result.rest.length;
    claims.push({ text: start >= 0 ? text.slice(start, end).trim() : token.text, holds: holds(exact, result.text, result.value) });
  });
  return {
    verdict: claims.length === 0 ? "none" : claims.every((claim) => claim.holds) ? "true" : "false",
    claims,
  };
}
