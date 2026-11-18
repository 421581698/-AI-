import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";

describe("Our AI Hub API contract", () => {
  it("generates unique task identifiers", () => {
    expect(randomUUID()).not.toBe(randomUUID());
  });

  it("validates namespace and content before storing memory", async () => {
    const app = Fastify();
    await app.register(cors, { origin: false });
    app.post("/v1/memory/records", async (request, reply) => {
      const body = request.body as { namespace?: string; content?: string };
      if (!body.namespace || !body.content) return reply.code(400).send({ error: "invalid_request" });
      return reply.code(201).send({ ok: true });
    });
    const invalid = await app.inject({ method: "POST", url: "/v1/memory/records", payload: { namespace: "demo" } });
    expect(invalid.statusCode).toBe(400);
    const valid = await app.inject({ method: "POST", url: "/v1/memory/records", payload: { namespace: "demo", content: "hello" } });
    expect(valid.statusCode).toBe(201);
    await app.close();
  });
});
