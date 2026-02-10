import { describe, it, expect } from "vitest";
import {
  pathMatchesAny,
  checkFilesystemAccess,
  checkNetworkAccess,
} from "../src/enforcer/path-matcher.js";

describe("pathMatchesAny", () => {
  it("matches exact paths", () => {
    expect(pathMatchesAny("./data/tasks.json", ["./data/tasks.json"])).toBe(true);
  });

  it("matches glob patterns", () => {
    expect(pathMatchesAny("./data/tasks.json", ["./data/**"])).toBe(true);
    expect(pathMatchesAny("./data/sub/file.txt", ["./data/**"])).toBe(true);
  });

  it("matches dotfiles with dot option", () => {
    expect(pathMatchesAny(".env", ["**/.env"])).toBe(true);
    expect(pathMatchesAny("config/.env", ["**/.env"])).toBe(true);
  });

  it("returns false for non-matching paths", () => {
    expect(pathMatchesAny("./src/code.ts", ["./data/**"])).toBe(false);
  });

  it("handles home directory patterns", () => {
    expect(pathMatchesAny("~/.ssh/id_rsa", ["~/.ssh/**"])).toBe(true);
    expect(pathMatchesAny("~/.aws/credentials", ["~/.aws/**"])).toBe(true);
  });

  it("handles multiple patterns", () => {
    expect(
      pathMatchesAny("./config/app.yaml", ["./data/**", "./config/**"]),
    ).toBe(true);
    expect(
      pathMatchesAny("./src/code.ts", ["./data/**", "./config/**"]),
    ).toBe(false);
  });

  it("handles empty patterns array", () => {
    expect(pathMatchesAny("anything", [])).toBe(false);
  });
});

describe("checkFilesystemAccess", () => {
  const rules = {
    readable: ["./config/**", "./data/**"],
    writable: ["./data/**"],
    denied: ["~/.ssh/**", "~/.aws/**", "**/.env"],
  };

  it("allows reads to readable paths", () => {
    expect(checkFilesystemAccess("./config/app.yaml", "read", rules)).toBeNull();
    expect(checkFilesystemAccess("./data/tasks.json", "read", rules)).toBeNull();
  });

  it("denies reads to non-readable paths", () => {
    const result = checkFilesystemAccess("./src/code.ts", "read", rules);
    expect(result).not.toBeNull();
    expect(result).toContain("not covered");
  });

  it("allows writes to writable paths", () => {
    expect(checkFilesystemAccess("./data/tasks.json", "write", rules)).toBeNull();
  });

  it("denies writes to non-writable paths", () => {
    const result = checkFilesystemAccess("./config/app.yaml", "write", rules);
    expect(result).not.toBeNull();
    expect(result).toContain("not covered");
  });

  it("always denies denied paths (read)", () => {
    const result = checkFilesystemAccess("~/.ssh/id_rsa", "read", rules);
    expect(result).not.toBeNull();
    expect(result).toContain("denied");
  });

  it("always denies denied paths (write)", () => {
    const result = checkFilesystemAccess("~/.aws/credentials", "write", rules);
    expect(result).not.toBeNull();
    expect(result).toContain("denied");
  });

  it("denies .env files", () => {
    const result = checkFilesystemAccess(".env", "read", rules);
    expect(result).not.toBeNull();
  });

  it("allows anything when no readable rules defined", () => {
    const openRules = { readable: [], writable: [], denied: [] };
    expect(checkFilesystemAccess("./anything.txt", "read", openRules)).toBeNull();
  });
});

describe("checkNetworkAccess", () => {
  const rules = {
    allowedHosts: ["calendar.google.com", "*.googleapis.com", "*.slack.com"],
    deniedHosts: ["*.onion"],
  };

  it("allows listed hosts", () => {
    expect(checkNetworkAccess("calendar.google.com", rules)).toBeNull();
  });

  it("allows wildcard subdomains", () => {
    expect(checkNetworkAccess("www.googleapis.com", rules)).toBeNull();
    expect(checkNetworkAccess("api.slack.com", rules)).toBeNull();
  });

  it("denies unlisted hosts", () => {
    const result = checkNetworkAccess("evil.com", rules);
    expect(result).not.toBeNull();
    expect(result).toContain("not in the allowed hosts");
  });

  it("denies denied hosts", () => {
    const result = checkNetworkAccess("hidden.onion", rules);
    expect(result).not.toBeNull();
    expect(result).toContain("denied pattern");
  });

  it("denied hosts take priority over allowed", () => {
    const conflictRules = {
      allowedHosts: ["*"],
      deniedHosts: ["evil.com"],
    };
    const result = checkNetworkAccess("evil.com", conflictRules);
    expect(result).not.toBeNull();
  });

  it("allows anything when no allowed hosts defined", () => {
    const openRules = { allowedHosts: [], deniedHosts: [] };
    expect(checkNetworkAccess("anything.com", openRules)).toBeNull();
  });

  it("matches exact host from wildcard pattern", () => {
    // *.slack.com should also match slack.com itself
    expect(checkNetworkAccess("slack.com", rules)).not.toBeNull();
    // But it should match subdomains
    expect(checkNetworkAccess("api.slack.com", rules)).toBeNull();
  });
});
