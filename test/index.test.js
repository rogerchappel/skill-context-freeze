import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createFreezePacket, parseMarkdown, renderMarkdown } from "../src/index.js";

test("parses brief headings into packet fields", () => {
  const parsed = parseMarkdown(`# Goal\nShip a skill.\n## Files\n- src/index.js\n## Validation\n- npm test`);
  assert.deepEqual(parsed.files, ["src/index.js"]);
  assert.deepEqual(parsed.validation, ["npm test"]);
});

test("merges metadata and warns on risky side effects", () => {
  const packet = createFreezePacket("## Goal\nSend a Slack update\n", {
    files: ["README.md"],
    allowedTools: ["rg"],
    validation: ["npm test"]
  });
  assert.equal(packet.goal, "Send a Slack update");
  assert.ok(packet.allowedTools.includes("rg"));
  assert.ok(packet.warnings.some((warning) => warning.includes("external message")));
});

test("ignores fenced and indented Markdown examples", () => {
  const parsed = parseMarkdown(`# Goal
Review the brief.

\`\`\`md
## Files
- secrets.txt
Publish a release.
\`\`\`

    ## Constraints
    - Delete the repository.

## Files
- src/index.js`);

  assert.deepEqual(parsed.goal, ["Review the brief."]);
  assert.deepEqual(parsed.files, ["src/index.js"]);

  const packet = createFreezePacket(`# Goal
Review the brief.

\`\`\`md
Publish a release.
\`\`\`

    Send an email.

## Files
- src/index.js`, { validation: ["npm test"] });
  assert.doesNotMatch(packet.warnings.join("\n"), /remote write|external message/);
});

test("does not map unknown headings into constraints", () => {
  const parsed = parseMarkdown(`# Goal
Review context.

## Background
- Historical note only.

## Constraints
- Stay local.`);

  assert.deepEqual(parsed.goal, ["Review context."]);
  assert.deepEqual(parsed.constraints, ["Stay local."]);
});

test("warns only for affirmative risky side effects", () => {
  const safe = createFreezePacket(`# Goal
Review locally.
## Constraints
- Do not publish packages or tag releases.
## Files
- src/index.js`, { validation: ["npm test"] });
  assert.doesNotMatch(safe.warnings.join("\n"), /remote write/);

  const affirmative = createFreezePacket(`# Goal
Publish the package.
## Files
- src/index.js`, { validation: ["npm test"] });
  assert.match(affirmative.warnings.join("\n"), /remote write/);

  const mixed = createFreezePacket(`# Goal
Do not publish the package, but deploy the documentation.
## Files
- src/index.js`, { validation: ["npm test"] });
  assert.match(mixed.warnings.join("\n"), /remote write/);
});

test("basic CLI smoke omits a warning for its publish prohibition", () => {
  const output = execFileSync(process.execPath, [
    "bin/skill-context-freeze.js",
    "freeze",
    "fixtures/basic-brief.md",
    "--metadata",
    "fixtures/basic-metadata.json",
    "--json"
  ], { encoding: "utf8" });
  const packet = JSON.parse(output);
  assert.doesNotMatch(packet.warnings.join("\n"), /remote write/);
});

test("renders markdown with validation evidence", () => {
  const packet = createFreezePacket("## Goal\nReview context\n", {
    files: ["docs/PRD.md"],
    validation: ["npm run smoke"]
  });
  const markdown = renderMarkdown(packet);
  assert.match(markdown, /Context Freeze Packet/);
  assert.match(markdown, /npm run smoke/);
});
