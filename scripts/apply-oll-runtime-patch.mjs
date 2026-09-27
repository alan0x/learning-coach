import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const contract = JSON.parse(readFileSync(resolve(root, "oll-contract.json"), "utf8"));
const patch = contract.oll.patch;
if (patch) {
  const path = resolve(root, patch.path);
  if (createHash("sha256").update(readFileSync(path)).digest("hex") !== patch.sha256) throw new Error("OLL patch digest mismatch");
  const args = ["apply", "--directory=node_modules/octos-lesson-language"];
  try { execFileSync("git", [...args, "--reverse", "--check", path], { cwd: root, stdio: "pipe" }); }
  catch {
    execFileSync("git", [...args, "--check", path], { cwd: root, stdio: "pipe" });
    execFileSync("git", [...args, path], { cwd: root, stdio: "pipe" });
  }
}
