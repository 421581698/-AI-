import { randomUUID } from "node:crypto";
import { buildAgentPlan, validatePlanSteps, type AgentPlan, type PlannedStep } from "./planner.js";
import type { SkillSummary } from "../skills/registry.js";

export type AgentRole = "coordinator" | "specialist" | "reviewer";
export type AgentDefinition = {
  id: string;
  role: AgentRole;
  responsibilities: string[];
  executionMode: "planning-only";
};
export type AgentAssignment = {
  agentId: string;
  role: AgentRole;
  stepIds: string[];
  dependsOnAssignments: string[];
  inputContract: { task: string; stepIds: string[]; requiredCapabilities: string[] };
  outputContract: { requiredFields: ["status", "summary", "evidence", "blockedBy"] };
};
export type CollaborationPlan = {
  collaborationId: string;
  schemaVersion: "1";
  sourcePlanId: string;
  coordinatorAgentId: string;
  agents: AgentDefinition[];
  assignments: AgentAssignment[];
  stepOrder: string[];
  status: "planned";
  executionEnabled: false;
  modelUsed: false;
  summary: { agentCount: number; assignmentCount: number; stepCount: number };
};

const AGENT_CATALOG: AgentDefinition[] = [
  { id: "coordinator", role: "coordinator", responsibilities: ["decompose task", "coordinate handoffs", "consolidate results"], executionMode: "planning-only" },
  { id: "specialist", role: "specialist", responsibilities: ["review assigned skill reference", "prepare domain-specific findings"], executionMode: "planning-only" },
  { id: "reviewer", role: "reviewer", responsibilities: ["check plan consistency", "identify missing evidence and risks"], executionMode: "planning-only" }
];

function roleFor(step: PlannedStep): AgentRole {
  if (step.id === "understand-request") return "coordinator";
  if (step.id === "review-plan") return "reviewer";
  return "specialist";
}

/** Convert a validated task DAG into bounded, explicit agent handoff contracts. */
export function buildCollaborationPlan(task: string, skills: SkillSummary[], limit = 3): CollaborationPlan {
  const plan: AgentPlan = buildAgentPlan(task, skills, limit);
  const validation = validatePlanSteps(plan.steps);
  if (!validation.valid) throw new Error("invalid_source_plan:" + validation.errors.join(","));

  const grouped = new Map<AgentRole, PlannedStep[]>();
  for (const step of plan.steps) {
    const role = roleFor(step);
    grouped.set(role, [...(grouped.get(role) ?? []), step]);
  }

  const assignmentIds = new Map<AgentRole, string>();
  for (const role of grouped.keys()) assignmentIds.set(role, "assignment-" + role);

  const assignments: AgentAssignment[] = [...grouped.entries()].map(([role, steps]) => {
    const dependencies = new Set<string>();
    for (const step of steps) {
      for (const dependency of step.dependsOn) {
        const dependencyStep = plan.steps.find((candidate) => candidate.id === dependency);
        if (!dependencyStep) continue;
        const dependencyRole = roleFor(dependencyStep);
        if (dependencyRole !== role) dependencies.add(assignmentIds.get(dependencyRole)!);
      }
    }
    const agentId = role;
    return {
      agentId,
      role,
      stepIds: steps.map((step) => step.id),
      dependsOnAssignments: [...dependencies],
      inputContract: {
        task,
        stepIds: steps.map((step) => step.id),
        requiredCapabilities: [...new Set(steps.flatMap((step) => step.requiredCapabilities))]
      },
      outputContract: { requiredFields: ["status", "summary", "evidence", "blockedBy"] }
    };
  });

  const assignmentGraph: PlannedStep[] = assignments.map((assignment) => ({
    id: "assignment-" + assignment.role,
    title: assignment.role,
    description: "Planning-only agent assignment",
    skillId: null,
    dependsOn: assignment.dependsOnAssignments,
    requiredCapabilities: assignment.inputContract.requiredCapabilities,
    risk: "low",
    status: "planned"
  }));
  const assignmentValidation = validatePlanSteps(assignmentGraph);
  if (!assignmentValidation.valid) throw new Error("invalid_assignment_graph:" + assignmentValidation.errors.join(","));

  const roles = new Set(assignments.map((assignment) => assignment.role));
  const agents = AGENT_CATALOG.filter((agent) => roles.has(agent.role));
  return {
    collaborationId: randomUUID(),
    schemaVersion: "1",
    sourcePlanId: plan.planId,
    coordinatorAgentId: "coordinator",
    agents,
    assignments,
    stepOrder: validation.order,
    status: "planned",
    executionEnabled: false,
    modelUsed: false,
    summary: { agentCount: agents.length, assignmentCount: assignments.length, stepCount: plan.steps.length }
  };
}
