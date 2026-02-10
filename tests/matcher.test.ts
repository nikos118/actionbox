import { describe, it, expect } from "vitest";
import { matchToolCall } from "../src/enforcer/matcher.js";
import type { ActionBox } from "../src/types.js";
import type { ToolCallEvent } from "../src/openclaw-sdk.js";

const sampleBox: ActionBox = {
  version: "1.0",
  skillId: "calendar-sync",
  skillName: "Calendar Sync",
  allowedTools: [
    { name: "google_calendar_read", reason: "Read calendar events" },
    { name: "task_create", reason: "Create tasks" },
    { name: "task_update", reason: "Update tasks" },
    { name: "slack_send_message", reason: "Send notifications" },
  ],
  deniedTools: [
    { name: "shell_exec", reason: "No shell needed" },
    { name: "file_delete", reason: "Should not delete files" },
  ],
  filesystem: {
    readable: ["./config/**", "./data/**"],
    writable: ["./data/**"],
    denied: ["~/.ssh/**", "~/.aws/**", "**/.env"],
  },
  network: {
    allowedHosts: ["calendar.google.com", "*.googleapis.com", "*.slack.com"],
    deniedHosts: ["*.onion"],
  },
  behavior: {
    summary: "Syncs calendar events to tasks",
    neverDo: ["Delete calendar events", "Execute shell commands"],
    maxToolCalls: 20,
  },
  drift: {
    skillHash: "abc123",
    generatedAt: "2025-01-15T10:00:00.000Z",
    generatorModel: "claude-sonnet-4-5-20250929",
    reviewed: false,
  },
};

function makeEvent(overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
  return {
    skillId: "calendar-sync",
    toolName: "google_calendar_read",
    arguments: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("matchToolCall", () => {
  it("returns no violations for an allowed tool", () => {
    const event = makeEvent({ toolName: "google_calendar_read" });
    const violations = matchToolCall(event, sampleBox);
    expect(violations).toHaveLength(0);
  });

  it("returns a critical violation for a denied tool", () => {
    const event = makeEvent({ toolName: "shell_exec" });
    const violations = matchToolCall(event, sampleBox);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe("critical");
    expect(violations[0].type).toBe("denied_tool");
    expect(violations[0].toolName).toBe("shell_exec");
  });

  it("returns a high violation for an unlisted tool", () => {
    const event = makeEvent({ toolName: "unknown_tool" });
    const violations = matchToolCall(event, sampleBox);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe("high");
    expect(violations[0].type).toBe("unlisted_tool");
  });

  it("detects filesystem read violations", () => {
    const event = makeEvent({
      toolName: "read_file",
      resolvedPaths: ["/etc/passwd"],
    });
    const violations = matchToolCall(event, sampleBox);

    // unlisted_tool + filesystem violation
    expect(violations.length).toBeGreaterThanOrEqual(1);
    const fsViolation = violations.find(
      (v) => v.type === "filesystem_read_violation",
    );
    expect(fsViolation).toBeDefined();
  });

  it("allows reads to permitted paths", () => {
    const event = makeEvent({
      toolName: "google_calendar_read",
      resolvedPaths: ["./config/calendar.yaml"],
    });
    const violations = matchToolCall(event, sampleBox);
    expect(violations).toHaveLength(0);
  });

  it("detects filesystem denied path access", () => {
    const event = makeEvent({
      toolName: "google_calendar_read",
      resolvedPaths: ["~/.ssh/id_rsa"],
    });
    const violations = matchToolCall(event, sampleBox);

    const denied = violations.find(
      (v) => v.type === "filesystem_denied",
    );
    expect(denied).toBeDefined();
    expect(denied!.severity).toBe("critical");
  });

  it("detects write to read-only path", () => {
    const event = makeEvent({
      toolName: "write_file",
      resolvedPaths: ["./config/calendar.yaml"],
    });
    const violations = matchToolCall(event, sampleBox);

    const writeViolation = violations.find(
      (v) => v.type === "filesystem_write_violation",
    );
    expect(writeViolation).toBeDefined();
  });

  it("allows writes to writable paths", () => {
    const event = makeEvent({
      toolName: "write_file",
      resolvedPaths: ["./data/tasks.json"],
    });
    const violations = matchToolCall(event, sampleBox);

    // write_file is unlisted, but filesystem write should pass
    const fsViolations = violations.filter((v) =>
      v.type.startsWith("filesystem"),
    );
    expect(fsViolations).toHaveLength(0);
  });

  it("detects network violations", () => {
    const event = makeEvent({
      toolName: "google_calendar_read",
      networkHosts: ["evil.com"],
    });
    const violations = matchToolCall(event, sampleBox);

    expect(violations).toHaveLength(1);
    expect(violations[0].type).toBe("network_violation");
  });

  it("allows network access to permitted hosts", () => {
    const event = makeEvent({
      toolName: "google_calendar_read",
      networkHosts: ["calendar.google.com"],
    });
    const violations = matchToolCall(event, sampleBox);
    expect(violations).toHaveLength(0);
  });

  it("detects denied network hosts", () => {
    const event = makeEvent({
      toolName: "google_calendar_read",
      networkHosts: ["secret.onion"],
    });
    const violations = matchToolCall(event, sampleBox);

    const netViolation = violations.find((v) => v.type === "network_violation");
    expect(netViolation).toBeDefined();
    expect(netViolation!.message).toContain("denied");
  });

  it("handles multiple violations in one tool call", () => {
    const event = makeEvent({
      toolName: "shell_exec",
      resolvedPaths: ["~/.ssh/id_rsa"],
      networkHosts: ["evil.com"],
    });
    const violations = matchToolCall(event, sampleBox);

    // Denied tool stops further checks, so we get just that
    expect(violations).toHaveLength(1);
    expect(violations[0].type).toBe("denied_tool");
  });

  it("reports multiple filesystem violations", () => {
    const event = makeEvent({
      toolName: "read_file",
      resolvedPaths: ["/etc/passwd", "~/.ssh/id_rsa"],
    });
    const violations = matchToolCall(event, sampleBox);

    const fsViolations = violations.filter((v) =>
      v.type.startsWith("filesystem"),
    );
    expect(fsViolations.length).toBeGreaterThanOrEqual(2);
  });
});
