import { minimatch } from "minimatch";

/**
 * Check if a path matches any of the given glob patterns.
 */
export function pathMatchesAny(
  filePath: string,
  patterns: string[],
): boolean {
  return patterns.some((pattern) => minimatch(filePath, pattern, { dot: true }));
}

/**
 * Check filesystem access for a tool call.
 * Returns a violation description or null if access is allowed.
 */
export function checkFilesystemAccess(
  filePath: string,
  operation: "read" | "write",
  rules: { readable: string[]; writable: string[]; denied: string[] },
): string | null {
  // Denied paths always take priority
  if (pathMatchesAny(filePath, rules.denied)) {
    return `Path "${filePath}" matches a denied filesystem pattern`;
  }

  if (operation === "read") {
    if (rules.readable.length > 0 && !pathMatchesAny(filePath, rules.readable)) {
      return `Read access to "${filePath}" is not covered by any readable pattern`;
    }
  }

  if (operation === "write") {
    if (rules.writable.length > 0 && !pathMatchesAny(filePath, rules.writable)) {
      return `Write access to "${filePath}" is not covered by any writable pattern`;
    }
  }

  return null;
}

/**
 * Check if a network host is allowed.
 * Returns a violation description or null if access is allowed.
 */
export function checkNetworkAccess(
  host: string,
  rules: { allowedHosts: string[]; deniedHosts: string[] },
): string | null {
  // Denied hosts always take priority
  for (const pattern of rules.deniedHosts) {
    if (hostMatches(host, pattern)) {
      return `Host "${host}" matches denied pattern "${pattern}"`;
    }
  }

  // If there are allowed hosts, the host must match at least one
  if (rules.allowedHosts.length > 0) {
    const allowed = rules.allowedHosts.some((pattern) =>
      hostMatches(host, pattern),
    );
    if (!allowed) {
      return `Host "${host}" is not in the allowed hosts list`;
    }
  }

  return null;
}

/**
 * Match a hostname against a pattern (supports wildcard prefix like *.example.com).
 */
function hostMatches(host: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // .example.com
    return host.endsWith(suffix);
  }
  return host === pattern;
}
