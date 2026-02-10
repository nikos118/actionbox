import type {
  OpenClawPluginDefinition,
  OpenClawPluginApi,
  BeforeToolCallEvent,
  BeforeToolCallResult,
  AfterToolCallEvent,
  ToolContext,
} from "./openclaw-sdk.js";
import { ActionBoxEnforcer } from "./enforcer/enforcer.js";
import { ActionBoxAlerter } from "./alerter/alerter.js";
import { buildConfig, discoverSkillDirs } from "./utils/config.js";
import { runGenerate, runGenerateAll } from "./cli/generate.js";
import { runAudit } from "./cli/audit.js";
import { runStatus, recordViolations } from "./cli/status.js";
import { runReview } from "./cli/review.js";
import type { ActionBoxConfig } from "./types.js";

// Re-export all public modules
export * from "./types.js";
export { ActionBoxEnforcer } from "./enforcer/enforcer.js";
export { ActionBoxAlerter } from "./alerter/alerter.js";
export { generateActionBox } from "./generator/generate.js";
export { parseSkillMd } from "./generator/parser.js";
export { matchToolCall } from "./enforcer/matcher.js";
export { buildGlobalPolicy, attributeToolToSkills } from "./enforcer/policy.js";
export type { GlobalPolicy } from "./enforcer/policy.js";
export {
  pathMatchesAny,
  checkFilesystemAccess,
  checkNetworkAccess,
} from "./enforcer/path-matcher.js";
export {
  extractPaths,
  extractHosts,
  inferFileOperation,
} from "./enforcer/param-extractor.js";
export {
  parseActionBox,
  serializeActionBox,
} from "./utils/yaml.js";
export { sha256 } from "./utils/hash.js";

/**
 * Config schema with parse/safeParse for OpenClaw's plugin loader.
 */
const configSchema = {
  safeParse(data: unknown) {
    if (typeof data !== "object" || data === null) {
      return { success: false, error: "Config must be an object" };
    }
    const raw = data as Record<string, unknown>;
    if (raw.mode && raw.mode !== "monitor" && raw.mode !== "enforce") {
      return { success: false, error: `Invalid mode: ${raw.mode}` };
    }
    return { success: true, data };
  },
  parse(data: unknown) {
    const result = this.safeParse(data);
    if (!result.success) throw new Error(String(result.error));
    return result.data;
  },
  jsonSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["monitor", "enforce"],
        default: "monitor",
        description: "Enforcement mode: monitor (alert only) or enforce (block violations)",
      },
      skillsDir: {
        type: "string",
        default: "skills",
        description: "Directory containing skill definitions",
      },
      autoGenerate: {
        type: "boolean",
        default: false,
        description: "Auto-generate boxes for new skills",
      },
      generatorModel: {
        type: "string",
        default: "claude-sonnet-4-5-20250929",
        description: "Model for ActionBox generation",
      },
      driftCheckInterval: {
        type: "number",
        default: 300000,
        description: "Drift check interval in milliseconds",
      },
    },
  },
};

