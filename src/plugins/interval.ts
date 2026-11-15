// Interval arithmetic over an expression in the lesson numbers: the range of values it can take while each
// number stays inside its bounds. Used where a sign decides what is drawn (which side a range bar opens
// to, whether a coefficient can reach 0): sampled values can miss a sign change between samples (review of
// #92: (n1² − 1)·x² with n1 from −3 to 3 opens downward only for |n1| < 1), an interval cannot.
//
// The result always contains every value the expression takes (it may be wider: n1 − n1 gives
// [−w, w], not 0), so a sign it proves holds, and a sign it cannot prove is treated as changing. Anything
// it does not read (an unknown function, a parse it does not follow) is the whole line.

export type Interval = readonly [number, number];
const ALL: Interval = [-Infinity, Infinity];
const finite = ([lo, hi]: Interval) => Number.isFinite(lo) && Number.isFinite(hi);

function times(a: Interval, b: Interval): Interval {
  if (!finite(a) || !finite(b)) return ALL;
  const products = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]];
  return [Math.min(...products), Math.max(...products)];
}

function reciprocal([lo, hi]: Interval): Interval {
  if (lo <= 0 && hi >= 0) return ALL;
  return [1 / hi, 1 / lo];
}

function power(base: Interval, exponent: Interval): Interval {
  if (exponent[0] !== exponent[1]) {
    // A fixed base above 0 raised to a range: monotone in the exponent.
    if (base[0] !== base[1] || !(base[0] > 0) || !finite(exponent)) return ALL;
    const ends = [base[0] ** exponent[0], base[0] ** exponent[1]];
    return [Math.min(...ends), Math.max(...ends)];
  }
  const n = exponent[0];
  if (Number.isInteger(n)) {
    if (n === 0) return [1, 1];
    if (n < 0) return reciprocal(power(base, [-n, -n]));
    if (!finite(base)) return ALL;
    const [lo, hi] = base;
    if (n % 2 === 1) return [lo ** n, hi ** n];
    if (lo >= 0) return [lo ** n, hi ** n];
    if (hi <= 0) return [hi ** n, lo ** n];
    return [0, Math.max(lo ** n, hi ** n)];
  }
  // A fractional power is defined (and monotone) only above 0.
  if (!(base[0] > 0) || !finite(base)) return ALL;
  const ends = [base[0] ** n, base[1] ** n];
  return [Math.min(...ends), Math.max(...ends)];
}

const FUNCTIONS: Record<string, (value: Interval) => Interval> = {
  sqrt: ([lo, hi]) => (lo >= 0 && Number.isFinite(hi) ? [Math.sqrt(lo), Math.sqrt(hi)] : ALL),
  exp: ([lo, hi]) => [Math.exp(lo), Math.exp(hi)],
  abs: ([lo, hi]) => (lo >= 0 ? [lo, hi] : hi <= 0 ? [-hi, -lo] : [0, Math.max(-lo, hi)]),
};

/** The interval of `text` while each name in `bounds` stays inside its interval; the whole line when unread. */
export function intervalOf(text: string, bounds: Readonly<Record<string, Interval>>): Interval {
  const tokens = text.match(/\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/^(),]|\S/gu) ?? [];
  let position = 0;
  const peek = () => tokens[position];
  const fail = (): never => { throw new Error("unread"); };
  const expect = (token: string) => { if (tokens[position] !== token) fail(); position += 1; };

  const sum = (): Interval => {
    let value = product();
    while (peek() === "+" || peek() === "-") {
      const operator = tokens[position++];
      const right = product();
      value = operator === "+" ? [value[0] + right[0], value[1] + right[1]] : [value[0] - right[1], value[1] - right[0]];
    }
    return value;
  };
  const product = (): Interval => {
    let value = unary();
    while (peek() === "*" || peek() === "/") {
      const operator = tokens[position++];
      const right = unary();
      value = operator === "*" ? times(value, right) : times(value, reciprocal(right));
    }
    return value;
  };
  // −a^b is −(a^b), and a^−b reads the exponent's sign: the usual precedence.
  const unary = (): Interval => {
    if (peek() === "-") { position += 1; const [lo, hi] = unary(); return [-hi, -lo]; }
    if (peek() === "+") { position += 1; return unary(); }
    const base = atom();
    if (peek() === "^") { position += 1; return power(base, unary()); }
    return base;
  };
  const atom = (): Interval => {
    const token = tokens[position++];
    if (token === undefined) return fail();
    if (token === "(") { const value = sum(); expect(")"); return value; }
    if (/^\d/u.test(token)) { const value = Number(token); return [value, value]; }
    if (/^[A-Za-z_]/u.test(token)) {
      if (peek() === "(") {
        position += 1;
        const argument = sum();
        expect(")");
        const f = FUNCTIONS[token];
        return f ? f(argument) : ALL;
      }
      if (token === "pi") return [Math.PI, Math.PI];
      if (token === "e") return [Math.E, Math.E];
      return bounds[token] ?? fail();
    }
    return fail();
  };

  try {
    const value = sum();
    if (position !== tokens.length) return ALL;
    return Number.isNaN(value[0]) || Number.isNaN(value[1]) ? ALL : value;
  } catch {
    return ALL;
  }
}

/** The sign an interval proves: "positive" or "negative" when it excludes 0, else "unknown". */
export function signOf([lo, hi]: Interval): "positive" | "negative" | "unknown" {
  return lo > 0 ? "positive" : hi < 0 ? "negative" : "unknown";
}
