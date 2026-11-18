import type { SkillSummary } from "./registry.js";

export type SkillMatch = {
  skill: SkillSummary;
  score: number;
  confidence: number;
  reasons: string[];
};

export type SkillSelection = {
  selected: SkillMatch | null;
  matches: SkillMatch[];
  threshold: number;
};

const DEFAULT_THRESHOLD = 0.16;

function tokenize(value: string): string[] {
  const normalized = value.normalize("NFKC").toLocaleLowerCase();
  const chunks = normalized.match(/[a-z0-9]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu) ?? [];
  const tokens: string[] = [];
  for (const chunk of chunks) {
    if (/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u.test(chunk)) {
      if (chunk.length === 1) tokens.push(chunk);
      else {
        for (let i = 0; i < chunk.length - 1; i += 1) tokens.push(chunk.slice(i, i + 2));
      }
    } else {
      tokens.push(chunk);
    }
  }
  return [...new Set(tokens.filter((token) => token.length > 1))];
}

function coverage(queryTokens: string[], fieldTokens: string[]): number {
  if (queryTokens.length === 0 || fieldTokens.length === 0) return 0;
  const field = new Set(fieldTokens);
  return queryTokens.reduce((sum, token) => sum + (field.has(token) ? 1 : 0), 0) / queryTokens.length;
}

export function selectSkills(
  task: string,
  skills: SkillSummary[],
  options: { limit?: number; threshold?: number } = {}
): SkillSelection {
  const limit = Math.min(10, Math.max(1, Math.trunc(options.limit ?? 5)));
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const queryTokens = tokenize(task);
  const ranked = skills.map((skill): SkillMatch => {
    const nameTokens = tokenize(skill.name.replace(/-/g, " "));
    const descriptionTokens = tokenize(skill.description);
    const nameCoverage = coverage(queryTokens, nameTokens);
    const descriptionCoverage = coverage(queryTokens, descriptionTokens);
    const combinedCoverage = coverage(queryTokens, [...nameTokens, ...descriptionTokens]);
    const phrase = task.normalize("NFKC").toLocaleLowerCase().includes(skill.name.replace(/-/g, " "));
    const score = Math.min(1, (nameCoverage * 0.7 + descriptionCoverage * 0.3) * 0.85 + (phrase ? 0.15 : 0));
    const reasons: string[] = [];
    if (nameCoverage > 0) reasons.push("task terms match the skill name");
    if (descriptionCoverage > 0) reasons.push("task terms match the skill description");
    if (phrase) reasons.push("skill name appears as a phrase in the task");
    return {
      skill,
      score: Number(score.toFixed(4)),
      confidence: Number(Math.min(1, score * (0.65 + combinedCoverage * 0.35)).toFixed(4)),
      reasons
    };
  }).filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id))
    .slice(0, limit);

  const matches = ranked.filter((match) => match.score >= threshold);
  return {
    selected: matches[0] ?? null,
    matches,
    threshold
  };
}
