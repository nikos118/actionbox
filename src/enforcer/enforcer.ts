import { readFile } from "node:fs/promises";
import { parseActionBox } from "../utils/yaml.js";
import { actionBoxPath } from "../utils/config.js";
import { sha256 } from "../utils/hash.js";
import { skillMdPath } from "../utils/config.js";
import { matchToolCall } from "./matcher.js";
import type { ActionBox, Violation, EnforcementMode } from "../types.js";
import type { ToolCallEvent, AgentEndEvent } from "../openclaw-sdk.js";

export interface DriftStatus {
  skillId: string;
  hasDrift: boolean;
  currentHash: string;
  expectedHash: string;
}

/**
 * ActionBoxEnforcer loads and caches behavioral contracts,
 * then checks tool calls against them for violations.
 */
export class ActionBoxEnforcer {
  private boxes = new Map<string, ActionBox>();
  private mode: EnforcementMode;

  constructor(mode: EnforcementMode = "monitor") {
    this.mode = mode;
  }

  /**
   * Load an ActionBox from a skill directory into the enforcer cache.
   */
  async loadBox(skillDir: string): Promise<ActionBox> {
    const boxFile = actionBoxPath(skillDir);
    const content = await readFile(boxFile, "utf-8");
    const box = parseActionBox(content);
    this.boxes.set(box.skillId, box);
    return box;
  }

  /**
   * Load boxes from multiple skill directories.
   */
  async loadBoxes(skillDirs: string[]): Promise<void> {
    await Promise.all(
      skillDirs.map(async (dir) => {
        try {
          await this.loadBox(dir);
        } catch {
          // Skip directories without valid ACTIONBOX.md
        }
      }),
    );
  }

  /**
   * Get a loaded box by skill ID.
   */
  getBox(skillId: string): ActionBox | undefined {
    return this.boxes.get(skillId);
  }

  /**
   * Get all loaded boxes.
   */
  getAllBoxes(): ActionBox[] {
    return Array.from(this.boxes.values());
  }

  /**
   * Check a single tool call against its skill's ActionBox.
   * Returns violations (empty array if none).
   */
  check(event: ToolCallEvent): Violation[] {
    const box = this.boxes.get(event.skillId);
    if (!box) {
      // No box loaded for this skill — can't enforce
      return [];
    }
    return matchToolCall(event, box);
  }

  /**
   * Check all tool calls from an agent_end event.
   * Also checks maxToolCalls if configured.
   */
  checkAgentEnd(event: AgentEndEvent): Violation[] {
    const violations: Violation[] = [];
    const box = this.boxes.get(event.skillId);

    // Check each tool call
    for (const toolCall of event.toolCalls) {
      violations.push(...this.check(toolCall));
    }

    // Check tool call count limit
    if (box?.behavior.maxToolCalls) {
      if (event.toolCalls.length > box.behavior.maxToolCalls) {
        violations.push({
          id: crypto.randomUUID(),
          type: "tool_call_limit_exceeded",
          severity: "medium",
          skillId: event.skillId,
          toolName: "*",
          message: `Skill made ${event.toolCalls.length} tool calls, exceeding limit of ${box.behavior.maxToolCalls}`,
          rule: `behavior.maxToolCalls: ${box.behavior.maxToolCalls}`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return violations;
  }

  /**
   * Check if a skill's SKILL.md has drifted from when its box was generated.
   */
  async checkDrift(skillDir: string): Promise<DriftStatus | null> {
    const box = this.boxes.values();
    let targetBox: ActionBox | undefined;

    // Find the box for this skill dir by reading ACTIONBOX.md
    try {
      const content = await readFile(actionBoxPath(skillDir), "utf-8");
      targetBox = parseActionBox(content);
    } catch {
      return null;
    }

    if (!targetBox) return null;

    try {
      const skillContent = await readFile(skillMdPath(skillDir), "utf-8");
      const currentHash = sha256(skillContent);
      return {
        skillId: targetBox.skillId,
        hasDrift: currentHash !== targetBox.drift.skillHash,
        currentHash,
        expectedHash: targetBox.drift.skillHash,
      };
    } catch {
      return null;
    }
  }

  get enforcementMode(): EnforcementMode {
    return this.mode;
  }
}
