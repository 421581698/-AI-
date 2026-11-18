import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run database migrations");
}

const pool = new Pool({ connectionString, max: 1 });
const migrationsDir = join(process.cwd(), "db", "migrations");

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/.test(file))
    .sort();

  for (const filename of files) {
    const alreadyApplied = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE filename = $1",
      [filename]
    );
    if (alreadyApplied.rowCount) continue;

    const sql = await readFile(join(migrationsDir, filename), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations(filename) VALUES ($1)",
        [filename]
      );
      await client.query("COMMIT");
      process.stdout.write(`applied ${filename}\n`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
