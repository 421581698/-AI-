import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SkillRegistry } from "./registry.js";
import { evaluateSkillPermissions } from "./permission.js";

type AuditSkillPermission = (
  requestId: string,
  action: string,
  outcome: string,
  details: Record<string, unknown>
) => Promise<void>;

const requestSchema = z.object({
  skillId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  capabilities: z.array(z.string().min(1).max(120)).min(1).max(20)
}).strict();

export function registerSkillPermissionRoute(
  app: FastifyInstance,
  registry: SkillRegistry,
  audit: AuditSkillPermission
): void {
  app.post("/v1/skills/authorize", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }

    const { skillId, capabilities } = parsed.data;
    const registeredSkills = await registry.list();
    const registeredSkillIds = new Set(registeredSkills.map((skill) => skill.id));
    const results = evaluateSkillPermissions(skillId, capabilities, registeredSkillIds);
    const registered = registeredSkillIds.has(skillId);
    const outcome = !registered || results.some((item) => item.decision === "deny")
      ? "denied"
      : results.some((item) => item.decision === "approval_required")
        ? "approval_required"
        : "allowed";

    await audit(request.id, "skill.authorize", outcome, {
      skillId,
      requestedCapabilities: results.map((item) => item.capability),
      decisions: results.map((item) => item.decision),
      risk: results.reduce<"low" | "medium" | "high" | "critical">((highest, item) => {
        const rank = { low: 0, medium: 1, high: 2, critical: 3 };
        return rank[item.risk] > rank[highest] ? item.risk : highest;
      }, "low")
    });

    return {
      skillId,
      registered,
      results,
      summary: {
        allowed: results.filter((item) => item.decision === "allow").length,
        approvalRequired: results.filter((item) => item.decision === "approval_required").length,
        denied: results.filter((item) => item.decision === "deny").length
      },
      execution: "disabled",
      toolAccess: "none"
    };
  });
}
