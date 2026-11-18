import { SkillRuntime } from "./runtime.js";

export type SkillEvaluationCheck = {
  id: string;
  passed: boolean;
  message: string;
};

export type SkillEvaluationReport = {
  evaluationId: string;
  skillId: string;
  status: "passed" | "failed";
  score: number;
  checks: SkillEvaluationCheck[];
  evaluatedAt: string;
  scope: "deterministic-runtime-contract";
  modelQualityEvaluated: false;
};

export class SkillEvaluator {
  constructor(private readonly runtime: SkillRuntime) {}

  async evaluate(skillId: string): Promise<SkillEvaluationReport | null> {
    const result = await this.runtime.run(skillId);
    if (!result) return null;

    const checks: SkillEvaluationCheck[] = [
      {
        id: "identity",
        passed: result.skillId === skillId && result.status === "completed",
        message: "Runtime returns the requested registered skill."
      },
      {
        id: "provenance",
        passed: result.output.sha256.length === 64 && result.output.version.length > 0,
        message: "Output includes a content digest and version."
      },
      {
        id: "output-budget",
        passed: result.output.content.length <= 12_000,
        message: "Reference output stays within the 12,000-character budget."
      },
      {
        id: "untrusted-label",
        passed: result.output.kind === "untrusted-reference" &&
          result.safety.trust === "untrusted-reference",
        message: "Skill content remains explicitly untrusted."
      },
      {
        id: "no-code-execution",
        passed: result.safety.skillCodeExecuted === false,
        message: "Skill document content is not executed as code."
      },
      {
        id: "no-tool-access",
        passed: result.safety.toolsInvoked === false &&
          result.safety.externalNetworkAccess === false,
        message: "Runtime does not invoke tools or access external networks."
      },
      {
        id: "permission-gate",
        passed: result.permission.capability === "skill.context.read" &&
          result.permission.decision === "allow",
        message: "Runtime reports the required read-only permission gate."
      }
    ];

    const passed = checks.filter((check) => check.passed).length;
    return {
      evaluationId: result.runId,
      skillId,
      status: passed === checks.length ? "passed" : "failed",
      score: Math.round((passed / checks.length) * 100),
      checks,
      evaluatedAt: new Date().toISOString(),
      scope: "deterministic-runtime-contract",
      modelQualityEvaluated: false
    };
  }
}
