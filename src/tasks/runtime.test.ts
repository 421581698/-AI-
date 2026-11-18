import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { TaskRuntime } from "./runtime.js";
import { registerTaskRoutes } from "./routes.js";

describe("TaskRuntime", () => {
  it("runs the allowlisted plan-validation task and records lifecycle events", async () => {
    const runtime = new TaskRuntime(null, 5);
    const task = await runtime.enqueue({ type: "agent.plan.validate", payload: { plan: { planner: "deterministic-skill-planner", executionEnabled: false, steps: [{ id: "review" }] } } });
    expect(task.status).toBe("queued");
    expect(await runtime.runOnce()).toBe(true);
    const completed = await runtime.get(task.id);
    expect(completed?.status).toBe("completed");
    expect(completed?.result).toMatchObject({ accepted: true, executionMode: "validated-plan-only", sideEffects: false });
    const events = await runtime.getEvents(task.id);
    expect(events?.map((event) => event.event_type)).toEqual(["task.queued", "task.started", "task.completed"]);
  });

  it("rejects unsupported task types at the API boundary", async () => {
    const runtime = new TaskRuntime(null);
    const app = Fastify();
    registerTaskRoutes(app, runtime, async () => undefined);
    const response = await app.inject({ method: "POST", url: "/v1/tasks", payload: { type: "shell.execute", payload: { command: "whoami" } } });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("supports cancellation before a worker claims the task", async () => {
    const runtime = new TaskRuntime(null);
    const task = await runtime.enqueue({ type: "agent.plan.validate", payload: { plan: { executionEnabled: false, steps: [{ id: "a" }] } } });
    expect((await runtime.cancel(task.id))?.status).toBe("cancelled");
    expect(await runtime.runOnce()).toBe(false);
  });

  it("returns false when the queue is empty", async () => {
    expect(await new TaskRuntime(null).runOnce()).toBe(false);
  });
});
