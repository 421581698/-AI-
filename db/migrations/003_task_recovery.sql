ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS tasks_recovery_idx
  ON tasks(status, locked_until)
  WHERE status = 'running';
