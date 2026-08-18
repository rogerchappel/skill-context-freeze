import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFreezePacket, parseMarkdown, renderMarkdown } from "../src/index.js";

test("parses brief headings into packet fields", () => {
  const parsed = parseMarkdown(`# Goal\nShip a skill.\n## Files\n- src/index.js\n## Validation\n- npm test`);
  assert.deepEqual(parsed.files, ["src/index.js"]);
  assert.deepEqual(parsed.validation, ["npm test"]);
});

test("parses ATX headings indented by up to three spaces", () => {
  for (const indentation of [" ", "  ", "   "]) {
    const parsed = parseMarkdown(`${indentation}# Goal
Ship the change.
${indentation}## Files
- src/index.js
${indentation}###### Validation
- npm test`);

    assert.deepEqual(parsed.goal, ["Ship the change."], `${indentation.length}-space goal`);
    assert.deepEqual(parsed.files, ["src/index.js"], `${indentation.length}-space files`);
    assert.deepEqual(parsed.validation, ["npm test"], `${indentation.length}-space validation`);
  }
});

test("ignores ATX headings at the four-space code boundary", () => {
  const parsed = parseMarkdown(`# Goal
Review the brief.

    ## Files
    - hidden.js
	## Validation
	- npm run hidden

## Files
- src/index.js`);

  assert.deepEqual(parsed.goal, ["Review the brief."]);
  assert.deepEqual(parsed.files, ["src/index.js"]);
  assert.deepEqual(parsed.validation, []);
});

test("parses level-five and level-six headings for every section alias", () => {
  const aliases = {
    goal: ["goal", "goals", "objective", "request"],
    nonGoals: ["non-goals", "non goals", "out of scope"],
    constraints: ["constraints", "requirements", "rules"],
    assumptions: ["assumptions"],
    files: ["files", "paths", "context files"],
    validation: ["validation", "verification", "tests"],
    approvals: ["approvals", "approval requirements"],
    tools: ["tools", "allowed tools"]
  };

  for (const [field, headings] of Object.entries(aliases)) {
    for (const [index, heading] of headings.entries()) {
      const level = index % 2 === 0 ? "#####" : "######";
      const value = `${field}-${index}`;
      const parsed = parseMarkdown(`${level} ${heading}\n- ${value}`);
      assert.deepEqual(parsed[field], [value], `${level} ${heading}`);
      if (field !== "goal") assert.deepEqual(parsed.goal, [], `${level} ${heading} leaked into goal`);
    }
  }
});

