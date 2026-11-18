import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";

const app = Fastify({ logger: true, genReqId: () => randomUUID(), bodyLimit: 1_048_576 });
await app.register(cors, { origin: false });

app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health") return;
  if (config.API_KEY && request.headers.authorization !== `Bearer ${config.API_KEY}`) {
    await reply.code(401).send({ error: "unauthorized" });
  }
});

app.get("/health", async () => ({
  ok: true,
  service: "our-ai-hub",
  version: "0.1.0",
  timestamp: new Date().toISOString()
}));

const memoryInput = z.object({
  namespace: z.string().min(1).max(120),
  content: z.string().min(1).max(20_000),
  source: z.string().min(1).max(300),
  confidence: z.number().min(0).max(1).default(0.5),
  metadata: z.record(z.string(), z.unknown()).default({})
});

const memoryStore = new Map<string, z.infer<typeof memoryInput> & { id: string; createdAt: string }>();

app.post("/v1/memory/records", async (request, reply) => {
  const parsed = memoryInput.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
  const record = { ...parsed.data, id: randomUUID(), createdAt: new Date().toISOString() };
  memoryStore.set(record.id, record);
  return reply.code(201).send(record);
});

app.post("/v1/memory/search", async (request, reply) => {
  const parsed = z.object({
    namespace: z.string().min(1).max(120),
    query: z.string().min(1).max(500),
    limit: z.number().int().min(1).max(50).default(10)
  }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
  const terms = parsed.data.query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = [...memoryStore.values()]
    .filter((item) => item.namespace === parsed.data.namespace)
    .map((item) => ({ item, score: terms.reduce((n, term) => n + (item.content.toLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.createdAt.localeCompare(a.item.createdAt))
    .slice(0, parsed.data.limit)
    .map(({ item, score }) => ({ ...item, score }));
  return { results, mode: "development-memory-adapter" };
});

const taskInput = z.object({ type: z.string().min(1).max(120), payload: z.record(z.string(), z.unknown()) });
type Task = { id: string; status: "queued" | "cancelled"; input: z.infer<typeof taskInput>; createdAt: string };
const tasks = new Map<string, Task>();

app.post("/v1/tasks", async (request, reply) => {
  const parsed = taskInput.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
  const task: Task = { id: randomUUID(), status: "queued", input: parsed.data, createdAt: new Date().toISOString() };
  tasks.set(task.id, task);
  return reply.code(202).send(task);
});

app.get<{ Params: { id: string } }>("/v1/tasks/:id", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) return reply.code(404).send({ error: "task_not_found" });
  return task;
});

app.post<{ Params: { id: string } }>("/v1/tasks/:id/cancel", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) return reply.code(404).send({ error: "task_not_found" });
  if (task.status === "queued") task.status = "cancelled";
  return task;
});

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "request failed");
  void reply.code(500).send({ error: "internal_error", requestId: request.id });
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
