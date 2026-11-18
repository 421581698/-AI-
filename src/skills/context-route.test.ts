import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillRegistry } from "./registry.js";
import { registerSkillContextRoute } from "./context-route.js";

describe("POST /v1/skills/context", () => {
  let temporary: string | undefined;
  afterEach(async () => {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    temporary = undefined;
  });

  it("selects skills and returns bounded context with provenance", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "our-ai-context-api-"));
    const dir = path.join(temporary, "modern-web-guidance");
    await mkdir(dir);
    await writeFile(path.join(dir, "SKILL.md"), "---\nname: modern-web-guidance\ndescription: Modern browser development, HTML, CSS, JavaScript and accessibility.\n---\n# Guide\nUse semantic HTML and accessible controls.\n");
    const app = Fastify();
    const audit = vi.fn(async () => undefined);
    registerSkillContextRoute(app, new SkillRegistry([temporary]), audit);

    const response = await app.inject({
      method: "POST",
      url: "/v1/skills/context",
      payload: { task: "Build a modern accessible website using CSS and browser" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().materials[0].id).toBe("modern-web-guidance");
    expect(response.json().policy.execution).toBe("disabled");
    expect(response.json().materials[0].trust).toBe("untrusted-reference");
    expect(audit).toHaveBeenCalledOnce();
    await app.close();
  });

  it("returns empty context for unrelated tasks and validates input", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "our-ai-context-api-"));
    const app = Fastify();
    registerSkillContextRoute(app, new SkillRegistry([temporary]), async () => undefined);

    const invalid = await app.inject({ method: "POST", url: "/v1/skills/context", payload: { task: "x" } });
    expect(invalid.statusCode).toBe(400);
    const unrelated = await app.inject({ method: "POST", url: "/v1/skills/context", payload: { task: "Write a poem about the ocean" } });
    expect(unrelated.statusCode).toBe(200);
    expect(unrelated.json().materials).toEqual([]);
    expect(unrelated.json().summary.totalChars).toBe(0);
    await app.close();
  });
});
