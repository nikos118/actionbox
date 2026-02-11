import Anthropic from "@anthropic-ai/sdk";

export interface CapabilityClassification {
  allowed: boolean;
  reason: string;
  matchedCapability?: string;
}

const CLASSIFICATION_PROMPT = `You are a tool-capability classifier. Given a tool call and a set of capability descriptions, determine whether the tool call aligns with the allowed capabilities or matches any denied capabilities.

Tool name: {{toolName}}
Tool parameters: {{params}}

Allowed capabilities:
{{allowedCapabilities}}

Denied capabilities:
{{deniedCapabilities}}

Respond with EXACTLY one JSON object (no markdown fencing, no extra text):
{"allowed": true/false, "reason": "brief explanation", "matchedCapability": "the capability that matched, or null"}

Rules:
- If the tool call clearly matches a denied capability, set allowed=false and matchedCapability to the denied capability.
- If the tool call clearly aligns with an allowed capability, set allowed=true and matchedCapability to the allowed capability.
- If the tool call does not match any denied capability AND does not match any allowed capability, set allowed=false, reason="Tool does not match any allowed capability", matchedCapability=null.
- Be practical: match based on the conceptual purpose of the tool, not just its exact name.`;

function buildClassificationPrompt(
  toolName: string,
  params: Record<string, unknown>,
  allowedCapabilities: string[],
  deniedCapabilities: string[],
): string {
  const allowedList =
    allowedCapabilities.length > 0
      ? allowedCapabilities.map((c) => `- ${c}`).join("\n")
      : "- (none)";
  const deniedList =
    deniedCapabilities.length > 0
      ? deniedCapabilities.map((c) => `- ${c}`).join("\n")
      : "- (none)";

  return CLASSIFICATION_PROMPT.replace("{{toolName}}", toolName)
    .replace("{{params}}", JSON.stringify(params))
    .replace("{{allowedCapabilities}}", allowedList)
    .replace("{{deniedCapabilities}}", deniedList);
}

/**
 * Classify a tool call against capability descriptions using an LLM.
 */
export async function classifyToolCall(
  toolName: string,
  params: Record<string, unknown>,
  allowedCapabilities: string[],
  deniedCapabilities: string[],
  model = "claude-haiku-4-5-20251001",
): Promise<CapabilityClassification> {
  const client = new Anthropic();
  const prompt = buildClassificationPrompt(
    toolName,
    params,
    allowedCapabilities,
    deniedCapabilities,
  );

  const response = await client.messages.create({
    model,
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const result = JSON.parse(text.trim()) as {
      allowed: boolean;
      reason: string;
      matchedCapability?: string | null;
    };
    return {
      allowed: result.allowed,
      reason: result.reason,
      matchedCapability: result.matchedCapability ?? undefined,
    };
  } catch {
    return {
      allowed: false,
      reason: `Failed to parse capability classification response: ${text}`,
    };
  }
}

/**
 * Cache for capability classifications, keyed by tool name.
 * Tool name determines the category — params don't change classification.
 */
export class CapabilityMatcherCache {
  private cache = new Map<string, CapabilityClassification>();

  get(toolName: string): CapabilityClassification | undefined {
    return this.cache.get(toolName);
  }

  set(toolName: string, classification: CapabilityClassification): void {
    this.cache.set(toolName, classification);
  }

  has(toolName: string): boolean {
    return this.cache.has(toolName);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Re-export the prompt builder for testing
export { buildClassificationPrompt as _buildClassificationPrompt };
