import { describe, it, expect } from "vitest";
import {
  buildDirective,
  buildSkillDirective,
} from "../src/injector/directive-builder.js";
import type { ActionBox } from "../src/types.js";

function makeBox(overrides: Partial<ActionBox> = {}): ActionBox {
  return {
    version: "1.0",
    skillId: "test-skill",
    skillName: "Test Skill",
    allowedTools: [
      { name: "read_file", reason: "Needed for reading" },
    ],
    deniedTools: [
      { name: "shell_exec", reason: "No shell access" },
    ],
    filesystem: {
      readable: ["./data/**"],
      writable: ["./data/output.json"],
      denied: ["~/.ssh/**", "**/.env"],
    },
    network: {
      allowedHosts: ["api.example.com"],
      deniedHosts: ["*.onion"],
    },
    behavior: {
      summary: "A test skill for unit testing.",
      neverDo: ["Execute shell commands", "Access credentials"],
      alwaysDo: ["Validate input data", "Log all operations"],
      principles: ["Prefer read-only operations"],
      maxToolCalls: 10,
    },
    drift: {
      skillHash: "abc123",
      generatedAt: "2025-01-01T00:00:00.000Z",
      generatorModel: "claude-sonnet-4-5-20250929",
      reviewed: false,
    },
    ...overrides,
  };
}

describe("buildSkillDirective", () => {
  it("includes all sections for a fully populated box", () => {
    const box = makeBox();
    const xml = buildSkillDirective(box);

    expect(xml).toContain('<skill name="test-skill">');
    expect(xml).toContain("<purpose>A test skill for unit testing.</purpose>");
    expect(xml).toContain("<principle>Prefer read-only operations</principle>");
    expect(xml).toContain("<rule>Validate input data</rule>");
    expect(xml).toContain("<rule>Log all operations</rule>");
    expect(xml).toContain("<rule>Execute shell commands</rule>");
    expect(xml).toContain("<rule>Access credentials</rule>");
    expect(xml).toContain("<allowed-tools>read_file</allowed-tools>");
    expect(xml).toContain("<denied-tools>shell_exec</denied-tools>");
    expect(xml).toContain("<readable>./data/**</readable>");
    expect(xml).toContain("<writable>./data/output.json</writable>");
    expect(xml).toContain("<denied>~/.ssh/**, **/.env</denied>");
    expect(xml).toContain("<allowed>api.example.com</allowed>");
    expect(xml).toContain("<denied>*.onion</denied>");
    expect(xml).toContain("</skill>");
  });

  it("renders alwaysDo rules in <always-do> section", () => {
    const box = makeBox();
    const xml = buildSkillDirective(box);

    expect(xml).toContain("<always-do>");
    expect(xml).toContain("<rule>Validate input data</rule>");
    expect(xml).toContain("<rule>Log all operations</rule>");
    expect(xml).toContain("</always-do>");
  });

  it("renders principles in <principles> section", () => {
    const box = makeBox();
    const xml = buildSkillDirective(box);

    expect(xml).toContain("<principles>");
    expect(xml).toContain("<principle>Prefer read-only operations</principle>");
    expect(xml).toContain("</principles>");
  });

  it("omits <always-do> section when alwaysDo is empty", () => {
    const box = makeBox({
      behavior: {
        summary: "Minimal skill.",
        neverDo: ["Bad things"],
        alwaysDo: [],
        principles: [],
      },
    });
    const xml = buildSkillDirective(box);

    expect(xml).not.toContain("<always-do>");
    expect(xml).not.toContain("</always-do>");
  });

  it("omits <principles> section when principles is empty", () => {
    const box = makeBox({
      behavior: {
        summary: "Minimal skill.",
        neverDo: ["Bad things"],
        alwaysDo: [],
        principles: [],
      },
    });
    const xml = buildSkillDirective(box);

    expect(xml).not.toContain("<principles>");
    expect(xml).not.toContain("</principles>");
  });

  it("handles missing alwaysDo and principles (undefined)", () => {
    const box = makeBox({
      behavior: {
        summary: "Legacy skill.",
        neverDo: ["Bad things"],
      },
    });
    const xml = buildSkillDirective(box);

    expect(xml).not.toContain("<always-do>");
    expect(xml).not.toContain("<principles>");
    expect(xml).toContain("<purpose>Legacy skill.</purpose>");
    expect(xml).toContain("<rule>Bad things</rule>");
  });

  it("escapes XML special characters", () => {
    const box = makeBox({
      behavior: {
        summary: "Handles <tags> & \"quotes\"",
        neverDo: ["Use <script> injection"],
        alwaysDo: ["Escape & validate input"],
        principles: ["Data > assumptions"],
      },
    });
    const xml = buildSkillDirective(box);

    expect(xml).toContain("Handles &lt;tags&gt; &amp; \"quotes\"");
    expect(xml).toContain("Use &lt;script&gt; injection");
    expect(xml).toContain("Escape &amp; validate input");
    expect(xml).toContain("Data &gt; assumptions");
  });

  it("handles multiple allowed and denied tools", () => {
    const box = makeBox({
      allowedTools: [
        { name: "read_file", reason: "r" },
        { name: "write_file", reason: "w" },
        { name: "list_dir", reason: "l" },
      ],
      deniedTools: [
        { name: "shell_exec", reason: "no" },
        { name: "file_delete", reason: "no" },
      ],
    });
    const xml = buildSkillDirective(box);

    expect(xml).toContain("<allowed-tools>read_file, write_file, list_dir</allowed-tools>");
    expect(xml).toContain("<denied-tools>shell_exec, file_delete</denied-tools>");
  });

  it("omits filesystem section when all arrays are empty", () => {
    const box = makeBox({
      filesystem: { readable: [], writable: [], denied: [] },
    });
    const xml = buildSkillDirective(box);

    expect(xml).not.toContain("<filesystem>");
  });

  it("omits network section when all arrays are empty", () => {
    const box = makeBox({
      network: { allowedHosts: [], deniedHosts: [] },
    });
    const xml = buildSkillDirective(box);

    expect(xml).not.toContain("<network>");
  });
});

describe("buildDirective", () => {
  it("returns empty string for empty array", () => {
    expect(buildDirective([])).toBe("");
  });

  it("wraps a single box in <actionbox-directive>", () => {
    const box = makeBox();
    const directive = buildDirective([box]);

    expect(directive).toMatch(/^<actionbox-directive>\n/);
    expect(directive).toMatch(/<\/actionbox-directive>$/);
    expect(directive).toContain('<skill name="test-skill">');
  });

  it("includes multiple skills in a single directive block", () => {
    const box1 = makeBox({ skillId: "skill-a", skillName: "Skill A" });
    const box2 = makeBox({ skillId: "skill-b", skillName: "Skill B" });
    const directive = buildDirective([box1, box2]);

    expect(directive).toContain('<skill name="skill-a">');
    expect(directive).toContain('<skill name="skill-b">');

    // Only one wrapper
    const openTags = directive.match(/<actionbox-directive>/g);
    expect(openTags).toHaveLength(1);
    const closeTags = directive.match(/<\/actionbox-directive>/g);
    expect(closeTags).toHaveLength(1);
  });

  it("produces valid structure with all sections populated", () => {
    const box = makeBox();
    const directive = buildDirective([box]);

    // Verify nesting: actionbox-directive > skill > purpose, principles, etc.
    const lines = directive.split("\n");
    expect(lines[0]).toBe("<actionbox-directive>");
    expect(lines[lines.length - 1]).toBe("</actionbox-directive>");

    // Skill is indented
    expect(lines[1]).toMatch(/^ {2}<skill/);
  });
});
