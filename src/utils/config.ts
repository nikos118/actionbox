import { resolve, join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import type { ActionBoxConfig } from "../types.js";
import type { PluginConfig } from "../openclaw-sdk.js";

const DEFAULTS: ActionBoxConfig = {
  mode: "monitor",
  skillsDir: "skills",
  autoGenerate: false,
  generatorModel: "claude-sonnet-4-5-20250929",
  driftCheckInterval: 300_000, // 5 minutes
};

/**
 * Build an ActionBoxConfig from plugin configuration, applying defaults.
 */
export function buildConfig(
  pluginConfig: PluginConfig,
  workspaceRoot: string,
): ActionBoxConfig {
  return {
    mode: pluginConfig.get<ActionBoxConfig["mode"]>("mode") ?? DEFAULTS.mode,
    skillsDir: resolve(
      workspaceRoot,
      pluginConfig.get<string>("skillsDir") ?? DEFAULTS.skillsDir,
    ),
    alertChannel: pluginConfig.get<string>("alertChannel"),
    autoGenerate:
      pluginConfig.get<boolean>("autoGenerate") ?? DEFAULTS.autoGenerate,
    generatorModel:
      pluginConfig.get<string>("generatorModel") ?? DEFAULTS.generatorModel,
    driftCheckInterval:
      pluginConfig.get<number>("driftCheckInterval") ??
      DEFAULTS.driftCheckInterval,
  };
}

/**
 * Discover all skill directories under the configured skills root.
 * A skill directory is one that contains a SKILL.md file.
 */
export async function discoverSkillDirs(
  skillsDir: string,
): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = join(skillsDir, entry.name);
      try {
        const skillMd = join(skillDir, "SKILL.md");
        await stat(skillMd);
        results.push(skillDir);
      } catch {
        // No SKILL.md — skip
      }
    }
  } catch {
    // Skills directory doesn't exist
  }
  return results;
}

/**
 * Get the ACTIONBOX.md path for a skill directory.
 */
export function actionBoxPath(skillDir: string): string {
  return join(skillDir, "ACTIONBOX.md");
}

/**
 * Get the SKILL.md path for a skill directory.
 */
export function skillMdPath(skillDir: string): string {
  return join(skillDir, "SKILL.md");
}
