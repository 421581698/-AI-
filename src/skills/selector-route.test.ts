import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillRegistry } from "./registry.js";
import { registerSkillSelectorRoute } from "./selector-route.js";

describe("POST /v1/skills/select", () => {
  let temporary: string | undefined;
  afterEach(async () => {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    temporary = undefined;
  });

  it("returns ranked matches and records a minimal audit event", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "our-ai-selector-api-"));
    const dir = path.join(temporary, "modern-web-guidance");
    await mkdir(dir);
    await writeFile(path.join(dir, "SKILL.md"), "---\nname: modern-web-guidance\ndescription: Modern browser development, HTML, CSS, JavaScript, accessibility and web performance.\n---\n# Skill\n");
    const app = Fastify();
    const audit = vi.fn(async () => undefined);
    registerSkillSelectorRoute(app, new SkillRegistry([temporary]), audit);

    const response = await app.inject({
      method: "POST",
      url: "/v1/skills/select",
      payload: { task: "Build a modern accessible website using CSS and browser performance" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().selected.skill.id).toBe("modern-web-guidance");
    expect(response.json().mode).toBe("explainable-lexical");
    expect(audit).toHaveBeenCalledOnce();
    await app.close();
  });

  it("validates task input and returns an empty selection for unrelated work", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "our-ai-selector-api-"));
    const app = Fastify();
    registerSkillSelectorRoute(app, new SkillRegistry([temporary]), async () => undefined);

    const invalid = await app.inject({ method: "POST", url: "/v1/skills/select", payload: { task: "x" } });
    expect(invalid.statusCode).toBe(400);

    const unrelated = await app.inject({ method: "POST", url: "/v1/skills/select", payload: { task: "Write a poem about the ocean" } });
    expect(unrelated.statusCode).toBe(200);
    expect(unrelated.json().selected).toBeNull();
    expect(unrelated.json().matches).toEqual([]);
    await app.close();
  });
});
