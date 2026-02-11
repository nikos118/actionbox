/**
 * Core types for the ActionBox behavioral contract schema.
 * These match the ACTIONBOX.md YAML structure.
 */

export interface AllowedTool {
  name: string;
  /** Why this tool is needed */
  reason: string;
  /** Optional constraints on arguments */
  constraints?: Record<string, unknown>;
}

export interface DeniedTool {
  name: string;
  /** Why this tool must not be used */
  reason: string;
}

export interface FilesystemRules {
  /** Glob patterns for allowed read paths */
  readable: string[];
  /** Glob patterns for allowed write paths */
  writable: string[];
  /** Glob patterns that must never be accessed */
  denied: string[];
}

export interface NetworkRules {
  /** Allowed outbound host patterns */
  allowedHosts: string[];
  /** Denied outbound host patterns */
  deniedHosts: string[];
}

export interface BehaviorExpectations {
  /** Plain-language description of what the skill should do */
  summary: string;
  /** Actions the skill should never take */
  neverDo: string[];
  /** Positive behavioral guidance — actions the skill should always follow */
  alwaysDo?: string[];
  /** High-level operating principles for the skill */
  principles?: string[];
  /** Maximum expected tool calls per invocation */
  maxToolCalls?: number;
}

export interface DriftInfo {
  /** SHA-256 hash of the SKILL.md at generation time */
  skillHash: string;
  /** ISO timestamp of when the box was generated */
  generatedAt: string;
  /** Model used for generation */
  generatorModel: string;
  /** Whether the box has been human-reviewed */
  reviewed: boolean;
  /** Who reviewed (if applicable) */
  reviewedBy?: string;
  /** ISO timestamp of review */
  reviewedAt?: string;
}

export interface ActionBox {
  /** Schema version */
  version: "1.0";
  /** Skill identifier (directory name) */
  skillId: string;
  /** Human-readable skill name */
  skillName: string;
  /** Tools the skill is permitted to use */
  allowedTools: AllowedTool[];
  /** Tools the skill must never use */
  deniedTools: DeniedTool[];
  /** Conceptual capability descriptions the skill is allowed (LLM-evaluated) */
  allowedCapabilities?: string[];
  /** Conceptual capability descriptions the skill must not use (LLM-evaluated) */
  deniedCapabilities?: string[];
  /** Filesystem access rules */
  filesystem: FilesystemRules;
  /** Network access rules */
  network: NetworkRules;
  /** Behavioral expectations and guardrails */
  behavior: BehaviorExpectations;
  /** Drift detection metadata */
  drift: DriftInfo;
}

export type ViolationSeverity = "critical" | "high" | "medium" | "low";

export type ViolationType =
  | "denied_tool"
  | "unlisted_tool"
  | "denied_capability"
  | "unlisted_capability"
  | "filesystem_read_violation"
  | "filesystem_write_violation"
  | "filesystem_denied"
  | "network_violation"
  | "behavior_violation"
  | "tool_call_limit_exceeded";

export interface Violation {
  /** Unique violation ID */
  id: string;
  /** Severity level */
  severity: ViolationSeverity;
  /** Type of violation */
  type: ViolationType;
  /** Attributed skill (when determinable, otherwise "unknown") */
  skillId: string;
  /** The tool call that caused the violation */
  toolName: string;
  /** Human-readable description */
  message: string;
  /** The specific rule that was violated */
  rule: string;
  /** ISO timestamp */
  timestamp: string;
  /** Additional context */
  details?: Record<string, unknown>;
}

export type EnforcementMode = "monitor" | "enforce";

export interface ActionBoxConfig {
  /** Whether to block or just alert */
  mode: EnforcementMode;
  /** Directory containing skills */
  skillsDir: string;
  /** Whether to auto-generate boxes for new skills */
  autoGenerate: boolean;
  /** Model to use for generation */
  generatorModel: string;
  /** Background drift check interval in ms */
  driftCheckInterval: number;
}
