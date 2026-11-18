# Deployment

## Production container stack

The repository includes a multi-stage Node.js 22 image and a Docker Compose stack with:
- Our AI Hub API, running as an unprivileged user.
- PostgreSQL + pgvector on a private Compose network.
- Persistent PostgreSQL volume.
- Health checks and database readiness ordering.
- Automatic SQL migrations before the API starts.

## First start

1. Copy `.env.example` to `.env`.
2. Replace `POSTGRES_PASSWORD`, `API_KEY`, and `AUTH_TOKEN_SECRET` with unique, long random secrets encoded using URL-safe characters (such as base64url); the database password is embedded in a PostgreSQL connection URL. Do not commit `.env`. Set `CORS_ORIGINS` to a comma-separated allowlist only when browser clients on other origins must call the API.
3. Run `docker compose up --build -d`.
4. Check `docker compose ps` and `docker compose logs -f api`.
5. Verify `GET /health` and an authenticated API request.

Open the browser console at `/console`. The REST API reference is in [API.md](API.md). The API listens on port 8787 inside the container. By default, Compose publishes it only on `127.0.0.1` to avoid exposing an unauthenticated HTTP listener directly to the network; put a TLS reverse proxy in front of it. If you intentionally need direct network exposure, set `API_BIND=0.0.0.0` and provide TLS and firewall controls yourself. Set `API_PORT` to change the host port. The database is not published to the host.

## Production network requirements

- Put the API behind a TLS-terminating reverse proxy or managed HTTPS ingress.
- Restrict inbound access to the proxy; do not expose PostgreSQL.
- Use a secret manager for production credentials and rotate them periodically.
- Configure firewall rules, backups, monitoring and restore drills for the host.
- Persist and back up the `ourai_pgdata` volume.
- Review resource limits and PostgreSQL sizing for the deployment environment.

The Compose file is a self-hosting baseline, not a claim that a production environment has been deployed or security-certified. The API supports user accounts, 12-hour bearer sessions, per-user API keys, and owner-scoped memory/task access. Keep the bootstrap API key private; it is a privileged compatibility credential. Registration still lacks email verification and password recovery.

## Operations

- Start/update: `docker compose up --build -d`
- Logs: `docker compose logs -f api`
- Stop without deleting data: `docker compose down`
- Database backup: `docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > ourai.sql`
- Database restore: restore into a separately verified database before switching production traffic.

Never use `docker compose down -v` unless intentionally deleting the database volume.
