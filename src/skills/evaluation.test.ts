import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillRegistry } from "./registry.js";
import { SkillRuntime } from "./runtime.js";
import { SkillEvaluator } from "./evaluation.js";
import { registerSkillEvaluationRoute } from "./evaluation-route.js";

describe("SkillEvaluator", () => {
  let temporary: string | undefined;
  afterEach(async () => {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    temporary = undefined;
  });

  async function setup() {
    temporary = await mkdtemp(path.join(os.tmpdir(), "our-ai-evaluation-"));
    const dir = path.join(temporary, "test-skill");
    await mkdir(dir);
    await writeFile(path.join(dir, "SKILL.md"),
      "---\nname: test-skill\ndescription: Evaluation fixture.\n---\nUntrusted reference text.");
    const registry = new SkillRegistry([temporary]);
    const evaluator = new SkillEvaluator(new SkillRuntime(registry));
    return { registry, evaluator };
  }

  it("passes the complete deterministic runtime contract", async () => {
    const { evaluator } = await setup();
    const report = await evaluator.evaluate("test-skill");
    expect(report?.status).toBe("passed");
    expect(report?.score).toBe(100);
    expect(report?.checks).toHaveLength(7);
    expect(report?.scope).toBe("deterministic-runtime-contract");
    expect(report?.modelQualityEvaluated).toBe(false);
  });

  it("returns null for an unregistered skill", async () => {
    const { evaluator } = await setup();
    expect(await evaluator.evaluate("missing-skill")).toBeNull();
  });
});

describe("POST /v1/skills/evaluate", () => {
  let temporary: string | undefined;
  afterEach(async () => {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    temporary = undefined;
  });

  it("returns a report and audits only aggregate evaluation metadata", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "our-ai-eval-route-"));
    const dir = path.join(temporary, "test-skill");
    await mkdir(dir);
    await writeFile(path.join(dir, "SKILL.md"),
      "---\nname: test-skill\ndescription: Evaluation fixture.\n---\nDo not store this text in audit.");
    const evaluator = new SkillEvaluator(new SkillRuntime(new SkillRegistry([temporary])));
    const audit = vi.fn(async () => undefined);
    const app = Fastify();
    registerSkillEvaluationRoute(app, evaluator, audit);

    const response = await app.inject({
      method: "POST",
      url: "/v1/skills/evaluate",
      payload: { skillId: "test-skill" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("passed");
    expect(audit).toHaveBeenCalledOnce();
    expect(JSON.stringify(audit.mock.calls)).not.toContain("Do not store this text in audit.");

    const invalid = await app.inject({
      method: "POST",
      url: "/v1/skills/evaluate",
      payload: { skillId: "test-skill", prompt: "inject" }
    });
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });
});
