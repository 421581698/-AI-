CREATE INDEX IF NOT EXISTS tasks_recovery_idx
  ON tasks(status, locked_until)
  WHERE status = 'running';
