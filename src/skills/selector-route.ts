import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SkillRegistry } from "./registry.js";
import { selectSkills } from "./selector.js";

type AuditSkillSelection = (
  requestId: string,
  action: string,
  outcome: string,
  details: Record<string, unknown>
) => Promise<void>;

export function registerSkillSelectorRoute(
  app: FastifyInstance,
  registry: SkillRegistry,
  audit: AuditSkillSelection
): void {
  app.post("/v1/skills/select", async (request, reply) => {
    const parsed = z.object({
      task: z.string().trim().min(3).max(4_000),
      limit: z.number().int().min(1).max(10).default(5)
    }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }

    const availableSkills = await registry.list();
    const selection = selectSkills(parsed.data.task, availableSkills, { limit: parsed.data.limit });
    await audit(request.id, "skill.select", "success", {
      selectedSkillId: selection.selected?.skill.id ?? null,
      candidateCount: selection.matches.length
    });
    return {
      selected: selection.selected,
      matches: selection.matches,
      threshold: selection.threshold,
      mode: "explainable-lexical"
    };
  });
}
