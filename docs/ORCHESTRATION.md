# Orchestration

## Inputs

- `brief.md`: user request, run notes, or handoff summary.
- `metadata.json`: optional local metadata with allowed tools, files, approvals, and validation commands.

## Flow

1. Read local inputs.
2. Parse known sections and checklist bullets.
3. Merge structured metadata.
4. Detect risky side-effect language.
5. Emit Markdown or JSON packet.
6. Record validation commands in the PR evidence.

## Side Effects

The tool has no side effects beyond writing to stdout and stderr.

## Failure Modes

- Missing brief file exits non-zero.
- Invalid metadata JSON exits non-zero.
- Empty briefs produce warnings rather than inferred scope.
