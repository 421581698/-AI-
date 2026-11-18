import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod";
import { config } from "./config.js";

const app = Fastify({ logger: true, genReqId: () => randomUUID(), bodyLimit: 1_048_576 });
await app.register(cors, { origin: false });
const pool = config.DATABASE_URL ? new Pool({ connectionString: config.DATABASE_URL, max: 10 }) : null;

app.addHook("onClose", async () => { await pool?.end(); });
app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health") return;
  if (config.API_KEY && request.headers.authorization !== `Bearer ${config.API_KEY}`) {
    await reply.code(401).send({ error: "unauthorized" });
  }
});

async function audit(requestId: string, action: string, outcome: string, details: Record<string, unknown> = {}) {
  if (!pool) return;
  try {
    await pool.query(
      "INSERT INTO audit_events(request_id, action, outcome, details) VALUES ($1, $2, $3, $4)",
      [requestId, action, outcome, JSON.stringify(details)]
    );
  } catch (error) {
    app.log.error({ err: error, requestId, action }, "audit write failed");
  }
}

app.get("/health", async () => {
  let database: "connected" | "unconfigured" | "unavailable" = "unconfigured";
  if (pool) {
    try { await pool.query("SELECT 1"); database = "connected"; }
    catch { database = "unavailable"; }
  }
  return {
    ok: database !== "unavailable",
    service: "our-ai-hub",
    version: "0.1.0",
    database,
    timestamp: new Date().toISOString()
  };
});

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
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  if (pool) {
    await pool.query(
      `INSERT INTO memory_records(id, namespace, content, source, confidence, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, parsed.data.namespace, parsed.data.content, parsed.data.source, parsed.data.confidence, JSON.stringify(parsed.data.metadata)]
    );
  } else {
    memoryStore.set(id, { ...parsed.data, id, createdAt });
  }
  await audit(request.id, "memory.create", "success", { id, namespace: parsed.data.namespace });
  return reply.code(201).send({ ...parsed.data, id, createdAt });
});

app.post("/v1/memory/search", async (request, reply) => {
  const parsed = z.object({
    namespace: z.string().min(1).max(120),
    query: z.string().min(1).max(500),
    limit: z.number().int().min(1).max(50).default(10)
  }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });

  if (pool) {
    const result = await pool.query(
      `SELECT id, namespace, content, source, confidence, metadata, created_at
       FROM memory_records
       WHERE namespace = $1 AND expires_at IS NULL OR (namespace = $1 AND expires_at > now())
         AND content ILIKE $2
       ORDER BY confidence DESC, created_at DESC LIMIT $3`,
      [parsed.data.namespace, `%${parsed.data.query}%`, parsed.data.limit]
    );
    await audit(request.id, "memory.search", "success", { namespace: parsed.data.namespace, count: result.rowCount ?? 0 });
    return { results: result.rows, mode: "postgres-lexical" };
  }

  const terms = parsed.data.query.toLowerCase().split(/\\s+/).filter(Boolean);
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
type Task = { id: string; status: string; input: z.infer<typeof taskInput>; createdAt: string };
const tasks = new Map<string, Task>();

app.post("/v1/tasks", async (request, reply) => {
  const parsed = taskInput.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  let task: Task = { id, status: "queued", input: parsed.data, createdAt };
  if (pool) {
    const result = await pool.query(
      "INSERT INTO tasks(id, status, input) VALUES ($1, 'queued', $2) RETURNING id, status, input, created_at",
      [id, JSON.stringify(parsed.data)]
    );
    const row = result.rows[0] as { id: string; status: string; input: z.infer<typeof taskInput>; created_at: Date };
    task = { id: row.id, status: row.status, input: row.input, createdAt: row.created_at.toISOString() };
  } else {
    tasks.set(id, task);
  }
  await audit(request.id, "task.create", "success", { id, type: parsed.data.type });
  return reply.code(202).send(task);
});

app.get<{ Params: { id: string } }>("/v1/tasks/:id", async (request, reply) => {
  if (pool) {
    const result = await pool.query(
      "SELECT id, status, input, result, error, created_at FROM tasks WHERE id = $1",
      [request.params.id]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "task_not_found" });
    return result.rows[0];
  }
  const task = tasks.get(request.params.id);
  if (!task) return reply.code(404).send({ error: "task_not_found" });
  return task;
});

app.post<{ Params: { id: string } }>("/v1/tasks/:id/cancel", async (request, reply) => {
  if (pool) {
    const result = await pool.query(
      `UPDATE tasks SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND status = 'queued'
       RETURNING id, status, input, created_at`,
      [request.params.id]
    );
    if (result.rowCount) return result.rows[0];
    const existing = await pool.query("SELECT id, status, input, created_at FROM tasks WHERE id = $1", [request.params.id]);
    if (!existing.rowCount) return reply.code(404).send({ error: "task_not_found" });
    return existing.rows[0];
  }
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
