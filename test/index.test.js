import test from "node:test";
import assert from "node:assert/strict";
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

test("renders markdown with validation evidence", () => {
  const packet = createFreezePacket("## Goal\nReview context\n", {
    files: ["docs/PRD.md"],
    validation: ["npm run smoke"]
  });
  const markdown = renderMarkdown(packet);
  assert.match(markdown, /Context Freeze Packet/);
  assert.match(markdown, /npm run smoke/);
});
