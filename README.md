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

## Library

```js
import { createFreezePacket, renderMarkdown } from "skill-context-freeze";

const packet = createFreezePacket(markdown, { allowedTools: ["rg", "npm test"] });
console.log(renderMarkdown(packet));
```

## Limitations

The parser is intentionally conservative and looks for common headings and checklist language. It does not infer hidden project policy or read external systems.

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
