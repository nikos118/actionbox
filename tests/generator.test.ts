import { describe, it, expect } from "vitest";
import { parseSkillMd } from "../src/generator/parser.js";
import {
  buildGeneratorPrompt,
  buildReviewPrompt,
  extractYamlFromResponse,
} from "../src/generator/prompts.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf-8");
}

describe("parseSkillMd", () => {
  it("parses a valid SKILL.md with id and name in frontmatter", () => {
    const content = readFixture("calendar-skill.md");
    const result = parseSkillMd(content);

    expect(result.skillId).toBe("calendar-sync");
    expect(result.skillName).toBe("Calendar Sync");
    expect(result.frontmatter).toHaveProperty("version", "1.0.0");
    expect(result.body).toContain("Calendar Sync Skill");
    expect(result.raw).toBe(content);
  });

  it("parses OpenClaw-style SKILL.md without id (uses fallback)", () => {
    const content = readFixture("openclaw-style-skill.md");
    const result = parseSkillMd(content, "merge-pr");

    expect(result.skillId).toBe("merge-pr");
    expect(result.skillName).toBe("Merge PR");
    expect(result.body).toContain("Squash-merges");
  });

  it("uses name as skillId when no id and no fallback", () => {
    const content = readFixture("openclaw-style-skill.md");
    const result = parseSkillMd(content);

    expect(result.skillId).toBe("Merge PR");
    expect(result.skillName).toBe("Merge PR");
  });

  it("throws if frontmatter is missing name", () => {
    const content = "---\nid: test\n---\n# Body";
    expect(() => parseSkillMd(content)).toThrow("'name' field");
  });

  it("parses the malicious skill fixture", () => {
    const content = readFixture("malicious-skill.md");
    const result = parseSkillMd(content);
    expect(result.skillId).toBe("data-exfil");
    expect(result.skillName).toBe("Innocent Helper");
  });

  it("parses the ambiguous skill fixture", () => {
    const content = readFixture("ambiguous-skill.md");
    const result = parseSkillMd(content);
    expect(result.skillId).toBe("general-assistant");
  });
});

describe("buildGeneratorPrompt", () => {
  it("includes the skill content and ID in the prompt", () => {
    const content = readFixture("calendar-skill.md");
    const skill = parseSkillMd(content);
    const prompt = buildGeneratorPrompt(skill);

    expect(prompt).toContain("calendar-sync");
    expect(prompt).toContain("Calendar Sync");
    expect(prompt).toContain("SKILL.md");
    expect(prompt).toContain("CONSERVATIVE");
    expect(prompt).toContain("deniedTools");
    expect(prompt).toContain("allowedTools");
    expect(prompt).toContain("alwaysDo");
    expect(prompt).toContain("principles");
  });
});

describe("buildReviewPrompt", () => {
  it("includes both the skill and generated YAML", () => {
    const content = readFixture("calendar-skill.md");
    const skill = parseSkillMd(content);
    const generatedYaml = "version: 1.0\nskillId: calendar-sync";
    const prompt = buildReviewPrompt(skill, generatedYaml);

    expect(prompt).toContain("red-team");
    expect(prompt).toContain("calendar-sync");
    expect(prompt).toContain(generatedYaml);
    expect(prompt).toContain("Over-permissiveness");
    expect(prompt).toContain("Scope escape vectors");
  });
});

describe("extractYamlFromResponse", () => {
  it("extracts YAML from fenced code block", () => {
    const response = `Here is the contract:

\`\`\`yaml
version: "1.0"
skillId: test
\`\`\`

Done!`;

    const yaml = extractYamlFromResponse(response);
    expect(yaml).toBe('version: "1.0"\nskillId: test');
  });

  it("throws if no YAML block is found", () => {
    expect(() => extractYamlFromResponse("no yaml here")).toThrow(
      "No YAML code block",
    );
  });

  it("handles multi-line YAML blocks", () => {
    const response = `\`\`\`yaml
allowedTools:
  - name: read_file
    reason: needed
  - name: write_file
    reason: also needed
\`\`\``;

    const yaml = extractYamlFromResponse(response);
    expect(yaml).toContain("allowedTools:");
    expect(yaml).toContain("read_file");
  });
});
