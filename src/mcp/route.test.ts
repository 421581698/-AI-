import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { SkillRegistry } from "../skills/registry.js";
import { registerMcpRoute } from "./route.js";

describe("MCP Streamable HTTP endpoint", () => {
  function app() {
    const server = Fastify();
    registerMcpRoute(server, new SkillRegistry([]), async () => undefined);
    return server;
  }

  it("initializes with tool capability and protocol metadata", async () => {
    const server = app();
    const response = await server.inject({ method: "POST", url: "/mcp", payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test-client", version: "1" } } } });
    expect(response.statusCode).toBe(200);
    expect(response.json().result).toMatchObject({ protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "our-ai-hub" } });
    await server.close();
  });

  it("lists only bounded read-only planning tools", async () => {
    const server = app();
    const response = await server.inject({ method: "POST", url: "/mcp", payload: { jsonrpc: "2.0", id: 2, method: "tools/list" } });
    expect(response.json().result.tools.map((tool: { name: string }) => tool.name)).toEqual(["list_skills", "get_skill", "plan_agent_task", "plan_collaboration", "evaluate_collaboration"]);
    expect(response.json().result.tools.every((tool: { inputSchema: { additionalProperties: boolean } }) => tool.inputSchema.additionalProperties === false)).toBe(true);
    await server.close();
  });

  it("executes a planning tool without enabling side effects", async () => {
    const server = app();
    const response = await server.inject({ method: "POST", url: "/mcp", payload: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "plan_collaboration", arguments: { task: "Prepare a research summary" } } } });
    const call = response.json().result;
    expect(call.isError).toBe(false);
    expect(call.structuredContent.executionEnabled).toBe(false);
    expect(call.structuredContent.modelUsed).toBe(false);
    await server.close();
  });

  it("rejects malformed JSON-RPC and unknown methods", async () => {
    const server = app();
    const malformed = await server.inject({ method: "POST", url: "/mcp", payload: { method: "initialize" } });
    expect(malformed.statusCode).toBe(400);
    const unknown = await server.inject({ method: "POST", url: "/mcp", payload: { jsonrpc: "2.0", id: "x", method: "unknown/method" } });
    expect(unknown.json().error.code).toBe(-32601);
    await server.close();
  });

  it("rejects caller attempts to add approval or execution arguments", async () => {
    const server = app();
    const response = await server.inject({ method: "POST", url: "/mcp", payload: { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "plan_agent_task", arguments: { task: "Prepare a plan", approved: true, executionEnabled: true } } } });
    expect(response.json().result.isError).toBe(true);
    await server.close();
  });
});
