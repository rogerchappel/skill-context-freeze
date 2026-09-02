# skill-context-freeze

`skill-context-freeze` turns a loose agent run brief into a bounded context packet that another agent can use without re-reading an entire project. It is built for local-first handoffs, review gates, and skill runs where the agent must state scope before implementation.

## Quickstart

```sh
npm install
npm run smoke
node bin/skill-context-freeze.js freeze fixtures/basic-brief.md --metadata fixtures/basic-metadata.json
```

Run the full release-candidate gate before publishing or opening a release PR:

```sh
npm run release:check
```

## CLI

```sh
skill-context-freeze freeze <brief.md> [--metadata run.json] [--json]
```

The command reads Markdown and optional JSON metadata, then emits:

- goal and non-goals
- constraints and assumptions
- files or directories to inspect
- allowed tools
- approval and side-effect warnings
- validation evidence to capture

`--metadata` accepts exactly one JSON file path. Omitting its value, passing an
option in place of the path, or repeating the option exits with a diagnostic.

## Library

```js
import { createFreezePacket, renderMarkdown } from "skill-context-freeze";

const packet = createFreezePacket(markdown, { allowedTools: ["rg", "npm test"] });
console.log(renderMarkdown(packet));
```

## Limitations

The parser is intentionally conservative and looks for known ATX headings at
levels 1 through 6 and checklist language. Following CommonMark, ATX headings
may have zero to three leading spaces; headings with four leading spaces or a
leading tab are treated as indented code and ignored. A trailing ATX closing
sequence must be separated from the heading text by whitespace, so
`## Constraints#` is not a `constraints` alias. Content under an unknown heading
is left out of structured packet fields rather than treated as a constraint.
Fenced code blocks and
four-space or tab-indented code examples are ignored by both section parsing
and warning detection.

Side-effect warnings recognize common base, past-tense, participle, and
continuous forms of supported messaging, remote-write, filesystem, and live-
connector actions. They distinguish explicit prohibitions (for example, “Do
not publish packages”, “You may not publish packages”, “Packages may not be
published”, “Publishing packages is prohibited”, “Publishing
packages is not allowed/permitted”, “Publishing isn't allowed/permitted”,
“Avoid publishing packages”, or “Refrain from publishing packages”)
from affirmative
instructions. A clause that actually asks for a recognized side effect still
produces a review warning, including when it follows a prohibition in the same
sentence. A standalone “no” that modifies an action detail does not negate the
action: for example, “Publish the package with no preview” still produces a
remote-write warning.

Warning analysis scans the merged `goal`, `constraints`, and `assumptions`
fields from both Markdown and metadata because those fields can contain
executable instructions. It deliberately excludes `nonGoals`, `files`,
`allowedTools`, `approvals`, and `validation`: prohibitions, paths, tool names,
approval evidence, and validation commands in those fields do not create
side-effect warnings by themselves.

An `approvals` entry counts as evidence only when it affirmatively records an
approval or authorization. Denials, missing or pending approval notes, and
prohibitions such as “No approval has been granted” or “Do not approve
publishing” remain visible in the packet but do not suppress the missing-
approval warning for an affirmative risky instruction.

Approval evidence must also name an action in the same detected side-effect
family. For example, approval to send an email covers an external-message risk
but does not cover deployment or publishing. When instructions contain more
than one risk family, each family needs its own matching approval; unrelated or
generic statements such as “all actions are approved” are retained as context
but do not suppress warnings or count as sufficient evidence.

The parser does not infer hidden project policy or read external systems.
Fenced code blocks follow CommonMark opener rules: a backtick fence whose info
string contains a backtick is not a fence and remains visible instruction text.
Fence markers may have zero to three leading spaces, but not a leading tab.
Closing fences must use the same marker character at least as many times as the
opener, followed only by spaces or tabs; a marker-like line with info text stays
inside the code block.
Valid backtick fences and tilde fences (whose info strings may contain backticks)
are ignored as examples.

## Safety Notes

This package only reads local files passed on the command line. It does not call external services, send messages, mutate repos, or grant connector permissions.

## Verification

```sh
npm run check
npm test
npm run smoke
npm run package:smoke
npm run release:check
```

`npm run package:smoke` performs a dry-run npm pack and asserts that the CLI,
library source, fixture brief, handoff example, skill instructions, changelog,
license, and security policy are present in the tarball.
