-- Workspace column on user data (default 'local' until SaaS), record versions, persistent jobs.
ALTER TABLE records ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'local';
ALTER TABLE records ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE records ADD COLUMN job_id INTEGER;
CREATE INDEX IF NOT EXISTS records_ws_kind ON records(workspace_id, kind, created_at DESC);

CREATE TABLE saved_v2 (
  workspace_id TEXT NOT NULL DEFAULT 'local', kind TEXT NOT NULL, ref TEXT NOT NULL,
  title TEXT, note TEXT, data TEXT, created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, kind, ref)
);
INSERT INTO saved_v2 (kind, ref, title, note, data, created_at) SELECT kind, ref, title, note, data, created_at FROM saved;
DROP TABLE saved;
ALTER TABLE saved_v2 RENAME TO saved;

CREATE TABLE settings_v2 (workspace_id TEXT NOT NULL DEFAULT 'local', key TEXT NOT NULL, value TEXT, PRIMARY KEY (workspace_id, key));
INSERT INTO settings_v2 (key, value) SELECT key, value FROM settings;
DROP TABLE settings;
ALTER TABLE settings_v2 RENAME TO settings;

CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL DEFAULT 'local',
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled','interrupted')),
  params TEXT NOT NULL,
  progress TEXT,
  idempotency_key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  record_id INTEGER,
  result TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER
);
CREATE UNIQUE INDEX jobs_active_key ON jobs(idempotency_key) WHERE status IN ('queued','running');
CREATE INDEX jobs_ws_created ON jobs(workspace_id, created_at DESC);

CREATE TABLE request_log (endpoint TEXT NOT NULL, status INTEGER, ms INTEGER, at INTEGER NOT NULL);
CREATE INDEX request_log_at ON request_log(at);
