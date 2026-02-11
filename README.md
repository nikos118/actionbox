# ActionBox

**Behavioral contracts for AI agent skills.** ActionBox generates, reviews, and enforces security boundaries so your AI skills can only do what they're supposed to.

ActionBox is an [OpenClaw](https://github.com/openclaw) plugin. It reads a skill's definition (`SKILL.md`), uses an LLM to produce a strict behavioral contract (`ACTIONBOX.md`), and then enforces that contract at runtime — flagging or blocking any tool call that falls outside the declared scope.

---

## Why ActionBox?

AI agent skills are powerful — they can read files, call APIs, send messages, and execute code. But with power comes risk. A misconfigured or compromised skill could:

- Read your SSH keys or AWS credentials
- Exfiltrate data to unauthorized servers
- Delete files it has no business touching
- Invoke tools far outside its intended purpose

ActionBox solves this by creating a **behavioral contract** for each skill: a machine-readable document that declares exactly what the skill is allowed to do, and nothing more.

## How It Works

```
  SKILL.md                    ACTIONBOX.md                  Runtime
  ┌──────────┐   generate    ┌──────────────┐   enforce   ┌──────────┐
  │  Skill   │──────────────>│  Behavioral  │────────────>│  Allow / │
  │  Defn.   │   (2-pass     │  Contract    │  (check     │  Block / │
  └──────────┘    LLM gen)   └──────────────┘   every     │  Alert   │
                                  │              call)    └──────────┘
                                  v
                              Human Review
```

**Three steps:**

1. **Generate** — ActionBox reads a skill's `SKILL.md` and uses a two-pass LLM pipeline to produce a conservative behavioral contract
2. **Review** — A human inspects and approves the contract
3. **Enforce** — At runtime, every tool call is checked against the contract; violations trigger alerts or blocks

### Two-Pass Generation

ActionBox doesn't blindly trust its own output. Generation uses two LLM passes:

| Pass | Role | What it does |
|------|------|-------------|
| **Pass 1** | Conservative Generator | Reads the skill definition and produces the strictest reasonable contract |
| **Pass 2** | Adversarial Reviewer | Red-teams the contract for over-permissiveness, missing denials, and scope escape vectors |

The result is a contract that's been both authored and attacked before a human ever sees it.

### Multi-Skill Enforcement

OpenClaw loads all eligible skills simultaneously — there's no "one skill at a time." ActionBox handles this by building a **global policy** from all loaded contracts:

- **Tool attribution** — each contract lists its `allowedTools`. ActionBox builds an index mapping tool names to the contracts that claim them. When a tool call comes in, it finds the claiming contract(s) and checks their rules.
- **Global denials** — if a tool is in any contract's `deniedTools` and not in any contract's `allowedTools`, it's globally blocked. Filesystem denied patterns (like `~/.ssh/**`) and network denied hosts (like `*.onion`) from ALL contracts are merged and always enforced.
- **Generous on allows** — if multiple skills claim a tool, the call is permitted as long as ANY claiming contract's rules allow it. This avoids false positives in multi-skill environments.

```
                      ┌─────────────────────────┐
                      │     Global Policy        │
                      │                          │
  Contract A ────────>│  Tool Index              │
  Contract B ────────>│  Global Denied Tools     │──── before_tool_call ──── Block / Allow
  Contract C ────────>│  Global Denied Paths     │──── after_tool_call  ──── Log / Alert
                      │  Global Denied Hosts     │
                      └─────────────────────────┘
```

---

## Quick Start

### Install

```bash
npm install @openclaw/plugin-actionbox
```

### Generate a contract

```bash
# For a single skill
openclaw actionbox generate calendar-sync

# For all skills
openclaw actionbox generate-all
```

### Review it

```bash
openclaw actionbox review calendar-sync

# Mark as reviewed
openclaw actionbox review calendar-sync --reviewer "alice"
```

### Audit your coverage

```bash
openclaw actionbox audit
```

```
┌────────────────┬─────┬──────────┬─────────┬─────────┬────────┐
│ Skill          │ Box │ Reviewed │ Drift   │ Allowed │ Denied │
├────────────────┼─────┼──────────┼─────────┼─────────┼────────┤
│ calendar-sync  │ yes │ yes      │ ok      │ 4       │ 5      │
│ github-triage  │ yes │ yes      │ ok      │ 5       │ 6      │
│ slack-standup  │ yes │ no       │ DRIFTED │ 4       │ 6      │
│ data-pipeline  │ no  │ -        │ -       │ 0       │ 0      │
└────────────────┴─────┴──────────┴─────────┴─────────┴────────┘

1 skill(s) missing ActionBox.
1 skill(s) with drift detected.
1 skill(s) not yet reviewed.
```

---

## Configuration

Add ActionBox to your OpenClaw plugin config:

```yaml
plugins:
  actionbox:
    mode: monitor                         # "monitor" or "enforce"
    skillsDir: skills                     # directory containing skill definitions
    alertChannel: actionbox-alerts        # channel for violation alerts
    autoGenerate: false                   # auto-generate boxes for new skills
    generatorModel: claude-sonnet-4-5-20250929  # model for generation
    driftCheckInterval: 300000            # drift check interval (ms), default 5 min
```

| Option | Default | Description |
|--------|---------|-------------|
| `mode` | `monitor` | `monitor` logs violations; `enforce` blocks them |
| `skillsDir` | `skills` | Where to find skill directories |
| `alertChannel` | `actionbox-alerts` | Messaging channel for violation alerts |
| `autoGenerate` | `false` | Auto-generate contracts for new skills |
| `generatorModel` | `claude-sonnet-4-5-20250929` | Which model generates contracts |
| `driftCheckInterval` | `300000` | How often to check for skill definition changes (ms) |

---

## The ACTIONBOX.md Contract

Each skill gets a contract file that lives alongside its `SKILL.md`. Here's what one looks like:

```yaml
version: "1.0"
skillId: calendar-sync
skillName: Calendar Sync

# What the skill CAN use
allowedTools:
  - name: google_calendar_read
    reason: Required to fetch events from Google Calendar API
  - name: task_create
    reason: Required to create local task entries
  - name: slack_send_message
    reason: Required to send meeting notifications

# What the skill must NEVER use
deniedTools:
  - name: shell_exec
    reason: Calendar sync has no need for shell execution
  - name: google_calendar_write
    reason: Skill is read-only — must never modify events

# Filesystem access boundaries
filesystem:
  readable:
    - "./config/calendar.yaml"
    - "./data/tasks.json"
  writable:
    - "./data/tasks.json"
  denied:
    - "~/.ssh/**"
    - "~/.aws/**"
    - "**/.env"

# Network access boundaries
network:
  allowedHosts:
    - "calendar.google.com"
    - "*.googleapis.com"
    - "*.slack.com"
  deniedHosts:
    - "*.onion"

# Behavioral guardrails
behavior:
  summary: >-
    Reads events from Google Calendar and syncs to local tasks.
    Sends Slack notifications for upcoming meetings.
    Read-only access to calendar.
  neverDo:
    - Delete or modify Google Calendar events
    - Execute shell commands
    - Access SSH keys or AWS credentials
  maxToolCalls: 20

# Drift detection metadata
drift:
  skillHash: e3b0c44298fc1c14...   # SHA-256 of SKILL.md at generation time
  generatedAt: "2025-01-15T10:00:00.000Z"
  generatorModel: claude-sonnet-4-5-20250929
  reviewed: true
  reviewedBy: security-team
  reviewedAt: "2025-01-16T14:30:00.000Z"
```

---

## Enforcement

### Violation Severities

| Severity | What triggers it | Example |
|----------|-----------------|---------|
| **Critical** | Denied tool used, denied filesystem path accessed | Skill calls `shell_exec`, reads `~/.ssh/id_rsa` |
| **High** | Unlisted tool used, filesystem or network rule violated | Skill calls `unknown_tool`, writes outside allowed dirs |
| **Medium** | Tool call limit exceeded | Skill makes 50 calls when limit is 20 |
| **Low** | Minor behavioral anomalies | Unusual argument patterns |

### Enforcement Modes

Runtime enforcement is optional and designed for specific situations where you need hard guardrails on tool calls. You can disable it entirely by leaving ActionBox in `monitor` mode (the default), or escalate to `enforce` mode when you need to actively block violations.

**Monitor mode** (default) — violations are logged via `after_tool_call`, but skill execution continues. Good for rollout and tuning.

**Enforce mode** — violations block the tool call via `before_tool_call` before it executes. Both hooks run simultaneously: `before_tool_call` for blocking, `after_tool_call` for logging.

> **Recommendation:** Even if you disable runtime enforcement, we recommend keeping **context injection** enabled (it's on by default). Context injection gives the LLM awareness of its behavioral contract before it acts, which prevents most violations from happening in the first place. Runtime enforcement is a safety net; context injection is the first line of defense.

### Drift Detection

ActionBox hashes each `SKILL.md` when generating a contract. A background service periodically re-hashes and alerts if the skill definition has changed since the contract was generated. This ensures contracts don't go stale.

---

## Context Injection

ActionBox doesn't just enforce contracts reactively — it also **injects behavioral directives** into each agent's context before execution begins. This gives the LLM driving each skill awareness of its contract *before* it ever makes a tool call.

Context injection is always on and works regardless of enforcement mode. We recommend leaving it enabled in all configurations — it's the most effective way to keep agents within their intended scope, because the LLM self-regulates rather than being blocked after the fact.

### How It Works

ActionBox hooks into OpenClaw's `before_agent_start` event. When an agent session starts, ActionBox builds a structured XML directive block from all loaded contracts and injects it via `prependContext`, which places the directive before the system prompt.

```xml
<actionbox-directive>
  <skill name="calendar-sync">
    <purpose>Reads events from Google Calendar and syncs to local tasks...</purpose>
    <principles>
      <principle>Prefer read-only operations when possible</principle>
    </principles>
    <always-do>
      <rule>Verify calendar event data before creating tasks</rule>
    </always-do>
    <never-do>
      <rule>Delete or modify Google Calendar events</rule>
      <rule>Execute shell commands</rule>
    </never-do>
    <allowed-tools>google_calendar_read, task_create, task_update, slack_send_message</allowed-tools>
    <denied-tools>shell_exec, file_delete, google_calendar_write, google_calendar_delete, http_request</denied-tools>
    <filesystem>
      <readable>./config/calendar.yaml, ./data/tasks.json</readable>
      <writable>./data/tasks.json, ./data/tasks.json.bak</writable>
      <denied>~/.ssh/**, ~/.aws/**, **/.env, **/.env.*, **/credentials*, **/secret*</denied>
    </filesystem>
    <network>
      <allowed>calendar.google.com, *.googleapis.com, slack.com, *.slack.com</allowed>
      <denied>*.onion, *.tor</denied>
    </network>
  </skill>
</actionbox-directive>
```

All loaded contracts are included in a single directive block, giving the LLM full awareness of every active behavioral contract.

### Behavioral Guidance Fields

Contracts support both negative constraints and positive guidance:

| Field | Purpose | Example |
|-------|---------|---------|
| `behavior.alwaysDo` | Positive behavioral guidance | "Verify calendar event data before creating tasks" |
| `behavior.principles` | High-level operating principles | "Prefer read-only operations when possible" |
| `behavior.neverDo` | Actions the skill must never take | "Delete or modify Google Calendar events" |

These fields are optional and backward-compatible — existing contracts without `alwaysDo` or `principles` will continue to work.

### Programmatic Usage

```typescript
import { buildDirective, buildSkillDirective } from "@openclaw/plugin-actionbox";

// Build directive for all loaded boxes
const directive = buildDirective(enforcer.getAllBoxes());

// Build directive for a single box
const skillXml = buildSkillDirective(box);
```

---

## CLI Reference

### `actionbox generate <skill>`

Generate an ACTIONBOX.md for a single skill.

```bash
openclaw actionbox generate calendar-sync
openclaw actionbox generate calendar-sync --skip-review  # skip adversarial pass
```

### `actionbox generate-all`

Generate contracts for all skills in the skills directory.

```bash
openclaw actionbox generate-all
```

### `actionbox audit`

Show a table of all skills with contract coverage, review status, and drift detection.

```bash
openclaw actionbox audit
```

### `actionbox status`

Display current enforcement mode, configuration, and recent violations.

```bash
openclaw actionbox status
```

### `actionbox review <skill>`

Display a contract and optionally mark it as human-reviewed.

```bash
openclaw actionbox review calendar-sync
openclaw actionbox review calendar-sync --reviewer "alice"
```

---

## Programmatic API

ActionBox exports its core modules for use in your own code:

```typescript
import {
  ActionBoxEnforcer,
  matchToolCall,
  buildGlobalPolicy,
  checkFilesystemAccess,
  checkNetworkAccess,
  extractPaths,
  extractHosts,
  parseActionBox,
  serializeActionBox,
  generateActionBox,
  parseSkillMd,
  sha256,
} from "@openclaw/plugin-actionbox";

// Load contracts and enforce
const enforcer = new ActionBoxEnforcer("monitor");
await enforcer.loadBoxes(["./skills/calendar-sync", "./skills/github-triage"]);

// Check a tool call (params are extracted automatically)
const violations = enforcer.check("shell_exec", { command: "rm -rf /" });
// => [{ severity: "critical", type: "denied_tool", ... }]

// Access the global policy directly
const policy = enforcer.getPolicy();
console.log(policy.globalDeniedTools); // tools denied across all contracts
console.log(policy.toolIndex);         // tool name → claiming skill IDs
```

---

## Project Structure

```
actionbox/
├── src/
│   ├── plugin.ts                # Main plugin entry point
│   ├── types.ts                 # Core TypeScript types
│   ├── openclaw-sdk.d.ts        # Mock SDK type definitions
│   ├── generator/
│   │   ├── parser.ts            # SKILL.md frontmatter parsing
│   │   ├── prompts.ts           # Two-pass LLM prompt templates
│   │   └── generate.ts          # Generation orchestration
│   ├── injector/
│   │   └── directive-builder.ts # XML directive builder for context injection
│   ├── enforcer/
│   │   ├── param-extractor.ts   # Extract paths/hosts from tool params
│   │   ├── policy.ts            # Global policy engine (multi-skill merge)
│   │   ├── path-matcher.ts      # Glob matching for paths and hosts
│   │   ├── matcher.ts           # Tool call → policy violation matching
│   │   └── enforcer.ts          # Enforcer class with caching
│   ├── alerter/
│   │   ├── formatters.ts        # Plain text / Markdown / Slack formatters
│   │   └── alerter.ts           # Alert dispatch
│   ├── cli/
│   │   ├── generate.ts          # generate / generate-all commands
│   │   ├── audit.ts             # audit command
│   │   ├── status.ts            # status command
│   │   └── review.ts            # review command
│   └── utils/
│       ├── hash.ts              # SHA-256 hashing
│       ├── config.ts            # Config + skill directory discovery
│       └── yaml.ts              # ACTIONBOX.md YAML parse/serialize
├── tests/
│   ├── fixtures/                # Sample SKILL.md and ACTIONBOX.md files
│   ├── generator.test.ts        # Parsing and prompt construction tests
│   ├── enforcer.test.ts         # Enforcer class tests
│   ├── matcher.test.ts          # Violation matching tests
│   ├── path-matcher.test.ts     # Path and host matching tests
│   └── injector.test.ts         # Directive builder tests
├── examples/
│   └── boxes/                   # Example ACTIONBOX.md contracts
│       ├── calendar.actionbox.md
│       ├── github-triage.actionbox.md
│       └── slack-standup.actionbox.md
├── openclaw.plugin.json          # OpenClaw plugin manifest
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

---

## Development

```bash
git clone https://github.com/nikos118/actionbox.git
cd actionbox
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test            # run once
npm run test:watch  # watch mode
```

### Type Check

```bash
npm run typecheck
```

### Test Coverage

Tests across 5 test files covering:

- **Generator** — SKILL.md parsing, prompt construction, YAML extraction
- **Enforcer** — Box loading, caching, agent_end checking, drift detection
- **Matcher** — Multi-skill policy matching, tool attribution, filesystem/network violations
- **Path Matcher** — Glob patterns, host wildcards, edge cases
- **Injector** — XML directive building, context injection, backward compatibility

---

## Examples

The `examples/boxes/` directory contains sample contracts for common skill types:

| Example | Description |
|---------|-------------|
| `calendar.actionbox.md` | Calendar sync — read-only calendar access, scoped file writes, Slack notifications |
| `github-triage.actionbox.md` | Issue triage — read issues, add labels/comments, no close/delete |
| `slack-standup.actionbox.md` | Standup bot — read/send messages, no channel management |

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm test`)
4. Commit your changes
5. Push to the branch and open a Pull Request

---

## License

[The Unlicense](LICENSE) — public domain. Do whatever you want with it.
