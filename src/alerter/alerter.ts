import type { Violation } from "../types.js";
import type { PluginLogger } from "../openclaw-sdk.js";
import { formatPlainText, formatViolationSummary } from "./formatters.js";

/**
 * ActionBoxAlerter dispatches violation alerts via the plugin logger.
 * In a future version, this could use OpenClaw's channel/gateway APIs
 * for richer alert delivery (Slack, email, etc.).
 */
export class ActionBoxAlerter {
  private logger: PluginLogger;

  constructor(logger: PluginLogger) {
    this.logger = logger;
  }

  /**
   * Log a single violation.
   */
  alertViolation(violation: Violation): void {
    const formatted = formatPlainText(violation);
    if (violation.severity === "critical") {
      this.logger.error(`[ActionBox] ${formatted}`);
    } else if (violation.severity === "high") {
      this.logger.warn(`[ActionBox] ${formatted}`);
    } else {
      this.logger.info(`[ActionBox] ${formatted}`);
    }
  }

  /**
   * Log multiple violations with a summary.
   */
  alertViolations(violations: Violation[]): void {
    if (violations.length === 0) return;

    const summary = formatViolationSummary(violations);
    this.logger.warn(`[ActionBox] ${summary}`);

    for (const violation of violations) {
      this.alertViolation(violation);
    }
  }

  /**
   * Log a drift detection alert.
   */
  alertDrift(
    skillId: string,
    currentHash: string,
    expectedHash: string,
  ): void {
    this.logger.warn(
      `[ActionBox] Drift detected for skill "${skillId}". ` +
      `Expected hash: ${expectedHash.slice(0, 12)}..., ` +
      `current: ${currentHash.slice(0, 12)}... ` +
      `Run "actionbox generate ${skillId}" to regenerate.`,
    );
  }
}
