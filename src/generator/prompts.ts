import type { SkillMdData } from "./parser.js";

/**
 * Build the generator prompt for Pass 1: Conservative contract generation.
 */
export function buildGeneratorPrompt(skill: SkillMdData): string {
  return `You are a security-focused AI that generates behavioral contracts for AI agent skills.

Given the following SKILL.md definition, generate a strict ACTIONBOX behavioral contract in YAML format.

## SKILL.md
\`\`\`
${skill.raw}
\`\`\`

## Instructions

Analyze the skill definition and produce a YAML document with the following structure. Be CONSERVATIVE — only allow what the skill explicitly needs.

\`\`\`yaml
version: "1.0"
skillId: "${skill.skillId}"
skillName: "${skill.skillName}"

allowedCapabilities:
  - <capability description, e.g. "Google Calendar read-only access">
  - <capability description, e.g. "Local task management (create and update)">

deniedCapabilities:
  - <capability description, e.g. "Shell or command execution">
  - <capability description, e.g. "Calendar event modification or deletion">

allowedTools: []
deniedTools: []

filesystem:
  readable:
    - <glob patterns for paths the skill should read>
  writable:
    - <glob patterns for paths the skill should write>
  denied:
    - <glob patterns that must never be accessed>

network:
  allowedHosts:
    - <host patterns the skill may contact>
  deniedHosts:
    - <host patterns the skill must never contact>

behavior:
  summary: <one-paragraph summary of expected behavior>
  alwaysDo:
    - <positive behavioral guidance the skill should always follow>
  principles:
    - <high-level operating principle for the skill>
  neverDo:
    - <action the skill should never take>
  maxToolCalls: <reasonable upper bound>
\`\`\`

## Rules
1. Use allowedCapabilities to describe CONCEPTUAL capabilities the skill needs (e.g. "Slack messaging", "Google Calendar read-only access") — do NOT guess specific tool names
2. Use deniedCapabilities to describe categories of access the skill must NOT have (e.g. "Shell or command execution", "Direct HTTP requests to arbitrary hosts")
3. Leave allowedTools and deniedTools as empty arrays — capability descriptions replace exact tool names
4. Filesystem access should be scoped as narrowly as possible
5. Network access should be limited to explicitly mentioned services
6. Always deny access to sensitive paths like ~/.ssh, ~/.aws, .env files
7. Set maxToolCalls to a reasonable upper bound (typically 2-5x the expected number)
8. The behavior.summary should accurately reflect the skill's purpose
9. neverDo should list actions that would represent scope escape
10. alwaysDo should list positive behavioral guidance (e.g., "confirm before deleting", "validate input data")
11. principles should capture high-level operating principles (e.g., "prefer read-only operations")

Output ONLY the YAML content between \`\`\`yaml and \`\`\` fences. No other text.`;
}

/**
 * Build the adversarial review prompt for Pass 2.
 */
export function buildReviewPrompt(
  skill: SkillMdData,
  generatedYaml: string,
): string {
  return `You are a red-team security reviewer for AI agent behavioral contracts.

Given the original SKILL.md and a generated ACTIONBOX contract, review the contract for:
1. **Over-permissiveness**: Are capabilities allowed that the skill doesn't need?
2. **Missing denials**: Are there dangerous capability categories not explicitly denied?
3. **Scope escape vectors**: Could the skill use allowed capabilities to access denied resources indirectly?
4. **Filesystem gaps**: Are sensitive paths (credentials, keys, configs) properly denied?
5. **Network gaps**: Could the skill exfiltrate data through allowed network access?
6. **Capability precision**: Are the capability descriptions specific enough to prevent abuse?

## SKILL.md
\`\`\`
${skill.raw}
\`\`\`

## Generated ACTIONBOX Contract
\`\`\`yaml
${generatedYaml}
\`\`\`

## Instructions
Output a REVISED version of the YAML contract that addresses any issues found. If the original is adequate, return it unchanged. Be strict but fair — don't remove capabilities the skill genuinely needs.

Ensure allowedCapabilities and deniedCapabilities use conceptual descriptions, NOT exact tool names. Leave allowedTools and deniedTools as empty arrays.

Output ONLY the YAML content between \`\`\`yaml and \`\`\` fences. No other text.`;
}

/**
 * Extract YAML from an LLM response that contains fenced code blocks.
 */
export function extractYamlFromResponse(response: string): string {
  const match = response.match(/```yaml\n([\s\S]*?)```/);
  if (!match) {
    throw new Error("No YAML code block found in LLM response");
  }
  return match[1].trim();
}
