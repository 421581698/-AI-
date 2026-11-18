import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SkillRegistry } from "../skills/registry.js";
import { buildAgentPlan } from "./planner.js";

type AuditPlan = (requestId: string, action: string, outcome: string, details: Record<string, unknown>) => Promise<void>;

const requestSchema = z.object({
  task: z.string().trim().min(3).max(4_000),
  limit: z.number().int().min(1).max(3).default(3)
}).strict();

export function registerAgentPlannerRoute(app: FastifyInstance, registry: SkillRegistry, audit: AuditPlan): void {
  app.post("/v1/agents/plan", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    const plan = buildAgentPlan(parsed.data.task, await registry.list(), parsed.data.limit);
    await audit(request.id, "agent.plan", "success", {
      planId: plan.planId,
      stepCount: plan.summary.stepCount,
      skillCount: plan.summary.skillCount,
      maxRisk: plan.summary.maxRisk,
      planner: plan.planner
    });
    return plan;
  });
}
