import { createHash } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

const MAX_SKILL_BYTES = 128 * 1024;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export type SkillSummary = {
  id: string;
  name: string;
  description: string;
  version: string;
  source: string;
};

export type SkillDocument = SkillSummary & {
  content: string;
  sha256: string;
};

function parseFrontmatter(content: string, fallbackId: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const header = match?.[1] ?? "";
  const name = header.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") || fallbackId;
  const descriptionMatch = header.match(/^description:\s*\|\s*\r?\n((?:[ \t]+.*(?:\r?\n|$))*)/m);
  const description = descriptionMatch
    ? descriptionMatch[1].split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join(" ")
    : header.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") || "";
  return { name: name.slice(0, 120), description: description.slice(0, 2000) };
}

export class SkillRegistry {
  private readonly roots: string[];

  constructor(roots: string[]) {
    this.roots = roots.map((root) => path.resolve(root));
  }

  private async readSkill(root: string, id: string): Promise<SkillDocument | null> {
    if (!ID_PATTERN.test(id)) return null;
    try {
      const rootReal = await realpath(root);
      const directory = await realpath(path.join(rootReal, id));
      if (path.dirname(directory) !== rootReal) return null;
      const file = path.join(directory, "SKILL.md");
      const fileReal = await realpath(file);
      if (path.dirname(fileReal) !== directory) return null;
      const stat = await import("node:fs/promises").then((fs) => fs.stat(fileReal));
      if (!stat.isFile() || stat.size > MAX_SKILL_BYTES) return null;
      const content = await readFile(fileReal, "utf8");
      const metadata = parseFrontmatter(content, id);
      return {
        id,
        ...metadata,
        version: createHash("sha256").update(content).digest("hex").slice(0, 16),
        sha256: createHash("sha256").update(content).digest("hex"),
        source: path.basename(rootReal) === "skills" ? "skills" : "agent-skills",
        content
      };
    } catch {
      return null;
    }
  }

  async list(): Promise<SkillSummary[]> {
    const found = new Map<string, SkillSummary>();
    for (const root of this.roots) {
      let entries;
      try { entries = await readdir(root, { withFileTypes: true }); }
      catch { continue; }
      for (const entry of entries) {
        if (!entry.isDirectory() || !ID_PATTERN.test(entry.name) || found.has(entry.name)) continue;
        const skill = await this.readSkill(root, entry.name);
        if (skill) {
          const { content: _content, sha256: _sha256, ...summary } = skill;
          found.set(entry.name, summary);
        }
      }
    }
    return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<SkillDocument | null> {
    for (const root of this.roots) {
      const skill = await this.readSkill(root, id);
      if (skill) return skill;
    }
    return null;
  }
}
