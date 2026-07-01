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
  { label: "external message", pattern: /\b(send|message|email|notify)\b/i },
  { label: "remote write", pattern: /\b(push|publish|deploy|release|merge)\b/i },
  { label: "destructive filesystem", pattern: /\brm\s+-rf\b|\bdelete\b/i },
  { label: "live connector", pattern: /\b(connector|crm|slack|github|jira|linear)\b.*\b(write|create|update)\b/i },
  { label: "secret-like token", pattern: /\b(?:gho|sk|xoxb|pat)_[A-Za-z0-9_=-]{12,}\b/ }
];

export function createFreezePacket(markdown, metadata = {}) {
  const parsed = parseMarkdown(markdown);
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

  packet.warnings = buildWarnings(markdown, packet);
  packet.evidence = buildEvidence(packet);
  return packet;
}

export function parseMarkdown(markdown) {
  const sections = {};
  let current = "goal";
  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = rawLine.match(/^#{1,4}\s+(.+?)\s*$/);
    if (heading) {
      current = resolveSection(heading[1]);
      sections[current] = sections[current] ?? [];
      continue;
    }
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
  const normalized = normalize(value);
  for (const [key, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.some((alias) => normalize(alias) === normalized)) return key;
  }
  return "constraints";
}

function buildWarnings(markdown, packet) {
  const warnings = [];
  for (const risk of RISK_PATTERNS) {
    if (risk.pattern.test(markdown)) warnings.push(`Review ${risk.label} language before execution.`);
  }
  if (packet.approvals.length === 0 && warnings.length > 0) {
    warnings.push("Risky side effects are mentioned but no approval evidence is listed.");
  }
  if (packet.validation.length === 0) warnings.push("No validation evidence listed.");
  if (packet.files.length === 0) warnings.push("No files or paths identified for context.");
  return [...new Set(warnings)];
}

function buildEvidence(packet) {
  const evidence = ["Generated packet reviewed for scope and warnings."];
  for (const command of packet.validation) evidence.push(`Result for: ${command}`);
  if (packet.approvals.length) evidence.push("Approval notes retained with the packet.");
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
