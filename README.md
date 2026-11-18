# Our AI Hub

独立的 AI 智能核心服务。当前阶段聚焦于可验证的基础设施：API Gateway、Memory、Knowledge、Task Runtime、模型适配、安全审计与自动化测试。

## Development

所有功能开发在独立 feature 分支进行；`main` 仅保留仓库初始化与稳定版本。默认不连接生产服务、不执行外部高风险操作。

## Status

Bootstrap repository initialized. See the development branch for the initial implementation plan.

## Coding-agent web standards

The repository includes the official GoogleChrome `modern-web-guidance` Agent Skill at
`.agents/skills/modern-web-guidance/SKILL.md`. Coding agents must consult it before
browser-facing HTML, CSS, or client-side JavaScript work. The skill searches and retrieves
task-specific modern platform guidance and requires implementation/fallback verification.

The skill is guidance for coding agents; it does not by itself install browser features,
change the model weights, or enable runtime capabilities in the Our AI Hub API.
