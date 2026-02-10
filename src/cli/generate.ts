import chalk from "chalk";
import { generateActionBox } from "../generator/generate.js";
import { discoverSkillDirs, skillMdPath } from "../utils/config.js";
import { basename } from "node:path";
import { stat } from "node:fs/promises";
import type { PluginLogger } from "../openclaw-sdk.js";

export interface GenerateCommandOptions {
  model: string;
  skillsDir: string;
  skipReview?: boolean;
  logger: PluginLogger;
}

/**
 * Generate an ActionBox for a single skill.
 */
export async function runGenerate(
  skillName: string,
  options: GenerateCommandOptions,
): Promise<void> {
  const { model, skillsDir, skipReview, logger } = options;
  const skillDir = `${skillsDir}/${skillName}`;

  // Verify SKILL.md exists
  try {
    await stat(skillMdPath(skillDir));
  } catch {
    logger.error(`No SKILL.md found at ${skillMdPath(skillDir)}`);
    return;
  }

  logger.info(
    chalk.blue(`Generating ActionBox for skill "${skillName}"...`),
  );
  logger.info(chalk.gray(`  Model: ${model}`));
  logger.info(chalk.gray(`  Review pass: ${skipReview ? "skipped" : "enabled"}`));

  try {
    const result = await generateActionBox({
      model,
      skillDir,
      skipReview,
    });

    logger.info(chalk.green(`ActionBox generated successfully!`));
    logger.info(chalk.gray(`  Output: ${result.path}`));
    logger.info(chalk.gray(`  Passes: ${result.passes}`));
    logger.info(chalk.gray(`  Allowed tools: ${result.box.allowedTools.length}`));
    logger.info(chalk.gray(`  Denied tools: ${result.box.deniedTools.length}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Generation failed: ${message}`);
  }
}

/**
 * Generate ActionBoxes for all skills in the skills directory.
 */
export async function runGenerateAll(
  options: GenerateCommandOptions,
): Promise<void> {
  const { skillsDir, logger } = options;

  logger.info(chalk.blue(`Discovering skills in ${skillsDir}...`));
  const skillDirs = await discoverSkillDirs(skillsDir);

  if (skillDirs.length === 0) {
    logger.warn("No skills found with SKILL.md files.");
    return;
  }

  logger.info(chalk.blue(`Found ${skillDirs.length} skill(s). Generating...\n`));

  let success = 0;
  let failed = 0;

  for (const dir of skillDirs) {
    const name = basename(dir);
    try {
      await runGenerate(name, options);
      success++;
    } catch {
      failed++;
    }
  }

  logger.info(chalk.blue(`Done. ${success} succeeded, ${failed} failed.`));
}
