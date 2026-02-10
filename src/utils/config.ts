import { resolve, join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import type { ActionBoxConfig } from "../types.js";

const DEFAULTS: ActionBoxConfig = {
  mode: "monitor",
  skillsDir: "skills",
  autoGenerate: false,
  generatorModel: "claude-sonnet-4-5-20250929",
  driftCheckInterval: 300_000, // 5 minutes
};

/**
 * Build an ActionBoxConfig from raw plugin config (plain object), applying defaults.
 */
export function buildConfig(
  pluginConfig: Record<string, unknown> | undefined,
  workspaceDir: string,
): ActionBoxConfig {
  const raw = pluginConfig ?? {};
  return {
    mode: (raw.mode as ActionBoxConfig["mode"]) ?? DEFAULTS.mode,
    skillsDir: resolve(
      workspaceDir,
      (raw.skillsDir as string) ?? DEFAULTS.skillsDir,
    ),
    autoGenerate: (raw.autoGenerate as boolean) ?? DEFAULTS.autoGenerate,
    generatorModel:
      (raw.generatorModel as string) ?? DEFAULTS.generatorModel,
    driftCheckInterval:
      (raw.driftCheckInterval as number) ?? DEFAULTS.driftCheckInterval,
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
