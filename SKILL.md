# Skill Context Freeze

## When To Use

Use this skill before handing an agent run from planning to implementation, from implementation to review, or from one automation lane to another. It is useful when the next agent needs a compact packet of goal, scope, assumptions, allowed tools, and validation evidence.

## Required Tools Or Inputs

- A Markdown brief with the requested outcome and constraints.
- Optional JSON metadata with `allowedTools`, `files`, `approvals`, and `validation`.
- Local shell access to run `skill-context-freeze freeze`.

## Side-Effect Boundaries

The skill reads only local files provided by the operator. It must not contact external services, send notifications, edit remote accounts, or mutate source repositories as part of packet generation.

## Approval Requirements

Explicit approval is required before including instructions for live connector writes, messages, deployment, package publishing, GitHub releases, billing changes, or destructive filesystem actions. Missing approval should be reported as a warning in the packet.

## Examples

```sh
node bin/skill-context-freeze.js freeze fixtures/basic-brief.md --metadata fixtures/basic-metadata.json
```

```sh
node bin/skill-context-freeze.js freeze run-brief.md --json > context-freeze.json
```

## Validation Workflow

Run `npm test`, `npm run check`, `npm run build`, and `npm run smoke`. Inspect the packet for scope, approval, and evidence coverage before passing it to another agent.
