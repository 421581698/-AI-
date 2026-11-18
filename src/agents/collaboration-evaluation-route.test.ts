import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { SkillRegistry } from "../skills/registry.js";
import { registerCollaborationEvaluationRoute } from "./collaboration-evaluation-route.js";

describe("collaboration evaluation route", () => {
  it("returns a deterministic contract report and bounded observability metrics", async () => {
    const app = Fastify();
    registerCollaborationEvaluationRoute(app, new SkillRegistry([]), async () => undefined);
    const response = await app.inject({ method: "POST", url: "/v1/agents/collaborate/evaluate", payload: { task: "Prepare a research summary" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().evaluation).toMatchObject({ status: "passed", score: 100, scope: "deterministic-collaboration-contract", runtimeExecutionEvaluated: false });
    expect(response.json().evaluation.metrics).toMatchObject({ agentCount: 2, assignmentCount: 2, plannedStepCount: 2, assignedStepCount: 2 });
    await app.close();
  });

  it("rejects unsupported evaluation options", async () => {
    const app = Fastify();
    registerCollaborationEvaluationRoute(app, new SkillRegistry([]), async () => undefined);
    const response = await app.inject({ method: "POST", url: "/v1/agents/collaborate/evaluate", payload: { task: "Evaluate collaboration", modelQuality: true } });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
