import chalk from "chalk";
import Table from "cli-table3";
import type { ActionBoxConfig, Violation } from "../types.js";
import type { PluginLogger } from "../openclaw-sdk.js";

// In-memory violation log for the current session
const recentViolations: Violation[] = [];
const MAX_RECENT = 20;

/**
 * Record a violation for the status display.
 */
export function recordViolation(violation: Violation): void {
  recentViolations.push(violation);
  if (recentViolations.length > MAX_RECENT) {
    recentViolations.shift();
  }
}

/**
 * Record multiple violations.
 */
export function recordViolations(violations: Violation[]): void {
  for (const v of violations) {
    recordViolation(v);
  }
}

/**
 * Show enforcement status, config, and recent violations.
 */
export async function runStatus(
  config: ActionBoxConfig,
  logger: PluginLogger,
): Promise<void> {
  logger.info(chalk.blue("ActionBox Status\n"));

  // Config
  const configTable = new Table();
  configTable.push(
    { "Enforcement mode": config.mode === "enforce" ? chalk.red(config.mode) : chalk.yellow(config.mode) },
    { "Skills directory": config.skillsDir },
    { "Auto-generate": config.autoGenerate ? "yes" : "no" },
    { "Generator model": config.generatorModel },
    { "Drift check interval": `${config.driftCheckInterval / 1000}s` },
  );
  console.log(configTable.toString());

  // Recent violations
  logger.info(chalk.blue(`\nRecent Violations (${recentViolations.length})\n`));

  if (recentViolations.length === 0) {
    logger.info(chalk.green("No recent violations."));
    return;
  }

  const violationTable = new Table({
    head: ["Time", "Severity", "Skill", "Tool", "Type"],
    style: { head: ["cyan"] },
  });

  for (const v of recentViolations.slice(-10)) {
    const time = new Date(v.timestamp).toLocaleTimeString();
    const severity =
      v.severity === "critical"
        ? chalk.red(v.severity)
        : v.severity === "high"
          ? chalk.yellow(v.severity)
          : chalk.gray(v.severity);

    violationTable.push([time, severity, v.skillId, v.toolName, v.type]);
  }

  console.log(violationTable.toString());
}
