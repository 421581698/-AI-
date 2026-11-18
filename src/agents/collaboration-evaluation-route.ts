import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SkillRegistry } from "../skills/registry.js";
import { buildCollaborationPlan } from "./collaboration.js";
import { evaluateCollaborationPlan } from "./collaboration-evaluation.js";

type Audit = (requestId: string, action: string, outcome: string, details: Record<string, unknown>) => Promise<void>;
const schema = z.object({
  task: z.string().trim().min(3).max(4_000),
  limit: z.number().int().min(1).max(3).default(3)
}).strict();

export function registerCollaborationEvaluationRoute(app: FastifyInstance, registry: SkillRegistry, audit: Audit): void {
  app.post("/v1/agents/collaborate/evaluate", async (request, reply) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    const plan = buildCollaborationPlan(parsed.data.task, await registry.list(), parsed.data.limit);
    const report = evaluateCollaborationPlan(plan);
    await audit(request.id, "agent.collaboration.evaluate", report.status, {
      evaluationId: report.evaluationId,
      collaborationId: report.collaborationId,
      score: report.score,
      passedChecks: report.checks.filter((check) => check.passed).length,
      totalChecks: report.checks.length,
      metrics: report.metrics,
      scope: report.scope
    });
    return { plan, evaluation: report };
  });
}
