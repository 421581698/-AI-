import { randomUUID } from "node:crypto";
import { SkillRegistry } from "./registry.js";
import { evaluateSkillPermissions } from "./permission.js";

export type SkillRunResult = {
  runId: string;
  skillId: string;
  status: "completed";
  executor: "reference-context";
  permission: {
    capability: "skill.context.read";
    decision: "allow";
  };
  output: {
    kind: "untrusted-reference";
    name: string;
    version: string;
    sha256: string;
    content: string;
    truncated: boolean;
  };
  safety: {
    skillCodeExecuted: false;
    toolsInvoked: false;
    externalNetworkAccess: false;
    trust: "untrusted-reference";
  };
};

const MAX_OUTPUT_CHARS = 12_000;

/**
 * Stage-5 safe runtime. The executor is application-owned and fixed to
 * loading bounded reference material; SKILL.md is never evaluated as code.
 */
export class SkillRuntime {
  constructor(private readonly registry: SkillRegistry) {}

  async run(skillId: string): Promise<SkillRunResult | null> {
    const skills = await this.registry.list();
    const registeredIds = new Set(skills.map((skill) => skill.id));
    const permission = evaluateSkillPermissions(skillId, ["skill.context.read"], registeredIds)[0];
    if (!permission || permission.decision !== "allow") return null;

    const document = await this.registry.get(skillId);
    if (!document) return null;

    const content = document.content.slice(0, MAX_OUTPUT_CHARS);
    return {
      runId: randomUUID(),
      skillId: document.id,
      status: "completed",
      executor: "reference-context",
      permission: { capability: "skill.context.read", decision: "allow" },
      output: {
        kind: "untrusted-reference",
        name: document.name,
        version: document.version,
        sha256: document.sha256,
        content,
        truncated: content.length < document.content.length
      },
      safety: {
        skillCodeExecuted: false,
        toolsInvoked: false,
        externalNetworkAccess: false,
        trust: "untrusted-reference"
      }
    };
  }
}
