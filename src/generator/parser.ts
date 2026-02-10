import matter from "gray-matter";

export interface SkillMdData {
  /** Frontmatter fields */
  frontmatter: Record<string, unknown>;
  /** Skill ID (from frontmatter id, or derived externally from directory name) */
  skillId: string;
  /** Skill name from frontmatter */
  skillName: string;
  /** The markdown body (excluding frontmatter) */
  body: string;
  /** Raw full content */
  raw: string;
}

/**
 * Parse a SKILL.md file into structured data.
 *
 * Real OpenClaw skills have `name` and `description` in frontmatter.
 * The `id` field is optional — when absent, the caller should provide
 * a skillId derived from the directory name.
 */
export function parseSkillMd(content: string, fallbackId?: string): SkillMdData {
  const { data, content: body } = matter(content);

  const skillName = data.name as string | undefined;
  if (!skillName) {
    throw new Error("SKILL.md frontmatter must include a 'name' field");
  }

  // Use frontmatter id if present, otherwise fall back to provided id or name
  const skillId = (data.id as string | undefined) ?? fallbackId ?? skillName;

  return {
    frontmatter: data,
    skillId,
    skillName,
    body: body.trim(),
    raw: content,
  };
}
