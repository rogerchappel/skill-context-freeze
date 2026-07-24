# Orchestration

## Inputs

- `brief.md`: user request, run notes, or handoff summary.
- `metadata.json`: optional local metadata with allowed tools, files, approvals, and validation commands.

## Flow

1. Read local inputs.
2. Parse known sections and checklist bullets outside Markdown code examples.
3. Merge structured metadata.
4. Detect affirmative risky side-effect language outside code examples.
5. Emit Markdown or JSON packet.
6. Record validation commands in the PR evidence.

## Side Effects

The tool has no side effects beyond writing to stdout and stderr.

## Failure Modes

- Missing brief file exits non-zero.
- Invalid metadata JSON exits non-zero.
- Empty briefs produce warnings rather than inferred scope.
- Unknown headings are not mapped to an operating section.
- Explicit prohibitions do not create side-effect warnings by themselves.
