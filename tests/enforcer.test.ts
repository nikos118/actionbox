import { describe, it, expect, beforeEach } from "vitest";
import { ActionBoxEnforcer } from "../src/enforcer/enforcer.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { ToolCallEvent, AgentEndEvent } from "../src/openclaw-sdk.js";

function createTmpSkillDir(boxContent: string, skillContent?: string): string {
  const dir = resolve(tmpdir(), `actionbox-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ACTIONBOX.md"), boxContent, "utf-8");
  if (skillContent) {
    writeFileSync(join(dir, "SKILL.md"), skillContent, "utf-8");
  }
  return dir;
}

const sampleBoxContent = `# ACTIONBOX.md — Behavioral Contract

---
version: "1.0"
skillId: test-skill
skillName: Test Skill
allowedTools:
  - name: read_file
    reason: Needed for reading
  - name: write_file
    reason: Needed for writing
deniedTools:
  - name: shell_exec
    reason: Dangerous
filesystem:
  readable:
    - "./src/**"
  writable:
    - "./output/**"
  denied:
    - "~/.ssh/**"
network:
  allowedHosts:
    - "api.example.com"
  deniedHosts:
    - "*.onion"
behavior:
  summary: A test skill
  neverDo:
    - Execute shell commands
  maxToolCalls: 5
drift:
  skillHash: "deadbeef"
  generatedAt: "2025-01-15T10:00:00.000Z"
  generatorModel: claude-sonnet-4-5-20250929
  reviewed: false
---
`;

describe("ActionBoxEnforcer", () => {
  let enforcer: ActionBoxEnforcer;
  let tmpDir: string;

  beforeEach(() => {
    enforcer = new ActionBoxEnforcer("monitor");
    tmpDir = createTmpSkillDir(sampleBoxContent);
  });

  it("loads a box from a skill directory", async () => {
    const box = await enforcer.loadBox(tmpDir);
    expect(box.skillId).toBe("test-skill");
    expect(box.allowedTools).toHaveLength(2);
    expect(box.deniedTools).toHaveLength(1);
  });

  it("caches loaded boxes by skill ID", async () => {
    await enforcer.loadBox(tmpDir);
    const box = enforcer.getBox("test-skill");
    expect(box).toBeDefined();
    expect(box!.skillName).toBe("Test Skill");
  });

  it("returns all loaded boxes", async () => {
    await enforcer.loadBox(tmpDir);
    const boxes = enforcer.getAllBoxes();
    expect(boxes).toHaveLength(1);
  });

  it("checks tool calls against loaded boxes", async () => {
    await enforcer.loadBox(tmpDir);

    const event: ToolCallEvent = {
      skillId: "test-skill",
      toolName: "read_file",
      arguments: {},
      timestamp: new Date().toISOString(),
    };

    const violations = enforcer.check(event);
    expect(violations).toHaveLength(0);
  });

  it("returns empty violations for unknown skill", () => {
    const event: ToolCallEvent = {
      skillId: "unknown",
      toolName: "anything",
      arguments: {},
      timestamp: new Date().toISOString(),
    };

    const violations = enforcer.check(event);
    expect(violations).toHaveLength(0);
  });

  it("detects denied tool usage", async () => {
    await enforcer.loadBox(tmpDir);

    const event: ToolCallEvent = {
      skillId: "test-skill",
      toolName: "shell_exec",
      arguments: {},
      timestamp: new Date().toISOString(),
    };

    const violations = enforcer.check(event);
    expect(violations).toHaveLength(1);
    expect(violations[0].type).toBe("denied_tool");
  });

  it("checks agent_end events with tool call count", async () => {
    await enforcer.loadBox(tmpDir);

    const toolCalls: ToolCallEvent[] = Array.from({ length: 6 }, (_, i) => ({
      skillId: "test-skill",
      toolName: "read_file",
      arguments: {},
      timestamp: new Date().toISOString(),
    }));

    const event: AgentEndEvent = {
      skillId: "test-skill",
      toolCalls,
      result: null,
      timestamp: new Date().toISOString(),
    };

    const violations = enforcer.checkAgentEnd(event);
    const limitViolation = violations.find(
      (v) => v.type === "tool_call_limit_exceeded",
    );
    expect(limitViolation).toBeDefined();
    expect(limitViolation!.severity).toBe("medium");
  });

  it("does not flag tool call limit when under threshold", async () => {
    await enforcer.loadBox(tmpDir);

    const toolCalls: ToolCallEvent[] = Array.from({ length: 3 }, () => ({
      skillId: "test-skill",
      toolName: "read_file",
      arguments: {},
      timestamp: new Date().toISOString(),
    }));

    const event: AgentEndEvent = {
      skillId: "test-skill",
      toolCalls,
      result: null,
      timestamp: new Date().toISOString(),
    };

    const violations = enforcer.checkAgentEnd(event);
    const limitViolation = violations.find(
      (v) => v.type === "tool_call_limit_exceeded",
    );
    expect(limitViolation).toBeUndefined();
  });

  it("detects drift when SKILL.md has changed", async () => {
    const skillContent = "---\nid: test-skill\nname: Test\n---\n# Updated content";
    const dir = createTmpSkillDir(sampleBoxContent, skillContent);
    await enforcer.loadBox(dir);

    const drift = await enforcer.checkDrift(dir);
    expect(drift).not.toBeNull();
    expect(drift!.hasDrift).toBe(true);
    expect(drift!.skillId).toBe("test-skill");
  });

  it("returns null drift for missing ACTIONBOX.md", async () => {
    const dir = resolve(tmpdir(), `actionbox-test-nodrift-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    const drift = await enforcer.checkDrift(dir);
    expect(drift).toBeNull();
  });

  it("exposes enforcement mode", () => {
    expect(enforcer.enforcementMode).toBe("monitor");
    const strictEnforcer = new ActionBoxEnforcer("enforce");
    expect(strictEnforcer.enforcementMode).toBe("enforce");
  });

  it("handles loadBoxes with mixed valid/invalid directories", async () => {
    const invalidDir = resolve(tmpdir(), `actionbox-test-invalid-${randomUUID()}`);
    mkdirSync(invalidDir, { recursive: true });

    await enforcer.loadBoxes([tmpDir, invalidDir]);
    expect(enforcer.getAllBoxes()).toHaveLength(1);
  });
});
