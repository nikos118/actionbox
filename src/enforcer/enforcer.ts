import { readFile } from "node:fs/promises";
import { parseActionBox } from "../utils/yaml.js";
import { actionBoxPath, skillMdPath } from "../utils/config.js";
import { sha256 } from "../utils/hash.js";
import { buildGlobalPolicy } from "./policy.js";
import type { GlobalPolicy } from "./policy.js";
import { matchToolCall } from "./matcher.js";
import { CapabilityMatcherCache } from "./capability-matcher.js";
import type { ActionBox, Violation, EnforcementMode } from "../types.js";
import type { PluginLogger } from "../openclaw-sdk.js";

export interface DriftStatus {
  skillId: string;
  hasDrift: boolean;
  currentHash: string;
  expectedHash: string;
}

/**
 * ActionBoxEnforcer loads behavioral contracts, builds a global policy
 * from all loaded contracts, and checks tool calls against it.
 *
 * Handles multi-skill environments where all skills are active simultaneously
 * by using tool-name attribution to map calls to claiming contracts.
 */
export class ActionBoxEnforcer {
  private boxes = new Map<string, ActionBox>();
  private policy: GlobalPolicy;
  private mode: EnforcementMode;
  private logger?: PluginLogger;
  private capabilityCache = new CapabilityMatcherCache();
  private capabilityModel?: string;

  constructor(mode: EnforcementMode = "monitor", logger?: PluginLogger, capabilityModel?: string) {
    this.mode = mode;
    this.logger = logger;
    this.capabilityModel = capabilityModel;
    this.policy = buildGlobalPolicy([]);
  }

  /**
   * Load an ActionBox from a skill directory into the enforcer.
   */
  async loadBox(skillDir: string): Promise<ActionBox> {
    const boxFile = actionBoxPath(skillDir);
    const content = await readFile(boxFile, "utf-8");
    const box = parseActionBox(content);
    this.boxes.set(box.skillId, box);
    this.rebuildPolicy();
    return box;
  }

  /**
   * Load boxes from multiple skill directories.
   */
  async loadBoxes(skillDirs: string[]): Promise<void> {
    await Promise.all(
      skillDirs.map(async (dir) => {
        try {
          const boxFile = actionBoxPath(dir);
          const content = await readFile(boxFile, "utf-8");
          const box = parseActionBox(content);
          this.boxes.set(box.skillId, box);
        } catch {
          // Skip directories without valid ACTIONBOX.md
        }
      }),
    );
    this.rebuildPolicy();
  }

  /**
   * Rebuild the global policy from all loaded boxes.
   */
  private rebuildPolicy(): void {
    this.policy = buildGlobalPolicy(Array.from(this.boxes.values()));
    this.capabilityCache.clear();
    this.logger?.debug(
      `ActionBox policy rebuilt: ${this.boxes.size} contracts, ` +
      `${this.policy.toolIndex.size} indexed tools, ` +
      `${this.policy.globalDeniedTools.size} globally denied tools, ` +
      `${this.policy.allAllowedCapabilities.length} allowed capabilities, ` +
      `${this.policy.allDeniedCapabilities.length} denied capabilities`,
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
   * Get the current global policy.
   */
  getPolicy(): GlobalPolicy {
    return this.policy;
  }

  /**
   * Check a tool call against the global policy.
   * This is the main enforcement entry point, used by both
   * before_tool_call (blocking) and after_tool_call (monitoring) hooks.
   */
  async check(toolName: string, params: Record<string, unknown>): Promise<Violation[]> {
    return matchToolCall(toolName, params, this.policy, this.capabilityCache, this.capabilityModel);
  }

  /**
   * Check if a skill's SKILL.md has drifted from when its box was generated.
   */
  async checkDrift(skillDir: string): Promise<DriftStatus | null> {
    let targetBox: ActionBox | undefined;

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
