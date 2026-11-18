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
/** Half-width and full-width (IME) operator signs. */
const SYMBOL_OPS: Record<string, "+" | "-" | "*" | "/"> = {
  "+": "+", "＋": "+", "-": "-", "−": "-", "–": "-", "‒": "-", "－": "-",
  "×": "*", "*": "*", "＊": "*", "·": "*", "÷": "/", "/": "/", "／": "/",
};
/** A result followed by one of these is not the value of the expression. */
const NOT_A_RESULT = /^((more|less|fewer|greater|smaller|larger|bigger|times|than|remainder|r)\b|R\d|余|多|少|倍|以上|以下|\.\.|…)/iu;
/** A division claim in a sentence that speaks of a remainder is a division with remainder, not exact. */
const REMAINDER = /remainder|\brem\b|(?<!nothing |no )left ?over|余数|余\s*\d|……|\bR\s?\d/iu;
/** A claim in a clause that negates it or calls it a mistake is quoted, not stated. 不错 and 没错 are praise. */
const NEGATED = /\b(not|isn't|aren't|never|instead|mistake|wrong|incorrect)\b|不是|并非|而非|(?<![不没])错|不对/iu;
/** A clause that opens as a question or a condition raises a claim without stating it. */
const ASKED_CLAUSE = /^\s*(is|are|does|do|if|suppose|what if)\b|^\s*(如果|假如|假设|要是)/iu;
/** A sentence that ends as a question. */
const ASKED_SENTENCE = /[?？吗][\s"'”’)）]*$/u;
/** A sentence that says it rounds is not read: the place and direction of rounding are its own. */
const ROUNDED = /\brounded\b|\bround(?:s|ing)? (?:to|off|up|down)\b|\bdecimal places?\b|\bapproximately\b|\bnearest (?:whole|tenth|hundredth|thousandth|integer|cent)\b|约等于|大约|近似|保留|四舍五入|精确到|(?<![节制预契简大])约(?![定束会])/iu;
/** A label number (Step 2, Question 3) is not the first term of a subtraction after it. */
const LABEL = /^(step|question|problem|part|example|exercise|no|q|第)$/iu;
/** Sentence ends; a full stop between digits is a decimal point. */
const SENTENCE_END = /[!?。！？；;\n]|\.(?!\d)/gu;
/** Clause ends inside a sentence; a comma or colon between digits is part of a number or a time. */
const CLAUSE_END = /[!?。！？；;\n、]|\.(?!\d)|(?<!\d)[,，:：]|[,，:：](?!\d)/gu;
const GLUE = /[A-Za-zα-ωπ%°²³⁰¹⁴⁵⁶⁷⁸⁹^′″\u0300-\u036f]/u;
const NUMBER = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/u;
/** Numbers and words are short: matching looks this far ahead instead of copying the rest of the text. */
const LOOKAHEAD = 40;

/** A token with where it starts and ends in the text, so checks can see what touches it. */
type Placed = Token & { at: number; end: number };

function tokenize(text: string): Placed[] {
  const placed: Placed[] = [];
  let i = 0;
  const push = (token: Token, length: number) => { placed.push({ ...token, at: i, end: i + length } as Placed); i += length; };
  const previous = () => placed[placed.length - 1];
  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/u.test(ch)) { i += 1; continue; }
    const ahead = text.slice(i, i + LOOKAHEAD);
    // A minus sign right before a digit is the number's sign unless a number or ")" comes just before it.
    const signed = /^[-−–‒－]\d/u.test(ahead) && previous()?.kind !== "num" && previous()?.text !== ")";
    const unsigned = signed ? ahead.slice(1) : ahead;
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
      if (!value) { push({ kind: "other", text: number[0] }, length); continue; }
      // A letter of any script right after a number scales or names it (7万, 4分之3); only Latin and Greek
      // letters right before one join it (x2).
      push({ kind: "num", value, glued: GLUE.test(before) || GLUE.test(after) || /\p{L}/u.test(after), text: text.slice(i, i + length) }, length);
      continue;
    }
    if (ch === "=" || ch === "＝") { push({ kind: "eq", symbol: true, text: ch }, 1); continue; }
    if (SYMBOL_OPS[ch]) { push({ kind: "op", op: SYMBOL_OPS[ch]!, text: ch }, 1); continue; }
    const lower = ahead.toLowerCase();
    const latinBoundary = (length: number) => !/[A-Za-z]/u.test(text[i + length] ?? "");
    const wordOp = WORD_OPS.find(([word]) => lower.startsWith(word) && (!/[a-z]/u.test(word[0]!) || latinBoundary(word.length)));
    if (wordOp) { push({ kind: "op", op: wordOp[1], text: wordOp[0] }, wordOp[0].length); continue; }
    const wordEq = WORD_EQS.find((word) => lower.startsWith(word) && (!/[a-z]/u.test(word[0]!) || latinBoundary(word.length)));
    if (wordEq) { push({ kind: "eq", symbol: false, text: wordEq }, wordEq.length); continue; }
    const word = /^[A-Za-z]+/u.exec(ahead);
    // "5 x 4": a lone x between two numbers is a times sign; operatorAt decides from its neighbours.
    if (word) { push({ kind: "word", text: word[0] }, word[0].length); continue; }
    push({ kind: /\p{L}/u.test(ch) ? "word" : "other", text: ch }, 1);
  }
  return placed;
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

/** A fraction with no finite decimal form (1/3), as opposed to one that ends (3/4 = 0.75). */
function nonTerminating(value: Fraction): boolean {
  let d = value.d;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  return d !== 1n;
}

