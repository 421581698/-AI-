import { describe, expect, it } from "vitest";
import { selectSkills } from "./selector.js";
import type { SkillSummary } from "./registry.js";

const skills: SkillSummary[] = [
  {
    id: "modern-web-guidance",
    name: "modern-web-guidance",
    description: "Modern browser development, HTML, CSS, JavaScript, accessibility and web performance.",
    version: "v1",
    source: "repository"
  },
  {
    id: "database-engineering",
    name: "database-engineering",
    description: "SQL schema design, PostgreSQL migrations, indexes and query optimization.",
    version: "v1",
    source: "repository"
  }
];

describe("selectSkills", () => {
  it("selects the most relevant web skill and explains the match", () => {
    const result = selectSkills("Build a modern accessible website with CSS and browser performance", skills);
    expect(result.selected?.skill.id).toBe("modern-web-guidance");
    expect(result.selected?.reasons.length).toBeGreaterThan(0);
    expect(result.matches[0]?.score).toBeGreaterThan(0);
  });

  it("selects database guidance for database tasks", () => {
    const result = selectSkills("Design PostgreSQL schema migrations and indexes", skills);
    expect(result.selected?.skill.id).toBe("database-engineering");
  });

  it("returns no selection for unrelated tasks", () => {
    const result = selectSkills("Write a poem about the ocean", skills);
    expect(result.selected).toBeNull();
    expect(result.matches).toEqual([]);
  });

  it("supports Chinese task descriptions", () => {
    const result = selectSkills("开发现代网页，优化浏览器性能和无障碍体验", skills);
    expect(result.selected?.skill.id).toBe("modern-web-guidance");
  });

  it("respects the requested result limit and stable tie ordering", () => {
    const duplicated = [...skills, { ...skills[0]!, id: "modern-web-guidance-copy" }];
    const result = selectSkills("modern web CSS", duplicated, { limit: 1 });
    expect(result.matches).toHaveLength(1);
  });

  it("does not select a result below a stricter threshold", () => {
    const result = selectSkills("web", skills, { threshold: 0.9 });
    expect(result.selected).toBeNull();
  });
});
