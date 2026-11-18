import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SkillEvaluator } from "./evaluation.js";

type AuditSkillEvaluation = (
  requestId: string,
  action: string,
  outcome: string,
  details: Record<string, unknown>
) => Promise<void>;

const requestSchema = z.object({
  skillId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)
}).strict();

export function registerSkillEvaluationRoute(
  app: FastifyInstance,
  evaluator: SkillEvaluator,
  audit: AuditSkillEvaluation
): void {
  app.post("/v1/skills/evaluate", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }

    const report = await evaluator.evaluate(parsed.data.skillId);
    if (!report) {
      await audit(request.id, "skill.evaluate", "unavailable", { skillId: parsed.data.skillId });
      return reply.code(404).send({ error: "skill_not_found_or_not_authorized" });
    }

    await audit(request.id, "skill.evaluate", report.status, {
      evaluationId: report.evaluationId,
      skillId: report.skillId,
      score: report.score,
      passedChecks: report.checks.filter((check) => check.passed).length,
      totalChecks: report.checks.length,
      scope: report.scope
    });
    return report;
  });
}
