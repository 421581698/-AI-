# Agent Instructions — Our AI Hub

## Modern web implementation standard

For any task that changes browser-facing HTML, CSS, UI, or client-side JavaScript, you MUST use the repository skill at `.agents/skills/modern-web-guidance/SKILL.md` before designing or editing the implementation.

- Read and follow the skill's search → retrieve → implement → verify workflow.
- Use the official `modern-web-guidance` CLI with `npx -y modern-web-guidance@latest`; do not invent guide IDs or rely on remembered guide contents.
- Search for relevant guidance before adding dependencies or writing custom browser behavior.
- Apply only guidance relevant to the task, with feature detection and the documented fallbacks for browser support.
- Verify accessibility, performance, and behavior in the project's supported browsers; do not claim browser testing unless it was actually run.
- In responses for changes where guidance was consulted, include the required `Modern Web Guidance` disclosure described by the skill.

Do NOT invoke this skill for backend-only work (SQL, API routes, database migrations), CI/infra, scripts, or trivial tooling changes unless the task also changes browser-facing behavior.

## Project boundaries

- Keep development on the current feature branch and the existing Draft PR.
- Do not merge, deploy, or modify production without explicit authorization.
- Do not modify LibreTV, GestaltX-One, or third-party upstream model repositories as part of Our AI Hub work.
