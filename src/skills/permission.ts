export type PermissionDecision = "allow" | "approval_required" | "deny";
export type PermissionRisk = "low" | "medium" | "high" | "critical";

export type CapabilityPolicy = {
  risk: PermissionRisk;
  decision: PermissionDecision;
  reason: string;
};

export type SkillPermissionResult = {
  skillId: string;
  capability: string;
  risk: PermissionRisk;
  decision: PermissionDecision;
  reason: string;
};

/**
 * Trusted server-side policy. Skill files and API callers cannot add or alter grants.
 * Approval is a decision state only; this module does not collect or validate approvals.
 */
const CAPABILITY_POLICIES: Readonly<Record<string, CapabilityPolicy>> = Object.freeze({
  "skill.context.read": {
    risk: "low",
    decision: "allow",
    reason: "Read-only reference context is permitted for repository-registered skills."
  },
  "web.read": {
    risk: "medium",
    decision: "approval_required",
    reason: "External web access requires a separate approval workflow."
  },
  "github.read": {
    risk: "medium",
    decision: "approval_required",
    reason: "Repository access requires a separate approval workflow."
  },
  "filesystem.write": {
    risk: "high",
    decision: "deny",
    reason: "Filesystem modification is not enabled."
  },
  "network.write": {
    risk: "high",
    decision: "deny",
    reason: "External network mutations are not enabled."
  },
  "shell.execute": {
    risk: "critical",
    decision: "deny",
    reason: "Command execution is not enabled."
  },
  "secrets.read": {
    risk: "critical",
    decision: "deny",
    reason: "Secret access is never granted to skills."
  }
});

const UNKNOWN_POLICY: CapabilityPolicy = {
  risk: "critical",
  decision: "deny",
  reason: "Unknown capabilities are denied by default."
};

export function evaluateSkillPermissions(
  skillId: string,
  capabilities: string[],
  registeredSkillIds: ReadonlySet<string>
): SkillPermissionResult[] {
  const isRegistered = registeredSkillIds.has(skillId);
  const uniqueCapabilities = [...new Set(capabilities)].sort((a, b) => a.localeCompare(b));

  return uniqueCapabilities.map((capability) => {
    if (!isRegistered) {
      return {
        skillId,
        capability,
        risk: "critical",
        decision: "deny",
        reason: "The skill is not registered in the trusted repository registry."
      };
    }

    const policy = CAPABILITY_POLICIES[capability] ?? UNKNOWN_POLICY;
    return { skillId, capability, ...policy };
  });
}
