# Architecture baseline (v0.1)

## Runtime boundaries

- API Gateway: Fastify HTTP boundary, request IDs, body-size limit, schema validation, optional bearer authentication in development, and mandatory API key in production.
- Memory Engine: namespace-scoped records with source, confidence, metadata and expiry. PostgreSQL persistence is enabled when DATABASE_URL is configured; otherwise a process-local development adapter is used. Current retrieval is lexical, not semantic.
- Knowledge Engine: planned ingestion and hybrid lexical/vector retrieval on PostgreSQL + pgvector. Embedding provider integration is not implemented yet.
- Skill Engine: repository-local skill discovery and read-only retrieval via `GET /v1/skills` and `GET /v1/skills/:id`. It scans only the configured repository skill roots, validates identifiers, rejects path traversal and symlinks escaping the skill directory, and caps each `SKILL.md` at 128 KiB. Skill execution, tool grants and dynamic installation are not implemented.
- Task Runtime: task creation, lookup and cancellation. PostgreSQL-backed task persistence is enabled when DATABASE_URL is configured. Workers, event history, leases, retries and replay remain planned.
- Model Router: provider-neutral adapter contract will be added before connecting upstream providers.
- Safety: default bind is loopback; secrets are environment-only; tool execution remains disabled until allowlists, scoped permissions and audit controls are complete.
- Audit: API actions are written to audit_events when PostgreSQL is enabled.

## API v0.1

- GET /health
- POST /v1/memory/records
- POST /v1/memory/search
- GET /v1/skills
- GET /v1/skills/:id
- POST /v1/tasks
- GET /v1/tasks/:id
- POST /v1/tasks/:id/cancel

## Local development

1. Copy .env.example to .env and set a development API_KEY.
2. Run docker compose up -d to start PostgreSQL + pgvector and initialize the schema on a fresh volume.
3. Set DATABASE_URL in .env to enable persistent memory and task storage.
4. Run npm install, npm run dev.

## Explicit non-goals

No production deployment, no changes to LibreTV or GestaltX-One, and no source modifications to third-party model services. External tool execution is disabled until the permission and audit layers are implemented.
