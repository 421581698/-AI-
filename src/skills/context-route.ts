import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SkillRegistry } from "./registry.js";
import { selectSkills } from "./selector.js";
import { buildSkillContext } from "./context.js";

type AuditSkillContext = (
  requestId: string,
  action: string,
  outcome: string,
  details: Record<string, unknown>
) => Promise<void>;

export function registerSkillContextRoute(
  app: FastifyInstance,
  registry: SkillRegistry,
  audit: AuditSkillContext
): void {
  app.post("/v1/skills/context", async (request, reply) => {
    const parsed = z.object({
      task: z.string().trim().min(3).max(4_000),
      limit: z.number().int().min(1).max(3).default(3)
    }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }

    const selection = selectSkills(parsed.data.task, await registry.list(), { limit: parsed.data.limit });
    const documents = new Map();
    for (const match of selection.matches) {
      const document = await registry.get(match.skill.id);
      if (document) documents.set(document.id, document);
    }
    const context = buildSkillContext(parsed.data.task, selection.matches, documents);
    await audit(request.id, "skill.context.build", "success", {
      selectedSkillIds: context.materials.map((material) => material.id),
      includedCount: context.summary.includedCount,
      totalChars: context.summary.totalChars,
      truncatedCount: context.summary.truncatedCount
    });
    return context;
  });
}
