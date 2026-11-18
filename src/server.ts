import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod";
import { config } from "./config.js";
import { SkillRegistry } from "./skills/registry.js";
import { registerSkillSelectorRoute } from "./skills/selector-route.js";
import { registerSkillContextRoute } from "./skills/context-route.js";
import { registerSkillPermissionRoute } from "./skills/permission-route.js";
import { SkillRuntime } from "./skills/runtime.js";
import { registerSkillRuntimeRoute } from "./skills/runtime-route.js";
import { SkillEvaluator } from "./skills/evaluation.js";
import { registerSkillEvaluationRoute } from "./skills/evaluation-route.js";
import { registerAgentPlannerRoute } from "./agents/planner-route.js";
import { registerCollaborationRoute } from "./agents/collaboration-route.js";
import { registerCollaborationEvaluationRoute } from "./agents/collaboration-evaluation-route.js";
import { TaskRuntime } from "./tasks/runtime.js";
import { registerTaskRoutes } from "./tasks/routes.js";
import { registerMcpRoute } from "./mcp/route.js";
import { AuthService } from "./auth/service.js";
import { consoleHtml } from "./console/page.js";

const app = Fastify({ logger: true, genReqId: () => randomUUID(), bodyLimit: 1_048_576 });
await app.register(cors, { origin: false });
const pool = config.DATABASE_URL ? new Pool({ connectionString: config.DATABASE_URL, max: 10 }) : null;
const skillRegistry = new SkillRegistry([
  new URL("../skills", import.meta.url).pathname,
  new URL("../.agents/skills", import.meta.url).pathname
]);

app.decorateRequest("principal", null);
const authService = pool ? new AuthService(pool, config.AUTH_TOKEN_SECRET ?? "development-only-secret-change-me-please", config.API_KEY) : null;
app.addHook("onClose", async () => { await pool?.end(); });
app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health" || request.url.startsWith("/v1/auth/register") || request.url.startsWith("/v1/auth/login")) return;
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (authService) {
    request.principal = await authService.authenticate(token);
    if (!request.principal) return reply.code(401).send({ error: "unauthorized" });
  } else if (config.API_KEY && token === config.API_KEY) {
    request.principal = { userId: "00000000-0000-4000-8000-000000000001", email: "bootstrap@local", role: "admin", authType: "bootstrap" };
  } else if (config.NODE_ENV === "production" || config.API_KEY) {
    return reply.code(401).send({ error: "unauthorized" });
  } else {
    request.principal = { userId: "00000000-0000-4000-8000-000000000002", email: "local-dev@local", role: "admin", authType: "bootstrap" };
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

registerSkillSelectorRoute(app, skillRegistry, audit);
registerSkillContextRoute(app, skillRegistry, audit);
registerSkillPermissionRoute(app, skillRegistry, audit);
const skillRuntime = new SkillRuntime(skillRegistry);
registerSkillRuntimeRoute(app, skillRuntime, audit);
const skillEvaluator = new SkillEvaluator(skillRuntime);
registerSkillEvaluationRoute(app, skillEvaluator, audit);
registerAgentPlannerRoute(app, skillRegistry, audit);
registerCollaborationRoute(app, skillRegistry, audit);
registerCollaborationEvaluationRoute(app, skillRegistry, audit);
registerMcpRoute(app, skillRegistry, audit);
app.get("/console", async (_request, reply) => reply.type("text/html; charset=utf-8").header("Cache-Control", "no-store").send(consoleHtml));
app.get("/v1/agents/catalog", async () => ({ agents: [ { id:"coordinator", role:"coordinator", executionEnabled:false }, { id:"specialist", role:"specialist", executionEnabled:false }, { id:"reviewer", role:"reviewer", executionEnabled:false } ] }));
app.get("/v1/tools", async () => ({ tools: [ "list_skills", "get_skill", "plan_agent_task", "plan_collaboration", "evaluate_collaboration" ].map((name) => ({ name, enabled:true, executionMode:"read-only-or-planning" })) }));
if (authService) await authService.register(app);

app.get("/v1/skills", async () => {
  const skills = await skillRegistry.list();
  return { skills, count: skills.length };
});

app.get<{ Params: { id: string } }>("/v1/skills/:id", async (request, reply) => {
  const skill = await skillRegistry.get(request.params.id);
  if (!skill) return reply.code(404).send({ error: "skill_not_found" });
  await audit(request.id, "skill.read", "success", { skillId: skill.id, version: skill.version });
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    sha256: skill.sha256,
    content: skill.content
  };
});

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
const memoryStore = new Map<string, z.infer<typeof memoryInput> & { id: string; createdAt: string; ownerId: string | null }>();

app.post("/v1/memory/records", async (request, reply) => {
  const parsed = memoryInput.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const ownerId = request.principal?.authType === "bootstrap" ? null : request.principal?.userId ?? null;
  if (pool) {
    await pool.query(
      `INSERT INTO memory_records(id, owner_id, namespace, content, source, confidence, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, ownerId, parsed.data.namespace, parsed.data.content, parsed.data.source, parsed.data.confidence, JSON.stringify(parsed.data.metadata)]
    );
  } else {
    memoryStore.set(id, { ...parsed.data, id, createdAt, ownerId });
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
    const ownerId = request.principal?.authType === "bootstrap" ? null : request.principal?.userId ?? null;
    const result = await pool.query(
      `SELECT id, namespace, content, source, confidence, metadata, created_at,
              greatest(
                ts_rank(search_vector, plainto_tsquery('simple', $3)),
                CASE WHEN content ILIKE $4 THEN 0.05 ELSE 0 END
              ) AS score
       FROM memory_records
       WHERE owner_id IS NOT DISTINCT FROM $1
         AND namespace = $2
         AND (expires_at IS NULL OR expires_at > now())
         AND (search_vector @@ plainto_tsquery('simple', $3) OR content ILIKE $4)
       ORDER BY score DESC, confidence DESC, created_at DESC
       LIMIT $5`,
      [ownerId, parsed.data.namespace, parsed.data.query, `%${parsed.data.query}%`, parsed.data.limit]
    );
    await audit(request.id, "memory.search", "success", { namespace: parsed.data.namespace, count: result.rowCount ?? 0 });
    return { results: result.rows, mode: "postgres-lexical" };
  }

  const ownerId = request.principal?.authType === "bootstrap" ? null : request.principal?.userId ?? null;
  const terms = parsed.data.query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = [...memoryStore.values()]
    .filter((item) => item.ownerId === ownerId && item.namespace === parsed.data.namespace)
    .map((item) => ({ item, score: terms.reduce((n, term) => n + (item.content.toLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.createdAt.localeCompare(a.item.createdAt))
    .slice(0, parsed.data.limit)
    .map(({ item, score }) => ({ ...item, score }));
  return { results, mode: "development-memory-adapter" };
});

const taskRuntime = new TaskRuntime(pool);
registerTaskRoutes(app, taskRuntime, audit);
taskRuntime.start();
app.addHook("onClose", async () => { await taskRuntime.stop(); });

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
