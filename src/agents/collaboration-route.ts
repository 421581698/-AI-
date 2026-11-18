import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SkillRegistry } from "../skills/registry.js";
import { buildCollaborationPlan } from "./collaboration.js";

type Audit = (requestId: string, action: string, outcome: string, details: Record<string, unknown>) => Promise<void>;

const schema = z.object({
  task: z.string().trim().min(3).max(4_000),
  limit: z.number().int().min(1).max(3).default(3)
}).strict();

export function registerCollaborationRoute(app: FastifyInstance, registry: SkillRegistry, audit: Audit): void {
  app.post("/v1/agents/collaborate/plan", async (request, reply) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    const plan = buildCollaborationPlan(parsed.data.task, await registry.list(), parsed.data.limit);
    await audit(request.id, "agent.collaboration.plan", "success", {
      collaborationId: plan.collaborationId,
      sourcePlanId: plan.sourcePlanId,
      agentCount: plan.summary.agentCount,
      assignmentCount: plan.summary.assignmentCount,
      stepCount: plan.summary.stepCount,
      executionEnabled: false
    });
    return plan;
  });
}
