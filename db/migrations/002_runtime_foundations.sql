ALTER TABLE memory_records
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS memory_records_search_vector_idx
  ON memory_records USING GIN(search_vector);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS tasks_claim_idx
  ON tasks(status, available_at, created_at)
  WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS task_events (
  id BIGSERIAL PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_events_task_created_idx
  ON task_events(task_id, created_at, id);

CREATE INDEX IF NOT EXISTS audit_events_request_idx
  ON audit_events(request_id, created_at DESC);
