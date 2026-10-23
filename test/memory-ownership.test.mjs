import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("skill instructions leave long-term learner memory to Octos", async () => {
  const [skillMarkdown, sessionState] = await Promise.all([
    readFile(new URL("SKILL.md", projectRoot), "utf8"),
    readFile(new URL("references/session-state.md", projectRoot), "utf8"),
  ]);

  for (const [name, text] of [
    ["SKILL.md", skillMarkdown],
    ["references/session-state.md", sessionState],
  ]) {
    assert.doesNotMatch(text, /Learning Profile/, `${name} must not define a coach-owned profile`);
    assert.doesNotMatch(text, /promot\w* (?:evidence |an item |information )?(?:to|into) (?:cross-session|long-term)/i, name);
    assert.doesNotMatch(text, /Candidate cross-session memories/, name);
    assert.match(text, /Octos owns long-term learner memory/, name);
  }

  // Session state the lesson flow depends on stays documented.
  assert.match(sessionState, /## Session workspace/);
  assert.match(sessionState, /## Session review/);
});
