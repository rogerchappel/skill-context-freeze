# PRD: Skill Context Freeze

## Problem

Agent workflows often lose useful constraints when work moves between planning, coding, review, and scheduled automation. Long transcripts are expensive to transfer and can obscure the few decisions that matter.

## Goal

Provide a local CLI and library that convert a brief into a bounded context freeze packet with explicit scope, assumptions, approvals, tools, and validation evidence.

## Non-Goals

- No live connector calls.
- No remote writes.
- No model calls.
- No secret detection beyond simple local redaction warnings.

## Users

- Agent maintainers preparing implementation handoffs.
- Review agents checking whether context is sufficient.
- Automation lanes that need compact run packets.

## MVP Requirements

- Parse Markdown headings and checklist-like bullets.
- Merge optional JSON metadata.
- Warn on risky side effects and missing approvals.
- Render Markdown and JSON.
- Provide fixture-backed tests and smoke command.

## Success Criteria

- Another agent can run the CLI locally and understand what work is in scope.
- The generated packet lists validation evidence to capture.
- Risky external actions are visible before work begins.
