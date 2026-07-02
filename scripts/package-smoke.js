#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const required = [
  "bin/skill-context-freeze.js",
  "src/index.js",
  "docs/PRD.md",
  "docs/TASKS.md",
  "docs/ORCHESTRATION.md",
  "docs/RELEASE_CANDIDATE.md",
  "fixtures/basic-brief.md",
  "fixtures/basic-metadata.json",
  "SKILL.md",
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "package.json"
];

const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json"]);
const [pack] = JSON.parse(stdout);
const files = new Set(pack.files.map((file) => file.path));
const missing = required.filter((file) => !files.has(file));

if (missing.length > 0) {
  throw new Error(`npm package is missing required files: ${missing.join(", ")}`);
}

console.log(`package smoke passed (${pack.files.length} files)`);
