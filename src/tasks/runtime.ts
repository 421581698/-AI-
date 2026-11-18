import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { validatePlanSteps, type PlannedStep } from "../agents/planner.js";

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type TaskInput = { type: string; payload: Record<string, unknown> };
export type TaskRecord = {
  id: string; status: TaskStatus; input: TaskInput; result?: unknown; error?: string;
  attempts: number; max_attempts: number; created_at: string; updated_at?: string;
};
export type TaskEvent = {
  id: string | number; task_id: string; event_type: string; from_status: string | null;
  to_status: string; payload: Record<string, unknown>; created_at: string;
};
type MemoryTask = TaskRecord & { ownerId: string | null; availableAt: number; lockedBy: string | null; lockedUntil: number | null };
const LEASE_MS = 30_000;
const MAX_ERROR_LENGTH = 500;

export class TaskRuntime {
  private readonly memory = new Map<string, MemoryTask>();
  private readonly events = new Map<string, TaskEvent[]>();
  private readonly workerId = `worker-${randomUUID()}`;
  private stopped = false;
  private loopPromise: Promise<void> | null = null;

  constructor(private readonly pool: Pool | null, private readonly pollMs = 1_000) {}

  private async event(taskId: string, eventType: string, from: string | null, to: string, payload: Record<string, unknown> = {}) {
    if (this.pool) {
      await this.pool.query(
        "INSERT INTO task_events(task_id,event_type,from_status,to_status,payload) VALUES($1,$2,$3,$4,$5)",
        [taskId, eventType, from, to, JSON.stringify(payload)]
      );
      return;
    }
    const list = this.events.get(taskId) ?? [];
    list.push({ id: randomUUID(), task_id: taskId, event_type: eventType, from_status: from, to_status: to, payload, created_at: new Date().toISOString() });
    this.events.set(taskId, list);
  }

  async enqueue(input: TaskInput, ownerId: string | null = null): Promise<TaskRecord> {
    const id = randomUUID();
    if (this.pool) {
      const result = await this.pool.query(
        "INSERT INTO tasks(id,owner_id,status,input,max_attempts) VALUES($1,$2,'queued',$3,3) RETURNING id,status,input,attempts,max_attempts,created_at,updated_at",
        [id, ownerId, JSON.stringify(input)]
      );
      const row = result.rows[0];
      await this.event(id, "task.queued", null, "queued", { type: input.type });
      return this.mapRow(row);
    }
    const now = new Date().toISOString();
    const task: MemoryTask = { id, ownerId, status: "queued", input, attempts: 0, max_attempts: 3, created_at: now, updated_at: now, availableAt: Date.now(), lockedBy: null, lockedUntil: null };
    this.memory.set(id, task);
    await this.event(id, "task.queued", null, "queued", { type: input.type });
    return this.publicTask(task);
  }

  private mapRow(row: any): TaskRecord {
    return { id: row.id, status: row.status, input: row.input, result: row.result ?? undefined, error: row.error ?? undefined, attempts: row.attempts ?? 0, max_attempts: row.max_attempts ?? 3, created_at: new Date(row.created_at).toISOString(), updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined };
  }
  private publicTask(task: MemoryTask): TaskRecord {
    const { availableAt: _a, lockedBy: _b, lockedUntil: _c, ...record } = task;
    return record;
  }

  async get(id: string, ownerId: string | null = null): Promise<TaskRecord | null> {
    if (this.pool) {
      const r = await this.pool.query("SELECT id,status,input,result,error,attempts,max_attempts,created_at,updated_at FROM tasks WHERE id=$1 AND owner_id IS NOT DISTINCT FROM $2", [id, ownerId]);
      return r.rowCount ? this.mapRow(r.rows[0]) : null;
    }
    const task = this.memory.get(id);
    return task && task.ownerId === ownerId ? this.publicTask(task) : null;
  }

  async getEvents(id: string, ownerId: string | null = null): Promise<TaskEvent[] | null> {
    if (!(await this.get(id, ownerId))) return null;
    if (this.pool) {
      const r = await this.pool.query("SELECT id,task_id,event_type,from_status,to_status,payload,created_at FROM task_events WHERE task_id=$1 ORDER BY id", [id]);
      return r.rows;
    }
    return this.events.get(id) ?? [];
  }

  async cancel(id: string, ownerId: string | null = null): Promise<TaskRecord | null> {
    if (this.pool) {
      const r = await this.pool.query(
        "UPDATE tasks SET status='cancelled',locked_by=NULL,locked_until=NULL,updated_at=now() WHERE id=$1 AND owner_id IS NOT DISTINCT FROM $2 AND status='queued' RETURNING id,status,input,attempts,max_attempts,created_at,updated_at",
        [id]
      );
      if (r.rowCount) {
        await this.event(id, "task.cancelled", "queued", "cancelled");
        return this.mapRow(r.rows[0]);
      }
      return this.get(id, ownerId);
    }
    const task = this.memory.get(id);
    if (!task) return null;
    if (task.status === "queued") {
      task.status = "cancelled"; task.updated_at = new Date().toISOString();
      await this.event(id, "task.cancelled", "queued", "cancelled");
    }
    return this.publicTask(task);
  }

