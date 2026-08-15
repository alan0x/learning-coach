import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("package, manifest, and skill metadata publish the same version", async () => {
  const [packageJson, manifestJson, skillMarkdown] = await Promise.all([
    readFile(new URL("package.json", projectRoot), "utf8").then(JSON.parse),
    readFile(new URL("manifest.json", projectRoot), "utf8").then(JSON.parse),
    readFile(new URL("SKILL.md", projectRoot), "utf8"),
  ]);

  const skillVersion = skillMarkdown.match(
    /^metadata:\s*\n(?:^[ \t]+.*\n)*?^[ \t]+version:\s*([^\s]+)\s*$/m,
  )?.[1];

  assert.ok(skillVersion, "SKILL.md must declare metadata.version");
  assert.equal(manifestJson.version, packageJson.version);
  assert.equal(skillVersion, packageJson.version);
});
