import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SkillRuntime } from "./runtime.js";

type AuditSkillRun = (
  requestId: string,
  action: string,
  outcome: string,
  details: Record<string, unknown>
) => Promise<void>;

const requestSchema = z.object({
  skillId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)
}).strict();

export function registerSkillRuntimeRoute(
  app: FastifyInstance,
  runtime: SkillRuntime,
  audit: AuditSkillRun
): void {
  app.post("/v1/skills/run", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }

    const result = await runtime.run(parsed.data.skillId);
    if (!result) {
      await audit(request.id, "skill.run", "denied", { skillId: parsed.data.skillId });
      return reply.code(403).send({ error: "skill_not_authorized_or_unavailable" });
    }

    await audit(request.id, "skill.run", "success", {
      runId: result.runId,
      skillId: result.skillId,
      executor: result.executor,
      outputChars: result.output.content.length,
      outputSha256: result.output.sha256
    });
    return result;
  });
}
