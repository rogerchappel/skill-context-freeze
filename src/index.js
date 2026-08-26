const SECTION_ALIASES = {
  goal: ["goal", "goals", "objective", "request"],
  nonGoals: ["non-goals", "non goals", "out of scope"],
  constraints: ["constraints", "requirements", "rules"],
  assumptions: ["assumptions"],
  files: ["files", "paths", "context files"],
  validation: ["validation", "verification", "tests"],
  approvals: ["approvals", "approval requirements"],
  tools: ["tools", "allowed tools"]
};

const RISK_PATTERNS = [
  { label: "external message", pattern: /\b(?:send(?:s|ing)?|sent|messag(?:e|es|ed|ing)|email(?:s|ed|ing)?|notif(?:y|ies|ied|ying))\b/i },
  { label: "remote write", pattern: /\b(?:push(?:es|ed|ing)?|publish(?:es|ed|ing)?|deploy(?:s|ed|ing)?|releas(?:e|es|ed|ing)|merg(?:e|es|ed|ing))\b/i },
  { label: "destructive filesystem", pattern: /\brm\s+-rf\b|\b(?:delet(?:e|es|ed|ing)|remov(?:e|es|ed|ing))\b/i },
  { label: "live connector", pattern: /(?:\b(?:connector|crm|slack|github|jira|linear)\b.*\b(?:writ(?:e|es|ten|ing)|creat(?:e|es|ed|ing)|updat(?:e|es|ed|ing))\b|\b(?:writ(?:e|es|ten|ing)|creat(?:e|es|ed|ing)|updat(?:e|es|ed|ing))\b.*\b(?:connector|crm|slack|github|jira|linear)\b)/i },
  { label: "secret-like token", pattern: /\b(?:gho|sk|xoxb|pat)_[A-Za-z0-9_=-]{12,}\b/ }
];

export function createFreezePacket(markdown, metadata = {}) {
  const parsed = parseMarkdown(markdown);
  const instructionLines = uniqueList(
    metadata.goal,
    parsed.goal,
    metadata.constraints,
    parsed.constraints,
    metadata.assumptions,
    parsed.assumptions
  );
  const packet = {
    source: metadata.source ?? "inline",
    goal: firstNonEmpty(metadata.goal, parsed.goal, "Unspecified"),
    nonGoals: uniqueList(metadata.nonGoals, parsed.nonGoals),
    constraints: uniqueList(metadata.constraints, parsed.constraints),
    assumptions: uniqueList(metadata.assumptions, parsed.assumptions),
    files: uniqueList(metadata.files, parsed.files),
    allowedTools: uniqueList(metadata.allowedTools, parsed.tools),
    approvals: uniqueList(metadata.approvals, parsed.approvals),
    validation: uniqueList(metadata.validation, parsed.validation),
    warnings: [],
    evidence: []
  };

  packet.warnings = buildWarnings(instructionLines, packet);
  packet.evidence = buildEvidence(packet);
  return packet;
}

