import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SkillRegistry } from "./registry.js";

describe("SkillRegistry", () => {
  let temporary: string | undefined;
  afterEach(async () => {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    temporary = undefined;
  });

  it("lists valid skill manifests and returns their content with a stable digest", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "our-ai-skills-"));
    const skillDir = path.join(temporary, "modern-web-guidance");
    await mkdir(skillDir);
    const content = "---\nname: modern-web-guidance\ndescription: |\n  Modern browser development guidance.\n---\n# Guide\nUse current platform features.\n";
    await writeFile(path.join(skillDir, "SKILL.md"), content);

    const registry = new SkillRegistry([temporary]);
    const list = await registry.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "modern-web-guidance",
      name: "modern-web-guidance",
      description: "Modern browser development guidance."
    });

    const loaded = await registry.get("modern-web-guidance");
    expect(loaded?.content).toBe(content);
    expect(loaded?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(loaded?.version).toHaveLength(16);
  });

  it("rejects path traversal and invalid identifiers", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "our-ai-skills-"));
    const registry = new SkillRegistry([temporary]);
    await expect(registry.get("../package.json")).resolves.toBeNull();
    await expect(registry.get("UPPER CASE")).resolves.toBeNull();
  });

  it("ignores missing manifests and oversized skill files", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "our-ai-skills-"));
    await mkdir(path.join(temporary, "empty"));
    const large = path.join(temporary, "large");
    await mkdir(large);
    await writeFile(path.join(large, "SKILL.md"), "x".repeat(128 * 1024 + 1));
    const registry = new SkillRegistry([temporary]);
    await expect(registry.list()).resolves.toEqual([]);
  });
});
