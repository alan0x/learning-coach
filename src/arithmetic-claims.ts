// Arithmetic a model writes into a message ("3 × 4 = 12"), checked by the program. A message with a false
// claim is dropped, not repaired: the player then shows its own message (plan §7 step 3.6; the owner's two
// principles, 2026-11-16: prose may make the program drop something nobody narrates, never choose a value).
// Found: 1 of 9 checkable claims in 144 local success messages was wrong (2026-11-13).

const NUMBER = String.raw`(\d+(?:\.\d+)?)`;
const OPERATOR = String.raw`[+＋\-−–×xX*÷/^=＝]`;
// Only a claim that stands alone is checked: nothing that computes into it before (spaces skipped; a minus
// sign right before the first number belongs to it), and nothing that goes on computing after its result.
// "4 ÷ 1/10 = 4 × 10 = 40" and "5 − 3 + 4 = 6" are chains, so no part of them is read as a claim.
const CLAIM = new RegExp(String.raw`(?<![\d.)\]]\s*|${OPERATOR}\s*)([-−]?)${NUMBER}\s*([+＋\-−–×xX*÷/])\s*${NUMBER}\s*[=＝]\s*([-−]?)${NUMBER}(?![\d.])(?!\s*${OPERATOR})`, "gu");

/** Whether the text states a binary arithmetic fact ("a op b = c") that is false. */
export function hasFalseArithmetic(text: string): boolean {
  for (const match of text.matchAll(CLAIM)) {
    const [, leftSign, left, operator, right, sign, result] = match;
    const a = Number(`${leftSign ? "-" : ""}${left}`), b = Number(right), c = Number(`${sign ? "-" : ""}${result}`);
    const value = "+＋".includes(operator!) ? a + b
      : "-−–".includes(operator!) ? a - b
      : "×xX*".includes(operator!) ? a * b
      : b === 0 ? Number.NaN : a / b;
    if (!Number.isFinite(value)) return true;
    // The precision the message wrote: "= 0.33" and "= 0.3" for 1/3 are right; "= 0.6" for 2/3 is not.
    const places = result!.includes(".") ? result!.split(".")[1]!.length : 0;
    if (Math.abs(value - c) > 0.5 * 10 ** -places + 1e-9) return true;
  }
  return false;
}
