/**
 * OpenClaw SDK types — matches the real OpenClaw plugin API from
 * https://github.com/openclaw/openclaw (src/plugins/types.ts).
 *
 * These will be replaced by the official @openclaw/plugin-sdk package
 * when published.
 */

// ---------------------------------------------------------------------------
// Hook event and context types
// ---------------------------------------------------------------------------

export interface BeforeToolCallEvent {
  toolName: string;
  params: Record<string, unknown>;
}

export interface BeforeToolCallResult {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
}

export interface AfterToolCallEvent {
  toolName: string;
  params: Record<string, unknown>;
  result: unknown;
  durationMs: number;
}

export interface AgentEndEvent {
  messages: unknown[];
  success: boolean;
  error?: string;
  durationMs?: number;
}

export interface ToolContext {
  agentId?: string;
  sessionKey?: string;
  toolName: string;
}

export interface AgentContext {
  agentId?: string;
  sessionKey?: string;
}

// ---------------------------------------------------------------------------
// Hook system
// ---------------------------------------------------------------------------

export type PluginHookName =
  | "before_agent_start"
  | "agent_end"
  | "before_compaction"
  | "after_compaction"
  | "message_received"
  | "message_sending"
  | "message_sent"
  | "before_tool_call"
  | "after_tool_call"
  | "tool_result_persist"
  | "session_start"
  | "session_end"
  | "gateway_start"
  | "gateway_stop";

export interface PluginHookHandlerMap {
  before_tool_call: (
    event: BeforeToolCallEvent,
    ctx: ToolContext,
  ) => Promise<BeforeToolCallResult | void> | BeforeToolCallResult | void;
  after_tool_call: (
    event: AfterToolCallEvent,
    ctx: ToolContext,
  ) => Promise<void> | void;
  agent_end: (
    event: AgentEndEvent,
    ctx: AgentContext,
  ) => Promise<void> | void;
  [key: string]: (...args: unknown[]) => unknown;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export interface PluginLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

// ---------------------------------------------------------------------------
// CLI registration (Commander.js)
// ---------------------------------------------------------------------------

/** Minimal Commander.js Command interface for CLI registration */
export interface CommanderCommand {
  command: (nameAndArgs: string) => CommanderCommand;
  description: (desc: string) => CommanderCommand;
  argument: (name: string, description?: string) => CommanderCommand;
  option: (flags: string, description?: string, defaultValue?: unknown) => CommanderCommand;
  action: (fn: (...args: unknown[]) => void | Promise<void>) => CommanderCommand;
}

export interface CliContext {
  program: CommanderCommand;
  config: Record<string, unknown>;
  workspaceDir?: string;
  logger: PluginLogger;
}

export type CliRegistrar = (ctx: CliContext) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export interface ServiceContext {
  config: Record<string, unknown>;
  workspaceDir?: string;
  stateDir: string;
  logger: PluginLogger;
}

export interface PluginService {
  id: string;
  start: (ctx: ServiceContext) => void | Promise<void>;
  stop?: (ctx: ServiceContext) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

export interface PluginConfigSchema {
  safeParse: (data: unknown) => { success: boolean; data?: unknown; error?: unknown };
  parse: (data: unknown) => unknown;
  jsonSchema?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Plugin API
// ---------------------------------------------------------------------------

export interface OpenClawPluginApi {
  id: string;
  name: string;
  version?: string;
  description?: string;
  config: Record<string, unknown>;
  pluginConfig?: Record<string, unknown>;
  logger: PluginLogger;
  registerCli: (registrar: CliRegistrar, opts?: { commands?: string[] }) => void;
  registerService: (service: PluginService) => void;
  resolvePath: (path: string) => string;
  on: <K extends keyof PluginHookHandlerMap>(
    hookName: K,
    handler: PluginHookHandlerMap[K],
    opts?: { priority?: number },
  ) => void;
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

export interface OpenClawPluginDefinition {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  configSchema?: PluginConfigSchema;
  register?: (api: OpenClawPluginApi) => void | Promise<void>;
  activate?: (api: OpenClawPluginApi) => void | Promise<void>;
}

export type OpenClawPluginModule =
  | OpenClawPluginDefinition
  | ((api: OpenClawPluginApi) => void | Promise<void>);
