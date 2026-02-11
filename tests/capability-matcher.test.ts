import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CapabilityMatcherCache,
  _buildClassificationPrompt,
} from "../src/enforcer/capability-matcher.js";
import { matchToolCall } from "../src/enforcer/matcher.js";
import { buildGlobalPolicy } from "../src/enforcer/policy.js";
import type { ActionBox } from "../src/types.js";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

describe("CapabilityMatcherCache", () => {
  let cache: CapabilityMatcherCache;

  beforeEach(() => {
    cache = new CapabilityMatcherCache();
  });

  it("starts empty", () => {
    expect(cache.size).toBe(0);
    expect(cache.has("any_tool")).toBe(false);
  });

  it("stores and retrieves classifications", () => {
    cache.set("google_calendar_read", {
      allowed: true,
      reason: "Matches calendar read access",
      matchedCapability: "Google Calendar read-only access",
    });

    expect(cache.has("google_calendar_read")).toBe(true);
    const result = cache.get("google_calendar_read");
    expect(result?.allowed).toBe(true);
    expect(result?.matchedCapability).toBe("Google Calendar read-only access");
  });

  it("returns undefined for cache misses", () => {
    expect(cache.get("unknown_tool")).toBeUndefined();
  });

  it("clears all entries", () => {
    cache.set("tool_a", { allowed: true, reason: "ok" });
    cache.set("tool_b", { allowed: false, reason: "denied" });
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has("tool_a")).toBe(false);
  });
});

describe("buildClassificationPrompt", () => {
  it("includes tool name and capabilities in prompt", () => {
    const prompt = _buildClassificationPrompt(
      "google_calendar_read",
      { query: "meetings" },
      ["Google Calendar read-only access", "Slack messaging"],
      ["Shell or command execution"],
    );

    expect(prompt).toContain("google_calendar_read");
    expect(prompt).toContain("Google Calendar read-only access");
    expect(prompt).toContain("Slack messaging");
    expect(prompt).toContain("Shell or command execution");
    expect(prompt).toContain("meetings");
  });

  it("handles empty capability arrays", () => {
    const prompt = _buildClassificationPrompt(
      "some_tool",
      {},
      [],
      [],
    );

    expect(prompt).toContain("- (none)");
  });
});

describe("matchToolCall with capabilities (integration)", () => {
  const capabilityBox: ActionBox = {
    version: "1.0",
    skillId: "calendar-sync",
    skillName: "Calendar Sync",
    allowedTools: [],
    deniedTools: [],
    allowedCapabilities: [
      "Google Calendar read-only access",
      "Local task management (create and update)",
      "Slack messaging for meeting notifications",
    ],
    deniedCapabilities: [
      "Shell or command execution",
      "Calendar event modification or deletion",
    ],
    filesystem: {
      readable: ["./config/**", "./data/**"],
      writable: ["./data/**"],
      denied: ["~/.ssh/**", "~/.aws/**", "**/.env"],
    },
    network: {
      allowedHosts: ["*.googleapis.com", "*.slack.com"],
      deniedHosts: ["*.onion"],
    },
    behavior: {
      summary: "Syncs calendar events to tasks",
      neverDo: ["Delete calendar events"],
      maxToolCalls: 20,
    },
    drift: {
      skillHash: "abc123",
      generatedAt: "2025-01-15T10:00:00.000Z",
      generatorModel: "claude-sonnet-4-5-20250929",
      reviewed: false,
    },
  };

  it("uses capability matching when no exact tool match and capabilities exist", async () => {
    const policy = buildGlobalPolicy([capabilityBox]);

    // Verify capabilities are in the policy
    expect(policy.allAllowedCapabilities).toContain("Google Calendar read-only access");
    expect(policy.allDeniedCapabilities).toContain("Shell or command execution");

    // Tool index should be empty (no allowedTools)
    expect(policy.toolIndex.size).toBe(0);
  });

  it("falls back to unlisted_tool when no capabilities and no cache", async () => {
    const boxNoCapabilities: ActionBox = {
      ...capabilityBox,
      allowedCapabilities: [],
      deniedCapabilities: [],
      allowedTools: [{ name: "read_file", reason: "reading" }],
    };
    const policy = buildGlobalPolicy([boxNoCapabilities]);

    // No cache provided, no capabilities → standard unlisted_tool behavior
    const violations = await matchToolCall("unknown_tool", {}, policy);
    expect(violations).toHaveLength(1);
    expect(violations[0].type).toBe("unlisted_tool");
  });

  it("uses cached classification on second call", async () => {
    const policy = buildGlobalPolicy([capabilityBox]);
    const cache = new CapabilityMatcherCache();

    // Pre-populate cache
    cache.set("google_calendar_read", {
      allowed: true,
      reason: "Matches Google Calendar read-only access",
      matchedCapability: "Google Calendar read-only access",
    });

    // Should use cache — no API call
    const violations = await matchToolCall(
      "google_calendar_read",
      {},
      policy,
      cache,
    );

    // Tool is allowed by capability — no violations
    expect(violations).toHaveLength(0);
  });

  it("produces denied_capability violation from cache", async () => {
    const policy = buildGlobalPolicy([capabilityBox]);
    const cache = new CapabilityMatcherCache();

    cache.set("shell_exec", {
      allowed: false,
      reason: "Matches denied capability",
      matchedCapability: "Shell or command execution",
    });

    const violations = await matchToolCall(
      "shell_exec",
      {},
      policy,
      cache,
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].type).toBe("denied_capability");
    expect(violations[0].severity).toBe("critical");
    expect(violations[0].message).toContain("Shell or command execution");
  });

  it("produces unlisted_capability violation when no capability matches", async () => {
    const policy = buildGlobalPolicy([capabilityBox]);
    const cache = new CapabilityMatcherCache();

    cache.set("random_unknown_tool", {
      allowed: false,
      reason: "Tool does not match any allowed capability",
    });

    const violations = await matchToolCall(
      "random_unknown_tool",
      {},
      policy,
      cache,
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].type).toBe("unlisted_capability");
    expect(violations[0].severity).toBe("high");
  });

  it("still enforces filesystem denied paths even with capability matching", async () => {
    const policy = buildGlobalPolicy([capabilityBox]);
    const cache = new CapabilityMatcherCache();

    // Tool allowed by capability
    cache.set("google_calendar_read", {
      allowed: true,
      reason: "Matches calendar access",
      matchedCapability: "Google Calendar read-only access",
    });

    const violations = await matchToolCall(
      "google_calendar_read",
      { path: "~/.ssh/id_rsa" },
      policy,
      cache,
    );

    const denied = violations.find((v) => v.type === "filesystem_denied");
    expect(denied).toBeDefined();
    expect(denied!.severity).toBe("critical");
  });

  it("still enforces network denied hosts even with capability matching", async () => {
    const policy = buildGlobalPolicy([capabilityBox]);
    const cache = new CapabilityMatcherCache();

    cache.set("some_tool", {
      allowed: true,
      reason: "ok",
      matchedCapability: "Slack messaging for meeting notifications",
    });

    const violations = await matchToolCall(
      "some_tool",
      { url: "https://secret.onion/data" },
      policy,
      cache,
    );

    const netViolation = violations.find((v) => v.type === "network_violation");
    expect(netViolation).toBeDefined();
    expect(netViolation!.severity).toBe("critical");
  });

  it("returns no violations when policy has no boxes", async () => {
    const policy = buildGlobalPolicy([]);
    const violations = await matchToolCall("anything", {}, policy);
    expect(violations).toHaveLength(0);
  });
});
