import chalk from "chalk";
import { generateActionBox } from "../generator/generate.js";
import { discoverSkillDirs, skillMdPath } from "../utils/config.js";
import { basename } from "node:path";
import { stat } from "node:fs/promises";

export interface GenerateCommandOptions {
  model: string;
  skillsDir: string;
  skipReview?: boolean;
}

/**
 * Generate an ActionBox for a single skill.
 */
export async function runGenerate(
  skillName: string,
  options: GenerateCommandOptions,
): Promise<void> {
  const { model, skillsDir, skipReview } = options;
  const skillDir = `${skillsDir}/${skillName}`;

  // Verify SKILL.md exists
  try {
    await stat(skillMdPath(skillDir));
  } catch {
    console.error(
      chalk.red(`Error: No SKILL.md found at ${skillMdPath(skillDir)}`),
    );
    return;
  }

  console.log(
    chalk.blue(`Generating ActionBox for skill "${skillName}"...`),
  );
  console.log(chalk.gray(`  Model: ${model}`));
  console.log(chalk.gray(`  Review pass: ${skipReview ? "skipped" : "enabled"}`));

  try {
    const result = await generateActionBox({
      model,
      skillDir,
      skipReview,
    });

    console.log(chalk.green(`\nActionBox generated successfully!`));
    console.log(chalk.gray(`  Output: ${result.path}`));
    console.log(chalk.gray(`  Passes: ${result.passes}`));
    console.log(
      chalk.gray(`  Allowed tools: ${result.box.allowedTools.length}`),
    );
    console.log(
      chalk.gray(`  Denied tools: ${result.box.deniedTools.length}`),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nGeneration failed: ${message}`));
  }
}

/**
 * Generate ActionBoxes for all skills in the skills directory.
 */
export async function runGenerateAll(
  options: GenerateCommandOptions,
): Promise<void> {
  const { skillsDir } = options;

  console.log(chalk.blue(`Discovering skills in ${skillsDir}...`));
  const skillDirs = await discoverSkillDirs(skillsDir);

  if (skillDirs.length === 0) {
    console.log(chalk.yellow("No skills found with SKILL.md files."));
    return;
  }

  console.log(chalk.blue(`Found ${skillDirs.length} skill(s). Generating...\n`));

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
    console.log(""); // blank line between skills
  }

  console.log(
    chalk.blue(`\nDone. ${success} succeeded, ${failed} failed.`),
  );
}
