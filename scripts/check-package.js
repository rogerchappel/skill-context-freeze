#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";

const required = [
  "README.md",
  "SKILL.md",
  "docs/PRD.md",
  "docs/TASKS.md",
  "docs/ORCHESTRATION.md",
  "docs/RELEASE_CANDIDATE.md",
  "bin/skill-context-freeze.js",
  "src/index.js",
  "test/index.test.js",
  "fixtures/basic-brief.md",
  "fixtures/basic-metadata.json"
];

for (const file of required) {
  await access(new URL(`../${file}`, import.meta.url));
}

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (!pkg.bin || !pkg.exports || !pkg.scripts?.smoke) {
  throw new Error("package metadata is missing bin, exports, or smoke script");
}

console.log("package check passed");
