import { afterAll, describe, expect, it } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import Fastify from "fastify";
import { Pool } from "pg";
import { AuthService } from "../auth/service.js";
import { TaskRuntime } from "./runtime.js";
import { registerTaskRoutes } from "./routes.js";

const enabled = Boolean(process.env.DATABASE_URL);
describe.skipIf(!enabled)("PostgreSQL task tenancy integration", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  afterAll(async () => { await pool.end(); });

  it("isolates task listing, detail, events, cancellation and API-key access across real users", async () => {
    const secret = randomBytes(32).toString("base64url");
    const auth = new AuthService(pool, secret);
    const runtime = new TaskRuntime(pool);
    const app = Fastify();
    app.decorateRequest("principal", null);
    app.addHook("onRequest", async (request, reply) => {
      if (request.url.startsWith("/v1/auth/register") || request.url.startsWith("/v1/auth/login")) return;
      const bearer = request.headers.authorization?.replace(/^Bearer /, "");
      request.principal = await auth.authenticate(bearer);
      if (!request.principal) return reply.code(401).send({ error: "unauthorized" });
    });
    await auth.register(app);
    registerTaskRoutes(app, runtime, async () => undefined);
    const createdUserIds: string[] = [];
    try {
      const suffix = randomUUID();
      const credentialsA = { email: "tenant-a-" + suffix + "@example.test", password: "integration-password-a" };
      const credentialsB = { email: "tenant-b-" + suffix + "@example.test", password: "integration-password-b" };
      const regA = await app.inject({ method: "POST", url: "/v1/auth/register", payload: credentialsA });
      const regB = await app.inject({ method: "POST", url: "/v1/auth/register", payload: credentialsB });
      expect(regA.statusCode).toBe(201);
      expect(regB.statusCode).toBe(201);
      const tokenA = regA.json().token as string;
      const tokenB = regB.json().token as string;
      createdUserIds.push(regA.json().user.id, regB.json().user.id);

      const payload = { type: "agent.plan.validate", payload: { plan: { executionEnabled: false, steps: [{ id: "step-1", title: "Validate", description: "Tenant isolation test", skillId: null, dependsOn: [], requiredCapabilities: [], risk: "low", status: "planned" }] } } };
      const created = await app.inject({ method: "POST", url: "/v1/tasks", headers: { authorization: "Bearer " + tokenA }, payload });
      expect(created.statusCode).toBe(202);
      const taskId = created.json().id as string;

      const listA = await app.inject({ method: "GET", url: "/v1/tasks", headers: { authorization: "Bearer " + tokenA } });
      const listB = await app.inject({ method: "GET", url: "/v1/tasks", headers: { authorization: "Bearer " + tokenB } });
      expect(listA.json().tasks.some((task: {id:string}) => task.id === taskId)).toBe(true);
      expect(listB.json().tasks.some((task: {id:string}) => task.id === taskId)).toBe(false);

      expect((await app.inject({ method: "GET", url: "/v1/tasks/" + taskId, headers: { authorization: "Bearer " + tokenB } })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/v1/tasks/" + taskId + "/events", headers: { authorization: "Bearer " + tokenB } })).statusCode).toBe(404);
      expect((await app.inject({ method: "POST", url: "/v1/tasks/" + taskId + "/cancel", headers: { authorization: "Bearer " + tokenB } })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/v1/tasks/" + taskId, headers: { authorization: "Bearer " + tokenA } })).statusCode).toBe(200);
      expect((await app.inject({ method: "POST", url: "/v1/tasks/" + taskId + "/cancel", headers: { authorization: "Bearer " + tokenA } })).json().status).toBe("cancelled");

      const keyResponse = await app.inject({ method: "POST", url: "/v1/auth/api-keys", headers: { authorization: "Bearer " + tokenA }, payload: { name: "integration key" } });
      expect(keyResponse.statusCode).toBe(201);
      const apiKey = keyResponse.json().key as string;
      const keyList = await app.inject({ method: "GET", url: "/v1/tasks", headers: { authorization: "Bearer " + apiKey } });
      expect(keyList.statusCode).toBe(200);
      expect(keyList.json().tasks.some((task: {id:string}) => task.id === taskId)).toBe(true);
      expect((await app.inject({ method: "DELETE", url: "/v1/auth/api-keys/" + keyResponse.json().id, headers: { authorization: "Bearer " + tokenA } })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/v1/tasks", headers: { authorization: "Bearer " + apiKey } })).statusCode).toBe(401);
    } finally {
      if (createdUserIds.length) await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]);
      await app.close();
    }
  });
});
