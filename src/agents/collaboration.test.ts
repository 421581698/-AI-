import { describe, expect, it } from "vitest";
import { buildCollaborationPlan } from "./collaboration.js";
import type { SkillSummary } from "../skills/registry.js";

const skills: SkillSummary[] = [{
  id: "modern-web-guidance",
  name: "modern-web-guidance",
  description: "Modern browser development, HTML CSS JavaScript accessibility and web performance.",
  version: "v1",
  source: "repository"
}];

describe("Multi-Agent Collaboration Planner", () => {
  it("creates coordinator, specialist and reviewer assignments with explicit handoffs", () => {
    const plan = buildCollaborationPlan("Build a modern accessible website", skills);
    expect(plan.executionEnabled).toBe(false);
    expect(plan.modelUsed).toBe(false);
    expect(plan.coordinatorAgentId).toBe("coordinator");
    expect(plan.assignments.map((item) => item.role)).toEqual(["coordinator", "specialist", "reviewer"]);
    expect(plan.assignments.find((item) => item.role === "specialist")?.dependsOnAssignments).toContain("assignment-coordinator");
    expect(plan.assignments.find((item) => item.role === "reviewer")?.dependsOnAssignments).toContain("assignment-specialist");
    expect(plan.assignments.every((item) => item.outputContract.requiredFields.includes("evidence"))).toBe(true);
  });

  it("produces a minimal safe collaboration plan when no specialist skill matches", () => {
    const plan = buildCollaborationPlan("Write a short poem about rain", skills);
    expect(plan.assignments.map((item) => item.role)).toEqual(["coordinator", "reviewer"]);
    expect(plan.summary.agentCount).toBe(2);
    expect(plan.executionEnabled).toBe(false);
  });

  it("bounds the team to the fixed application-owned catalog", () => {
    const plan = buildCollaborationPlan("Build a website", skills, 3);
    expect(plan.agents.map((agent) => agent.id)).toEqual(["coordinator", "specialist", "reviewer"]);
    expect(plan.agents.every((agent) => agent.executionMode === "planning-only")).toBe(true);
  });
});
