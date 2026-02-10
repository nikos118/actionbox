import chalk from "chalk";
import { readFile, writeFile } from "node:fs/promises";
import { actionBoxPath } from "../utils/config.js";
import { parseActionBox, serializeActionBox } from "../utils/yaml.js";

export interface ReviewCommandOptions {
  skillsDir: string;
  reviewer?: string;
}

/**
 * Show an ActionBox for review and optionally mark it as reviewed.
 */
export async function runReview(
  skillName: string,
  options: ReviewCommandOptions,
): Promise<void> {
  const { skillsDir, reviewer } = options;
  const skillDir = `${skillsDir}/${skillName}`;
  const boxFile = actionBoxPath(skillDir);

  let content: string;
  try {
    content = await readFile(boxFile, "utf-8");
  } catch {
    console.error(
      chalk.red(`No ACTIONBOX.md found for skill "${skillName}" at ${boxFile}`),
    );
    return;
  }

  const box = parseActionBox(content);

  // Display the box
  console.log(chalk.blue(`\nActionBox for "${box.skillName}" (${box.skillId})\n`));
  console.log(chalk.gray(`Generated: ${box.drift.generatedAt}`));
  console.log(chalk.gray(`Model: ${box.drift.generatorModel}`));
  console.log(
    chalk.gray(
      `Reviewed: ${box.drift.reviewed ? `yes (by ${box.drift.reviewedBy ?? "unknown"})` : "no"}`,
    ),
  );
  console.log(chalk.gray(`Skill hash: ${box.drift.skillHash.slice(0, 12)}...`));

  console.log(chalk.blue("\n--- Allowed Tools ---"));
  for (const tool of box.allowedTools) {
    console.log(`  ${chalk.green("+")} ${tool.name}: ${tool.reason}`);
  }

  console.log(chalk.blue("\n--- Denied Tools ---"));
  for (const tool of box.deniedTools) {
    console.log(`  ${chalk.red("-")} ${tool.name}: ${tool.reason}`);
  }

  console.log(chalk.blue("\n--- Filesystem ---"));
  console.log(`  Readable: ${box.filesystem.readable.join(", ") || "(none)"}`);
  console.log(`  Writable: ${box.filesystem.writable.join(", ") || "(none)"}`);
  console.log(`  Denied: ${box.filesystem.denied.join(", ") || "(none)"}`);

  console.log(chalk.blue("\n--- Network ---"));
  console.log(
    `  Allowed: ${box.network.allowedHosts.join(", ") || "(none)"}`,
  );
  console.log(
    `  Denied: ${box.network.deniedHosts.join(", ") || "(none)"}`,
  );

  console.log(chalk.blue("\n--- Behavior ---"));
  console.log(`  ${box.behavior.summary}`);
  if (box.behavior.maxToolCalls) {
    console.log(`  Max tool calls: ${box.behavior.maxToolCalls}`);
  }
  console.log(chalk.blue("  Never do:"));
  for (const item of box.behavior.neverDo) {
    console.log(`    - ${item}`);
  }

  // Mark as reviewed if reviewer is provided
  if (reviewer) {
    box.drift.reviewed = true;
    box.drift.reviewedBy = reviewer;
    box.drift.reviewedAt = new Date().toISOString();

    await writeFile(boxFile, serializeActionBox(box), "utf-8");
    console.log(
      chalk.green(`\nMarked as reviewed by "${reviewer}".`),
    );
  } else {
    console.log(
      chalk.yellow(
        `\nTo mark as reviewed, run: actionbox review ${skillName} --reviewer <name>`,
      ),
    );
  }
}
