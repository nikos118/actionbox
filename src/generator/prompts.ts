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

allowedTools:
  - name: <tool_name>
    reason: <why this tool is needed>
    constraints: {} # optional argument constraints

deniedTools:
  - name: <tool_name>
    reason: <why this must be denied>

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
1. Only allow tools that the skill EXPLICITLY needs based on its description
2. Filesystem access should be scoped as narrowly as possible
3. Network access should be limited to explicitly mentioned services
4. The deniedTools list should include dangerous tools the skill has no reason to use (e.g., shell execution, file deletion outside scope)
5. Always deny access to sensitive paths like ~/.ssh, ~/.aws, .env files
6. Set maxToolCalls to a reasonable upper bound (typically 2-5x the expected number)
7. The behavior.summary should accurately reflect the skill's purpose
8. neverDo should list actions that would represent scope escape
9. alwaysDo should list positive behavioral guidance (e.g., "confirm before deleting", "validate input data")
10. principles should capture high-level operating principles (e.g., "prefer read-only operations")

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
1. **Over-permissiveness**: Are tools or paths allowed that the skill doesn't need?
2. **Missing denials**: Are there dangerous capabilities not explicitly denied?
3. **Scope escape vectors**: Could the skill use allowed tools to access denied resources indirectly?
4. **Filesystem gaps**: Are sensitive paths (credentials, keys, configs) properly denied?
5. **Network gaps**: Could the skill exfiltrate data through allowed network access?

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
