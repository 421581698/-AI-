# Architecture baseline (v0.1)

## Runtime boundaries

- API Gateway: Fastify HTTP boundary, request IDs, body-size limit, schema validation, optional bearer authentication in development, and mandatory API key in production.
- Memory Engine: namespace-scoped records with source, confidence, metadata and expiry. PostgreSQL persistence is enabled when DATABASE_URL is configured; otherwise a process-local development adapter is used. Current retrieval is lexical, not semantic.
- Knowledge Engine: planned ingestion and hybrid lexical/vector retrieval on PostgreSQL + pgvector. Embedding provider integration is not implemented yet.
- Skill Engine: repository-local skill discovery and read-only retrieval via `GET /v1/skills` and `GET /v1/skills/:id`, plus explainable task-to-skill ranking via `POST /v1/skills/select` and bounded context assembly via `POST /v1/skills/context`. The context builder loads only selected repository skills, preserves provenance (version and SHA-256), enforces per-skill and total character budgets, and returns skill text as explicitly untrusted reference material with execution and tool access disabled. The selector uses transparent lexical matching and a small Chinese-to-English intent alias set; it returns scores, confidence, reasons and no-match when below threshold. It does not invoke an LLM or execute selected skills. It scans only the configured repository skill roots, validates identifiers, rejects path traversal and symlinks escaping the skill directory, and caps each `SKILL.md` at 128 KiB. Skill permission evaluation is exposed via `POST /v1/skills/authorize`. It uses a trusted server-side capability policy, defaults unknown capabilities to deny, denies unregistered skills and dangerous write/execute/secret capabilities, and marks selected external read capabilities as approval-required. Skill documents and caller-supplied fields cannot modify policy or self-approve. The stage-5 runtime exposes `POST /v1/skills/run` and invokes only an application-owned, fixed `reference-context` executor after checking the trusted `skill.context.read` policy. It returns bounded (12,000-character) skill reference material with provenance and an explicit untrusted-data label. It never evaluates SKILL.md as code, invokes tools, accesses external networks, or accepts caller-supplied commands/approval flags. This is a controlled reference-loading runtime, not yet an LLM-driven agent executor. Stage 6 adds deterministic runtime-contract evaluation via POST /v1/skills/evaluate. It checks identity, provenance, output budget, untrusted labeling, no-code-execution, no-tool-access and permission-gate invariants; it does not evaluate model answer quality or arbitrary task success. Stage 7 adds a deterministic Agent Planning Engine via POST /v1/agents/plan. It creates a bounded, explainable plan from the task and registered skill matches, validates the dependency DAG (unique IDs, known dependencies, cycle detection and a 12-step ceiling), returns a topological order, and annotates each step with required capabilities, risk and planned status. The planner does not invoke an LLM, execute skills, call tools, or grant permissions. Approval workflow, arbitrary skill code, tool grants and dynamic installation are not implemented.
- Multi-Agent Collaboration (stage 14 foundation): `POST /v1/agents/collaborate/plan` converts the deterministic task plan into a bounded application-owned coordinator/specialist/reviewer team, explicit step assignments, dependency handoffs, and structured output contracts. This is collaboration planning only: it does not start model instances, execute agents, invoke tools, or claim autonomous multi-agent work. The coordinator, specialist and reviewer are role definitions, not separate running processes.
- Task Runtime (stage 8): `POST /v1/tasks`, `GET /v1/tasks/:id`, `POST /v1/tasks/:id/cancel`, and `GET /v1/tasks/:id/events` are backed by a leased worker loop. PostgreSQL mode claims queued work transactionally with `FOR UPDATE SKIP LOCKED`, records lifecycle events, applies bounded exponential retry, and recovers expired running leases; the in-memory development adapter supports the same basic lifecycle but is process-local. The only enabled task type is `agent.plan.validate`, which validates and records a plan in dry-run mode without executing its steps or causing external side effects. Arbitrary task types, shell commands, external tools, and skill execution are rejected or unsupported.
- Model Router: provider-neutral adapter contract will be added before connecting upstream providers.
- Safety: default bind is loopback; secrets are environment-only; tool execution remains disabled until allowlists, scoped permissions and audit controls are complete.
- Audit: API actions are written to audit_events when PostgreSQL is enabled.

## API v0.1

- GET /health
- POST /v1/memory/records
- POST /v1/memory/search
- GET /v1/skills
- GET /v1/skills/:id
- POST /v1/skills/select
- POST /v1/skills/context
- POST /v1/skills/authorize
- POST /v1/skills/run
- POST /v1/skills/evaluate
- POST /v1/agents/plan
- POST /v1/agents/collaborate/plan
- GET /v1/tasks/:id/events
- POST /v1/tasks
- GET /v1/tasks/:id
- POST /v1/tasks/:id/cancel

## Local development

1. Copy .env.example to .env and set a development API_KEY.
2. Run docker compose up -d to start PostgreSQL + pgvector and initialize the schema on a fresh volume.
3. Set DATABASE_URL in .env to enable persistent memory and task storage.
4. Run npm install, npm run dev.

## Explicit non-goals

No production deployment, no changes to LibreTV or GestaltX-One, and no source modifications to third-party model services. External tool execution and arbitrary skill code execution remain disabled. The current runtime supports only bounded, permission-checked reference-context loading.
