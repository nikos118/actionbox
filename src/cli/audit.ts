import chalk from "chalk";
import Table from "cli-table3";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { discoverSkillDirs, actionBoxPath, skillMdPath } from "../utils/config.js";
import { parseActionBox } from "../utils/yaml.js";
import { sha256 } from "../utils/hash.js";

export interface AuditCommandOptions {
  skillsDir: string;
}

interface AuditRow {
  skill: string;
  hasBox: boolean;
  reviewed: boolean;
  drift: boolean;
  allowedTools: number;
  deniedTools: number;
}

/**
 * Audit all skills — show a table with box status and drift detection.
 */
export async function runAudit(options: AuditCommandOptions): Promise<void> {
  const { skillsDir } = options;

  console.log(chalk.blue("Auditing skills...\n"));
  const skillDirs = await discoverSkillDirs(skillsDir);

  if (skillDirs.length === 0) {
    console.log(chalk.yellow("No skills found."));
    return;
  }

  const rows: AuditRow[] = [];

  for (const dir of skillDirs) {
    const name = basename(dir);
    const row: AuditRow = {
      skill: name,
      hasBox: false,
      reviewed: false,
      drift: false,
      allowedTools: 0,
      deniedTools: 0,
    };

    try {
      await stat(actionBoxPath(dir));
      row.hasBox = true;

      const boxContent = await readFile(actionBoxPath(dir), "utf-8");
      const box = parseActionBox(boxContent);
      row.reviewed = box.drift.reviewed;
      row.allowedTools = box.allowedTools.length;
      row.deniedTools = box.deniedTools.length;

      // Check drift
      try {
        const skillContent = await readFile(skillMdPath(dir), "utf-8");
        const currentHash = sha256(skillContent);
        row.drift = currentHash !== box.drift.skillHash;
      } catch {
        row.drift = true; // Can't read SKILL.md — treat as drifted
      }
    } catch {
      // No ACTIONBOX.md
    }

    rows.push(row);
  }

  const table = new Table({
    head: ["Skill", "Box", "Reviewed", "Drift", "Allowed", "Denied"],
    style: { head: ["cyan"] },
  });

  for (const row of rows) {
    table.push([
      row.skill,
      row.hasBox ? chalk.green("yes") : chalk.red("no"),
      row.reviewed ? chalk.green("yes") : chalk.yellow("no"),
      row.drift ? chalk.red("DRIFTED") : chalk.green("ok"),
      String(row.allowedTools),
      String(row.deniedTools),
    ]);
  }

  console.log(table.toString());

  // Summary
  const noBox = rows.filter((r) => !r.hasBox).length;
  const drifted = rows.filter((r) => r.drift).length;
  const unreviewed = rows.filter((r) => r.hasBox && !r.reviewed).length;

  if (noBox > 0) {
    console.log(chalk.yellow(`\n${noBox} skill(s) missing ActionBox.`));
  }
  if (drifted > 0) {
    console.log(chalk.red(`${drifted} skill(s) with drift detected.`));
  }
  if (unreviewed > 0) {
    console.log(chalk.yellow(`${unreviewed} skill(s) not yet reviewed.`));
  }
  if (noBox === 0 && drifted === 0 && unreviewed === 0) {
    console.log(chalk.green("\nAll skills have reviewed, up-to-date ActionBoxes."));
  }
}