/**
 * The exact value equals the result as written. Only a value with no finite decimal form may be shown
 * rounded or cut off at the result's own decimal places (10 / 3 = 3.33); a value that ends must be written
 * exactly, so 0.5 + 0.25 = 0.8 is false. A sentence that says it rounds is not read at all.
 */
function holds(exact: Fraction, resultText: string, result: Fraction): boolean {
  const difference = sub(exact, result);
  if (difference.n === 0n) return true;
  const places = (/\.(\d+)/u.exec(resultText)?.[1] ?? "").length;
  // A whole-number result must be exact, and so must a value that ends.
  if (places === 0 || !nonTerminating(exact)) return false;
  // Rounded or cut off at the places shown, as number-line-fit reads model decimals (0.67 and 0.66 are 2/3),
  // compared exactly. Rounded: |exact − result| ≤ ½ · 10^−places. Cut off: the result is the exact value
  // with its later digits removed, so it lies between zero and the exact value, less than 10^−places away.
  const scale = 10n ** BigInt(places);
  const rounded = abs(difference.n) * 2n * scale <= difference.d;
  const towardZero = (exact.n > 0n) === (difference.n > 0n) && (result.n === 0n || (result.n > 0n) === (exact.n > 0n));
  const cutOff = towardZero && abs(difference.n) * scale < difference.d;
  return rounded || cutOff;
}

export function praiseArithmetic(text: string): PraiseArithmeticResult {
  text = text ?? "";
  const tokens = tokenize(text);
  const claims: PraiseArithmeticResult["claims"] = [];
  const sentenceEnds = [...text.matchAll(SENTENCE_END)].map((match) => match.index!);
  const clauseEnds = [...text.matchAll(CLAUSE_END)].map((match) => match.index!);
  /** The span around [start, end) between two of the given ends, with its closing mark. */
  const span = (ends: number[], start: number, end: number) => {
    let from = 0;
    let to = text.length;
    for (const index of ends) {
      if (index < start) from = index + 1;
      else if (index >= end) { to = index + 1; break; }
    }
    return text.slice(from, to);
  };
  const betweenDigits = (token: Placed) => /\d/u.test(text[token.at - 1] ?? "") && /\d/u.test(text[token.at + 1] ?? "");
  tokens.forEach((token, e) => {
    if (token.kind !== "eq") return;
    // Right side: one number, not glued to a symbol, and not continued by an operator, "=", another number
    // (the 1/2 of 1 1/2), a colon or comma between digits (3:45, 3,5) or a comparison.
    const result = tokens[e + 1];
    if (result?.kind !== "num" || result.glued) return;
    const after = tokens[e + 2];
    if (after && (operatorAt(tokens, e + 2) || after.kind === "num" || after.kind === "eq" && after.symbol || after.text === "≈"
      || /^[:：,]$/u.test(after.text) && betweenDigits(after))) return;
    if (NOT_A_RESULT.test(text.slice(result.end, result.end + LOOKAHEAD).trimStart())) return;
    // Left side: number (operator number)+, read backwards from the "=".
    const values: Fraction[] = [];
    const ops: Array<"+" | "-" | "*" | "/"> = [];
    let k = e - 1;
    for (;;) {
      const value = tokens[k];
      // An expression starts and ends on a number: an operator at the very start ("Plus 3 is 7") is no claim.
      if (value?.kind !== "num" || value.glued) return;
      values.unshift(value.value);
      const op = operatorAt(tokens, k - 1);
      if (!op) break;
      ops.unshift(op);
      k -= 2;
    }
    if (ops.length === 0 || values.length !== ops.length + 1) return;
    // What comes before the expression must end it: not a number, an operator, a bracket, a colon or comma
    // between digits, a label (Step 2), or an "=" that follows a value (a chain). A label before "="
    // (面积 = 8 × 3 = 24) is fine.
    const before = tokens[k - 1];
    const chain = before?.kind === "eq" && before.symbol && (tokens[k - 2]?.kind === "num" || /^[)\]}|]$/u.test(tokens[k - 2]?.text ?? ""));
    if (before && (before.kind === "num" || operatorAt(tokens, k - 1) || chain || /^[([{|]$/u.test(before.text)
      || /^[:：,]$/u.test(before.text) && betweenDigits(before) || LABEL.test(before.text))) return;
    // "3-5 is 2", "Pages 1-3 = 3" or "2024-11-18 is a day" is a range or a date: an unspaced hyphen between
    // digits, read with a word "is" or a spaced "=". "8-3=5", written tight, is a subtraction.
    const spacedEquals = !token.symbol || /\s/u.test(text[token.at - 1] ?? "") || /\s/u.test(text[token.end] ?? "");
    const opTokens = tokens.slice(k, e).filter((_t, index) => index % 2 === 1);
    if (spacedEquals && opTokens.some((op) => op.kind === "op" && op.op === "-" && op.text !== "−" && betweenDigits(op))) return;
    const exact = evaluate(values, ops);
    if (!exact) return;
    const start = tokens[k]!.at;
    const end = result.end;
    // Read in place: a quoted mistake (in its clause), a question or condition, or a remainder (in its
    // sentence) is not a stated claim.
    const clause = span(clauseEnds, start, end);
    const sentence = span(sentenceEnds, start, end);
    if (NEGATED.test(clause) || ASKED_CLAUSE.test(clause) || ASKED_SENTENCE.test(sentence) || ROUNDED.test(sentence)
      || ops.includes("/") && REMAINDER.test(sentence)) return;
    claims.push({ text: text.slice(start, end).trim(), holds: holds(exact, result.text, result.value) });
  });
  return {
    verdict: claims.length === 0 ? "none" : claims.every((claim) => claim.holds) ? "true" : "false",
    claims,
  };
}
