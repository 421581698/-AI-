# Our AI Hub API

Base URL is the deployed HTTPS origin. All endpoints except `GET /health`, `GET /console`, `POST /v1/auth/register` and `POST /v1/auth/login` require:

```http
Authorization: Bearer <session-token-or-api-key>
```

## Identity

- `POST /v1/auth/register` — create an account. JSON: `{"email":"you@example.com","password":"at-least-12-characters"}`. Returns a 12-hour bearer session.
- `POST /v1/auth/login` — authenticate with email/password.
- `GET /v1/auth/me` — return the authenticated principal.
- `GET /v1/auth/api-keys` — list active keys (secret values are never returned).
- `POST /v1/auth/api-keys` — create a key. JSON: `{"name":"my-agent"}`. The secret is returned once only.
- `DELETE /v1/auth/api-keys/:id` — revoke one of your own keys.

Passwords are hashed with Node.js scrypt. Session tokens are HMAC-SHA256 signed and expire after 12 hours. API keys are stored as SHA-256 digests. Login and registration have a process-local per-IP throttle (10 requests/minute per action). Deploy behind a trusted proxy and configure its client-IP handling before relying on IP-based throttling.

## Platform

- `GET /health` — liveness/database status.
- `GET /console` — browser control console.
- `GET /v1/skills`, `GET /v1/skills/:id` — discover and read repository skills.
- `POST /v1/skills/run`, `POST /v1/skills/authorize`, `POST /v1/skills/evaluate` — existing bounded skill interfaces.
- `POST /v1/agents/plan` — deterministic planning-only task DAG.
- `GET /v1/agents/catalog` — fixed role catalog; not live Agent processes.
- `POST /v1/agents/collaborate/plan` — collaboration plan.
- `POST /v1/agents/collaborate/evaluate` — deterministic contract evaluation.
- `GET /v1/tools` — fixed read-only/planning tool catalog.
- `POST /v1/tasks`, `GET /v1/tasks`, `GET /v1/tasks/:id`, `GET /v1/tasks/:id/events`, `POST /v1/tasks/:id/cancel` — tenant-scoped task lifecycle and history.
- `POST /v1/memory/records`, `POST /v1/memory/search` — tenant-scoped memory records and lexical search.

## MCP

Streamable HTTP JSON-RPC endpoint: `POST /mcp`. Initialize with protocol version `2025-03-26` or `2024-11-05`; tools include skill discovery, deterministic task planning, collaboration planning, and collaboration contract evaluation. MCP currently exposes no arbitrary shell, network, or live Agent execution tools.

## Tenant isolation

User-owned memory records and tasks are filtered by the authenticated user ID in database queries. API keys are bound to their creating user. The bootstrap API key is a privileged compatibility credential for operators and uses the legacy null-owner data scope; keep it secret and do not distribute it to end users. Skill documents and the fixed tool/agent catalogs are repository-wide read-only metadata.

## Current limitations

This release is a productization foundation, not a fully managed SaaS service: registration does not yet include email verification or password recovery; no organization/team hierarchy, billing, OAuth/SSO, administrator user-management UI, refresh-token flow, or distributed rate-limit store is included. Agent catalog entries are fixed planning roles, and Tool catalog entries do not imply live execution. Configure TLS, secret rotation, backups, and monitoring at the deployment layer.
