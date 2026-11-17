// How close each probe or judge case is to the math expressiveness question set, so cases are never
// drawn from it (plan §3: the question set is never used to tune prompts or cards).
//
// Jaccard similarity over content words (English) and character bigrams (Chinese), against every
// question. Prints only case IDs and scores, never question text, so held-out questions are not quoted.
// The bar used for the plot judge cases: at most 0.20 against open questions and 0.15 against held-out.
//
// node scripts/case-overlap.mjs <cases.json> [--open 0.2] [--held-out 0.15]   (exit 1 above a bar)
import { readFileSync } from "node:fs";

const STOP = new Set("a an the and or of to in on at by for with from into onto as is are be it its this that these those what which how many much does do did you your me my i we our show draw find work out make let give one two each".split(" "));

export function terms(text) {
  const lower = String(text).toLowerCase();
  const words = (lower.match(/[a-z]+/gu) ?? []).filter((word) => word.length > 2 && !STOP.has(word));
  const han = [...lower.matchAll(/\p{Script=Han}+/gu)].flatMap(([run]) => [...run].slice(0, -1).map((char, index) => char + run[index + 1]));
  return new Set([...words, ...han]);
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const term of a) if (b.has(term)) shared += 1;
  return shared / (a.size + b.size - shared);
}

if (process.argv[1] && new URL(import.meta.url).pathname === (await import("node:path")).resolve(process.argv[1])) {
  const [casesFile, ...rest] = process.argv.slice(2);
  if (!casesFile) throw new Error("Usage: node scripts/case-overlap.mjs <cases.json> [--open 0.2] [--held-out 0.15]");
  const bar = (flag, fallback) => { const at = rest.indexOf(flag); return at >= 0 ? Number(rest[at + 1]) : fallback; };
  const [openBar, heldBar] = [bar("--open", 0.2), bar("--held-out", 0.15)];
  const questions = JSON.parse(readFileSync(new URL("../testsuite/math-expressiveness-question-set.json", import.meta.url), "utf8")).questions
    .map((question) => ({ heldOut: question.held_out === true, terms: terms(question.prompt) }));
  let over = 0;
  for (const item of JSON.parse(readFileSync(casesFile, "utf8")).cases) {
    const mine = terms(item.prompt);
    const best = (heldOut) => Math.max(0, ...questions.filter((question) => question.heldOut === heldOut).map((question) => jaccard(mine, question.terms)));
    const [open, held] = [best(false), best(true)];
    const flag = open > openBar || held > heldBar;
    if (flag) over += 1;
    console.log(`${item.id}\topen ${open.toFixed(2)}\theld-out ${held.toFixed(2)}${flag ? "\tOVER" : ""}`);
  }
  if (over) process.exit(1);
}
