import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("warns for affirmative risks in merged instruction metadata", () => {
  for (const [field, value, warning] of [
    ["goal", "Send the handoff email.", "external message"],
    ["constraints", ["Publish the package."], "remote write"],
    ["assumptions", ["Delete the generated directory."], "destructive filesystem"]
  ]) {
    const packet = createFreezePacket("## Goal\nReview locally.", {
      [field]: value,
      files: ["src/index.js"],
      validation: ["npm test"]
    });

    assert.match(packet.warnings.join("\n"), new RegExp(warning));
    assert.match(packet.warnings.join("\n"), /no approval evidence/i);
  }
});

test("does not treat approval denial or prohibition as approval evidence", () => {
  for (const approval of [
    "No approval has been granted.",
    "Do not approve publishing the package."
  ]) {
    const packet = createFreezePacket("## Goal\nPublish the package.", {
      approvals: [approval],
      files: ["src/index.js"],
      validation: ["npm test"]
    });

    assert.deepEqual(packet.approvals, [approval]);
    assert.match(packet.warnings.join("\n"), /no approval evidence/i);
    assert.doesNotMatch(packet.evidence.join("\n"), /approval evidence retained/i);
  }
});

test("retains genuine positive approval evidence", () => {
  const packet = createFreezePacket("## Goal\nPublish the package.", {
    approvals: ["Approval to publish was recorded."],
    files: ["src/index.js"],
    validation: ["npm test"]
  });

  assert.doesNotMatch(packet.warnings.join("\n"), /no approval evidence/i);
  assert.match(packet.evidence.join("\n"), /affirmative approval evidence retained/i);
});

test("does not treat metadata boundaries or prohibitions as instructions", () => {
  const packet = createFreezePacket("## Goal\nReview locally.", {
    nonGoals: ["Publish the package."],
    constraints: ["Do not deploy or release anything."],
    files: ["release/publish-plan.md"],
    allowedTools: ["github-write"],
    approvals: ["Approval to publish was recorded."],
    validation: ["npm run release:check"]
  });

  assert.doesNotMatch(packet.warnings.join("\n"), /remote write|live connector/);
});

test("deduplicates risks found in Markdown and metadata", () => {
  const packet = createFreezePacket(`# Goal
Publish the package.
## Files
- src/index.js`, {
    constraints: ["Deploy the package."],
    validation: ["npm test"]
  });

  assert.equal(
    packet.warnings.filter((warning) => warning.includes("remote write")).length,
    1
  );
  assert.equal(
    packet.warnings.filter((warning) => warning.includes("no approval evidence")).length,
    1
  );
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

test("CLI warns for risky metadata merged with safe Markdown", () => {
  const directory = mkdtempSync(join(tmpdir(), "skill-context-freeze-"));
  const briefPath = join(directory, "brief.md");
  const metadataPath = join(directory, "metadata.json");
  writeFileSync(briefPath, "## Goal\nReview locally.\n## Files\n- src/index.js\n");
  writeFileSync(metadataPath, JSON.stringify({
    constraints: ["Publish the package."],
    validation: ["npm test"]
  }));

  const output = execFileSync(process.execPath, [
    "bin/skill-context-freeze.js",
    "freeze",
    briefPath,
    "--metadata",
    metadataPath,
    "--json"
  ], { encoding: "utf8" });
  const packet = JSON.parse(output);

  assert.match(packet.warnings.join("\n"), /remote write/);
  assert.match(packet.warnings.join("\n"), /no approval evidence/i);
});

test("CLI distinguishes denied, prohibited, and positive approval metadata", () => {
  const directory = mkdtempSync(join(tmpdir(), "skill-context-freeze-"));
  const briefPath = join(directory, "brief.md");
  const metadataPath = join(directory, "metadata.json");
  writeFileSync(briefPath, "## Goal\nSend the handoff email.\n## Files\n- src/index.js\n");

  for (const [approval, expectsMissingApproval] of [
    ["No approval has been granted.", true],
    ["Do not approve sending the email.", true],
    ["Approval to send the email was recorded.", false]
  ]) {
    writeFileSync(metadataPath, JSON.stringify({
      approvals: [approval],
      validation: ["npm test"]
    }));
    const output = execFileSync(process.execPath, [
      "bin/skill-context-freeze.js",
      "freeze",
      briefPath,
      "--metadata",
      metadataPath,
      "--json"
    ], { encoding: "utf8" });
    const packet = JSON.parse(output);

    assert.equal(/no approval evidence/i.test(packet.warnings.join("\n")), expectsMissingApproval);
    assert.equal(/affirmative approval evidence retained/i.test(packet.evidence.join("\n")), !expectsMissingApproval);
  }
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
