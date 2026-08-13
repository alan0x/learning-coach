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

function installFixtureDependency(fixture) {
  const contract = JSON.parse(readFileSync(join(fixture.skillDirectory, "oll-contract.json"), "utf8"));
  const spec = `git+https://github.com/${contract.oll.repository}.git#${contract.oll.ref}`;
  const installedRoot = join(fixture.skillDirectory, "node_modules", "octos-lesson-language");
  mkdirSync(join(installedRoot, "dist", "schema", "authoring"), { recursive: true });
  writeFileSync(
    join(fixture.skillDirectory, "package.json"),
    `${JSON.stringify({ dependencies: { "octos-lesson-language": spec } }, null, 2)}\n`,
  );
  writeFileSync(
    join(fixture.skillDirectory, "package-lock.json"),
    `${JSON.stringify({
      packages: {
        "": { dependencies: { "octos-lesson-language": spec } },
        "node_modules/octos-lesson-language": {
          version: contract.oll.package_version,
          resolved: `git+https://github.com/${contract.oll.repository}.git#${contract.oll.ref}`,
        },
      },
    }, null, 2)}\n`,
  );
  writeFileSync(
    join(installedRoot, "package.json"),
    `${JSON.stringify({ name: "octos-lesson-language", version: contract.oll.package_version }, null, 2)}\n`,
  );
  writeFileSync(
    join(installedRoot, "dist", "schema", "authoring", "v0.1.schema.json"),
    readFileSync(join(fixture.skillDirectory, "references", "oll-authoring-v0.1.schema.json")),
  );
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

test("check uses the exact installed OLL dependency without a sibling checkout", () => {
  const fixture = makeFixture();
  try {
    syncContract(fixture);
    installFixtureDependency(fixture);
    const result = checkContract({ skillDirectory: fixture.skillDirectory });
    assert.equal(result.ollRef, git(fixture.ollDirectory, ["rev-parse", "HEAD"]));

    const packageJson = JSON.parse(readFileSync(join(fixture.skillDirectory, "package.json"), "utf8"));
    packageJson.dependencies["octos-lesson-language"] = "git+https://github.com/example/octos-lesson-language.git#deadbeef";
    writeFileSync(join(fixture.skillDirectory, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
    assert.throws(
      () => checkContract({ skillDirectory: fixture.skillDirectory }),
      /OLL dependency mismatch/,
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