const actionboxPlugin: OpenClawPluginDefinition = {
  id: "actionbox",
  name: "ActionBox",
  description: "Behavioral contracts for AI agent skills — generates, reviews, and enforces security boundaries",
  version: "0.1.0",
  configSchema,

  async register(api: OpenClawPluginApi): Promise<void> {
    const workspaceDir = (api.config as Record<string, unknown>).workspaceDir as string ?? ".";
    const config = buildConfig(api.pluginConfig, workspaceDir);
    const enforcer = new ActionBoxEnforcer(config.mode, api.logger);
    const alerter = new ActionBoxAlerter(api.logger);

    // Load all existing ActionBoxes
    const skillDirs = await discoverSkillDirs(config.skillsDir);
    await enforcer.loadBoxes(skillDirs);

    api.logger.info(
      `[ActionBox] Loaded ${enforcer.getAllBoxes().length} contract(s) in ${config.mode} mode`,
    );

    // --- CLI Commands (Commander.js style) ---

    api.registerCli(
      ({ program, logger }) => {
        const ab = program.command("actionbox").description("ActionBox behavioral contract management");

        ab.command("generate <skill>")
          .description("Generate an ActionBox for a skill")
          .option("--skip-review", "Skip the adversarial review pass")
          .action(async (skill: unknown, opts: unknown) => {
            const options = opts as Record<string, unknown>;
            await runGenerate(skill as string, {
              model: config.generatorModel,
              skillsDir: config.skillsDir,
              skipReview: options.skipReview as boolean | undefined,
              logger,
            });
          });

        ab.command("generate-all")
          .description("Generate ActionBoxes for all skills")
          .option("--skip-review", "Skip the adversarial review pass")
          .action(async (opts: unknown) => {
            const options = opts as Record<string, unknown>;
            await runGenerateAll({
              model: config.generatorModel,
              skillsDir: config.skillsDir,
              skipReview: options.skipReview as boolean | undefined,
              logger,
            });
          });

        ab.command("audit")
          .description("Audit all skills for ActionBox coverage and drift")
          .action(async () => {
            await runAudit({ skillsDir: config.skillsDir, logger });
          });

        ab.command("status")
          .description("Show enforcement status and recent violations")
          .action(async () => {
            await runStatus(config, logger);
          });

        ab.command("review <skill>")
          .description("Review an ActionBox and optionally mark as reviewed")
          .option("--reviewer <name>", "Mark as reviewed by this person")
          .action(async (skill: unknown, opts: unknown) => {
            const options = opts as Record<string, unknown>;
            await runReview(skill as string, {
              skillsDir: config.skillsDir,
              reviewer: options.reviewer as string | undefined,
              logger,
            });
          });
      },
      { commands: ["actionbox"] },
    );

    // --- before_tool_call: Enforce mode blocks violations ---

    api.on("before_tool_call", (
      event: BeforeToolCallEvent,
      _ctx: ToolContext,
    ): BeforeToolCallResult | void => {
      const violations = enforcer.check(event.toolName, event.params);

      if (violations.length > 0) {
        recordViolations(violations);
        alerter.alertViolations(violations);

        if (config.mode === "enforce") {
          const worst = violations[0];
          return {
            block: true,
            blockReason: `[ActionBox] ${worst.message}`,
          };
        }
      }
    });

    // --- after_tool_call: Monitor mode logs all violations ---

    api.on("after_tool_call", (
      event: AfterToolCallEvent,
      _ctx: ToolContext,
    ): void => {
      const violations = enforcer.check(event.toolName, event.params);

      if (violations.length > 0) {
        recordViolations(violations);
        // In monitor mode, after_tool_call is the primary alert path.
        // In enforce mode, before_tool_call already alerted.
        if (config.mode === "monitor") {
          alerter.alertViolations(violations);
        }
      }
    });

    // --- Background drift detection service ---

    let driftTimer: ReturnType<typeof setInterval> | null = null;

    api.registerService({
      id: "actionbox-drift-check",
      async start(ctx) {
        ctx.logger.info("[ActionBox] Drift detection service started");

        const checkDrift = async () => {
          const currentSkillDirs = await discoverSkillDirs(config.skillsDir);
          for (const dir of currentSkillDirs) {
            const driftStatus = await enforcer.checkDrift(dir);
            if (driftStatus?.hasDrift) {
              alerter.alertDrift(
                driftStatus.skillId,
                driftStatus.currentHash,
                driftStatus.expectedHash,
              );
            }
          }
        };

        driftTimer = setInterval(checkDrift, config.driftCheckInterval);
        // Run once immediately
        await checkDrift();
      },
      stop() {
        if (driftTimer) {
          clearInterval(driftTimer);
          driftTimer = null;
        }
      },
    });
  },
};

export default actionboxPlugin;
