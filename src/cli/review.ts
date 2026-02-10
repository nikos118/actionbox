import chalk from "chalk";
import { readFile, writeFile } from "node:fs/promises";
import { actionBoxPath } from "../utils/config.js";
import { parseActionBox, serializeActionBox } from "../utils/yaml.js";
import type { PluginLogger } from "../openclaw-sdk.js";

export interface ReviewCommandOptions {
  skillsDir: string;
  reviewer?: string;
  logger: PluginLogger;
}

/**
 * Show an ActionBox for review and optionally mark it as reviewed.
 */
export async function runReview(
  skillName: string,
  options: ReviewCommandOptions,
): Promise<void> {
  const { skillsDir, reviewer, logger } = options;
  const skillDir = `${skillsDir}/${skillName}`;
  const boxFile = actionBoxPath(skillDir);

  let content: string;
  try {
    content = await readFile(boxFile, "utf-8");
  } catch {
    logger.error(`No ACTIONBOX.md found for skill "${skillName}" at ${boxFile}`);
    return;
  }

  const box = parseActionBox(content);

  // Display the box
  logger.info(chalk.blue(`\nActionBox for "${box.skillName}" (${box.skillId})\n`));
  logger.info(chalk.gray(`Generated: ${box.drift.generatedAt}`));
  logger.info(chalk.gray(`Model: ${box.drift.generatorModel}`));
  logger.info(
    chalk.gray(
      `Reviewed: ${box.drift.reviewed ? `yes (by ${box.drift.reviewedBy ?? "unknown"})` : "no"}`,
    ),
  );
  logger.info(chalk.gray(`Skill hash: ${box.drift.skillHash.slice(0, 12)}...`));

  logger.info(chalk.blue("\n--- Allowed Tools ---"));
  for (const tool of box.allowedTools) {
    logger.info(`  ${chalk.green("+")} ${tool.name}: ${tool.reason}`);
  }

  logger.info(chalk.blue("\n--- Denied Tools ---"));
  for (const tool of box.deniedTools) {
    logger.info(`  ${chalk.red("-")} ${tool.name}: ${tool.reason}`);
  }

  logger.info(chalk.blue("\n--- Filesystem ---"));
  logger.info(`  Readable: ${box.filesystem.readable.join(", ") || "(none)"}`);
  logger.info(`  Writable: ${box.filesystem.writable.join(", ") || "(none)"}`);
  logger.info(`  Denied: ${box.filesystem.denied.join(", ") || "(none)"}`);

  logger.info(chalk.blue("\n--- Network ---"));
  logger.info(`  Allowed: ${box.network.allowedHosts.join(", ") || "(none)"}`);
  logger.info(`  Denied: ${box.network.deniedHosts.join(", ") || "(none)"}`);

  logger.info(chalk.blue("\n--- Behavior ---"));
  logger.info(`  ${box.behavior.summary}`);
  if (box.behavior.maxToolCalls) {
    logger.info(`  Max tool calls: ${box.behavior.maxToolCalls}`);
  }
  logger.info(chalk.blue("  Never do:"));
  for (const item of box.behavior.neverDo) {
    logger.info(`    - ${item}`);
  }

  // Mark as reviewed if reviewer is provided
  if (reviewer) {
    box.drift.reviewed = true;
    box.drift.reviewedBy = reviewer;
    box.drift.reviewedAt = new Date().toISOString();

    await writeFile(boxFile, serializeActionBox(box), "utf-8");
    logger.info(chalk.green(`\nMarked as reviewed by "${reviewer}".`));
  } else {
    logger.info(
      chalk.yellow(
        `\nTo mark as reviewed, run: actionbox review ${skillName} --reviewer <name>`,
      ),
    );
  }
}
