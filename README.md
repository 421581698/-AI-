# Our AI Hub

独立的 AI 智能核心服务。当前阶段聚焦于可验证的基础设施：API Gateway、Memory、Knowledge、Task Runtime、模型适配、安全审计与自动化测试。

## Self-hosted deployment

See [Deployment Guide](docs/DEPLOYMENT.md). Copy `.env.example`, replace both secrets, then run `docker compose up --build -d`. The API is exposed on `API_PORT`; PostgreSQL remains private to the Compose network.

## Development

所有功能开发在独立 feature 分支进行；`main` 仅保留仓库初始化与稳定版本。默认不连接生产服务、不执行外部高风险操作。

## Status

Development branch currently includes a first MCP-compatible HTTP integration at `POST /mcp`. It exposes a fixed read-only tool catalog for skill discovery, deterministic planning, collaboration planning, and contract evaluation. It does not execute agents or external actions.

## Coding-agent web standards

The repository includes the official GoogleChrome `modern-web-guidance` Agent Skill at
`.agents/skills/modern-web-guidance/SKILL.md`. Coding agents must consult it before
browser-facing HTML, CSS, or client-side JavaScript work. The skill searches and retrieves
task-specific modern platform guidance and requires implementation/fallback verification.

The skill is guidance for coding agents; it does not by itself install browser features,
change the model weights, or enable runtime capabilities in the Our AI Hub API.
