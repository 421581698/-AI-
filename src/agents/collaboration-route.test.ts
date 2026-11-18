import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { SkillRegistry } from "../skills/registry.js";
import { registerCollaborationRoute } from "./collaboration-route.js";

describe("collaboration route", () => {
  it("returns a bounded planning-only multi-agent collaboration plan", async () => {
    const app = Fastify();
    const registry = new SkillRegistry([]);
    registerCollaborationRoute(app, registry, async () => undefined);
    const response = await app.inject({ method: "POST", url: "/v1/agents/collaborate/plan", payload: { task: "Prepare a research summary" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ executionEnabled: false, modelUsed: false, status: "planned" });
    expect(response.json().summary.agentCount).toBe(2);
    await app.close();
  });

  it("rejects unknown request fields", async () => {
    const app = Fastify();
    registerCollaborationRoute(app, new SkillRegistry([]), async () => undefined);
    const response = await app.inject({ method: "POST", url: "/v1/agents/collaborate/plan", payload: { task: "Research this", approved: true } });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
