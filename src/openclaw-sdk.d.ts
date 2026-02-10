/**
 * Mock OpenClaw SDK types — mirrors the expected plugin API surface.
 * These will be replaced by the actual @openclaw/sdk package when available.
 */

export interface ToolCallEvent {
  skillId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  /** Resolved absolute paths if the tool operates on files */
  resolvedPaths?: string[];
  /** Network hosts if the tool makes HTTP requests */
  networkHosts?: string[];
  timestamp: string;
}

export interface AgentEndEvent {
  skillId: string;
  toolCalls: ToolCallEvent[];
  result: unknown;
  timestamp: string;
}

export interface HookResult {
  /** Whether to allow the action to proceed */
  allow: boolean;
  /** Reason for blocking (shown to user) */
  reason?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface CliCommand {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
  options?: Array<{
    flags: string;
    description: string;
    defaultValue?: unknown;
  }>;
  action: (args: Record<string, unknown>, opts: Record<string, unknown>) => Promise<void>;
}

export interface CliContext {
  program: {
    command: (name: string) => {
      description: (desc: string) => CliCommandBuilder;
    };
  };
}

export interface CliCommandBuilder {
  argument: (name: string, description: string) => CliCommandBuilder;
  option: (flags: string, description: string, defaultValue?: unknown) => CliCommandBuilder;
  action: (fn: (args: Record<string, unknown>, opts: Record<string, unknown>) => Promise<void>) => CliCommandBuilder;
}

export interface MessageApi {
  send: (channel: string, message: string) => Promise<void>;
  sendBlocks: (channel: string, blocks: unknown[]) => Promise<void>;
}

export interface ServiceRegistration {
  name: string;
  interval?: number;
  run: () => Promise<void>;
}

export interface PluginConfig {
  get: <T>(key: string) => T | undefined;
  getRequired: <T>(key: string) => T;
  getAll: () => Record<string, unknown>;
}

export interface OpenClawPluginApi {
  on: (event: string, handler: (...args: unknown[]) => Promise<void> | void) => void;
  registerCli: (command: CliCommand) => void;
  registerService: (service: ServiceRegistration) => void;
  pluginConfig: PluginConfig;
  messaging: MessageApi;
  /** Root directory of the OpenClaw workspace */
  workspaceRoot: string;
}

export interface OpenClawPlugin {
  id: string;
  name: string;
  kind: "enforcer" | "generator" | "integration" | "utility";
  configSchema: Record<string, unknown>;
  register: (api: OpenClawPluginApi) => Promise<void>;
}
