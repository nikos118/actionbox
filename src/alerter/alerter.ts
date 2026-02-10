import type { Violation } from "../types.js";
import type { MessageApi } from "../openclaw-sdk.js";
import {
  formatMarkdown,
  formatSlackBlocks,
  formatViolationSummary,
} from "./formatters.js";

export interface AlerterOptions {
  messaging: MessageApi;
  channel?: string;
}

/**
 * ActionBoxAlerter dispatches violation alerts via the OpenClaw messaging API.
 */
export class ActionBoxAlerter {
  private messaging: MessageApi;
  private channel: string;

  constructor(options: AlerterOptions) {
    this.messaging = options.messaging;
    this.channel = options.channel ?? "actionbox-alerts";
  }

  /**
   * Send an alert for a single violation.
   */
  async alertViolation(violation: Violation): Promise<void> {
    const markdown = formatMarkdown(violation);
    await this.messaging.send(this.channel, markdown);
  }

  /**
   * Send alerts for multiple violations with a summary.
   */
  async alertViolations(violations: Violation[]): Promise<void> {
    if (violations.length === 0) return;

    // Send summary first
    const summary = formatViolationSummary(violations);
    await this.messaging.send(this.channel, summary);

    // Send individual violations as Slack blocks if available
    for (const violation of violations) {
      const blocks = formatSlackBlocks(violation);
      try {
        await this.messaging.sendBlocks(this.channel, blocks);
      } catch {
        // Fall back to markdown if blocks aren't supported
        await this.alertViolation(violation);
      }
    }
  }

  /**
   * Send a drift detection alert.
   */
  async alertDrift(
    skillId: string,
    currentHash: string,
    expectedHash: string,
  ): Promise<void> {
    const message = [
      `### ActionBox Drift Detected`,
      "",
      `**Skill:** \`${skillId}\``,
      `**Expected SKILL.md hash:** \`${expectedHash.slice(0, 12)}...\``,
      `**Current SKILL.md hash:** \`${currentHash.slice(0, 12)}...\``,
      "",
      `The skill definition has changed since the ActionBox was generated.`,
      `Run \`actionbox generate ${skillId}\` to regenerate the behavioral contract.`,
    ].join("\n");

    await this.messaging.send(this.channel, message);
  }
}
