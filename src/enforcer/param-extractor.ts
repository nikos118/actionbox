/**
 * Extract filesystem paths and network hosts from tool call params.
 *
 * Since OpenClaw's before_tool_call/after_tool_call events only provide
 * { toolName, params }, we infer paths and hosts from param keys and
 * tool name heuristics.
 */

const PATH_KEYS = ["path", "file_path", "filePath", "file", "filename", "directory", "dir"];
const URL_KEYS = ["url", "uri", "endpoint", "href"];
const HOST_KEYS = ["host", "hostname", "server", "domain"];

const WRITE_TOOL_PATTERNS = [
  "write", "create", "edit", "patch", "delete", "move", "copy", "mkdir", "rm", "save",
];

/**
 * Extract filesystem paths from tool params.
 */
export function extractPaths(
  toolName: string,
  params: Record<string, unknown>,
): string[] {
  const paths: string[] = [];

  // Check known path-like param keys
  for (const key of PATH_KEYS) {
    const val = params[key];
    if (typeof val === "string" && val.length > 0) {
      paths.push(val);
    }
  }

  // For Bash/shell tools, try to extract paths from command strings
  if (
    toolName.toLowerCase().includes("bash") ||
    toolName.toLowerCase().includes("shell")
  ) {
    const cmd = params.command ?? params.cmd;
    if (typeof cmd === "string") {
      // Extract quoted paths and common path patterns
      const pathMatches = cmd.match(/(?:["'])(\/[^"']+)(?:["'])/g);
      if (pathMatches) {
        for (const match of pathMatches) {
          paths.push(match.replace(/["']/g, ""));
        }
      }
    }
  }

  // For glob tools, extract the directory
  if (params.pattern && typeof params.path === "string") {
    paths.push(params.path as string);
  }

  return [...new Set(paths)]; // dedupe
}

/**
 * Extract network hosts from tool params.
 */
export function extractHosts(
  params: Record<string, unknown>,
): string[] {
  const hosts: string[] = [];

  // Check URL-like params and parse out host
  for (const key of URL_KEYS) {
    const val = params[key];
    if (typeof val === "string" && val.length > 0) {
      try {
        const url = new URL(val);
        hosts.push(url.hostname);
      } catch {
        // Not a valid URL, skip
      }
    }
  }

  // Check direct host params
  for (const key of HOST_KEYS) {
    const val = params[key];
    if (typeof val === "string" && val.length > 0) {
      hosts.push(val);
    }
  }

  return [...new Set(hosts)]; // dedupe
}

/**
 * Infer whether a tool call is a read or write filesystem operation.
 */
export function inferFileOperation(toolName: string): "read" | "write" {
  const lower = toolName.toLowerCase();
  return WRITE_TOOL_PATTERNS.some((w) => lower.includes(w)) ? "write" : "read";
}
