import { readFile, writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import YAML from "yaml";
import { parseSkillMd } from "./parser.js";
import {
  buildGeneratorPrompt,
  buildReviewPrompt,
  extractYamlFromResponse,
} from "./prompts.js";
import { sha256 } from "../utils/hash.js";
import { serializeActionBox } from "../utils/yaml.js";
import { skillMdPath, actionBoxPath } from "../utils/config.js";
import type { ActionBox, DriftInfo } from "../types.js";

export interface GenerateOptions {
  model: string;
  skillDir: string;
  /** Skip the adversarial review pass */
  skipReview?: boolean;
}

export interface GenerateResult {
  box: ActionBox;
  path: string;
  passes: number;
}

/**
 * Generate an ACTIONBOX.md for a skill directory.
 *
 * Uses a two-pass approach:
 * 1. Conservative generation — produce initial contract
 * 2. Adversarial review — red-team and tighten the contract
 */
export async function generateActionBox(
  options: GenerateOptions,
): Promise<GenerateResult> {
  const { model, skillDir, skipReview = false } = options;

  // Read and parse SKILL.md
  const skillContent = await readFile(skillMdPath(skillDir), "utf-8");
  const skill = parseSkillMd(skillContent);

  const client = new Anthropic();

  // Pass 1: Conservative generation
  const generatorPrompt = buildGeneratorPrompt(skill);
  const pass1Response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: generatorPrompt }],
  });

  const pass1Text =
    pass1Response.content[0].type === "text" ? pass1Response.content[0].text : "";
  let yamlContent = extractYamlFromResponse(pass1Text);
  let passes = 1;

  // Pass 2: Adversarial review
  if (!skipReview) {
    const reviewPrompt = buildReviewPrompt(skill, yamlContent);
    const pass2Response = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: reviewPrompt }],
    });

    const pass2Text =
      pass2Response.content[0].type === "text"
        ? pass2Response.content[0].text
        : "";
    yamlContent = extractYamlFromResponse(pass2Text);
    passes = 2;
  }

  // Parse generated YAML and attach drift metadata
  const parsed = YAML.parse(yamlContent) as Omit<ActionBox, "drift">;

  const drift: DriftInfo = {
    skillHash: sha256(skillContent),
    generatedAt: new Date().toISOString(),
    generatorModel: model,
    reviewed: false,
  };

  const box: ActionBox = {
    ...parsed,
    version: "1.0",
    skillId: skill.skillId,
    skillName: skill.skillName,
    drift,
  };

  // Write ACTIONBOX.md
  const outputPath = actionBoxPath(skillDir);
  const serialized = serializeActionBox(box);
  await writeFile(outputPath, serialized, "utf-8");

  return { box, path: outputPath, passes };
}
