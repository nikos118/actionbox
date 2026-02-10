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

**Monitor mode** (default) — violations are logged and alerts are sent, but skill execution continues. Good for rollout and tuning.

**Enforce mode** — violations block the tool call before it executes. Requires OpenClaw's `before_tool_call` hook support (coming soon; currently ActionBox uses post-hoc `agent_end` checking).

### Drift Detection

ActionBox hashes each `SKILL.md` when generating a contract. A background service periodically re-hashes and alerts if the skill definition has changed since the contract was generated. This ensures contracts don't go stale.

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
  checkFilesystemAccess,
  checkNetworkAccess,
  parseActionBox,
  serializeActionBox,
  generateActionBox,
  parseSkillMd,
  sha256,
} from "@openclaw/plugin-actionbox";

// Load and enforce
const enforcer = new ActionBoxEnforcer("monitor");
await enforcer.loadBox("./skills/calendar-sync");

const violations = enforcer.check({
  skillId: "calendar-sync",
  toolName: "shell_exec",
  arguments: { command: "rm -rf /" },
  timestamp: new Date().toISOString(),
});
// => [{ severity: "critical", type: "denied_tool", ... }]
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
│   ├── enforcer/
│   │   ├── path-matcher.ts      # Glob matching for paths and hosts
│   │   ├── matcher.ts           # Tool call → violation matching
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
│   └── path-matcher.test.ts     # Path and host matching tests
├── examples/
│   └── boxes/                   # Example ACTIONBOX.md contracts
│       ├── calendar.actionbox.md
│       ├── github-triage.actionbox.md
│       └── slack-standup.actionbox.md
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

57 tests across 4 test files covering:

- **Generator** — SKILL.md parsing, prompt construction, YAML extraction
- **Enforcer** — Box loading, caching, agent_end checking, drift detection
- **Matcher** — Tool matching, filesystem violations, network violations
- **Path Matcher** — Glob patterns, host wildcards, edge cases

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