export function parseMarkdown(markdown) {
  const sections = {};
  let current = "goal";
  for (const rawLine of visibleMarkdownLines(markdown)) {
    const heading = rawLine.match(/^ {0,3}#{1,6}(?:[ \t]+(.*?)[ \t]*|[ \t]*)$/);
    if (heading) {
      const headingText = (heading[1] ?? "").replace(/[ \t]+#+[ \t]*$/, "");
      current = resolveSection(headingText);
      if (current) sections[current] = sections[current] ?? [];
      continue;
    }
    if (!current) continue;
    const line = rawLine.trim();
    if (!line) continue;
    const bullet = line.match(/^(?:[-*]|\d+\.)\s+\[?[ xX]?\]?\s*(.+)$/);
    const text = bullet ? bullet[1].trim() : line;
    sections[current] = sections[current] ?? [];
    sections[current].push(text);
  }
  return Object.fromEntries(Object.keys(SECTION_ALIASES).map((key) => [key, sections[key] ?? []]));
}

export function renderMarkdown(packet) {
  const lines = [
    "# Context Freeze Packet",
    "",
    `- Source: ${packet.source}`,
    `- Goal: ${packet.goal}`,
    "",
    "## Scope",
    ...renderList("Non-goals", packet.nonGoals),
    ...renderList("Constraints", packet.constraints),
    ...renderList("Assumptions", packet.assumptions),
    "",
    "## Operating Bounds",
    ...renderList("Files To Inspect", packet.files),
    ...renderList("Allowed Tools", packet.allowedTools),
    ...renderList("Approvals", packet.approvals),
    "",
    "## Validation",
    ...renderList("Commands Or Evidence", packet.validation),
    "",
    "## Warnings",
    ...(packet.warnings.length ? packet.warnings.map((item) => `- ${item}`) : ["- None"]),
    "",
    "## Evidence To Capture",
    ...packet.evidence.map((item) => `- ${item}`)
  ];
  return `${lines.join("\n")}\n`;
}

function resolveSection(value) {
  if (String(value).includes("#")) return null;
  const normalized = normalize(value);
  for (const [key, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.some((alias) => normalize(alias) === normalized)) return key;
  }
  return null;
}

function buildWarnings(lines, packet) {
  const warnings = [];
  for (const risk of detectedRisks(lines)) {
    warnings.push(`Review ${risk.label} language before execution.`);
    if (!packet.approvals.some((approval) => approvalMatchesRisk(approval, risk))) {
      warnings.push(`Risky ${risk.label} side effects are mentioned but no approval evidence matching this risk is listed.`);
    }
  }
  if (packet.validation.length === 0) warnings.push("No validation evidence listed.");
  if (packet.files.length === 0) warnings.push("No files or paths identified for context.");
  return [...new Set(warnings)];
}

function visibleMarkdownLines(markdown) {
  const lines = [];
  let fence = null;

  for (const line of String(markdown).split(/\r?\n/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      const character = marker[1][0];
      if (!fence) {
        const validOpener = character === "~" || !marker[2].includes("`");
        if (validOpener) fence = { character, length: marker[1].length };
      } else if (character === fence.character && marker[1].length >= fence.length) {
        fence = null;
      }
      if (fence || !marker[2].includes("`")) continue;
    }
    if (fence || /^(?: {4}|\t)/.test(line)) continue;
    lines.push(line);
  }

  return lines;
}

function hasAffirmativeRisk(line, pattern) {
  const clauses = line.split(/[.,;]|\b(?:but|however|then|yet)\b/i);
  return clauses.some((clause) => {
    if (!pattern.test(clause)) return false;
    return !/\b(?:do\s+not|don't|never|may(?:\s+not|n't)|must(?:\s+not|n't)|should(?:\s+not|n't)|cannot|can't|no)\b/i.test(clause)
      && !/\b(?:prohibited|forbidden|disallowed)\b/i.test(clause)
      && !/\b(?:(?:is|are|was|were|be|being|been)\s+not|(?:is|are|was|were)n['’]t)\s+(?:allowed|permitted)\b/i.test(clause);
  });
}

function hasAffirmativeApproval(line) {
  const clauses = String(line).split(/[.;]|\b(?:but|however)\b/i);
  return clauses.some((clause) => {
    if (/\b(?:no|not|never|without|pending)\b|\b(?:do|does|did|must|should|can(?:not|'t))\s+not\b/i.test(clause)) {
      return false;
    }
    return /\b(?:approved|authorized)\b/i.test(clause)
      || /\bapproval\b.*\b(?:granted|given|recorded|received|confirmed|documented)\b/i.test(clause)
      || /\b(?:granted|gave|recorded|received|confirmed|documented)\b.*\bapproval\b/i.test(clause);
  });
}

function detectedRisks(lines) {
  return RISK_PATTERNS.filter((risk) => lines.some((line) => hasAffirmativeRisk(line, risk.pattern)));
}

function approvalMatchesRisk(approval, risk) {
  return hasAffirmativeApproval(approval) && risk.pattern.test(String(approval));
}

function buildEvidence(packet) {
  const evidence = ["Generated packet reviewed for scope and warnings."];
  for (const command of packet.validation) evidence.push(`Result for: ${command}`);
  const instructionLines = uniqueList(packet.goal, packet.constraints, packet.assumptions);
  for (const risk of detectedRisks(instructionLines)) {
    if (packet.approvals.some((approval) => approvalMatchesRisk(approval, risk))) {
      evidence.push(`Affirmative approval evidence retained for ${risk.label} with the packet.`);
    }
  }
  return evidence;
}

function renderList(label, values) {
  return [`### ${label}`, ...(values.length ? values.map((item) => `- ${item}`) : ["- Not specified"])];
}

function uniqueList(...groups) {
  return [...new Set(groups.flat().filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value[0];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalize(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
