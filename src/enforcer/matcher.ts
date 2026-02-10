import { randomUUID } from "node:crypto";
import type { ActionBox, Violation, ViolationType, ViolationSeverity } from "../types.js";
import type { ToolCallEvent } from "../openclaw-sdk.js";
import { checkFilesystemAccess, checkNetworkAccess, pathMatchesAny } from "./path-matcher.js";

/**
 * Match a tool call against an ActionBox and return any violations found.
 */
export function matchToolCall(
  event: ToolCallEvent,
  box: ActionBox,
): Violation[] {
  const violations: Violation[] = [];

  // Check denied tools (critical severity)
  const denied = box.deniedTools.find((d) => d.name === event.toolName);
  if (denied) {
    violations.push(
      createViolation({
        type: "denied_tool",
        severity: "critical",
        skillId: event.skillId,
        toolName: event.toolName,
        message: `Tool "${event.toolName}" is explicitly denied: ${denied.reason}`,
        rule: `deniedTools: ${denied.name}`,
      }),
    );
    return violations; // No need to check further for a denied tool
  }

  // Check if tool is in allowed list (high severity if not)
  const allowed = box.allowedTools.find((a) => a.name === event.toolName);
  if (!allowed) {
    violations.push(
      createViolation({
        type: "unlisted_tool",
        severity: "high",
        skillId: event.skillId,
        toolName: event.toolName,
        message: `Tool "${event.toolName}" is not in the allowed tools list`,
        rule: "allowedTools",
      }),
    );
  }

  // Check filesystem access
  if (event.resolvedPaths) {
    for (const filePath of event.resolvedPaths) {
      // Determine operation type based on tool name heuristics
      const operation = inferFileOperation(event.toolName);
      const fsViolation = checkFilesystemAccess(
        filePath,
        operation,
        box.filesystem,
      );

      if (fsViolation) {
        const isDeniedPath = pathMatchesAny(filePath, box.filesystem.denied);
        const type: ViolationType =
          isDeniedPath
            ? "filesystem_denied"
            : operation === "write"
              ? "filesystem_write_violation"
              : "filesystem_read_violation";

        violations.push(
          createViolation({
            type,
            severity: type === "filesystem_denied" ? "critical" : "high",
            skillId: event.skillId,
            toolName: event.toolName,
            message: fsViolation,
            rule: `filesystem.${operation === "write" ? "writable" : "readable"}`,
            details: { path: filePath },
          }),
        );
      }
    }
  }

  // Check network access
  if (event.networkHosts) {
    for (const host of event.networkHosts) {
      const netViolation = checkNetworkAccess(host, box.network);
      if (netViolation) {
        violations.push(
          createViolation({
            type: "network_violation",
            severity: "high",
            skillId: event.skillId,
            toolName: event.toolName,
            message: netViolation,
            rule: "network.allowedHosts",
            details: { host },
          }),
        );
      }
    }
  }

  return violations;
}

/**
 * Infer whether a tool call is a read or write filesystem operation.
 */
function inferFileOperation(
  toolName: string,
): "read" | "write" {
  const writeTools = [
    "write_file",
    "create_file",
    "edit_file",
    "delete_file",
    "move_file",
    "copy_file",
    "mkdir",
    "write",
    "patch",
  ];
  const lowerName = toolName.toLowerCase();
  return writeTools.some((w) => lowerName.includes(w)) ? "write" : "read";
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
