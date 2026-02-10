import type { Violation } from "../types.js";

const SEVERITY_LABELS: Record<string, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

/**
 * Format a violation as plain text.
 */
export function formatPlainText(violation: Violation): string {
  return [
    `[${SEVERITY_LABELS[violation.severity]}] ${violation.type}`,
    `Skill: ${violation.skillId}`,
    `Tool: ${violation.toolName}`,
    `Message: ${violation.message}`,
    `Rule: ${violation.rule}`,
    `Time: ${violation.timestamp}`,
  ].join("\n");
}

/**
 * Format a violation as markdown.
 */
export function formatMarkdown(violation: Violation): string {
  const emoji =
    violation.severity === "critical"
      ? ":red_circle:"
      : violation.severity === "high"
        ? ":orange_circle:"
        : violation.severity === "medium"
          ? ":yellow_circle:"
          : ":white_circle:";

  return [
    `### ${emoji} ActionBox Violation — ${SEVERITY_LABELS[violation.severity]}`,
    "",
    `**Type:** \`${violation.type}\``,
    `**Skill:** \`${violation.skillId}\``,
    `**Tool:** \`${violation.toolName}\``,
    `**Message:** ${violation.message}`,
    `**Rule:** \`${violation.rule}\``,
    `**Time:** ${violation.timestamp}`,
    violation.details
      ? `**Details:** \`${JSON.stringify(violation.details)}\``
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Format a violation as Slack Block Kit blocks.
 */
export function formatSlackBlocks(violation: Violation): unknown[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `ActionBox Violation — ${SEVERITY_LABELS[violation.severity]}`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Type:*\n\`${violation.type}\`` },
        { type: "mrkdwn", text: `*Severity:*\n${violation.severity}` },
        { type: "mrkdwn", text: `*Skill:*\n\`${violation.skillId}\`` },
        { type: "mrkdwn", text: `*Tool:*\n\`${violation.toolName}\`` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Message:*\n${violation.message}` },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Rule: \`${violation.rule}\` | ${violation.timestamp}`,
        },
      ],
    },
    { type: "divider" },
  ];
}

/**
 * Format a summary of multiple violations.
 */
export function formatViolationSummary(violations: Violation[]): string {
  if (violations.length === 0) return "No violations detected.";

  const bySeverity = {
    critical: violations.filter((v) => v.severity === "critical").length,
    high: violations.filter((v) => v.severity === "high").length,
    medium: violations.filter((v) => v.severity === "medium").length,
    low: violations.filter((v) => v.severity === "low").length,
  };

  const lines = [`ActionBox detected ${violations.length} violation(s):`];
  if (bySeverity.critical > 0) lines.push(`  CRITICAL: ${bySeverity.critical}`);
  if (bySeverity.high > 0) lines.push(`  HIGH: ${bySeverity.high}`);
  if (bySeverity.medium > 0) lines.push(`  MEDIUM: ${bySeverity.medium}`);
  if (bySeverity.low > 0) lines.push(`  LOW: ${bySeverity.low}`);

  return lines.join("\n");
}
