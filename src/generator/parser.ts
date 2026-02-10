import matter from "gray-matter";

export interface SkillMdData {
  /** Frontmatter fields */
  frontmatter: Record<string, unknown>;
  /** Skill ID from frontmatter */
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
 * Expects YAML frontmatter with at least `id` and `name` fields.
 */
export function parseSkillMd(content: string): SkillMdData {
  const { data, content: body } = matter(content);

  const skillId = data.id as string | undefined;
  const skillName = data.name as string | undefined;

  if (!skillId) {
    throw new Error("SKILL.md frontmatter must include an 'id' field");
  }
  if (!skillName) {
    throw new Error("SKILL.md frontmatter must include a 'name' field");
  }

  return {
    frontmatter: data,
    skillId,
    skillName,
    body: body.trim(),
    raw: content,
  };
}
