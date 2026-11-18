import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TaskRuntime } from "./runtime.js";

const inputSchema = z.object({
  type: z.literal("agent.plan.validate"),
  payload: z.object({ plan: z.object({
    planner: z.string().max(100).optional(),
    executionEnabled: z.literal(false),
    steps: z.array(z.unknown()).min(1).max(12)
  }).passthrough() }).strict()
}).strict();

export function registerTaskRoutes(app: FastifyInstance, runtime: TaskRuntime, audit: (requestId: string, action: string, outcome: string, details: Record<string, unknown>) => Promise<void>): void {
  app.post("/v1/tasks", async (request, reply) => {
    const parsed = inputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    const ownerId = request.principal?.authType === "bootstrap" ? null : request.principal?.userId ?? null;\n    const task = await runtime.enqueue(parsed.data, ownerId);
    await audit(request.id, "task.create", "success", { id: task.id, type: parsed.data.type });
    return reply.code(202).send(task);
  });
  app.get<{ Params: { id: string } }>("/v1/tasks/:id", async (request, reply) => {
    const task = await runtime.get(request.params.id, request.principal?.authType === "bootstrap" ? null : request.principal?.userId ?? null);
    if (!task) return reply.code(404).send({ error: "task_not_found" });
    return task;
  });
  app.post<{ Params: { id: string } }>("/v1/tasks/:id/cancel", async (request, reply) => {
    const task = await runtime.cancel(request.params.id, request.principal?.authType === "bootstrap" ? null : request.principal?.userId ?? null);
    if (!task) return reply.code(404).send({ error: "task_not_found" });
    await audit(request.id, "task.cancel", task.status === "cancelled" ? "success" : "unchanged", { id: task.id, status: task.status });
    return task;
  });
  app.get<{ Params: { id: string } }>("/v1/tasks/:id/events", async (request, reply) => {
    const events = await runtime.getEvents(request.params.id, request.principal?.authType === "bootstrap" ? null : request.principal?.userId ?? null);
    if (!events) return reply.code(404).send({ error: "task_not_found" });
    return { events };
  });
}
