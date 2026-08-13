#!/usr/bin/env node

// OLL is the schema source of truth. `check` verifies the exact installed OLL
// package, lockfile, and vendored Schema without depending on a sibling checkout.
// `sync` alone reads an explicit OLL source worktree to upgrade the pinned commit.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultSkillDirectory = resolve(scriptDirectory, "..");

function fail(message) {
  throw new Error(message);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`Cannot read ${label} at ${path}: ${error.message}`);
  }
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function git(ollDirectory, args) {
  try {
    return execFileSync("git", ["-C", ollDirectory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail = error.stderr?.trim() || error.message;
    fail(`Git command failed in ${ollDirectory}: ${detail}`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  return value;
}

function loadContract(skillDirectory) {
  const contractPath = join(skillDirectory, "oll-contract.json");
  const contract = readJson(contractPath, "OLL contract");

  if (contract.contract_version !== 1) {
    fail(`Unsupported contract_version: ${contract.contract_version}`);
  }
  if (!contract.oll || !contract.profile) {
    fail("OLL contract must contain oll and profile objects");
  }

  requireString(contract.oll.repository, "oll.repository");
  requireString(contract.oll.ref, "oll.ref");
  requireString(contract.oll.package_version, "oll.package_version");
  requireString(contract.profile.name, "profile.name");
  requireString(contract.profile.dsl_version, "profile.dsl_version");
  requireString(contract.profile.schema_id, "profile.schema_id");
  requireString(contract.profile.source, "profile.source");
  requireString(contract.profile.vendored, "profile.vendored");
  requireString(contract.profile.sha256, "profile.sha256");

  if (!/^[0-9a-f]{40}$/.test(contract.oll.ref)) {
    fail("oll.ref must be a full 40-character lowercase Git commit SHA");
  }
  if (!/^[0-9a-f]{64}$/.test(contract.profile.sha256)) {
    fail("profile.sha256 must be a 64-character lowercase SHA-256 digest");
  }

  return { contract, contractPath };
}

function resolveContractPath(root, contractPath, label) {
  if (isAbsolute(contractPath)) {
    fail(`${label} must be relative to its repository root`);
  }
  const resolved = resolve(root, contractPath);
  const relativeRoot = `${resolve(root)}/`;
  if (!resolved.startsWith(relativeRoot)) {
    fail(`${label} escapes its repository root`);
  }
  return resolved;
}

function inspectSource(contract, ollDirectory) {
  const sourcePath = resolveContractPath(
    ollDirectory,
    contract.profile.source,
    "profile.source",
  );
  const packagePath = join(ollDirectory, "package.json");
  const source = readFileSync(sourcePath);
  const schema = JSON.parse(source.toString("utf8"));
  const ollPackage = readJson(packagePath, "OLL package metadata");
  const head = git(ollDirectory, ["rev-parse", "HEAD"]);

  if (schema.$id !== contract.profile.schema_id) {
    fail(`Schema $id mismatch: expected ${contract.profile.schema_id}, got ${schema.$id}`);
  }
  if (schema.properties?.dsl?.const !== "octos.lesson") {
    fail("Authoring schema must describe the octos.lesson DSL");
  }
  if (schema.properties?.version?.const !== contract.profile.dsl_version) {
    fail(
      `DSL version mismatch: expected ${contract.profile.dsl_version}, got ${schema.properties?.version?.const}`,
    );
  }
  if (schema.properties?.profile?.const !== contract.profile.name) {
    fail(
      `Profile mismatch: expected ${contract.profile.name}, got ${schema.properties?.profile?.const}`,
    );
  }

  return {
    source,
    sourcePath,
    sourceHash: sha256(source),
    packageVersion: ollPackage.version,
    head,
    schema,
  };
}

function expectedDependencySpec(contract) {
  return `git+https://github.com/${contract.oll.repository}.git#${contract.oll.ref}`;
}

function inspectInstalled(contract, skillDirectory) {
  const skillPackage = readJson(join(skillDirectory, "package.json"), "learning-coach package metadata");
  const lock = readJson(join(skillDirectory, "package-lock.json"), "learning-coach package lock");
  const expectedSpec = expectedDependencySpec(contract);
  if (skillPackage.dependencies?.["octos-lesson-language"] !== expectedSpec) {
    fail(`OLL dependency mismatch: expected ${expectedSpec}`);
  }
  if (lock.packages?.[""]?.dependencies?.["octos-lesson-language"] !== expectedSpec) {
    fail("package-lock does not pin the declared OLL dependency");
  }
  const lockedPackage = lock.packages?.["node_modules/octos-lesson-language"];
  const lockedSource = lockedPackage?.resolved;
  if (typeof lockedSource !== "string"
    || (!lockedSource.endsWith(`#${contract.oll.ref}`) && !lockedSource.endsWith(`/${contract.oll.ref}`))) {
    fail(`package-lock does not resolve OLL commit ${contract.oll.ref}`);
  }

  const installedRoot = join(skillDirectory, "node_modules", "octos-lesson-language");
  const installedPackage = readJson(join(installedRoot, "package.json"), "installed OLL package metadata");
  if (installedPackage.version !== contract.oll.package_version) {
    fail(`Installed OLL package version mismatch: expected ${contract.oll.package_version}, got ${installedPackage.version}`);
  }
  const installedSchema = readFileSync(join(installedRoot, "dist", contract.profile.source));
  return {
    source: installedSchema,
    sourceHash: sha256(installedSchema),
    packageVersion: installedPackage.version,
    head: contract.oll.ref,
    packaged: true,
  };
}

export function checkContract({
  skillDirectory = defaultSkillDirectory,
  ollDirectory,
} = {}) {
  const { contract } = loadContract(skillDirectory);
  const source = ollDirectory
    ? inspectSource(contract, ollDirectory)
    : inspectInstalled(contract, skillDirectory);
  const vendoredPath = resolveContractPath(
    skillDirectory,
    contract.profile.vendored,
    "profile.vendored",
  );
  const vendored = readFileSync(vendoredPath);
  const vendoredHash = sha256(vendored);

  if (source.head !== contract.oll.ref) {
    fail(`OLL commit mismatch: expected ${contract.oll.ref}, got ${source.head}`);
  }
  if (source.packageVersion !== contract.oll.package_version) {
    fail(
      `OLL package version mismatch: expected ${contract.oll.package_version}, got ${source.packageVersion}`,
    );
  }
  if (!source.packaged && source.sourceHash !== contract.profile.sha256) {
    fail(
      `Canonical schema hash mismatch: expected ${contract.profile.sha256}, got ${source.sourceHash}`,
    );
  }
  if (vendoredHash !== contract.profile.sha256) {
    fail(
      `Vendored schema hash mismatch: expected ${contract.profile.sha256}, got ${vendoredHash}`,
    );
  }
  if (source.packaged) {
    const installedCanonical = JSON.stringify(JSON.parse(source.source.toString("utf8")));
    const vendoredCanonical = JSON.stringify(JSON.parse(vendored.toString("utf8")));
    if (installedCanonical !== vendoredCanonical) {
      fail("Installed OLL Schema differs structurally from the vendored canonical Schema");
    }
  } else if (!source.source.equals(vendored)) {
    fail("Vendored schema differs byte-for-byte from the canonical OLL schema");
  }

  return {
    ollRef: source.head,
    packageVersion: source.packageVersion,
    profile: `${contract.profile.name}/v${contract.profile.dsl_version}`,
    schemaHash: contract.profile.sha256,
  };
}

export function syncContract({
  skillDirectory = defaultSkillDirectory,
  ollDirectory = resolve(skillDirectory, "../octos-lesson-language"),
} = {}) {
  const { contract, contractPath } = loadContract(skillDirectory);
  const dirtySource = git(ollDirectory, [
    "status",
    "--porcelain",
    "--",
    contract.profile.source,
  ]);
  if (dirtySource) {
    fail(
      `Refusing to sync an uncommitted OLL schema (${contract.profile.source}): ${dirtySource}`,
    );
  }

  const source = inspectSource(contract, ollDirectory);
  const vendoredPath = resolveContractPath(
    skillDirectory,
    contract.profile.vendored,
    "profile.vendored",
  );
  const nextContract = {
    ...contract,
    oll: {
      ...contract.oll,
      ref: source.head,
      package_version: source.packageVersion,
    },
    profile: {
      ...contract.profile,
      schema_id: source.schema.$id,
      dsl_version: source.schema.properties.version.const,
      name: source.schema.properties.profile.const,
      sha256: source.sourceHash,
    },
  };

  mkdirSync(dirname(vendoredPath), { recursive: true });
  writeFileSync(vendoredPath, source.source);
  writeFileSync(contractPath, `${JSON.stringify(nextContract, null, 2)}\n`);

  return checkContract({ skillDirectory, ollDirectory });
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (command !== "check" && command !== "sync") {
    fail("Usage: node scripts/oll-contract.mjs <check|sync> [--oll-dir PATH]");
  }

  let ollDirectory = command === "sync"
    ? resolve(defaultSkillDirectory, "../octos-lesson-language")
    : undefined;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] !== "--oll-dir" || !rest[index + 1]) {
      fail(`Unknown or incomplete argument: ${rest[index]}`);
    }
    ollDirectory = resolve(rest[index + 1]);
    index += 1;
  }
  return { command, ollDirectory };
}

function main() {
  const { command, ollDirectory } = parseArguments(process.argv.slice(2));
  const result =
    command === "sync"
      ? syncContract({ ollDirectory })
      : checkContract({ ollDirectory });
  process.stdout.write(
    `OLL contract OK: ${result.profile}, package ${result.packageVersion}, ${result.ollRef}, sha256:${result.schemaHash}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`OLL contract failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
