#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
const [pack] = JSON.parse(output);
const files = new Set(pack.files.map((file) => file.path));

const required = [
  "bin/skill-context-freeze.js",
  "src/index.js",
  "fixtures/basic-brief.md",
  "fixtures/basic-metadata.json",
  "examples/handoff-brief.md",
  "SKILL.md",
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md"
];

const missing = required.filter((file) => !files.has(file));
if (missing.length) {
  throw new Error(`package missing required files: ${missing.join(", ")}`);
}

console.log(`package smoke ok: ${pack.filename} includes ${pack.files.length} files`);
