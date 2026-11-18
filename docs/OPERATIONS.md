# Operations Runbook

This runbook describes operator procedures for a self-hosted installation. CI verifies the image, migrations, and a PostgreSQL 16 custom-format backup/restore round trip; it does not replace a scheduled restore drill on the target host.

## Before first exposure

- Keep the API bound to loopback and place it behind a TLS reverse proxy.
- Do not publish PostgreSQL or its Compose network.
- Generate independent URL-safe secrets for the database password, bootstrap API key, and session signing secret. Store them in a secret manager; never commit `.env`.
- Keep the bootstrap API key restricted to trusted operators. It is a privileged compatibility credential and bypasses per-user tenant scoping.
- Configure a strict CORS origin allowlist. CORS is not an authentication boundary.
- Restrict registration at the reverse proxy or application edge if the installation is not intended to be open-registration.
- Rate limiting is process-local in this release. Use an upstream rate limiter before exposing registration/login to the public internet.

## Backup

Run from the directory containing `docker-compose.yml`:

```sh
umask 077
mkdir -p backups
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "backups/our-ai-hub-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

- Confirm the dump is non-empty and record its SHA-256 digest.
- Encrypt the backup before moving it off-host; store encryption keys separately.
- Copy backups to an access-controlled, independent storage location.
- Define retention and recovery-point objectives before production use.

## Restore drill

Never overwrite the active database for a first restore test.

1. Provision an isolated PostgreSQL 16 + pgvector instance and an empty restore database.
2. Restore the selected dump with `pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" <dump-file>`.
3. Verify migration history, expected row counts, and application-level reads using a temporary application instance pointed at the restored database.
4. Run authenticated tenant-isolation checks with two separate test accounts.
5. Record duration, failures, and the backup timestamp. Destroy the isolated test database after recording the result.

For a planned production recovery, stop API writers, take a final backup of the damaged/current state where possible, restore to a new database, verify health and tenant access, then switch the API connection configuration. Keep the old database until the recovery is accepted.

## Upgrade and rollback

1. Record the deployed image digest and current migration version.
2. Take and verify a fresh backup before updating.
3. Build and test the candidate image in a non-production environment.
4. Apply the candidate and verify `GET /health`, sign-in, task listing, and memory access.
5. Roll back the image only when its schema remains compatible. Database migrations are not automatically reversed; restore a pre-upgrade backup to a separate database if a schema rollback is required.

## Incident response

- Revoke compromised user API keys through the authenticated API.
- Rotate the bootstrap API key and session signing secret if exposed; rotating the signing secret invalidates existing sessions.
- Review reverse-proxy and application logs, but avoid logging bearer tokens, passwords, memory contents, or skill contents.
- If compromise is suspected, isolate ingress first and preserve logs/backups for investigation.

## Development-toolchain advisory: picomatch

As of 2026-11-18, the full development dependency audit reports a high-severity picomatch advisory (GHSA-fc5q-39xc-vjpf / CVE-2026-112366) through the Vitest/Vite test-toolchain dependency graph. The npm package registry does not offer a version newer than the affected 4.0.7 range, and the upstream proposed fix was closed without being merged; the package maintainer disputes the report. Do not force-downgrade Vitest: the attempted 3.1.4 downgrade introduces additional vulnerable transitive packages, including critical tinypool advisories.

In this release, this dependency graph is development-only and is pruned from the production image. The production dependency audit remains clean. Do not pass untrusted user-controlled glob/extglob patterns to this toolchain. Keep the full audit visible, re-check the upstream advisory and npm releases on dependency updates, and remove this note only after a published fixed release is adopted and verified. This is a documented residual development-toolchain advisory, not a claim that the full dependency tree is vulnerability-free.

## Current release limitations

- Authentication throttling is process-local, not distributed.
- Registration has no email verification or password recovery.
- No organization/team model, SSO/OAuth, billing, or refresh-token lifecycle.
- CI backup/restore is a reproducible integration check, not a production-host restore drill.
- No production deployment or external device/browser acceptance is claimed by this repository change.
