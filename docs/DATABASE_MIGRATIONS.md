# Database migrations

All schema changes belong in ordered SQL files under `db/migrations`.

Run migrations against the configured database with:

```sh
npm run db:migrate
```

The runner creates `schema_migrations`, applies unapplied files in filename order,
and records each successful migration in the same transaction as its schema changes.
Migrations must be safe to run once and should use idempotent DDL where practical.

For a new local database, Docker Compose may still initialize the baseline schema
through the PostgreSQL image's initialization directory. For an existing volume,
run the migration command explicitly after deploying the application update.

Never run migrations against production as part of CI or an unapproved deployment.
