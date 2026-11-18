import { describe, expect, it } from "vitest";
import { buildCollaborationPlan } from "./collaboration.js";
import { evaluateCollaborationPlan } from "./collaboration-evaluation.js";
import type { SkillSummary } from "../skills/registry.js";

const skills: SkillSummary[] = [{
  id: "modern-web-guidance",
  name: "modern-web-guidance",
  description: "Modern browser development, HTML CSS JavaScript accessibility and web performance.",
  version: "v1",
  source: "repository"
}];

describe("Collaboration Evaluation", () => {
  it("passes all deterministic collaboration contract checks", () => {
    const plan = buildCollaborationPlan("Build a modern accessible website", skills);
    const report = evaluateCollaborationPlan(plan);
    expect(report.status).toBe("passed");
    expect(report.score).toBe(100);
    expect(report.checks).toHaveLength(10);
    expect(report.runtimeExecutionEvaluated).toBe(false);
    expect(report.metrics.assignedStepCount).toBe(report.metrics.plannedStepCount);
    expect(report.metrics.handoffCount).toBeGreaterThan(0);
  });

  it("detects duplicated step assignment and inconsistent summary", () => {
    const plan = buildCollaborationPlan("Build a modern accessible website", skills);
    const duplicated = structuredClone(plan);
    duplicated.assignments[1].stepIds.push(duplicated.assignments[0].stepIds[0]);
    duplicated.summary.stepCount += 1;
    const report = evaluateCollaborationPlan(duplicated);
    expect(report.status).toBe("failed");
    expect(report.checks.find((check) => check.id === "step-coverage")?.passed).toBe(false);
    expect(report.checks.find((check) => check.id === "summary-consistency")?.passed).toBe(false);
  });

  it("detects cyclic assignment handoffs", () => {
    const plan = buildCollaborationPlan("Build a modern accessible website", skills);
    const cyclic = structuredClone(plan);
    cyclic.assignments.find((item) => item.role === "coordinator")!.dependsOnAssignments = ["assignment-reviewer"];
    const report = evaluateCollaborationPlan(cyclic);
    expect(report.checks.find((check) => check.id === "handoff-dag")?.passed).toBe(false);
  });

  it("rejects any plan that enables execution", () => {
    const plan = buildCollaborationPlan("Write a poem about rain", skills);
    const unsafe = { ...plan, executionEnabled: true as unknown as false };
    const report = evaluateCollaborationPlan(unsafe);
    expect(report.checks.find((check) => check.id === "execution-disabled")?.passed).toBe(false);
  });
});
