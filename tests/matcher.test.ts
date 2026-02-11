import { describe, it, expect } from "vitest";
import { matchToolCall } from "../src/enforcer/matcher.js";
import { buildGlobalPolicy } from "../src/enforcer/policy.js";
import type { ActionBox } from "../src/types.js";

const calendarBox: ActionBox = {
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

const githubBox: ActionBox = {
  version: "1.0",
  skillId: "github-triage",
  skillName: "GitHub Triage",
  allowedTools: [
    { name: "github_list_issues", reason: "List issues" },
    { name: "github_add_label", reason: "Add labels" },
    { name: "slack_send_message", reason: "Notify team" },
  ],
  deniedTools: [
    { name: "shell_exec", reason: "No shell needed" },
    { name: "github_close_issue", reason: "Triage doesn't close" },
  ],
  filesystem: {
    readable: ["./config/**"],
    writable: [],
    denied: ["~/.ssh/**", "**/.env"],
  },
  network: {
    allowedHosts: ["api.github.com", "*.slack.com"],
    deniedHosts: ["*.onion"],
  },
  behavior: {
    summary: "Triages GitHub issues",
    neverDo: ["Close issues"],
    maxToolCalls: 50,
  },
  drift: {
    skillHash: "def456",
    generatedAt: "2025-01-15T10:00:00.000Z",
    generatorModel: "claude-sonnet-4-5-20250929",
    reviewed: false,
  },
};

describe("matchToolCall (multi-skill global policy)", () => {
  it("returns no violations for an allowed tool", async () => {
    const policy = buildGlobalPolicy([calendarBox]);
    const violations = await matchToolCall("google_calendar_read", {}, policy);
    expect(violations).toHaveLength(0);
  });

  it("returns a critical violation for a globally denied tool", async () => {
    // shell_exec is denied by both contracts and allowed by none
    const policy = buildGlobalPolicy([calendarBox, githubBox]);
    const violations = await matchToolCall("shell_exec", {}, policy);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe("critical");
    expect(violations[0].type).toBe("denied_tool");
  });

  it("does NOT deny a tool that one contract denies but another allows", async () => {
    // github_close_issue is denied by github-triage but if another skill allowed it, it wouldn't be globally denied
    const boxThatAllowsClose: ActionBox = {
      ...calendarBox,
      skillId: "closer",
      allowedTools: [{ name: "github_close_issue", reason: "Close issues" }],
      deniedTools: [],
    };
    const policy = buildGlobalPolicy([githubBox, boxThatAllowsClose]);
    const violations = await matchToolCall("github_close_issue", {}, policy);

    // Should NOT be denied — the "closer" contract allows it
    const deniedViolation = violations.find((v) => v.type === "denied_tool");
    expect(deniedViolation).toBeUndefined();
  });

  it("returns a high violation for an unlisted tool", async () => {
    const policy = buildGlobalPolicy([calendarBox]);
    const violations = await matchToolCall("unknown_tool", {}, policy);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe("high");
    expect(violations[0].type).toBe("unlisted_tool");
  });

  it("detects globally denied filesystem paths", async () => {
    const policy = buildGlobalPolicy([calendarBox, githubBox]);
    // ~/.ssh/** is denied by both contracts
    const violations = await matchToolCall("google_calendar_read", {
      path: "~/.ssh/id_rsa",
    }, policy);

    const denied = violations.find((v) => v.type === "filesystem_denied");
    expect(denied).toBeDefined();
    expect(denied!.severity).toBe("critical");
  });

  it("allows reads to paths permitted by claiming contract", async () => {
    const policy = buildGlobalPolicy([calendarBox]);
    const violations = await matchToolCall("google_calendar_read", {
      path: "./config/calendar.yaml",
    }, policy);
    expect(violations).toHaveLength(0);
  });

  it("flags reads to paths not permitted by any contract", async () => {
    const policy = buildGlobalPolicy([calendarBox]);
    const violations = await matchToolCall("google_calendar_read", {
      path: "/etc/passwd",
    }, policy);

    const fsViolation = violations.find(
      (v) => v.type === "filesystem_read_violation",
    );
    expect(fsViolation).toBeDefined();
  });

  it("allows a path if ANY claiming contract permits it (multi-skill)", async () => {
    // slack_send_message is claimed by both calendar and github contracts
    // ./config/** is readable by both
    const policy = buildGlobalPolicy([calendarBox, githubBox]);
    const violations = await matchToolCall("slack_send_message", {
      path: "./config/app.yaml",
    }, policy);
    expect(violations).toHaveLength(0);
  });

  it("detects write to non-writable path for a claimed tool", async () => {
    // Add write_file to calendar's allowed tools so it gets filesystem checks
    const boxWithWrite: ActionBox = {
      ...calendarBox,
      allowedTools: [
        ...calendarBox.allowedTools,
        { name: "write_file", reason: "Write output" },
      ],
    };
    const policy = buildGlobalPolicy([boxWithWrite]);
    const violations = await matchToolCall("write_file", {
      path: "./config/calendar.yaml",
    }, policy);

    const writeViolation = violations.find(
      (v) => v.type === "filesystem_write_violation",
    );
    expect(writeViolation).toBeDefined();
  });

  it("flags unlisted tool that tries to write", async () => {
    const policy = buildGlobalPolicy([calendarBox]);
    const violations = await matchToolCall("write_file", {
      path: "./config/calendar.yaml",
    }, policy);

    const unlisted = violations.find((v) => v.type === "unlisted_tool");
    expect(unlisted).toBeDefined();
  });

  it("detects network violations via URL param extraction", async () => {
    const policy = buildGlobalPolicy([calendarBox]);
    const violations = await matchToolCall("google_calendar_read", {
      url: "https://evil.com/exfiltrate",
    }, policy);

    const netViolation = violations.find((v) => v.type === "network_violation");
    expect(netViolation).toBeDefined();
  });

  it("allows network access to permitted hosts", async () => {
    const policy = buildGlobalPolicy([calendarBox]);
    const violations = await matchToolCall("google_calendar_read", {
      url: "https://calendar.google.com/events",
    }, policy);
    expect(violations).toHaveLength(0);
  });

  it("detects globally denied network hosts", async () => {
    const policy = buildGlobalPolicy([calendarBox, githubBox]);
    const violations = await matchToolCall("google_calendar_read", {
      url: "https://secret.onion/data",
    }, policy);

    const netViolation = violations.find((v) => v.type === "network_violation");
    expect(netViolation).toBeDefined();
    expect(netViolation!.severity).toBe("critical");
  });

  it("returns no violations when no contracts loaded", async () => {
    const policy = buildGlobalPolicy([]);
    const violations = await matchToolCall("anything", { path: "~/.ssh/id_rsa" }, policy);
    expect(violations).toHaveLength(0);
  });
});
