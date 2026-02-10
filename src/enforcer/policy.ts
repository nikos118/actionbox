import type { ActionBox } from "../types.js";

/**
 * GlobalPolicy merges multiple ActionBox contracts into a unified
 * enforcement policy for multi-skill environments.
 *
 * Strategy:
 * - Tool is globally denied if ANY contract denies it AND no contract allows it
 * - Tool is "known" if ANY contract lists it in allowedTools
 * - Filesystem denied paths are the UNION of all contracts' denied patterns
 * - Network denied hosts are the UNION of all contracts' denied hosts
 * - For allowed paths/hosts, a tool call passes if ANY claiming contract permits it
 */
export interface GlobalPolicy {
  /** Tools explicitly denied across all contracts (denied by any, allowed by none) */
  globalDeniedTools: Map<string, { reason: string; denyingSkills: string[] }>;
  /** Map of tool name → skill IDs whose contracts list it as allowed */
  toolIndex: Map<string, string[]>;
  /** Union of all contracts' filesystem denied patterns */
  globalDeniedPaths: string[];
  /** Union of all contracts' network denied hosts */
  globalDeniedHosts: string[];
  /** All loaded boxes keyed by skill ID */
  boxes: Map<string, ActionBox>;
}

/**
 * Build a GlobalPolicy from a set of loaded ActionBox contracts.
 */
export function buildGlobalPolicy(boxes: ActionBox[]): GlobalPolicy {
  const boxMap = new Map<string, ActionBox>();
  const toolIndex = new Map<string, string[]>();
  const allDeniedTools = new Map<string, { reason: string; denyingSkills: string[] }>();
  const allAllowedToolNames = new Set<string>();
  const deniedPaths = new Set<string>();
  const deniedHosts = new Set<string>();

  for (const box of boxes) {
    boxMap.set(box.skillId, box);

    // Index allowed tools → skill IDs
    for (const tool of box.allowedTools) {
      allAllowedToolNames.add(tool.name);
      const existing = toolIndex.get(tool.name) ?? [];
      existing.push(box.skillId);
      toolIndex.set(tool.name, existing);
    }

    // Collect denied tools
    for (const tool of box.deniedTools) {
      const existing = allDeniedTools.get(tool.name);
      if (existing) {
        existing.denyingSkills.push(box.skillId);
      } else {
        allDeniedTools.set(tool.name, {
          reason: tool.reason,
          denyingSkills: [box.skillId],
        });
      }
    }

    // Collect filesystem denied patterns (union)
    for (const pattern of box.filesystem.denied) {
      deniedPaths.add(pattern);
    }

    // Collect network denied hosts (union)
    for (const host of box.network.deniedHosts) {
      deniedHosts.add(host);
    }
  }

  // Global denied = denied by any contract AND not allowed by any contract
  const globalDeniedTools = new Map<string, { reason: string; denyingSkills: string[] }>();
  for (const [toolName, info] of allDeniedTools) {
    if (!allAllowedToolNames.has(toolName)) {
      globalDeniedTools.set(toolName, info);
    }
  }

  return {
    globalDeniedTools,
    toolIndex,
    globalDeniedPaths: [...deniedPaths],
    globalDeniedHosts: [...deniedHosts],
    boxes: boxMap,
  };
}

/**
 * Find which skill(s) likely own a tool based on the tool index.
 * Returns the skill IDs whose contracts list this tool as allowed.
 */
export function attributeToolToSkills(
  toolName: string,
  policy: GlobalPolicy,
): string[] {
  return policy.toolIndex.get(toolName) ?? [];
}
