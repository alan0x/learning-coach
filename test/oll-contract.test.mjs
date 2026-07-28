import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkContract, syncContract } from "../scripts/oll-contract.mjs";

const schema = {
  $id: "https://octos.dev/schema/lesson/authoring/0.1",
  properties: {
    dsl: { const: "octos.lesson" },
    version: { const: "0.1" },
    profile: { const: "authoring" },
  },
};

function git(directory, args) {
  return execFileSync("git", ["-C", directory, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "learning-coach-oll-contract-"));
  const skillDirectory = join(root, "learning-coach");
  const ollDirectory = join(root, "octos-lesson-language");
  mkdirSync(join(skillDirectory, "references"), { recursive: true });
  mkdirSync(join(ollDirectory, "schema", "authoring"), { recursive: true });

  writeFileSync(
    join(ollDirectory, "package.json"),
    `${JSON.stringify({ name: "octos-lesson-language", version: "0.1.0-test" }, null, 2)}\n`,
  );
  writeFileSync(
    join(ollDirectory, "schema", "authoring", "v0.1.schema.json"),
    `${JSON.stringify(schema, null, 2)}\n`,
  );
  git(ollDirectory, ["init", "-q"]);
  git(ollDirectory, ["config", "user.email", "contract-test@octos.dev"]);
  git(ollDirectory, ["config", "user.name", "OLL Contract Test"]);
  git(ollDirectory, ["add", "package.json", "schema/authoring/v0.1.schema.json"]);
  git(ollDirectory, ["commit", "-q", "-m", "fixture"]);

  writeFileSync(
    join(skillDirectory, "oll-contract.json"),
    `${JSON.stringify(
      {
        contract_version: 1,
        oll: {
          repository: "example/octos-lesson-language",
          ref: "0".repeat(40),
          package_version: "pending",
        },
        profile: {
          name: "authoring",
          dsl_version: "0.1",
          schema_id: schema.$id,
          source: "schema/authoring/v0.1.schema.json",
          vendored: "references/oll-authoring-v0.1.schema.json",
          sha256: "0".repeat(64),
        },
      },
      null,
      2,
    )}\n`,
  );

  return { root, skillDirectory, ollDirectory };
}

test("sync pins the exact OLL commit and check accepts the synchronized contract", () => {
  const fixture = makeFixture();
  try {
    const result = syncContract(fixture);
    const contract = JSON.parse(
      readFileSync(join(fixture.skillDirectory, "oll-contract.json"), "utf8"),
    );

    assert.equal(contract.oll.ref, git(fixture.ollDirectory, ["rev-parse", "HEAD"]));
    assert.equal(contract.oll.package_version, "0.1.0-test");
    assert.equal(result.profile, "authoring/v0.1");
    assert.deepEqual(checkContract(fixture), result);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("check rejects a manually changed vendored schema", () => {
  const fixture = makeFixture();
  try {
    syncContract(fixture);
    writeFileSync(
      join(fixture.skillDirectory, "references", "oll-authoring-v0.1.schema.json"),
      "{}\n",
    );

    assert.throws(
      () => checkContract(fixture),
      /Vendored schema hash mismatch/,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("sync refuses to vendor an uncommitted canonical schema", () => {
  const fixture = makeFixture();
  try {
    writeFileSync(
      join(fixture.ollDirectory, "schema", "authoring", "v0.1.schema.json"),
      `${JSON.stringify({ ...schema, title: "dirty" }, null, 2)}\n`,
    );

    assert.throws(
      () => syncContract(fixture),
      /Refusing to sync an uncommitted OLL schema/,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
