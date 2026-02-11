import type { ActionBox } from "../types.js";

/**
 * Escape XML special characters in a string.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build an XML directive block for a single ActionBox contract.
 */
export function buildSkillDirective(box: ActionBox): string {
  const lines: string[] = [];
  lines.push(`  <skill name="${escapeXml(box.skillId)}">`);

  // Purpose
  lines.push(`    <purpose>${escapeXml(box.behavior.summary)}</purpose>`);

  // Principles
  const principles = box.behavior.principles ?? [];
  if (principles.length > 0) {
    lines.push("    <principles>");
    for (const p of principles) {
      lines.push(`      <principle>${escapeXml(p)}</principle>`);
    }
    lines.push("    </principles>");
  }

  // Always do
  const alwaysDo = box.behavior.alwaysDo ?? [];
  if (alwaysDo.length > 0) {
    lines.push("    <always-do>");
    for (const rule of alwaysDo) {
      lines.push(`      <rule>${escapeXml(rule)}</rule>`);
    }
    lines.push("    </always-do>");
  }

  // Never do
  if (box.behavior.neverDo.length > 0) {
    lines.push("    <never-do>");
    for (const rule of box.behavior.neverDo) {
      lines.push(`      <rule>${escapeXml(rule)}</rule>`);
    }
    lines.push("    </never-do>");
  }

  // Allowed tools
  if (box.allowedTools.length > 0) {
    const names = box.allowedTools.map((t) => t.name).join(", ");
    lines.push(`    <allowed-tools>${escapeXml(names)}</allowed-tools>`);
  }

  // Denied tools
  if (box.deniedTools.length > 0) {
    const names = box.deniedTools.map((t) => t.name).join(", ");
    lines.push(`    <denied-tools>${escapeXml(names)}</denied-tools>`);
  }

  // Filesystem
  const fs = box.filesystem;
  if (fs.readable.length > 0 || fs.writable.length > 0 || fs.denied.length > 0) {
    lines.push("    <filesystem>");
    if (fs.readable.length > 0) {
      lines.push(`      <readable>${escapeXml(fs.readable.join(", "))}</readable>`);
    }
    if (fs.writable.length > 0) {
      lines.push(`      <writable>${escapeXml(fs.writable.join(", "))}</writable>`);
    }
    if (fs.denied.length > 0) {
      lines.push(`      <denied>${escapeXml(fs.denied.join(", "))}</denied>`);
    }
    lines.push("    </filesystem>");
  }

  // Network
  const net = box.network;
  if (net.allowedHosts.length > 0 || net.deniedHosts.length > 0) {
    lines.push("    <network>");
    if (net.allowedHosts.length > 0) {
      lines.push(`      <allowed>${escapeXml(net.allowedHosts.join(", "))}</allowed>`);
    }
    if (net.deniedHosts.length > 0) {
      lines.push(`      <denied>${escapeXml(net.deniedHosts.join(", "))}</denied>`);
    }
    lines.push("    </network>");
  }

  lines.push("  </skill>");
  return lines.join("\n");
}

/**
 * Build a complete `<actionbox-directive>` XML block from all loaded ActionBox contracts.
 * Returns an empty string if no boxes are provided.
 */
export function buildDirective(boxes: ActionBox[]): string {
  if (boxes.length === 0) {
    return "";
  }

  const skillBlocks = boxes.map((box) => buildSkillDirective(box));
  return `<actionbox-directive>\n${skillBlocks.join("\n")}\n</actionbox-directive>`;
}
