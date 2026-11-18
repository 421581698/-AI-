import { randomUUID } from "node:crypto";
import { validatePlanSteps, type PlannedStep } from "./planner.js";
import type { CollaborationPlan } from "./collaboration.js";

export type CollaborationCheck = { id: string; passed: boolean; message: string };
export type CollaborationEvaluation = {
  evaluationId: string;
  collaborationId: string;
  status: "passed" | "failed";
  score: number;
  checks: CollaborationCheck[];
  evaluatedAt: string;
  scope: "deterministic-collaboration-contract";
  runtimeExecutionEvaluated: false;
  metrics: {
    agentCount: number;
    assignmentCount: number;
    plannedStepCount: number;
    handoffCount: number;
    assignedStepCount: number;
  };
};

export function evaluateCollaborationPlan(plan: CollaborationPlan): CollaborationEvaluation {
  const assignmentIds = new Set(plan.assignments.map((item) => "assignment-" + item.role));
  const assignedSteps = plan.assignments.flatMap((item) => item.stepIds);
  const uniqueAssignedSteps = new Set(assignedSteps);
  const allDependenciesKnown = plan.assignments.every((item) =>
    item.dependsOnAssignments.every((dependency) => assignmentIds.has(dependency))
  );
  const graph: PlannedStep[] = plan.assignments.map((item) => ({
    id: "assignment-" + item.role,
    title: item.role,
    description: "Evaluation-only graph node",
    skillId: null,
    dependsOn: item.dependsOnAssignments,
    requiredCapabilities: item.inputContract.requiredCapabilities,
    risk: "low",
    status: "planned"
  }));
  const graphValidation = validatePlanSteps(graph);
  const coordinator = plan.agents.find((agent) => agent.id === plan.coordinatorAgentId && agent.role === "coordinator");
  const rolesMatch = plan.assignments.every((assignment) =>
    plan.agents.some((agent) => agent.id === assignment.agentId && agent.role === assignment.role && agent.executionMode === "planning-only")
  );
  const outputContractsValid = plan.assignments.every((assignment) =>
    ["status", "summary", "evidence", "blockedBy"].every((field) =>
      (assignment.outputContract.requiredFields as string[]).includes(field)
    )
  );
  const stepCoverage = plan.stepOrder.length > 0 &&
    uniqueAssignedSteps.size === assignedSteps.length &&
    plan.stepOrder.length === assignedSteps.length &&
    plan.stepOrder.every((stepId) => uniqueAssignedSteps.has(stepId));
  const checks: CollaborationCheck[] = [
    { id: "identity", passed: Boolean(plan.collaborationId && plan.sourcePlanId), message: "Collaboration and source plan identifiers are present." },
    { id: "bounded-size", passed: plan.agents.length >= 1 && plan.agents.length <= 3 && plan.assignments.length >= 1 && plan.assignments.length <= 3 && plan.stepOrder.length <= 12, message: "Agent, assignment and planned-step counts stay within configured limits." },
    { id: "coordinator", passed: Boolean(coordinator), message: "The declared coordinator exists in the application-owned agent catalog." },
    { id: "role-catalog", passed: rolesMatch && plan.agents.every((agent) => agent.executionMode === "planning-only"), message: "Every assignment maps to a known planning-only role." },
    { id: "step-coverage", passed: stepCoverage, message: "Every source-plan step is assigned exactly once." },
    { id: "handoff-references", passed: allDependenciesKnown, message: "Every inter-agent handoff references an existing assignment." },
    { id: "handoff-dag", passed: graphValidation.valid, message: "The assignment handoff graph contains no cycles or invalid dependencies." },
    { id: "output-contract", passed: outputContractsValid, message: "Every agent has the required structured output contract." },
    { id: "execution-disabled", passed: plan.executionEnabled === false && plan.modelUsed === false && plan.status === "planned", message: "Evaluation does not imply model execution or autonomous side effects." },
    { id: "summary-consistency", passed: plan.summary.agentCount === plan.agents.length && plan.summary.assignmentCount === plan.assignments.length && plan.summary.stepCount === plan.stepOrder.length, message: "Reported plan summary matches the underlying plan." }
  ];
  const passed = checks.filter((check) => check.passed).length;
  return {
    evaluationId: randomUUID(),
    collaborationId: plan.collaborationId,
    status: passed === checks.length ? "passed" : "failed",
    score: Math.round((passed / checks.length) * 100),
    checks,
    evaluatedAt: new Date().toISOString(),
    scope: "deterministic-collaboration-contract",
    runtimeExecutionEvaluated: false,
    metrics: {
      agentCount: plan.agents.length,
      assignmentCount: plan.assignments.length,
      plannedStepCount: plan.stepOrder.length,
      handoffCount: plan.assignments.reduce((count, assignment) => count + assignment.dependsOnAssignments.length, 0),
      assignedStepCount: assignedSteps.length
    }
  };
}