test("applies Markdown visibility rules to level-five and level-six headings", () => {
  const parsed = parseMarkdown(`# Goal
Review the brief.

\`\`\`md
##### Constraints
- Hidden fenced constraint.
\`\`\`

    ###### Validation
    - Hidden indented validation.

###### Tests
- npm test`);

  assert.deepEqual(parsed.goal, ["Review the brief."]);
  assert.deepEqual(parsed.constraints, []);
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

test("recognizes common grammatical forms for every action risk category", () => {
  for (const [instruction, warning] of [
    ["Send the update.", "external message"],
    ["The update was sent.", "external message"],
    ["Publishing the package is required.", "remote write"],
    ["Deployed the site.", "remote write"],
    ["Delete the cache.", "destructive filesystem"],
    ["Removing the generated directory is required.", "destructive filesystem"],
    ["Create a GitHub record.", "live connector"],
    ["The Slack record was updated.", "live connector"]
  ]) {
    const packet = createFreezePacket(`## Goal\n${instruction}`, {
      files: ["src/index.js"],
      validation: ["npm test"]
    });
    assert.match(packet.warnings.join("\n"), new RegExp(warning), instruction);
  }
});

test("keeps inflected prohibitions safe and detects mixed affirmative clauses", () => {
  for (const instruction of [
    "Publishing packages is prohibited.",
    "Publishing packages is not allowed.",
    "Publishing packages is not permitted.",
    "Releases are not allowed.",
    "The site mustn't be deployed.",
    "Never remove generated directories.",
    "Creating GitHub records is forbidden."
  ]) {
    const packet = createFreezePacket(`## Goal\n${instruction}`, {
      files: ["src/index.js"],
      validation: ["npm test"]
    });
    assert.doesNotMatch(packet.warnings.join("\n"), /external message|remote write|destructive filesystem|live connector/, instruction);
  }

  const mixed = createFreezePacket("## Goal\nPublishing packages is prohibited, but the site was deployed.", {
    files: ["src/index.js"],
    validation: ["npm test"]
  });
  assert.match(mixed.warnings.join("\n"), /remote write/);

  const passiveMixed = createFreezePacket("## Goal\nPublishing packages is not allowed, but the site was deployed.", {
    files: ["src/index.js"],
    validation: ["npm test"]
  });
  assert.match(passiveMixed.warnings.join("\n"), /remote write/);
});

test("detects affirmative side effects after comma and conjunction clause boundaries", () => {
  for (const instruction of [
    "Do not publish the package, deploy the documentation.",
    "Do not publish the package, and deploy the documentation.",
    "Do not publish the package yet deploy the documentation."
  ]) {
    const packet = createFreezePacket(`## Goal\n${instruction}`, {
      files: ["src/index.js"],
      validation: ["npm test"]
    });

    assert.match(packet.warnings.join("\n"), /remote write/, instruction);
  }
});

test("keeps coordinated side effects inside a pure prohibition", () => {
  for (const instruction of [
    "Do not publish packages or tag releases.",
    "Never deploy the site and release the package."
  ]) {
    const packet = createFreezePacket(`## Goal\n${instruction}`, {
      files: ["src/index.js"],
      validation: ["npm test"]
    });

    assert.doesNotMatch(packet.warnings.join("\n"), /remote write/, instruction);
  }
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

test("requires approval evidence to match each detected side-effect family", () => {
  const unrelated = createFreezePacket("## Goal\nDeploy the app.", {
    approvals: ["Approval to send the email was recorded."],
    files: ["src/index.js"],
    validation: ["npm test"]
  });

  assert.match(unrelated.warnings.join("\n"), /no approval evidence matching/i);
  assert.doesNotMatch(unrelated.evidence.join("\n"), /approval evidence retained/i);

  const mixed = createFreezePacket("## Goal\nDeploy the app and send the handoff email.", {
    approvals: ["Approval to deploy the app was recorded."],
    files: ["src/index.js"],
    validation: ["npm test"]
  });

  assert.match(mixed.warnings.join("\n"), /external message.*no approval evidence matching/i);
  assert.doesNotMatch(mixed.warnings.join("\n"), /remote write.*no approval evidence matching/i);
  assert.match(mixed.evidence.join("\n"), /approval evidence retained for remote write/i);
});

test("does not accept denied or generic broad approval for a detected risk", () => {
  for (const approval of [
    "Approval to deploy was denied.",
    "All actions are approved.",
    "Broad approval was recorded for this work."
  ]) {
    const packet = createFreezePacket("## Goal\nDeploy the app.", {
      approvals: [approval],
      files: ["src/index.js"],
      validation: ["npm test"]
    });

    assert.match(packet.warnings.join("\n"), /no approval evidence matching/i, approval);
    assert.doesNotMatch(packet.evidence.join("\n"), /approval evidence retained/i, approval);
  }
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
    packet.warnings.filter((warning) => warning === "Review remote write language before execution.").length,
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

test("CLI treats passive publishing prohibitions as non-affirmative", () => {
  const directory = mkdtempSync(join(tmpdir(), "skill-context-freeze-"));
  const briefPath = join(directory, "brief.md");
  writeFileSync(briefPath, `## Goal
Publishing packages is not permitted.
## Files
- src/index.js
## Validation
- npm test
`);

  const output = execFileSync(process.execPath, [
    "bin/skill-context-freeze.js",
    "freeze",
    briefPath,
    "--json"
  ], { encoding: "utf8" });
  const packet = JSON.parse(output);

  assert.doesNotMatch(packet.warnings.join("\n"), /remote write/);
});

test("CLI accepts one- to three-space ATX indentation and ignores four-space examples", () => {
  const directory = mkdtempSync(join(tmpdir(), "skill-context-freeze-"));
  const briefPath = join(directory, "brief.md");
  writeFileSync(briefPath, ` # Goal
Ship the CLI fix.
  ## Files
- bin/skill-context-freeze.js
   ## Validation
- npm run release:check

    ## Files
    - hidden-example.js
`);

  const output = execFileSync(process.execPath, [
    "bin/skill-context-freeze.js",
    "freeze",
    briefPath,
    "--json"
  ], { encoding: "utf8" });
  const packet = JSON.parse(output);

  assert.equal(packet.goal, "Ship the CLI fix.");
  assert.deepEqual(packet.files, ["bin/skill-context-freeze.js"]);
  assert.deepEqual(packet.validation, ["npm run release:check"]);
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

test("CLI warns for an affirmative side effect after a prohibited clause", () => {
  const directory = mkdtempSync(join(tmpdir(), "skill-context-freeze-"));
  const briefPath = join(directory, "brief.md");
  writeFileSync(briefPath, `## Goal
Do not publish the package, and deploy the documentation.
## Files
- src/index.js
## Validation
- npm test
`);

  const output = execFileSync(process.execPath, [
    "bin/skill-context-freeze.js",
    "freeze",
    briefPath,
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

test("CLI requires approvals to match detected side effects", () => {
  const directory = mkdtempSync(join(tmpdir(), "skill-context-freeze-"));
  const briefPath = join(directory, "brief.md");
  const metadataPath = join(directory, "metadata.json");
  writeFileSync(briefPath, "## Goal\nDeploy the app and send the handoff email.\n## Files\n- src/index.js\n");
  writeFileSync(metadataPath, JSON.stringify({
    approvals: ["Approval to deploy the app was recorded."],
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

  assert.match(packet.warnings.join("\n"), /external message.*no approval evidence matching/i);
  assert.match(packet.evidence.join("\n"), /approval evidence retained for remote write/i);
});

test("CLI requires one non-option metadata path", () => {
  for (const [args, diagnostic] of [
    [["freeze", "fixtures/basic-brief.md", "--metadata"], /--metadata requires exactly one path/],
    [["freeze", "fixtures/basic-brief.md", "--metadata", "--json"], /--metadata requires exactly one path/],
    [["freeze", "fixtures/basic-brief.md", "--metadata", "fixtures/basic-metadata.json", "--metadata", "fixtures/basic-metadata.json"], /--metadata may only be specified once/],
    [["freeze", "fixtures/basic-brief.md", "--metadata", "fixtures/basic-metadata.json", "extra.json"], /Unknown argument: extra\.json/]
  ]) {
    const result = spawnSync(process.execPath, ["bin/skill-context-freeze.js", ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, diagnostic);
    assert.equal(result.stdout, "");
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
