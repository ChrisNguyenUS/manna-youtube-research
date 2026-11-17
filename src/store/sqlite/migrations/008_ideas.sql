-- The idea board: batches of up to ten live cards, one open batch at a time. A card is one JSON document
-- (core/ideas/card.js); `learned` is what the owner keeps from a closed batch (phase 7).
CREATE TABLE idea_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL DEFAULT 'local',
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',     -- 'open' | 'closed'
  learned TEXT,
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE TABLE ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL DEFAULT 'local',
  batch_id INTEGER NOT NULL REFERENCES idea_batches(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX ideas_batch ON ideas(workspace_id, batch_id);
