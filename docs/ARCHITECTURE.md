# Architecture baseline (v0.1)

## Runtime boundaries

- API Gateway: Fastify HTTP boundary, request IDs, body-size limit, schema validation and optional bearer authentication.
- Memory Engine: namespace-scoped records with source, confidence, metadata and expiry. The current in-process adapter is development-only; PostgreSQL is the persistence target.
- Knowledge Engine: planned hybrid lexical/vector retrieval on PostgreSQL + pgvector. No embedding provider is assumed yet.
- Task Runtime: task lifecycle API. Durable queue, event log, worker leases, retries and replay are subsequent milestones.
- Model Router: provider-neutral adapter contract will be added before connecting upstream providers.
- Safety: default bind is loopback; secrets are environment-only; tools must use explicit allowlists and scoped permissions.

## API v0.1

- GET /health
- POST /v1/memory/records
- POST /v1/memory/search
- POST /v1/tasks
- GET /v1/tasks/:id
- POST /v1/tasks/:id/cancel

## Explicit non-goals

No production deployment, no changes to LibreTV or GestaltX-One, and no source modifications to third-party model services. External tool execution is disabled until the permission and audit layers are implemented.
