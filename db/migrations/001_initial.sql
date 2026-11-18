CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_records (
  id UUID PRIMARY KEY,
  namespace TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS memory_records_namespace_created_idx
  ON memory_records(namespace, created_at DESC);
CREATE INDEX IF NOT EXISTS memory_records_metadata_idx
  ON memory_records USING GIN(metadata);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled')),
  input JSONB NOT NULL,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_status_created_idx ON tasks(status, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);
