import type {
  OpenClawPlugin,
  OpenClawPluginApi,
  AgentEndEvent,
  // ToolCallEvent,
  // HookResult,
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
export {
  pathMatchesAny,
  checkFilesystemAccess,
  checkNetworkAccess,
} from "./enforcer/path-matcher.js";
export {
  parseActionBox,
  serializeActionBox,
} from "./utils/yaml.js";
export { sha256 } from "./utils/hash.js";

const actionboxPlugin: OpenClawPlugin = {
  id: "actionbox",
  name: "ActionBox",
  kind: "enforcer",
  configSchema: {
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
      alertChannel: {
        type: "string",
        description: "Channel for violation alerts",
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

  async register(api: OpenClawPluginApi): Promise<void> {
    const config = buildConfig(api.pluginConfig, api.workspaceRoot);
    const enforcer = new ActionBoxEnforcer(config.mode);
    const alerter = new ActionBoxAlerter({
      messaging: api.messaging,
      channel: config.alertChannel,
    });

    // Load all existing ActionBoxes
    const skillDirs = await discoverSkillDirs(config.skillsDir);
    await enforcer.loadBoxes(skillDirs);

    // --- CLI Commands ---

    api.registerCli({
      name: "actionbox generate",
      description: "Generate an ActionBox for a skill",
      arguments: [
        { name: "skill", description: "Skill directory name", required: true },
      ],
      options: [
        {
          flags: "--skip-review",
          description: "Skip the adversarial review pass",
        },
      ],
      action: async (args, opts) => {
        await runGenerate(args.skill as string, {
          model: config.generatorModel,
          skillsDir: config.skillsDir,
          skipReview: opts["skip-review"] as boolean | undefined,
        });
      },
    });

    api.registerCli({
      name: "actionbox generate-all",
      description: "Generate ActionBoxes for all skills",
      options: [
        {
          flags: "--skip-review",
          description: "Skip the adversarial review pass",
        },
      ],
      action: async (_args, opts) => {
        await runGenerateAll({
          model: config.generatorModel,
          skillsDir: config.skillsDir,
          skipReview: opts["skip-review"] as boolean | undefined,
        });
      },
    });

    api.registerCli({
      name: "actionbox audit",
      description: "Audit all skills for ActionBox coverage and drift",
      action: async () => {
        await runAudit({ skillsDir: config.skillsDir });
      },
    });

    api.registerCli({
      name: "actionbox status",
      description: "Show enforcement status and recent violations",
      action: async () => {
        await runStatus(config);
      },
    });

    api.registerCli({
      name: "actionbox review",
      description: "Review an ActionBox and optionally mark as reviewed",
      arguments: [
        { name: "skill", description: "Skill directory name", required: true },
      ],
      options: [
        {
          flags: "--reviewer <name>",
          description: "Mark as reviewed by this person",
        },
      ],
      action: async (args, opts) => {
        await runReview(args.skill as string, {
          skillsDir: config.skillsDir,
          reviewer: opts.reviewer as string | undefined,
        });
      },
    });

    // --- Path A: Post-hoc enforcement via agent_end ---

    api.on("agent_end", async (...args: unknown[]) => {
      const event = args[0] as AgentEndEvent;
      const violations = enforcer.checkAgentEnd(event);

      if (violations.length > 0) {
        recordViolations(violations);
        await alerter.alertViolations(violations);
      }
    });

    // --- Path B: Pre-execution blocking (future) ---
    // Uncomment when OpenClaw supports before_tool_call hooks:
    //
    // api.on("before_tool_call", async (...args: unknown[]) => {
    //   const event = args[0] as ToolCallEvent;
    //   const violations = enforcer.check(event);
    //
    //   if (violations.length > 0 && config.mode === "enforce") {
    //     recordViolations(violations);
    //     await alerter.alertViolations(violations);
    //     return { allow: false, reason: violations[0].message } as HookResult;
    //   }
    //
    //   if (violations.length > 0) {
    //     recordViolations(violations);
    //     await alerter.alertViolations(violations);
    //   }
    //
    //   return { allow: true } as HookResult;
    // });

    // --- Background drift detection service ---

    api.registerService({
      name: "actionbox-drift-check",
      interval: config.driftCheckInterval,
      run: async () => {
        const currentSkillDirs = await discoverSkillDirs(config.skillsDir);
        for (const dir of currentSkillDirs) {
          const driftStatus = await enforcer.checkDrift(dir);
          if (driftStatus?.hasDrift) {
            await alerter.alertDrift(
              driftStatus.skillId,
              driftStatus.currentHash,
              driftStatus.expectedHash,
            );
          }
        }
      },
    });
  },
};

export default actionboxPlugin;
