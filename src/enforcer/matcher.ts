import { randomUUID } from "node:crypto";
import type { Violation, ViolationType, ViolationSeverity } from "../types.js";
import type { GlobalPolicy } from "./policy.js";
import { attributeToolToSkills } from "./policy.js";
import {
  checkFilesystemAccess,
  checkNetworkAccess,
  pathMatchesAny,
} from "./path-matcher.js";
import {
  extractPaths,
  extractHosts,
  inferFileOperation,
} from "./param-extractor.js";

/**
 * Check a tool call against the global policy.
 * Returns any violations found.
 *
 * Multi-skill strategy:
 * 1. Globally denied tools (denied by any, allowed by none) → critical
 * 2. Unlisted tools (not in any contract's allowedTools) → high
 * 3. Global denied paths (union of all contracts) → critical
 * 4. Per-skill filesystem/network checks for claiming contracts → high if ALL fail
 */
export function matchToolCall(
  toolName: string,
  params: Record<string, unknown>,
  policy: GlobalPolicy,
): Violation[] {
  const violations: Violation[] = [];

  // 1. Check globally denied tools
  const denied = policy.globalDeniedTools.get(toolName);
  if (denied) {
    violations.push(
      createViolation({
        type: "denied_tool",
        severity: "critical",
        skillId: denied.denyingSkills.join(", "),
        toolName,
        message: `Tool "${toolName}" is explicitly denied: ${denied.reason}`,
        rule: `deniedTools: ${toolName}`,
      }),
    );
    return violations; // Denied tool — stop here
  }

  // 2. Check if tool is known by any contract
  const claimingSkills = attributeToolToSkills(toolName, policy);
  if (claimingSkills.length === 0 && policy.boxes.size > 0) {
    violations.push(
      createViolation({
        type: "unlisted_tool",
        severity: "high",
        skillId: "unknown",
        toolName,
        message: `Tool "${toolName}" is not listed in any loaded ActionBox contract`,
        rule: "allowedTools (all contracts)",
      }),
    );
  }

  // 3. Extract paths and hosts from params
  const paths = extractPaths(toolName, params);
  const hosts = extractHosts(params);

  // 4. Check global denied paths (union of all contracts)
  for (const filePath of paths) {
    if (pathMatchesAny(filePath, policy.globalDeniedPaths)) {
      violations.push(
        createViolation({
          type: "filesystem_denied",
          severity: "critical",
          skillId: claimingSkills[0] ?? "unknown",
          toolName,
          message: `Path "${filePath}" matches a globally denied filesystem pattern`,
          rule: "filesystem.denied (global)",
          details: { path: filePath },
        }),
      );
    }
  }

  // 5. Check global denied hosts (union of all contracts)
  for (const host of hosts) {
    const globalNetResult = checkNetworkAccess(host, {
      allowedHosts: [],
      deniedHosts: policy.globalDeniedHosts,
    });
    if (globalNetResult) {
      violations.push(
        createViolation({
          type: "network_violation",
          severity: "critical",
          skillId: claimingSkills[0] ?? "unknown",
          toolName,
          message: globalNetResult,
          rule: "network.deniedHosts (global)",
          details: { host },
        }),
      );
    }
  }

  // 6. Per-skill filesystem/network checks for claiming contracts
  // A path/host is allowed if ANY claiming contract permits it
  if (claimingSkills.length > 0) {
    const operation = inferFileOperation(toolName);

    for (const filePath of paths) {
      // Skip if already flagged as globally denied
      if (pathMatchesAny(filePath, policy.globalDeniedPaths)) continue;

      let anyContractAllows = false;
      for (const skillId of claimingSkills) {
        const box = policy.boxes.get(skillId)!;
        const result = checkFilesystemAccess(filePath, operation, box.filesystem);
        if (result === null) {
          anyContractAllows = true;
          break;
        }
      }

      if (!anyContractAllows) {
        const type: ViolationType =
          operation === "write" ? "filesystem_write_violation" : "filesystem_read_violation";
        violations.push(
          createViolation({
            type,
            severity: "high",
            skillId: claimingSkills.join(", "),
            toolName,
            message: `${operation === "write" ? "Write" : "Read"} access to "${filePath}" is not permitted by any claiming contract`,
            rule: `filesystem.${operation === "write" ? "writable" : "readable"}`,
            details: { path: filePath, claimingSkills },
          }),
        );
      }
    }

    for (const host of hosts) {
      // Skip if already flagged as globally denied
      if (
        checkNetworkAccess(host, {
          allowedHosts: [],
          deniedHosts: policy.globalDeniedHosts,
        }) !== null
      ) {
        continue;
      }

      let anyContractAllows = false;
      for (const skillId of claimingSkills) {
        const box = policy.boxes.get(skillId)!;
        const result = checkNetworkAccess(host, box.network);
        if (result === null) {
          anyContractAllows = true;
          break;
        }
      }

      if (!anyContractAllows) {
        violations.push(
          createViolation({
            type: "network_violation",
            severity: "high",
            skillId: claimingSkills.join(", "),
            toolName,
            message: `Host "${host}" is not permitted by any claiming contract`,
            rule: "network.allowedHosts",
            details: { host, claimingSkills },
          }),
        );
      }
    }
  }

  return violations;
}

function createViolation(params: {
  type: ViolationType;
  severity: ViolationSeverity;
  skillId: string;
  toolName: string;
  message: string;
  rule: string;
  details?: Record<string, unknown>;
}): Violation {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...params,
  };
}
