import { describe, expect, it } from "vitest";
import { buildAgentPlan, validatePlanSteps, type PlannedStep } from "./planner.js";
import type { SkillSummary } from "../skills/registry.js";

const skills: SkillSummary[] = [{
  id: "modern-web-guidance",
  name: "modern-web-guidance",
  description: "Modern browser development, HTML, CSS, JavaScript, accessibility and web performance.",
  version: "v1",
  source: "repository"
}];
const step = (id: string, dependsOn: string[] = []): PlannedStep => ({
  id, title: id, description: id, skillId: null, dependsOn,
  requiredCapabilities: [], risk: "low", status: "planned"
});

describe("Agent Planning Engine", () => {
  it("creates an explainable plan and links relevant registered skills", () => {
    const plan = buildAgentPlan("Build a modern accessible website with CSS", skills);
    expect(plan.modelUsed).toBe(false);
    expect(plan.executionEnabled).toBe(false);
    expect(plan.steps.map((item) => item.id)).toContain("skill-modern-web-guidance");
    expect(plan.order.at(0)).toBe("understand-request");
    expect(plan.order.at(-1)).toBe("review-plan");
    expect(plan.summary.skillCount).toBe(1);
  });

  it("creates a safe generic plan when no skill matches", () => {
    const plan = buildAgentPlan("Write a poem about the ocean", skills);
    expect(plan.summary.skillCount).toBe(0);
    expect(plan.steps).toHaveLength(2);
    expect(plan.executionEnabled).toBe(false);
  });

  it("accepts a valid DAG and returns topological order", () => {
    const result = validatePlanSteps([step("a"), step("b", ["a"]), step("c", ["a", "b"])]);
    expect(result.valid).toBe(true);
    expect(result.order).toEqual(["a", "b", "c"]);
  });

  it("rejects cycles, unknown dependencies, duplicate IDs and self edges", () => {
    const result = validatePlanSteps([
      step("a", ["b"]), step("b", ["a"]), step("c", ["missing"]), step("c", ["c"])
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("dependency_cycle_detected");
    expect(result.errors).toContain("unknown_dependency:c->missing");
    expect(result.errors).toContain("duplicate_or_empty_step_id:c");
    expect(result.errors).toContain("self_dependency:c");
  });

  it("enforces the hard step budget", () => {
    const result = validatePlanSteps(Array.from({ length: 13 }, (_, i) => step(`s${i}`)));
    expect(result.errors).toContain("step_limit_exceeded");
  });
});