  private async claim(): Promise<TaskRecord | null> {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const r = await client.query(
          "SELECT id,status,input,attempts,max_attempts,created_at,updated_at FROM tasks WHERE status='queued' AND available_at<=now() AND (locked_until IS NULL OR locked_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1"
        );
        if (!r.rowCount) { await client.query("COMMIT"); return null; }
        const row = r.rows[0];
        const updated = await client.query(
          "UPDATE tasks SET status='running',attempts=attempts+1,locked_by=$2,locked_until=now()+($3 * interval '1 millisecond'),updated_at=now() WHERE id=$1 RETURNING id,status,input,attempts,max_attempts,created_at,updated_at",
          [row.id, this.workerId, LEASE_MS]
        );
        await client.query("INSERT INTO task_events(task_id,event_type,from_status,to_status,payload) VALUES($1,'task.started','queued','running',$2)", [row.id, JSON.stringify({ attempt: updated.rows[0].attempts })]);
        await client.query("COMMIT");
        return this.mapRow(updated.rows[0]);
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    }
    const task = [...this.memory.values()].filter((t) => t.status === "queued" && t.availableAt <= Date.now()).sort((a,b) => a.created_at.localeCompare(b.created_at))[0];
    if (!task) return null;
    task.status = "running"; task.attempts += 1; task.lockedBy = this.workerId; task.lockedUntil = Date.now() + LEASE_MS; task.updated_at = new Date().toISOString();
    await this.event(task.id, "task.started", "queued", "running", { attempt: task.attempts });
    return this.publicTask(task);
  }

  private async execute(task: TaskRecord): Promise<unknown> {
    if (task.input.type !== "agent.plan.validate") throw new Error("unsupported_task_type");
    const planSchema = z.object({
      planner: z.string().max(100).optional(),
      executionEnabled: z.literal(false),
      steps: z.array(z.object({
        id: z.string().min(1).max(100),
        title: z.string().min(1).max(200),
        description: z.string().max(2_000),
        skillId: z.string().max(80).nullable(),
        dependsOn: z.array(z.string().max(100)).max(12),
        requiredCapabilities: z.array(z.string().max(100)).max(12),
        risk: z.enum(["low", "medium", "high", "critical"]),
        status: z.literal("planned")
      }).strict()).min(1).max(12)
    }).strict();
    const parsed = planSchema.safeParse(task.input.payload.plan);
    if (!parsed.success) throw new Error("invalid_or_unsafe_plan_payload");
    const validation = validatePlanSteps(parsed.data.steps as PlannedStep[]);
    if (!validation.valid) throw new Error("invalid_plan_dag:" + validation.errors.join(","));
    return { accepted: true, executionMode: "validated-plan-only", stepCount: parsed.data.steps.length, order: validation.order, planner: parsed.data.planner ?? "unknown", sideEffects: false };
  }

  private async settle(task: TaskRecord, result: unknown, error?: string) {
    const failed = Boolean(error);
    const retry = failed && task.attempts < task.max_attempts;
    const next: TaskStatus = failed ? (retry ? "queued" : "failed") : "completed";
    const safeError = error?.slice(0, MAX_ERROR_LENGTH);
    if (this.pool) {
      const r = await this.pool.query(
        "UPDATE tasks SET status=$2,result=$3,error=$4,available_at=CASE WHEN $2='queued' THEN now()+($5 * interval '1 second') ELSE available_at END,locked_by=NULL,locked_until=NULL,updated_at=now() WHERE id=$1 AND status='running' AND locked_by=$6 RETURNING id",
        [task.id, next, result == null ? null : JSON.stringify(result), safeError ?? null, Math.min(30, 2 ** task.attempts), this.workerId]
      );
      if (r.rowCount) await this.event(task.id, retry ? "task.retry_scheduled" : failed ? "task.failed" : "task.completed", "running", next, { attempt: task.attempts, error: safeError });
    } else {
      const current = this.memory.get(task.id);
      if (!current || current.status !== "running" || current.lockedBy !== this.workerId) return;
      current.status = next; current.result = result; current.error = safeError; current.lockedBy = null; current.lockedUntil = null; current.updated_at = new Date().toISOString();
      if (retry) current.availableAt = Date.now() + Math.min(30, 2 ** task.attempts) * 1000;
      await this.event(task.id, retry ? "task.retry_scheduled" : failed ? "task.failed" : "task.completed", "running", next, { attempt: task.attempts, error: safeError });
    }
  }

  async recoverExpired(): Promise<number> {
    if (this.pool) {
      const r = await this.pool.query(
        "UPDATE tasks SET status=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,locked_by=NULL,locked_until=NULL,available_at=now(),error=CASE WHEN attempts>=max_attempts THEN 'worker_lease_expired' ELSE error END,updated_at=now() WHERE status='running' AND locked_until<now() RETURNING id,status"
      );
      for (const row of r.rows) await this.event(row.id, "task.lease_recovered", "running", row.status);
      return r.rowCount ?? 0;
    }
    let count = 0;
    for (const task of this.memory.values()) {
      if (task.status !== "running" || !task.lockedUntil || task.lockedUntil >= Date.now()) continue;
      const next = task.attempts >= task.max_attempts ? "failed" : "queued";
      task.status = next; task.lockedBy = null; task.lockedUntil = null; task.availableAt = Date.now(); task.updated_at = new Date().toISOString();
      if (next === "failed") task.error = "worker_lease_expired";
      await this.event(task.id, "task.lease_recovered", "running", next); count++;
    }
    return count;
  }

  async runOnce(): Promise<boolean> {
    const task = await this.claim();
    if (!task) return false;
    try { await this.settle(task, await this.execute(task)); }
    catch (error) { await this.settle(task, null, error instanceof Error ? error.message : "task_execution_failed"); }
    return true;
  }

  start(): void {
    if (this.loopPromise) return;
    this.stopped = false;
    this.loopPromise = (async () => {
      while (!this.stopped) {
        try { await this.recoverExpired(); const worked = await this.runOnce(); if (!worked) await new Promise((resolve) => setTimeout(resolve, this.pollMs)); }
        catch { await new Promise((resolve) => setTimeout(resolve, this.pollMs)); }
      }
    })();
  }
  async stop(): Promise<void> { this.stopped = true; await this.loopPromise; this.loopPromise = null; }
}
